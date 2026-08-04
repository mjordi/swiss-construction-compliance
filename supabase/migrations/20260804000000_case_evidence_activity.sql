-- First source-bound activity event for the case audit ledger. Events are
-- generated only from persisted evidence metadata; authenticated clients can
-- read their own history but cannot write, edit, or delete individual events.
create table public.case_activity_events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  case_id uuid references public.cases(id) on delete cascade not null,
  -- Keep the immutable source identifier if evidence is later removed. The case
  -- foreign key remains the privacy boundary and cascades the whole activity log.
  evidence_id uuid not null,
  event_type text not null check (event_type = 'evidence_uploaded'),
  source_name text not null check (char_length(source_name) between 1 and 255),
  source_mime_type text not null check (
    source_mime_type in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  source_size_bytes bigint not null check (source_size_bytes between 1 and 10485760),
  occurred_at timestamptz not null,
  unique (event_type, evidence_id)
);

create index case_activity_events_user_case_occurred_idx
  on public.case_activity_events (user_id, case_id, occurred_at desc);

alter table public.case_activity_events enable row level security;

create policy "Users can read own case activity events"
  on public.case_activity_events for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.cases
      where cases.id = case_activity_events.case_id
        and cases.user_id = auth.uid()
    )
  );

revoke all on public.case_activity_events from anon;
revoke all on public.case_activity_events from authenticated;
grant select on public.case_activity_events to authenticated;

create or replace function public.record_case_evidence_upload_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.case_activity_events (
    user_id,
    case_id,
    evidence_id,
    event_type,
    source_name,
    source_mime_type,
    source_size_bytes,
    occurred_at
  ) values (
    new.user_id,
    new.case_id,
    new.id,
    'evidence_uploaded',
    new.original_name,
    new.mime_type,
    new.size_bytes,
    clock_timestamp()
  )
  on conflict (event_type, evidence_id) do nothing;

  return new;
end;
$$;

revoke all on function public.record_case_evidence_upload_activity() from public;
revoke all on function public.record_case_evidence_upload_activity() from anon;
revoke all on function public.record_case_evidence_upload_activity() from authenticated;

drop trigger if exists record_case_evidence_upload_activity on public.case_evidence;
create trigger record_case_evidence_upload_activity
  after insert on public.case_evidence
  for each row execute function public.record_case_evidence_upload_activity();

-- Preserve provenance for evidence that landed before this event contract. The
-- trigger is installed first so concurrent inserts cannot fall between the
-- backfill snapshot and trigger activation; the unique source key deduplicates
-- rows seen by both paths.
insert into public.case_activity_events (
  user_id,
  case_id,
  evidence_id,
  event_type,
  source_name,
  source_mime_type,
  source_size_bytes,
  occurred_at
)
select
  evidence.user_id,
  evidence.case_id,
  evidence.id,
  'evidence_uploaded',
  evidence.original_name,
  evidence.mime_type,
  evidence.size_bytes,
  evidence.created_at
from public.case_evidence evidence
on conflict (event_type, evidence_id) do nothing;
