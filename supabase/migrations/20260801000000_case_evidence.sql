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
  )
  where id = target_case_id
    and user_id = auth.uid();

  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

revoke all on function public.mark_case_evidence_attached(uuid) from public;
grant execute on function public.mark_case_evidence_attached(uuid) to authenticated;

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
