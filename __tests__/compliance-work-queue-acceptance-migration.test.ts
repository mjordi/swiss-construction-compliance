import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260923000000_compliance_work_queue_acceptance_milestones.sql";
const sql = readFileSync(migrationPath, "utf8");

function snapshotDefinition(): string {
  const definition = sql.match(
    /create or replace function public\.get_compliance_work_queue_snapshot\(target_owner_id uuid default auth\.uid\(\)\)[\s\S]*?\$\$;/i
  )?.[0];
  expect(definition, "Missing work queue snapshot replacement").toBeDefined();
  return definition ?? "";
}

describe("compliance work queue acceptance milestone migration", () => {
  it("replaces only the narrow security-definer snapshot boundary", () => {
    const snapshot = snapshotDefinition();

    expect(snapshot).toMatch(/returns jsonb[\s\S]*language plpgsql[\s\S]*stable/i);
    expect(snapshot).toMatch(/security definer[\s\S]*set search_path = ''/i);
    expect(sql).not.toMatch(/create table|alter table|create policy|grant (?:select|insert|update|delete)/i);
    expect(sql).toMatch(/revoke all on function public\.get_compliance_work_queue_snapshot\(uuid\) from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.get_compliance_work_queue_snapshot\(uuid\) to authenticated/i);
  });

  it("preserves owner-or-active-collaborator authorization and active/review scope", () => {
    const snapshot = snapshotDefinition();

    expect(snapshot).toMatch(/target_owner_id = auth\.uid\(\)/i);
    expect(snapshot).toMatch(/memberships\.owner_id = target_owner_id[\s\S]*memberships\.collaborator_id = auth\.uid\(\)[\s\S]*memberships\.revoked_at is null/i);
    expect(snapshot).toMatch(/where c\.user_id = target_owner_id\s+and c\.status in \('active', 'review'\)/i);
    expect(snapshot).toMatch(/from public\.protocols as p\s+join public\.cases as c[\s\S]*c\.user_id = target_owner_id[\s\S]*c\.status in \('active', 'review'\)[\s\S]*where p\.user_id = target_owner_id/i);
  });

  it("adds only acceptance_date to the established Case projection and keeps Protocol narrow", () => {
    const snapshot = snapshotDefinition();
    const casesProjection = snapshot.match(/'cases'[\s\S]+?from public\.cases as c/i)?.[0] ?? "";
    const protocolsProjection = snapshot.match(/'protocols'[\s\S]+?from public\.protocols as p/i)?.[0] ?? "";

    for (const field of [
      "id",
      "project_name",
      "canton",
      "contract_date",
      "discovery_date",
      "acceptance_date",
      "checklist",
      "status",
    ]) {
      expect(casesProjection).toContain(`'${field}'`);
    }
    expect(protocolsProjection).toContain("'id'");
    expect(protocolsProjection).toContain("'case_id'");
    expect(protocolsProjection).not.toContain("'project_name'");

    expect(snapshot).not.toMatch(
      /signature_data|defect_description|notice_recipient_name|notice_recipient_address|defect_statement|created_at|updated_at/i
    );
  });
});
