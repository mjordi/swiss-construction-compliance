alter table public.protocols
  add column if not exists finalized_at timestamptz;

update public.protocols
set finalized_at = created_at
where status = 'finalized'
  and finalized_at is null;

create or replace function public.set_protocol_finalized_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'finalized' then
    new.finalized_at := now();
  elsif tg_op = 'UPDATE' and new.status = 'finalized' and old.status is distinct from 'finalized' then
    new.finalized_at := now();
  elsif tg_op = 'UPDATE' and new.status = 'finalized' then
    new.finalized_at := old.finalized_at;
  else
    new.finalized_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_protocol_finalized_at on public.protocols;
create trigger set_protocol_finalized_at
before insert or update of status, finalized_at on public.protocols
for each row execute function public.set_protocol_finalized_at();

create or replace view public.protocol_register_records
with (security_invoker = true)
as
select
  id,
  user_id,
  case_id,
  project_name,
  contractor,
  client,
  status,
  finalized_at,
  nullif(btrim(signature_data), '') is not null as signature_captured
from public.protocols;

revoke all on public.protocol_register_records from public;
grant select on public.protocol_register_records to authenticated;

comment on column public.protocols.finalized_at is
  'Server-recorded timestamp of the latest transition into finalized status.';