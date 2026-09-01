-- Explicit owner-entered source fact; it must not be inferred.
alter table public.cases
  add column if not exists acceptance_date date;
