-- =============================================================
-- BauCompliance.ch — Supabase Schema
-- Run this in the Supabase SQL Editor to set up all tables.
-- =============================================================

-- 1. Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  company text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Cases
create table if not exists public.cases (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  project_name text not null,
  canton text not null,
  contract_date date not null,
  discovery_date date not null,
  checklist jsonb default '{"defectDocumented":false,"evidenceAttached":false,"noticeDrafted":false,"calendarReminderExported":false}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.cases enable row level security;

create policy "Users can CRUD own cases"
  on public.cases for all using (auth.uid() = user_id);

-- 3. Vault Projects
create table if not exists public.vault_projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  status text default 'active' check (status in ('active', 'review', 'archived')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.vault_projects enable row level security;

create policy "Users can CRUD own vault projects"
  on public.vault_projects for all using (auth.uid() = user_id);

-- 4. Protocols (wizard output)
create table if not exists public.protocols (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  case_id text not null,
  project_name text not null,
  contractor text not null,
  client text not null,
  defect_description text,
  signature_data text,
  status text default 'draft' check (status in ('draft', 'awaiting-signature', 'finalized')),
  vault_project_id uuid references public.vault_projects on delete set null,
  created_at timestamptz default now()
);

alter table public.protocols enable row level security;

create policy "Users can CRUD own protocols"
  on public.protocols for all using (auth.uid() = user_id);
