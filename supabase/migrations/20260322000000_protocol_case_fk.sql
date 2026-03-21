-- Link protocols to real cases via UUID FK.
-- Existing protocols had text-based fake IDs — drop and re-add as proper FK.

alter table public.protocols drop column if exists case_id;

alter table public.protocols
  add column case_id uuid references public.cases(id) on delete set null;

create index if not exists idx_protocols_case_id on public.protocols(case_id);
