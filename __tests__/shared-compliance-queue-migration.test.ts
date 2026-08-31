import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260831000000_shared_compliance_queue.sql";
const sql = readFileSync(migrationPath, "utf8");

function functionDefinition(name: string): string {
  const definition = sql.match(new RegExp(
    `create or replace function public\\.${name}\\([^)]*\\)[\\s\\S]*?\\$\\$;`,
    "i"
  ))?.[0];
  expect(definition, `Missing function definition for ${name}`).toBeDefined();
  return definition ?? "";
}

describe("shared compliance queue migration", () => {
  it("defines tenant-scoped memberships with one active grant and private event history", () => {
    expect(sql).toMatch(/create table public\.compliance_queue_memberships/i);
    expect(sql).toMatch(/owner_id uuid[^;]+collaborator_id uuid[^;]+granted_at timestamptz[^;]+revoked_at timestamptz/is);
    expect(sql).toMatch(/check\s*\(owner_id\s*<>\s*collaborator_id\)/i);
    expect(sql).toMatch(/create unique index[^;]+where revoked_at is null/is);
    expect(sql).toMatch(/create table public\.compliance_queue_membership_events/i);
    expect(sql).toMatch(/event_type text[^;]+check\s*\(event_type in \('grant', 'revoke'\)\)/is);
    expect(sql).not.toMatch(/trigger[^;]+on public\.compliance_queue_membership_events/is);
    expect(sql).not.toMatch(/function public\.[^(]*(?:mutat|update|delete)[^(]*membership_event/i);
  });

  it("keeps tables private and exposes only narrow authenticated RPCs", () => {
    expect(sql).toMatch(/alter table public\.compliance_queue_memberships enable row level security/i);
    expect(sql).toMatch(/alter table public\.compliance_queue_membership_events enable row level security/i);
    expect(sql).toMatch(/revoke all on (table )?public\.compliance_queue_memberships from anon, authenticated/i);
    expect(sql).toMatch(/revoke all on (table )?public\.compliance_queue_membership_events from anon, authenticated/i);
    expect(sql).not.toMatch(/grant (select|insert|update|delete)[^;]+compliance_queue_membership/i);

    for (const name of [
      "grant_compliance_queue_access",
      "revoke_compliance_queue_access",
      "list_owned_compliance_queue_grants",
      "list_shared_compliance_queue_owners",
      "get_compliance_work_queue_snapshot",
    ]) {
      const definition = functionDefinition(name);
      expect(definition).toMatch(/security definer[\s\S]*?set search_path = ''/i);
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}[^;]+ from public, anon`, "i"));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}[^;]+ to authenticated`, "i"));
    }

    expect(sql).not.toMatch(/grant\s+(?:select|insert|update|delete)[^;]*on (?:table )?public\.compliance_queue_membership_events[^;]*to authenticated/is);
    expect(sql).not.toMatch(/create or replace function public\.[^(]*(?:membership_event|event_mutation)/i);
  });

  it("grants only an exact existing account without exposing a directory", () => {
    expect(sql).toMatch(/grant_compliance_queue_access\(target_collaborator_email text\)/i);
    expect(sql).toMatch(/from auth\.users[^;]+where[^;]+lower\(users\.email\) = lower\(btrim\(target_collaborator_email\)\)/is);
    expect(sql).toMatch(/auth\.uid\(\) is null/i);
    expect(sql).toMatch(/raise exception 'compliance_queue_grant_unavailable'/i);
    expect(sql).not.toMatch(/create (or replace )?function public\.[^(]*(search|directory|find).*user/i);
  });

  it("authorizes owner administration, safe listings, and immediate snapshot revocation", () => {
    expect(sql).toMatch(/revoke_compliance_queue_access[\s\S]+owner_id\s*=\s*auth\.uid\(\)[\s\S]+revoked_at is null/i);
    expect(sql).toMatch(/list_owned_compliance_queue_grants[\s\S]+owner_id\s*=\s*auth\.uid\(\)/i);
    expect(sql).toMatch(/list_shared_compliance_queue_owners[\s\S]+collaborator_id\s*=\s*auth\.uid\(\)[\s\S]+revoked_at is null/i);
    expect(sql).toMatch(/get_compliance_work_queue_snapshot\(target_owner_id uuid default auth\.uid\(\)\)/i);
    expect(sql).toMatch(/target_owner_id = auth\.uid\(\)[\s\S]+revoked_at is null/i);
    expect(sql).toMatch(/where c\.user_id = target_owner_id\s+and c\.status in \('active', 'review'\)/i);
    expect(sql).toMatch(/from public\.protocols as p\s+join public\.cases as c[\s\S]+c\.status in \('active', 'review'\)[\s\S]+where p\.user_id = target_owner_id/i);
    expect(sql).not.toMatch(/create policy[^;]+on public\.(cases|protocols)[^;]+(collaborator|membership)/is);
  });

  it("returns only queue-required Case and Protocol fields", () => {
    const snapshot = sql.slice(sql.search(/create or replace function public\.get_compliance_work_queue_snapshot/i));
    for (const field of ["id", "project_name", "canton", "contract_date", "discovery_date", "checklist", "status", "case_id"]) {
      expect(snapshot).toContain(`'${field}'`);
    }
    expect(snapshot).not.toMatch(/signature_data|defect_description|notice_recipient|defect_statement/i);
    const protocolsProjection = snapshot.match(/'protocols'[\s\S]+?from public\.protocols as p/i)?.[0] ?? "";
    expect(protocolsProjection).not.toContain("'project_name'");
  });
});
