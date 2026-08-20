-- Return the complete owner-visible Vault source data from one PostgreSQL
-- statement. PostgreSQL gives every subquery in the statement the same MVCC
-- snapshot, so concurrent Case/Protocol creation cannot fall between pages.
create or replace function public.get_vault_audit_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'cases', coalesce(
      (
        select jsonb_agg(to_jsonb(c) order by c.id)
        from public.cases as c
        where c.user_id = auth.uid()
      ),
      '[]'::jsonb
    ),
    'protocols', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'case_id', p.case_id,
            'project_name', p.project_name
          )
          order by p.id
        )
        from public.protocols as p
        where p.user_id = auth.uid()
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.get_vault_audit_snapshot() from public;
grant execute on function public.get_vault_audit_snapshot() to authenticated;