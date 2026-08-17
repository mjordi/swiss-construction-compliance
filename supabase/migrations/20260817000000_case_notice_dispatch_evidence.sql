-- One append-only association of existing private evidence with an immutable dispatch.
-- This is user-linked supporting evidence, not verified proof of delivery or receipt.
create table public.case_notice_dispatch_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  case_id uuid references public.cases(id) on delete cascade not null,
  dispatch_id uuid references public.case_notice_dispatches(id) on delete cascade not null unique,
  evidence_id uuid references public.case_evidence(id) on delete cascade not null,
  created_at timestamptz not null default now()
);

create function public.enforce_case_notice_dispatch_evidence_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.case_notice_dispatches as dispatch
    join public.case_notice_drafts as draft on draft.id = dispatch.notice_draft_id
    join public.cases as compliance_case on compliance_case.id = dispatch.case_id
    where dispatch.id = new.dispatch_id
      and dispatch.user_id = new.user_id
      and dispatch.case_id = new.case_id
      and draft.id = dispatch.notice_draft_id
      and draft.user_id = new.user_id
      and draft.case_id = new.case_id
      and compliance_case.user_id = new.user_id
  ) then
    raise exception 'Evidence association dispatch source must match its owner, Case, and immutable notice source'
      using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.case_evidence as evidence
    where evidence.id = new.evidence_id
      and evidence.user_id = new.user_id
      and evidence.case_id = new.case_id
  ) then
    raise exception 'Evidence association must reference existing evidence owned by the same owner and Case'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_case_notice_dispatch_evidence_source() from public;
create trigger case_notice_dispatch_evidence_source_guard
before insert on public.case_notice_dispatch_evidence
for each row execute function public.enforce_case_notice_dispatch_evidence_source();

create index case_notice_dispatch_evidence_user_case_idx
  on public.case_notice_dispatch_evidence (user_id, case_id, dispatch_id);

alter table public.case_notice_dispatch_evidence enable row level security;
create policy "Users can read own notice dispatch evidence"
  on public.case_notice_dispatch_evidence for select using (auth.uid() = user_id);
create policy "Users can link own notice dispatch evidence"
  on public.case_notice_dispatch_evidence for insert with check (auth.uid() = user_id);

revoke all on public.case_notice_dispatch_evidence from anon;
revoke all on public.case_notice_dispatch_evidence from authenticated;
grant select on public.case_notice_dispatch_evidence to authenticated;
grant insert (user_id, case_id, dispatch_id, evidence_id)
  on public.case_notice_dispatch_evidence to authenticated;

comment on table public.case_notice_dispatch_evidence is
  'Append-only user-linked supporting evidence for one immutable notice dispatch; not verified proof of delivery or receipt.';
