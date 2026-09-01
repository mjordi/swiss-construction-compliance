import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260901000000_case_acceptance_date.sql";

function migrationSql() {
  return readFileSync(migrationPath, "utf8").toLowerCase();
}

describe("case acceptance-date persistence", () => {
  it("adds only a nullable, idempotent owner-entered date source fact", () => {
    const sql = migrationSql();

    expect(sql).toContain("alter table public.cases");
    expect(sql).toMatch(/add column if not exists acceptance_date date/);
    expect(sql).toMatch(/owner-entered source fact/);
    expect(sql).toMatch(/must not be inferred/);
    expect(sql).not.toContain("not null");
    expect(sql).not.toMatch(/\bupdate\s+public\.cases\b/);
  });

  it("exposes the nullable date on the Case database type", () => {
    const databaseTypes = readFileSync("lib/database.types.ts", "utf8");

    expect(databaseTypes).toMatch(/export interface Case[\s\S]*acceptance_date:\s*string \| null;/);
  });
});
