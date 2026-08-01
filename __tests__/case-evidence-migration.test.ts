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
    expect(fn).toMatch(/where id = target_case_id\s+and user_id = auth\.uid\(\)/);
    expect(fn).toContain("get diagnostics affected_rows = row_count");
    expect(fn).toContain("return affected_rows > 0");
    expect(sql).toContain("revoke all on function public.mark_case_evidence_attached(uuid) from public");
    expect(sql).toContain("grant execute on function public.mark_case_evidence_attached(uuid) to authenticated");
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
    }

    const deletePolicy = storagePolicy(sql, "delete", "delete");
    expect(deletePolicy).toContain("bucket_id = 'case-evidence'");
    expect(deletePolicy).toContain("cardinality(string_to_array(name, '/')) = 3");
    expect(deletePolicy).toContain("split_part(name, '/', 1) = auth.uid()::text");
    expect(deletePolicy).toContain(`split_part(name, '/', 3) ~ ${pathRegex}`);
    expect(deletePolicy).not.toContain("public.cases");
    expect(deletePolicy).not.toContain("exists (");
  });
});
