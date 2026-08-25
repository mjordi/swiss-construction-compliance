-- Finalized protocol content and signature fields cannot be changed, and a
-- protocol cannot be individually deleted by authenticated users. Deleting a
-- linked Case clears the Case association through the existing case_id foreign
-- key; deleting the auth account removes its protocol records through user_id.
-- This database boundary does not provide external retention or absolute
-- immutability.

alter table public.protocols enable row level security;

drop policy if exists "Users can CRUD own protocols" on public.protocols;
drop policy if exists "Users can read own finalized protocols" on public.protocols;
drop policy if exists "Users can insert own finalized protocols" on public.protocols;

revoke all on public.protocols from anon;
revoke all on public.protocols from authenticated;

grant select on public.protocols to authenticated;
grant insert (
  user_id,
  case_id,
  project_name,
  contractor,
  client,
  defect_description,
  signature_data,
  status
) on public.protocols to authenticated;

create policy "Users can read own finalized protocols"
  on public.protocols
  for select
  to authenticated
  using (
    auth.uid() = protocols.user_id
    and protocols.status = 'finalized'
  );

create policy "Users can insert own finalized protocols"
  on public.protocols
  for insert
  to authenticated
  with check (
    auth.uid() = protocols.user_id
    and protocols.status = 'finalized'
    and (
      protocols.case_id is null
      or exists (
        select 1
        from public.cases as compliance_case
        where compliance_case.id = protocols.case_id
          and compliance_case.user_id = auth.uid()
      )
    )
  );

comment on table public.protocols is
  'Finalized protocol content and signature fields cannot be changed, and a protocol cannot be individually deleted by authenticated users. Deleting a linked Case clears the Case association; deleting the auth account removes its protocol records. This database boundary does not provide external retention or absolute immutability.';
