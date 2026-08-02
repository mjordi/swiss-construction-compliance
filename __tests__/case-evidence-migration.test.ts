import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve("supabase/migrations/20260801000000_case_evidence.sql");
const pathRegex = "'^[a-za-z0-9_-]{1,128}[.](pdf|jpg|png)$'";

function migrationSql() {
  return readFileSync(migrationPath, "utf8").toLowerCase();
}

function storagePolicy(sql: string, verb: "read" | "insert" | "delete", operation: "select" | "insert" | "delete") {
  return sql.match(new RegExp(`create policy "users can ${verb} own case evidence objects"[\\s\\S]*?for ${operation}[\\s\\S]*?;`))?.[0];
}

describe("case evidence migration", () => {
  it("adds the Cases workflow status before archived evidence guards reference it", () => {
    const sql = migrationSql();
    const statusColumn = sql.indexOf("add column if not exists status text not null default 'active'");
    const firstArchivedGuard = sql.indexOf("cases.status <> 'archived'");

    expect(statusColumn).toBeGreaterThan(-1);
    expect(sql).toContain("check (status in ('active', 'review', 'archived'))");
    expect(firstArchivedGuard).toBeGreaterThan(statusColumn);
  });

  it("creates constrained owner/case/path-bound metadata with RLS and PostgreSQL-safe path regexes", () => {
    const sql = migrationSql();

    expect(sql).toContain("create table if not exists public.case_evidence");
    for (const column of ["user_id", "case_id", "storage_path", "original_name", "mime_type", "size_bytes", "created_at"]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain("unique (storage_path)");
    expect(sql).toMatch(/constraint case_evidence_storage_path_matches_case check\s*\([\s\S]*?cardinality\(string_to_array\(storage_path, '\/'\)\) = 3[\s\S]*?split_part\(storage_path, '\/', 1\) = user_id::text[\s\S]*?split_part\(storage_path, '\/', 2\) = case_id::text[\s\S]*?split_part\(storage_path, '\/', 3\) ~/);
    expect(sql.match(new RegExp(pathRegex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(4);
    expect(sql).not.toContain(String.raw`\\.(pdf|jpg|png)`);
    expect(sql).toContain("size_bytes between 1 and 10485760");
    expect(sql).toContain("application/pdf");
    expect(sql).toContain("image/jpeg");
    expect(sql).toContain("image/png");
    expect(sql).toContain("enable row level security");

    const selectPolicy = sql.match(/create policy "users can read own case_evidence"[\s\S]*?;/)?.[0];
    expect(selectPolicy).toMatch(/auth\.uid\(\) = user_id[\s\S]*?exists\s*\([\s\S]*?cases\.id = case_evidence\.case_id[\s\S]*?cases\.user_id = auth\.uid\(\)/);
    const insertPolicy = sql.match(/create policy "users can insert own case_evidence"[\s\S]*?;/)?.[0];
    expect(insertPolicy).toMatch(/auth\.uid\(\) = user_id[\s\S]*?exists\s*\([\s\S]*?cases\.id = case_evidence\.case_id[\s\S]*?cases\.user_id = auth\.uid\(\)/);
    expect(sql).toContain("create index if not exists case_evidence_user_case_created_idx");
  });

  it("atomically marks only the authenticated owner's evidence checklist field", () => {
    const sql = migrationSql();
    const fn = sql.match(/create or replace function public\.mark_case_evidence_attached\(target_case_id uuid\)[\s\S]*?\$\$;/)?.[0];

    expect(fn).toBeDefined();
    expect(fn).toContain("returns boolean");
    expect(fn).toContain("security invoker");
    expect(fn).toContain("set search_path = ''");
    expect(fn).toContain("update public.cases");
    expect(fn).toContain("jsonb_set(");
    expect(fn).toContain("coalesce(checklist, '{}'::jsonb)");
    expect(fn).toContain("'{evidenceattached}'");
    expect(fn).toContain("'true'::jsonb");
    expect(fn).toContain("updated_at = now()");
    expect(fn).toMatch(/where id = target_case_id\s+and user_id = auth\.uid\(\)/);
    expect(fn).toContain("get diagnostics affected_rows = row_count");
    expect(fn).toContain("return affected_rows > 0");
    expect(sql).toContain("revoke all on function public.mark_case_evidence_attached(uuid) from public");
    expect(sql).toContain("grant execute on function public.mark_case_evidence_attached(uuid) to authenticated");
  });

  it("persists Cases checklist toggles per key without replacing concurrent fields", () => {
    const sql = migrationSql();
    const fn = sql.match(/create or replace function public\.set_case_checklist_item\([\s\S]*?\$\$;/)?.[0];

    expect(fn).toBeDefined();
    expect(fn).toContain("target_key text");
    expect(fn).toContain("target_value boolean");
    expect(fn).toContain("'evidenceattached'");
    expect(fn).toContain("array[target_key]");
    expect(fn).toContain("to_jsonb(target_value)");
    expect(fn).toMatch(/where id = target_case_id\s+and user_id = auth\.uid\(\)/);
    expect(fn).toContain("returns jsonb");
    expect(fn).toContain("returning checklist into persisted_checklist");
    expect(fn).toContain("return persisted_checklist");
    expect(sql).toContain("revoke all on function public.set_case_checklist_item(uuid, text, boolean) from public");
    expect(sql).toContain("grant execute on function public.set_case_checklist_item(uuid, text, boolean) to authenticated");
  });

  it("serializes case deletion and durably preserves cleanup paths across ambiguous responses", () => {
    const sql = migrationSql();
    const fn = sql.match(/create or replace function public\.delete_case_with_evidence\(target_case_id uuid\)[\s\S]*?\$\$;/)?.[0];

    expect(fn).toBeDefined();
    expect(fn).toContain("returns jsonb");
    expect(fn).toContain("security invoker");
    expect(fn).toContain("set search_path = ''");
    expect(fn).toMatch(/from public\.cases[\s\S]*?where id = target_case_id[\s\S]*?and user_id = auth\.uid\(\)[\s\S]*?for update/);
    expect(fn).toMatch(/select coalesce\(jsonb_agg\(storage_path order by created_at\), '\[\]'::jsonb\)[\s\S]*?from public\.case_evidence[\s\S]*?delete from public\.cases/);
    expect(sql).toContain("create table if not exists public.case_evidence_cleanup_jobs");
    expect(sql).toMatch(/case_id uuid primary key[\s\S]*?storage_paths jsonb not null/);
    expect(fn).toMatch(/if not found then[\s\S]*?from public\.case_evidence_cleanup_jobs[\s\S]*?return jsonb_build_object\('deleted', true, 'storage_paths', evidence_paths\)/);
    expect(fn).toMatch(/insert into public\.case_evidence_cleanup_jobs[\s\S]*?delete from public\.cases/);
    expect(fn).not.toContain("if jsonb_array_length(evidence_paths) > 0 then");
    expect(fn).toContain("jsonb_build_object('deleted', true, 'storage_paths', evidence_paths)");
    expect(sql).toContain("revoke all on function public.delete_case_with_evidence(uuid) from public");
    expect(sql).toContain("grant execute on function public.delete_case_with_evidence(uuid) to authenticated");
    const completeFn = sql.match(/create or replace function public\.complete_case_evidence_cleanup\(target_case_id uuid\)[\s\S]*?\$\$;/)?.[0];
    expect(completeFn).toMatch(/delete from public\.case_evidence_cleanup_jobs[\s\S]*?user_id = auth\.uid\(\)/);
    expect(sql).toContain("grant execute on function public.complete_case_evidence_cleanup(uuid) to authenticated");
  });

  it("persists and later reconciles ambiguous upload paths", () => {
    const sql = migrationSql();

    expect(sql).toContain("create table if not exists public.case_evidence_upload_jobs");
    expect(sql).toContain("record_case_evidence_upload_reconciliation");
    expect(sql).toContain("reconcile_case_evidence_uploads");
    expect(sql).toMatch(/reconcile_case_evidence_uploads[\s\S]*?storage\.objects[\s\S]*?insert into public\.case_evidence[\s\S]*?delete from public\.case_evidence_upload_jobs/);
    expect(sql).toMatch(/select storage_path, created_at from public\.case_evidence_upload_jobs[\s\S]*?where case_id = target_case_id/);
  });

  it("keeps read/insert case-bound but permits exact owner-path delete after case deletion", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/insert into storage\.buckets[\s\S]+case-evidence/);
    expect(sql).toContain("false");
    expect(sql).toContain("10485760");

    for (const [verb, operation] of [["read", "select"], ["insert", "insert"]] as const) {
      const policy = storagePolicy(sql, verb, operation);
      expect(policy, `${operation} policy missing`).toBeDefined();
      expect(policy).toContain("bucket_id = 'case-evidence'");
      expect(policy).toContain("cardinality(string_to_array(name, '/')) = 3");
      expect(policy).toContain("split_part(name, '/', 1) = auth.uid()::text");
      expect(policy).toContain(`split_part(name, '/', 3) ~ ${pathRegex}`);
      expect(policy).toMatch(/exists\s*\([\s\S]*?public\.cases[\s\S]*?cases\.id::text = split_part\(name, '\/', 2\)[\s\S]*?cases\.user_id = auth\.uid\(\)/);
      if (operation === "insert") expect(policy).toContain("cases.status <> 'archived'");
    }

    const metadataInsertPolicy = sql.match(/create policy "users can insert own case_evidence"[\s\S]*?;/)?.[0];
    expect(metadataInsertPolicy).toContain("cases.status <> 'archived'");

    const deletePolicy = storagePolicy(sql, "delete", "delete");
    expect(deletePolicy).toContain("bucket_id = 'case-evidence'");
    expect(deletePolicy).toContain("cardinality(string_to_array(name, '/')) = 3");
    expect(deletePolicy).toContain("split_part(name, '/', 1) = auth.uid()::text");
    expect(deletePolicy).toContain(`split_part(name, '/', 3) ~ ${pathRegex}`);
    expect(deletePolicy).not.toContain("public.cases");
    expect(deletePolicy).not.toContain("exists (");
  });
});
