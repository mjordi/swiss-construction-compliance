-- Remove vault_projects table and vault_project_id FK from protocols
-- The vault feature has been removed from the application.

alter table if exists public.protocols drop column if exists vault_project_id;
drop policy if exists "Users manage own vault projects" on public.vault_projects;
drop table if exists public.vault_projects;
