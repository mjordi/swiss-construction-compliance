import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260807000000_case_notice_source_basis.sql";

function migrationSql() {
  return readFileSync(migrationPath, "utf8").toLowerCase();
}

describe("case notice source-basis migration", () => {
  it("adds nullable, bounded source fields without replacing the owner-scoped cases policy", () => {
    const sql = migrationSql();

    expect(sql).toContain("alter table public.cases");
    expect(sql).toMatch(/add column if not exists notice_recipient_name text/);
    expect(sql).toMatch(/add column if not exists notice_recipient_address text/);
    expect(sql).toMatch(/add column if not exists defect_statement text/);
    expect(sql).toMatch(/notice_recipient_name is null[\s\S]*btrim\(notice_recipient_name\)[\s\S]*char_length\(notice_recipient_name\) <= 200/);
    expect(sql).toMatch(/notice_recipient_address is null[\s\S]*btrim\(notice_recipient_address\)[\s\S]*char_length\(notice_recipient_address\) <= 1000/);
    expect(sql).toMatch(/defect_statement is null[\s\S]*btrim\(defect_statement\)[\s\S]*char_length\(defect_statement\) <= 4000/);
    expect(sql).not.toContain("drop policy");
    expect(sql).not.toContain("disable row level security");
  });
});
