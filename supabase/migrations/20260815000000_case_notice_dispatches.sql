-- A dispatch record records the owner's statement that dispatch occurred.
-- It does not prove delivery or receipt. Records are append-only for the Case lifetime;
-- Case deletion is intentional privacy erasure and cascades records.

create table public.case_notice_dispatches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  case_id uuid references public.cases(id) on delete cascade not null,
  notice_draft_id uuid references public.case_notice_drafts(id) on delete cascade not null,
  dispatched_at timestamptz not null check (dispatched_at <= now()),
  channel text not null check (channel in ('registered-mail', 'a-mail-plus', 'courier', 'hand-delivery')),
  reference text check (
    reference is null or (btrim(reference) <> '' and char_length(reference) <= 200)
  ),
  created_at timestamptz not null default now()
);

-- Enforce the three-way source binding without adding new unique indexes or
-- blocking constraints to the existing Cases/draft tables.
create function public.enforce_case_notice_dispatch_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.case_notice_drafts as draft
    join public.cases as compliance_case on compliance_case.id = draft.case_id
    where draft.id = new.notice_draft_id
      and draft.case_id = new.case_id
      and draft.user_id = new.user_id
      and new.dispatched_at >= draft.created_at
      and compliance_case.id = new.case_id
      and compliance_case.user_id = new.user_id
  ) then
    raise exception 'Notice dispatch source must match its owner, Case, and immutable draft'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_case_notice_dispatch_source() from public;

create trigger case_notice_dispatches_source_guard
before insert on public.case_notice_dispatches
for each row execute function public.enforce_case_notice_dispatch_source();

create index case_notice_dispatches_user_case_dispatched_idx
  on public.case_notice_dispatches (user_id, case_id, dispatched_at desc, id desc);

alter table public.case_notice_dispatches enable row level security;

create policy "Users can read own case notice dispatches"
  on public.case_notice_dispatches for select
  using (auth.uid() = user_id);

create policy "Users can record own case notice dispatches"
  on public.case_notice_dispatches for insert
  with check (auth.uid() = user_id);

revoke all on public.case_notice_dispatches from anon;
revoke all on public.case_notice_dispatches from authenticated;
grant select on public.case_notice_dispatches to authenticated;
grant insert (
  user_id,
  case_id,
  notice_draft_id,
  dispatched_at,
  channel,
  reference
) on public.case_notice_dispatches to authenticated;

comment on table public.case_notice_dispatches is
  'Append-only owner statement that an exact saved notice draft was dispatched; not proof of delivery or receipt.';
