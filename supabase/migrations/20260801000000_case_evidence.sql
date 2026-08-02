-- Cases predates the Vault archive workflow in the versioned schema. Add its
-- persisted workflow status before evidence policies use it to reject writes
-- to archived cases.
alter table public.cases
  add column if not exists status text not null default 'active'
  check (status in ('active', 'review', 'archived'));

-- Private per-case evidence metadata and Storage bucket.
create table if not exists public.case_evidence (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  case_id uuid references public.cases(id) on delete cascade not null,
  storage_path text not null,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  constraint case_evidence_storage_path_matches_case check (
    cardinality(string_to_array(storage_path, '/')) = 3
    and split_part(storage_path, '/', 1) = user_id::text
    and split_part(storage_path, '/', 2) = case_id::text
    and split_part(storage_path, '/', 3) ~ '^[A-Za-z0-9_-]{1,128}[.](pdf|jpg|png)$'
  ),
  unique (storage_path)
);

create index if not exists case_evidence_user_case_created_idx
  on public.case_evidence (user_id, case_id, created_at desc);

alter table public.case_evidence enable row level security;

-- Preserve generated upload paths whose Storage outcome is still unknown. A
-- later Vault refresh can reconcile a late Storage commit into metadata.
create table if not exists public.case_evidence_upload_jobs (
  storage_path text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  case_id uuid references public.cases(id) on delete cascade not null,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  constraint case_evidence_upload_job_path_matches_case check (
    cardinality(string_to_array(storage_path, '/')) = 3
    and split_part(storage_path, '/', 1) = user_id::text
    and split_part(storage_path, '/', 2) = case_id::text
  )
);

alter table public.case_evidence_upload_jobs enable row level security;

drop policy if exists "Users can manage own case evidence upload jobs" on public.case_evidence_upload_jobs;
create policy "Users can manage own case evidence upload jobs"
  on public.case_evidence_upload_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep cleanup paths durable across a lost delete RPC response. The case ID is
-- intentionally not a foreign key because the queue must survive case deletion.
create table if not exists public.case_evidence_cleanup_jobs (
  case_id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  storage_paths jsonb not null check (jsonb_typeof(storage_paths) = 'array'),
  created_at timestamptz not null default now()
);

alter table public.case_evidence_cleanup_jobs enable row level security;

drop policy if exists "Users can manage own case evidence cleanup jobs" on public.case_evidence_cleanup_jobs;
drop policy if exists "Users can read own case evidence cleanup jobs" on public.case_evidence_cleanup_jobs;
drop policy if exists "Users can insert own case evidence cleanup jobs" on public.case_evidence_cleanup_jobs;
drop policy if exists "Users can update own case evidence cleanup jobs" on public.case_evidence_cleanup_jobs;
drop policy if exists "Users can delete own case evidence cleanup jobs" on public.case_evidence_cleanup_jobs;
create policy "Users can read own case evidence cleanup jobs"
  on public.case_evidence_cleanup_jobs for select
  using (auth.uid() = user_id);
create policy "Users can insert own case evidence cleanup jobs"
  on public.case_evidence_cleanup_jobs for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.cases
      where cases.id = case_evidence_cleanup_jobs.case_id
        and cases.user_id = auth.uid()
    )
  );
create policy "Users can update own case evidence cleanup jobs"
  on public.case_evidence_cleanup_jobs for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.cases
      where cases.id = case_evidence_cleanup_jobs.case_id
        and cases.user_id = auth.uid()
    )
  );
create policy "Users can delete own case evidence cleanup jobs"
  on public.case_evidence_cleanup_jobs for delete
  using (auth.uid() = user_id);

create or replace function public.mark_case_evidence_attached(target_case_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  update public.cases
  set checklist = jsonb_set(
    coalesce(checklist, '{}'::jsonb),
    '{evidenceAttached}',
    'true'::jsonb,
    true
  ),
  updated_at = now()
  where id = target_case_id
    and user_id = auth.uid();

  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

revoke all on function public.mark_case_evidence_attached(uuid) from public;
grant execute on function public.mark_case_evidence_attached(uuid) to authenticated;

-- Checklist writes are per-key so a stale client cannot replace a concurrently
-- updated field (notably evidenceAttached) with an older whole-object snapshot.
create or replace function public.set_case_checklist_item(
  target_case_id uuid,
  target_key text,
  target_value boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  persisted_checklist jsonb;
begin
  if target_key not in (
    'defectDocumented',
    'evidenceAttached',
    'noticeDrafted',
    'calendarReminderExported'
  ) then
    raise exception 'Unsupported checklist key';
  end if;

  update public.cases
  set checklist = jsonb_set(
    coalesce(checklist, '{}'::jsonb),
    array[target_key],
    to_jsonb(target_value),
    true
  ),
  updated_at = now()
  where id = target_case_id
    and user_id = auth.uid()
  returning checklist into persisted_checklist;

  return persisted_checklist;
end;
$$;

revoke all on function public.set_case_checklist_item(uuid, text, boolean) from public;
grant execute on function public.set_case_checklist_item(uuid, text, boolean) to authenticated;

create or replace function public.record_case_evidence_upload_reconciliation(
  target_case_id uuid,
  target_storage_path text,
  target_original_name text,
  target_mime_type text,
  target_size_bytes bigint
)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.cases
    where id = target_case_id and user_id = auth.uid() and status <> 'archived'
  ) then return false; end if;

  insert into public.case_evidence_upload_jobs (
    storage_path, user_id, case_id, original_name, mime_type, size_bytes
  ) values (
    target_storage_path, auth.uid(), target_case_id,
    target_original_name, target_mime_type, target_size_bytes
  ) on conflict (storage_path) do update set
    original_name = excluded.original_name,
    mime_type = excluded.mime_type,
    size_bytes = excluded.size_bytes;
  return true;
end;
$$;

revoke all on function public.record_case_evidence_upload_reconciliation(uuid, text, text, text, bigint) from public;
grant execute on function public.record_case_evidence_upload_reconciliation(uuid, text, text, text, bigint) to authenticated;

create or replace function public.reconcile_case_evidence_uploads(target_case_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare reconciled_count integer;
begin
  with ready_jobs as (
    select job.* from public.case_evidence_upload_jobs job
    where job.case_id = target_case_id and job.user_id = auth.uid()
      and exists (
        select 1 from public.cases
        where cases.id = job.case_id
          and cases.user_id = auth.uid()
          and cases.status <> 'archived'
      )
      and exists (
        select 1 from storage.objects object
        where object.bucket_id = 'case-evidence' and object.name = job.storage_path
      )
  ), inserted as (
    insert into public.case_evidence (user_id, case_id, storage_path, original_name, mime_type, size_bytes)
    select user_id, case_id, storage_path, original_name, mime_type, size_bytes from ready_jobs
    on conflict (storage_path) do nothing returning storage_path
  )
  delete from public.case_evidence_upload_jobs job
  where job.storage_path in (select storage_path from ready_jobs);

  get diagnostics reconciled_count = row_count;
  if reconciled_count > 0 then perform public.mark_case_evidence_attached(target_case_id); end if;
  return reconciled_count > 0;
end;
$$;

revoke all on function public.reconcile_case_evidence_uploads(uuid) from public;
grant execute on function public.reconcile_case_evidence_uploads(uuid) to authenticated;

-- Lock the parent case while capturing evidence paths and deleting it. The
-- foreign key's parent-row lock serializes concurrent metadata inserts with
-- this lock: an insert that wins is included, while one that loses observes
-- the deleted case and can clean up its just-uploaded object.
create or replace function public.delete_case_with_evidence(target_case_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  evidence_paths jsonb;
begin
  perform 1
  from public.cases
  where id = target_case_id
    and user_id = auth.uid()
  for update;

  if not found then
    -- A retry after an ambiguous transport failure recovers the durable paths
    -- written by the committed first call instead of losing them with metadata.
    select storage_paths
    into evidence_paths
    from public.case_evidence_cleanup_jobs
    where case_id = target_case_id
      and user_id = auth.uid();

    if found then
      return jsonb_build_object('deleted', true, 'storage_paths', evidence_paths);
    end if;

    return jsonb_build_object('deleted', false, 'storage_paths', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(storage_path order by created_at), '[]'::jsonb)
  into evidence_paths
  from (
    select storage_path, created_at from public.case_evidence
    where case_id = target_case_id and user_id = auth.uid()
    union
    select storage_path, created_at from public.case_evidence_upload_jobs
    where case_id = target_case_id and user_id = auth.uid()
  ) evidence_and_pending;

  insert into public.case_evidence_cleanup_jobs (case_id, user_id, storage_paths)
  values (target_case_id, auth.uid(), evidence_paths)
  on conflict (case_id) do update
    set storage_paths = excluded.storage_paths,
        user_id = excluded.user_id,
        created_at = now();

  delete from public.cases
  where id = target_case_id
    and user_id = auth.uid();

  return jsonb_build_object('deleted', true, 'storage_paths', evidence_paths);
end;
$$;

revoke all on function public.delete_case_with_evidence(uuid) from public;
grant execute on function public.delete_case_with_evidence(uuid) to authenticated;

create or replace function public.complete_case_evidence_cleanup(target_case_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  delete from public.case_evidence_cleanup_jobs
  where case_id = target_case_id
    and user_id = auth.uid();

  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

revoke all on function public.complete_case_evidence_cleanup(uuid) from public;
grant execute on function public.complete_case_evidence_cleanup(uuid) to authenticated;

drop policy if exists "Users can read own case_evidence" on public.case_evidence;
create policy "Users can read own case_evidence"
  on public.case_evidence for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.cases
      where cases.id = case_evidence.case_id
        and cases.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert own case_evidence" on public.case_evidence;
create policy "Users can insert own case_evidence"
  on public.case_evidence for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.cases
      where cases.id = case_evidence.case_id
        and cases.user_id = auth.uid()
        and cases.status <> 'archived'
    )
  );

-- No metadata update/delete policy in phase 1.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-evidence',
  'case-evidence',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read own case evidence objects" on storage.objects;
create policy "Users can read own case evidence objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'case-evidence'
    and cardinality(string_to_array(name, '/')) = 3
    and split_part(name, '/', 1) = auth.uid()::text
    and split_part(name, '/', 3) ~ '^[A-Za-z0-9_-]{1,128}[.](pdf|jpg|png)$'
    and exists (
      select 1 from public.cases
      where cases.id::text = split_part(name, '/', 2)
        and cases.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert own case evidence objects" on storage.objects;
create policy "Users can insert own case evidence objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'case-evidence'
    and cardinality(string_to_array(name, '/')) = 3
    and split_part(name, '/', 1) = auth.uid()::text
    and split_part(name, '/', 3) ~ '^[A-Za-z0-9_-]{1,128}[.](pdf|jpg|png)$'
    and exists (
      select 1 from public.cases
      where cases.id::text = split_part(name, '/', 2)
        and cases.user_id = auth.uid()
        and cases.status <> 'archived'
    )
  );

drop policy if exists "Users can delete own case evidence objects" on storage.objects;
create policy "Users can delete own case evidence objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'case-evidence'
    and cardinality(string_to_array(name, '/')) = 3
    and split_part(name, '/', 1) = auth.uid()::text
    and split_part(name, '/', 3) ~ '^[A-Za-z0-9_-]{1,128}[.](pdf|jpg|png)$'
  );
