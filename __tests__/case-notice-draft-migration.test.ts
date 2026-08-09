import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260809000000_case_notice_drafts.sql";

function migrationSql() {
  return readFileSync(migrationPath, "utf8").toLowerCase();
}

describe("case notice draft revisions migration", () => {
  it("creates a complete, bounded, server-stamped snapshot", () => {
    const sql = migrationSql();

    expect(sql).toContain("create table public.case_notice_drafts");
    expect(sql).toMatch(/id uuid primary key default gen_random_uuid\(\)/);
    expect(sql).toMatch(/user_id uuid references auth\.users\(id\) on delete cascade not null/);
    expect(sql).toMatch(/case_id uuid references public\.cases\(id\) on delete cascade not null/);
    expect(sql).toMatch(/project_name text not null[\s\S]*btrim\(project_name\) <> ''[\s\S]*char_length\(project_name\) <= 200/);
    expect(sql).toMatch(/canton text not null[\s\S]*btrim\(canton\) <> ''[\s\S]*char_length\(canton\) <= 2/);
    expect(sql).toMatch(/notice_recipient_name text not null[\s\S]*btrim\(notice_recipient_name\) <> ''[\s\S]*char_length\(notice_recipient_name\) <= 200/);
    expect(sql).toMatch(/notice_recipient_address text not null[\s\S]*btrim\(notice_recipient_address\) <> ''[\s\S]*char_length\(notice_recipient_address\) <= 1000/);
    expect(sql).toMatch(/defect_statement text not null[\s\S]*btrim\(defect_statement\) <> ''[\s\S]*char_length\(defect_statement\) <= 4000/);
    expect(sql).toContain("contract_date date not null");
    expect(sql).toContain("discovery_date date not null");
    expect(sql).toContain("notice_deadline date");
    expect(sql).toMatch(/regime text not null[\s\S]*check \(regime in \('old', 'new'\)\)/);
    expect(sql).toMatch(/created_at timestamptz not null default now\(\)/);
  });

  it("allows owners to select and insert only client-owned snapshot columns", () => {
    const sql = migrationSql();
    const selectPolicy = sql.match(/create policy "users can read own case notice drafts"[\s\S]*?;/)?.[0];
    const insertPolicy = sql.match(/create policy "users can create own case notice drafts"[\s\S]*?;/)?.[0];

    expect(sql).toContain("alter table public.case_notice_drafts enable row level security");
    expect(selectPolicy).toMatch(/for select[\s\S]*auth\.uid\(\) = user_id/);
    expect(insertPolicy).toMatch(/for insert[\s\S]*with check[\s\S]*auth\.uid\(\) = user_id[\s\S]*exists[\s\S]*from public\.cases[\s\S]*cases\.id = case_id[\s\S]*cases\.user_id = auth\.uid\(\)/);
    expect(sql).toContain("revoke all on public.case_notice_drafts from authenticated");
    expect(sql).toContain("grant select on public.case_notice_drafts to authenticated");
    const insertGrant = sql.match(/grant insert\s*\(([\s\S]*?)\)\s*on public\.case_notice_drafts to authenticated;/)?.[1];
    expect(insertGrant?.split(",").map((column) => column.trim())).toEqual([
      "user_id",
      "case_id",
      "project_name",
      "canton",
      "notice_recipient_name",
      "notice_recipient_address",
      "defect_statement",
      "contract_date",
      "discovery_date",
      "notice_deadline",
      "regime",
    ]);
    expect(insertGrant).not.toMatch(/\b(id|created_at)\b/);
    expect(sql).not.toMatch(/grant\s+(select\s*,\s*)?insert\s+on public\.case_notice_drafts/);
    expect(sql).not.toMatch(/grant[^;]*(update|delete)/);
    expect(sql).not.toMatch(/create policy[\s\S]*?for (update|delete)/);
  });

  it("documents Case-lifetime immutability and privacy cascade deletion", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/revisions are immutable\/read-only for the case lifetime/);
    expect(sql).toMatch(/case deletion is[\s\S]*privacy erasure[\s\S]*revisions are purged/);
    expect(sql).toMatch(/case_id uuid references public\.cases\(id\) on delete cascade not null/);
  });

  it("exposes only the server-selected latest revision per owner and Case", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/create view public\.latest_case_notice_drafts\s+with \(security_invoker = true\)/);
    expect(sql).toMatch(/select distinct on \(user_id, case_id\) \*[\s\S]*order by user_id, case_id, created_at desc, id desc/);
    expect(sql).toContain("revoke all on public.latest_case_notice_drafts from anon");
    expect(sql).toContain("revoke all on public.latest_case_notice_drafts from authenticated");
    expect(sql).toContain("grant select on public.latest_case_notice_drafts to authenticated");
  });
});
