import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Protocol } from "@/lib/database.types";
import { protocolPdfFilename, selectFinalizedProtocolRecords } from "@/lib/protocol-register";

function protocol(overrides: Partial<Protocol>): Protocol {
  return {
    id: "protocol-default",
    user_id: "owner-1",
    case_id: null,
    project_name: "Private project name",
    contractor: "Private contractor",
    client: "Private client",
    defect_description: null,
    signature_data: null,
    status: "finalized",
    created_at: "2026-08-13T10:00:00.000Z",
    finalized_at: "2026-08-13T10:05:00.000Z",
    ...overrides,
  };
}

describe("protocol register projection", () => {
  it("is RLS-aware and excludes full evidence payloads", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260813081500_protocol_register_records.sql"),
      "utf8",
    );

    expect(sql).toMatch(/create or replace view public\.protocol_register_records\s+with \(security_invoker = true\)/);
    expect(sql).toMatch(/nullif\(btrim\(signature_data\), ''\) is not null as signature_captured/);
    expect(sql).not.toMatch(/^\s*signature_data\s*,?\s*$/m);
    expect(sql).not.toMatch(/defect_description/);
    expect(sql).toMatch(/grant select on public\.protocol_register_records to authenticated/);
  });
});

describe("protocol finalization timestamp migration", () => {
  it("backfills existing finalized rows and records later transitions server-side", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260813083500_protocol_finalized_at.sql"),
      "utf8",
    );

    expect(sql).toMatch(/add column if not exists finalized_at timestamptz/);
    expect(sql).toMatch(/set finalized_at = created_at\s+where status = 'finalized'/);
    expect(sql).toMatch(/tg_op = 'INSERT' and new\.status = 'finalized'/);
    expect(sql).toMatch(/old\.status is distinct from 'finalized'/);
    expect(sql).toMatch(/new\.finalized_at := old\.finalized_at/);
    expect(sql).toMatch(/drop view public\.protocol_register_records;\s+create view public\.protocol_register_records/);
    expect(sql).toMatch(/nullif\(btrim\(signature_data\), ''\) is not null as signature_captured/);
  });
});

describe("finalized protocol database integrity migration", () => {
  it("limits authenticated access to owner-scoped finalized reads and inserts", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260825000000_finalized_protocol_integrity.sql"),
      "utf8",
    );

    expect(sql).toContain('drop policy if exists "Users can CRUD own protocols" on public.protocols;');
    expect(sql).toContain("revoke all on public.protocols from anon;");
    expect(sql).toContain("revoke all on public.protocols from authenticated;");
    expect(sql).toContain("grant select on public.protocols to authenticated;");

    const insertGrant = sql.match(
      /grant insert\s*\(([\s\S]*?)\)\s*on public\.protocols to authenticated;/,
    )?.[1];
    expect(insertGrant?.split(",").map((column) => column.trim())).toEqual([
      "user_id",
      "case_id",
      "project_name",
      "contractor",
      "client",
      "defect_description",
      "signature_data",
      "status",
    ]);

    const selectPolicy = sql.match(
      /create policy "Users can read own finalized protocols"[\s\S]*?;/,
    )?.[0];
    const insertPolicy = sql.match(
      /create policy "Users can insert own finalized protocols"[\s\S]*?;/,
    )?.[0];
    expect(selectPolicy).toMatch(/for select[\s\S]*auth\.uid\(\) = protocols\.user_id[\s\S]*protocols\.status = 'finalized'/);
    expect(insertPolicy).toMatch(/for insert[\s\S]*with check[\s\S]*auth\.uid\(\) = protocols\.user_id[\s\S]*protocols\.status = 'finalized'/);
    expect(insertPolicy).toMatch(/protocols\.case_id is null\s+or exists\s*\([\s\S]*from public\.cases as compliance_case[\s\S]*compliance_case\.id = protocols\.case_id[\s\S]*compliance_case\.user_id = auth\.uid\(\)/);
    expect(sql).not.toMatch(/grant\s+(?:update|delete|all)(?:\s*\([^)]*\))?\s+on public\.protocols to authenticated/i);
    expect(sql).not.toMatch(/create policy[\s\S]*?for\s+(?:all|update|delete)\b/i);
  });

  it("states the exact content lock, Case unlink, and account cascade boundaries", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260825000000_finalized_protocol_integrity.sql"),
      "utf8",
    );

    expect(sql).toMatch(/content and signature fields cannot be changed/i);
    expect(sql).toMatch(/cannot be individually deleted by authenticated users/i);
    expect(sql).toMatch(/deleting a linked Case clears the Case association/i);
    expect(sql).toMatch(/deleting the auth account (?:removes|deletes) its protocol records/i);
    expect(sql).toMatch(/does not (?:provide|claim) external retention or absolute immutability/i);
  });
});

describe("selectFinalizedProtocolRecords", () => {
  it("returns only finalized records newest first with an ID tie-break", () => {
    const rows = [
      protocol({ id: "z-final", finalized_at: "2026-08-13T10:00:00.000Z" }),
      protocol({ id: "draft", status: "draft", finalized_at: null }),
      protocol({ id: "b-new", finalized_at: "2026-08-14T10:00:00.000Z" }),
      protocol({ id: "a-new", finalized_at: "2026-08-14T10:00:00.000Z" }),
      protocol({ id: "awaiting", status: "awaiting-signature" }),
    ] as const;

    expect(selectFinalizedProtocolRecords(rows).map((row) => row.id)).toEqual([
      "a-new",
      "b-new",
      "z-final",
    ]);
  });

  it("does not mutate the source array", () => {
    const rows = [
      protocol({ id: "older", finalized_at: "2026-08-12T10:00:00.000Z" }),
      protocol({ id: "newer", finalized_at: "2026-08-13T10:00:00.000Z" }),
    ];
    const original = [...rows];

    const selected = selectFinalizedProtocolRecords(rows);

    expect(rows).toEqual(original);
    expect(selected).not.toBe(rows);
  });
});

describe("protocolPdfFilename", () => {
  it("is deterministic and based only on the protocol ID", () => {
    expect(protocolPdfFilename("9d7b-42")).toBe("baucompliance-protocol-9d7b-42.pdf");
    expect(protocolPdfFilename("9d7b-42")).not.toContain("Private");
  });

  it("normalizes unsafe filename characters without adding record PII", () => {
    expect(protocolPdfFilename(" protocol/id? ")).toBe("baucompliance-protocol-protocol-id.pdf");
  });
});
