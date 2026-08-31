-- Governed, read-only sharing for the derived compliance work queue.
-- Membership and event tables remain private; authenticated clients use only
-- the narrow RPC boundary below. Case, Protocol, and evidence RLS is unchanged.

create table public.compliance_queue_memberships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  collaborator_id uuid not null references auth.users(id) on delete cascade,
  granted_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  constraint compliance_queue_memberships_no_self_grant
    check (owner_id <> collaborator_id),
  constraint compliance_queue_memberships_revocation_order
    check (revoked_at is null or revoked_at >= granted_at)
);

create unique index compliance_queue_memberships_one_active_relationship
  on public.compliance_queue_memberships (owner_id, collaborator_id)
  where revoked_at is null;

create index compliance_queue_memberships_active_collaborator_lookup
  on public.compliance_queue_memberships (collaborator_id, owner_id)
  where revoked_at is null;

create table public.compliance_queue_membership_events (
  id uuid primary key default gen_random_uuid(),
  -- Keep the source membership UUID as an immutable fact without a foreign key:
  -- account deletion may remove memberships, but must not erase their audit history.
  membership_id uuid not null,
  owner_id uuid not null,
  collaborator_id uuid not null,
  actor_id uuid not null,
  event_type text not null check (event_type in ('grant', 'revoke')),
  occurred_at timestamptz not null default statement_timestamp()
);

alter table public.compliance_queue_memberships enable row level security;
alter table public.compliance_queue_membership_events enable row level security;

revoke all on table public.compliance_queue_memberships from anon, authenticated;
revoke all on table public.compliance_queue_membership_events from anon, authenticated;

create or replace function public.grant_compliance_queue_access(target_collaborator_email text)
returns table (
  membership_id uuid,
  collaborator_id uuid,
  collaborator_email text,
  granted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  candidate_id uuid;
  candidate_email text;
  created public.compliance_queue_memberships%rowtype;
begin
  if caller_id is null then
    raise exception 'compliance_queue_grant_unavailable';
  end if;

  select users.id, users.email
    into candidate_id, candidate_email
  from auth.users as users
  where users.email is not null
    and lower(users.email) = lower(btrim(target_collaborator_email))
  limit 1;

  if candidate_id is null
    or candidate_id = caller_id
    or exists (
      select 1
      from public.compliance_queue_memberships as memberships
      where memberships.owner_id = caller_id
        and memberships.collaborator_id = candidate_id
        and memberships.revoked_at is null
    )
  then
    raise exception 'compliance_queue_grant_unavailable';
  end if;

  begin
    insert into public.compliance_queue_memberships (owner_id, collaborator_id)
    values (caller_id, candidate_id)
    returning * into created;
  exception when unique_violation then
    raise exception 'compliance_queue_grant_unavailable';
  end;

  insert into public.compliance_queue_membership_events (
    membership_id, owner_id, collaborator_id, actor_id, event_type, occurred_at
  ) values (
    created.id, created.owner_id, created.collaborator_id, caller_id, 'grant', created.granted_at
  );

  return query select created.id, candidate_id, candidate_email, created.granted_at;
end;
$$;

create or replace function public.revoke_compliance_queue_access(target_collaborator_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  revoked public.compliance_queue_memberships%rowtype;
begin
  if caller_id is null then
    raise exception 'compliance_queue_revoke_unavailable';
  end if;

  update public.compliance_queue_memberships as memberships
  set revoked_at = statement_timestamp()
  where memberships.owner_id = auth.uid()
    and memberships.collaborator_id = target_collaborator_id
    and memberships.revoked_at is null
  returning memberships.* into revoked;

  if revoked.id is null then
    raise exception 'compliance_queue_revoke_unavailable';
  end if;

  insert into public.compliance_queue_membership_events (
    membership_id, owner_id, collaborator_id, actor_id, event_type, occurred_at
  ) values (
    revoked.id, revoked.owner_id, revoked.collaborator_id, caller_id, 'revoke', revoked.revoked_at
  );

  return true;
end;
$$;

create or replace function public.list_owned_compliance_queue_grants()
returns table (
  membership_id uuid,
  collaborator_id uuid,
  collaborator_email text,
  granted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select memberships.id, memberships.collaborator_id, users.email, memberships.granted_at
  from public.compliance_queue_memberships as memberships
  join auth.users as users on users.id = memberships.collaborator_id
  where auth.uid() is not null
    and memberships.owner_id = auth.uid()
    and memberships.revoked_at is null
  order by lower(users.email), memberships.id;
$$;

create or replace function public.list_shared_compliance_queue_owners()
returns table (
  owner_id uuid,
  owner_name text,
  owner_company text,
  granted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select memberships.owner_id, profiles.full_name, profiles.company, memberships.granted_at
  from public.compliance_queue_memberships as memberships
  left join public.profiles as profiles on profiles.id = memberships.owner_id
  where auth.uid() is not null
    and memberships.collaborator_id = auth.uid()
    and memberships.revoked_at is null
  order by coalesce(nullif(btrim(profiles.full_name), ''), nullif(btrim(profiles.company), ''), memberships.owner_id::text), memberships.owner_id;
$$;

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

revoke all on function public.grant_compliance_queue_access(text) from public, anon;
revoke all on function public.revoke_compliance_queue_access(uuid) from public, anon;
revoke all on function public.list_owned_compliance_queue_grants() from public, anon;
revoke all on function public.list_shared_compliance_queue_owners() from public, anon;
revoke all on function public.get_compliance_work_queue_snapshot(uuid) from public, anon;

grant execute on function public.grant_compliance_queue_access(text) to authenticated;
grant execute on function public.revoke_compliance_queue_access(uuid) to authenticated;
grant execute on function public.list_owned_compliance_queue_grants() to authenticated;
grant execute on function public.list_shared_compliance_queue_owners() to authenticated;
grant execute on function public.get_compliance_work_queue_snapshot(uuid) to authenticated;
