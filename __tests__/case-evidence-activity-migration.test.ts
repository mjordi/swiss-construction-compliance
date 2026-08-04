import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve("supabase/migrations/20260804000000_case_evidence_activity.sql");

function migrationSql() {
  return readFileSync(migrationPath, "utf8").toLowerCase();
}

describe("case evidence activity migration", () => {
  it("creates a source-bound, idempotent evidence-upload activity contract", () => {
    const sql = migrationSql();

    expect(sql).toContain("create table public.case_activity_events");
    expect(sql).toMatch(/event_type text not null[\s\S]*?check \(event_type = 'evidence_uploaded'\)/);
    expect(sql).toMatch(/user_id uuid references auth\.users\(id\) on delete cascade not null/);
    expect(sql).toMatch(/case_id uuid references public\.cases\(id\) on delete cascade not null/);
    expect(sql).toMatch(/evidence_id uuid not null/);
    expect(sql).not.toMatch(/evidence_id uuid references public\.case_evidence/);
    for (const sourceColumn of ["source_name", "source_mime_type", "source_size_bytes", "occurred_at"]) {
      expect(sql).toContain(sourceColumn);
    }
    expect(sql).toContain("unique (event_type, evidence_id)");
  });

  it("allows owners to read events while authenticated clients cannot mutate them", () => {
    const sql = migrationSql();
    const selectPolicy = sql.match(/create policy "users can read own case activity events"[\s\S]*?;/)?.[0];

    expect(sql).toContain("alter table public.case_activity_events enable row level security");
    expect(selectPolicy).toMatch(/for select[\s\S]*?auth\.uid\(\) = user_id/);
    expect(sql).toContain("revoke all on public.case_activity_events from authenticated");
    expect(sql).toContain("grant select on public.case_activity_events to authenticated");
    expect(sql).not.toMatch(/create policy .*case activity events[\s\S]*?for (insert|update|delete)/);
  });

  it("backfills source-bound activity for evidence recorded before the trigger exists", () => {
    const sql = migrationSql();
    const backfill = sql.match(/insert into public\.case_activity_events[\s\S]*?select[\s\S]*?from public\.case_evidence evidence[\s\S]*?on conflict \(event_type, evidence_id\) do nothing;/)?.[0];

    expect(backfill).toBeDefined();
    expect(backfill).toMatch(/evidence\.user_id[\s\S]*?evidence\.case_id[\s\S]*?evidence\.id[\s\S]*?'evidence_uploaded'[\s\S]*?evidence\.original_name[\s\S]*?evidence\.mime_type[\s\S]*?evidence\.size_bytes[\s\S]*?evidence\.created_at/);
  });

  it("derives events from every evidence metadata insert, including reconciled uploads", () => {
    const sql = migrationSql();
    const triggerFunction = sql.match(/create or replace function public\.record_case_evidence_upload_activity\(\)[\s\S]*?\$\$;/)?.[0];

    expect(triggerFunction).toBeDefined();
    expect(triggerFunction).toContain("returns trigger");
    expect(triggerFunction).toContain("security definer");
    expect(triggerFunction).toContain("set search_path = ''");
    expect(triggerFunction).toMatch(/insert into public\.case_activity_events[\s\S]*?new\.user_id[\s\S]*?new\.case_id[\s\S]*?new\.id[\s\S]*?new\.original_name[\s\S]*?new\.mime_type[\s\S]*?new\.size_bytes/);
    expect(triggerFunction).toContain("on conflict (event_type, evidence_id) do nothing");
    expect(triggerFunction).toContain("return new");
    expect(sql).toMatch(/create trigger record_case_evidence_upload_activity[\s\S]*?after insert on public\.case_evidence[\s\S]*?for each row execute function public\.record_case_evidence_upload_activity\(\)/);
    expect(sql).toContain("revoke all on function public.record_case_evidence_upload_activity() from public");
  });
});
