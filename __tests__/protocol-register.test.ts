import { describe, expect, expectTypeOf, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Protocol } from "@/lib/database.types";
import {
  buildProtocolRegisterAuditCsv,
  protocolPdfFilename,
  protocolRegisterAuditCsvFilename,
  selectFinalizedProtocolRecords,
  type ProtocolRegisterAuditCsvLabels,
  type ProtocolRegisterRecord,
} from "@/lib/protocol-register";

const auditCsvLabels: ProtocolRegisterAuditCsvLabels = {
  generatedAt: "Generated at",
  scope: "Scope",
  scopeValue: "Point-in-time finalized protocol register",
  protocolId: "Protocol ID",
  caseId: "Case ID",
  standalone: "Standalone protocol",
  project: "Project",
  contractor: "Contractor",
  client: "Client",
  finalizedAt: "Finalized at",
  signatureState: "Signature state",
  signatureCaptured: "Captured",
  signatureMissing: "Not captured",
};

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

describe("buildProtocolRegisterAuditCsv", () => {
  it("requires an explicit generation timestamp and is deterministic for identical inputs", () => {
    expectTypeOf<Parameters<typeof buildProtocolRegisterAuditCsv>>().toEqualTypeOf<
      [
        records: readonly ProtocolRegisterRecord[],
        labels: ProtocolRegisterAuditCsvLabels,
        generatedAt: Date,
      ]
    >();
    expect(buildProtocolRegisterAuditCsv).toHaveLength(3);

    const rows = [
      {
        ...protocol({ id: "deterministic" }),
        finalized_at: "2026-09-02T09:30:00.000Z",
        signature_captured: true,
      },
    ];
    const generatedAt = new Date("2026-09-03T12:34:56.789Z");

    expect(buildProtocolRegisterAuditCsv(rows, auditCsvLabels, generatedAt)).toBe(
      buildProtocolRegisterAuditCsv(rows, auditCsvLabels, generatedAt),
    );
  });

  it("adds a UTF-8 BOM, CRLF metadata, and the complete localized audit-index columns", () => {
    const csv = buildProtocolRegisterAuditCsv(
      [
        {
          ...protocol({ id: "protocol-1", case_id: null }),
          finalized_at: "2026-09-02T09:30:00.000Z",
          signature_captured: false,
        },
      ],
      auditCsvLabels,
      new Date("2026-09-03T12:34:56.789Z"),
    );

    expect(csv).toBe(
      '\uFEFF"Generated at","2026-09-03T12:34:56.789Z"\r\n' +
        '"Scope","Point-in-time finalized protocol register"\r\n' +
        "\r\n" +
        '"Protocol ID","Case ID","Project","Contractor","Client","Finalized at","Signature state"\r\n' +
        '"protocol-1","Standalone protocol","Private project name","Private contractor","Private client","2026-09-02T09:30:00.000Z","Not captured"\r\n',
    );
    expect(csv.slice(1)).not.toMatch(/(^|[^\r])\n/);
  });

  it("uses current register ordering without mutating the input", () => {
    const rows = [
      {
        ...protocol({ id: "older", case_id: "case-2" }),
        finalized_at: "2026-09-01T10:00:00.000Z",
        signature_captured: true,
      },
      {
        ...protocol({ id: "b-new", case_id: "case-3" }),
        finalized_at: "2026-09-02T10:00:00.000Z",
        signature_captured: false,
      },
      {
        ...protocol({ id: "a-new", case_id: "case-1" }),
        finalized_at: "2026-09-02T10:00:00.000Z",
        signature_captured: true,
      },
    ];
    const original = [...rows];

    const csv = buildProtocolRegisterAuditCsv(rows, auditCsvLabels, new Date("2026-09-03T00:00:00Z"));

    expect(rows).toEqual(original);
    expect(csv.indexOf('"a-new"')).toBeLessThan(csv.indexOf('"b-new"'));
    expect(csv.indexOf('"b-new"')).toBeLessThan(csv.indexOf('"older"'));
    expect(csv).toContain('"case-1"');
    expect(csv).toContain('"Captured"');
  });

  it("escapes CSV delimiters and neutralizes formulas after leading whitespace", () => {
    const csv = buildProtocolRegisterAuditCsv(
      [
        {
          ...protocol({
            id: "formula-safe",
            case_id: "\t@case",
            project_name: 'Site, "North"\nPhase 2',
            contractor: "  =DANGEROUS()",
            client: "+SUM(1,1)",
          }),
          finalized_at: "2026-09-02T10:00:00.000Z",
          signature_captured: true,
        },
      ],
      auditCsvLabels,
      new Date("2026-09-03T00:00:00Z"),
    );

    expect(csv).toContain('"\'\t@case"');
    expect(csv).toContain('"Site, ""North""\nPhase 2"');
    expect(csv).toContain('"\'  =DANGEROUS()"');
    expect(csv).toContain('"\'+SUM(1,1)"');
  });
});

describe("protocolRegisterAuditCsvFilename", () => {
  it("uses only the UTC calendar date and contains no register PII", () => {
    const generatedAt = new Date("2026-09-03T23:30:00-02:00");

    expect(protocolRegisterAuditCsvFilename(generatedAt)).toBe(
      "baucompliance-protocol-register-audit-2026-09-04.csv",
    );
  });
});
