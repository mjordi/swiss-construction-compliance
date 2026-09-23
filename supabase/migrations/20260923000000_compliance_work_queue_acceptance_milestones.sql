-- Extend the existing narrow work queue snapshot with the owner-entered
-- acceptance date required to derive imminent acceptance milestones.
create or replace function public.get_compliance_work_queue_snapshot(target_owner_id uuid default auth.uid())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    target_owner_id = auth.uid()
    or exists (
      select 1
      from public.compliance_queue_memberships as memberships
      where memberships.owner_id = target_owner_id
        and memberships.collaborator_id = auth.uid()
        and memberships.revoked_at is null
    )
  ) then
    raise exception 'compliance_queue_snapshot_unavailable';
  end if;

  return jsonb_build_object(
    'cases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'project_name', c.project_name,
        'canton', c.canton,
        'contract_date', c.contract_date,
        'discovery_date', c.discovery_date,
        'acceptance_date', c.acceptance_date,
        'checklist', c.checklist,
        'status', c.status
      ) order by c.id)
      from public.cases as c
      where c.user_id = target_owner_id
        and c.status in ('active', 'review')
    ), '[]'::jsonb),
    'protocols', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'case_id', p.case_id
      ) order by p.id)
      from public.protocols as p
      join public.cases as c
        on c.id = p.case_id
       and c.user_id = target_owner_id
       and c.status in ('active', 'review')
      where p.user_id = target_owner_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_compliance_work_queue_snapshot(uuid) from public, anon;
grant execute on function public.get_compliance_work_queue_snapshot(uuid) to authenticated;
