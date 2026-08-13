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
  created_at,
  nullif(btrim(signature_data), '') is not null as signature_captured
from public.protocols;

revoke all on public.protocol_register_records from public;
grant select on public.protocol_register_records to authenticated;

comment on view public.protocol_register_records is
  'Lightweight finalized-protocol register projection that excludes evidence payloads.';