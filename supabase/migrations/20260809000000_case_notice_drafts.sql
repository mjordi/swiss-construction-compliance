create table public.case_notice_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  -- Revisions are immutable/read-only for the Case lifetime. Case deletion is
  -- intentional privacy erasure, so its saved revisions are purged as well.
  case_id uuid references public.cases(id) on delete cascade not null,
  project_name text not null check (
    btrim(project_name) <> '' and
    char_length(project_name) <= 200
  ),
  canton text not null check (
    btrim(canton) <> '' and
    char_length(canton) <= 2
  ),
  notice_recipient_name text not null check (
    btrim(notice_recipient_name) <> '' and
    char_length(notice_recipient_name) <= 200
  ),
  notice_recipient_address text not null check (
    btrim(notice_recipient_address) <> '' and
    char_length(notice_recipient_address) <= 1000
  ),
  defect_statement text not null check (
    btrim(defect_statement) <> '' and
    char_length(defect_statement) <= 4000
  ),
  contract_date date not null,
  discovery_date date not null,
  notice_deadline date,
  regime text not null check (regime in ('old', 'new')),
  created_at timestamptz not null default now()
);

create index case_notice_drafts_user_case_created_idx
  on public.case_notice_drafts (user_id, case_id, created_at desc);

alter table public.case_notice_drafts enable row level security;

create policy "Users can read own case notice drafts"
  on public.case_notice_drafts
  for select
  using (auth.uid() = user_id);

create policy "Users can create own case notice drafts"
  on public.case_notice_drafts
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.cases
      where cases.id = case_id
        and cases.user_id = auth.uid()
    )
  );

revoke all on public.case_notice_drafts from anon;
revoke all on public.case_notice_drafts from authenticated;
grant select on public.case_notice_drafts to authenticated;
grant insert (
  user_id,
  case_id,
  project_name,
  canton,
  notice_recipient_name,
  notice_recipient_address,
  defect_statement,
  contract_date,
  discovery_date,
  notice_deadline,
  regime
) on public.case_notice_drafts to authenticated;

-- Keep client reads bounded to one server-selected latest revision per Case.
-- security_invoker preserves the underlying table's owner-scoped RLS policy.
create view public.latest_case_notice_drafts
with (security_invoker = true)
as
select distinct on (user_id, case_id) *
from public.case_notice_drafts
order by user_id, case_id, created_at desc, id desc;

revoke all on public.latest_case_notice_drafts from anon;
revoke all on public.latest_case_notice_drafts from authenticated;
grant select on public.latest_case_notice_drafts to authenticated;
