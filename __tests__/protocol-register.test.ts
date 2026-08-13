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
    expect(sql).toMatch(/signature_data is not null as signature_captured/);
    expect(sql).not.toMatch(/^\s*signature_data\s*,?\s*$/m);
    expect(sql).not.toMatch(/defect_description/);
    expect(sql).toMatch(/grant select on public\.protocol_register_records to authenticated/);
  });
});

describe("selectFinalizedProtocolRecords", () => {
  it("returns only finalized records newest first with an ID tie-break", () => {
    const rows = [
      protocol({ id: "z-final", created_at: "2026-08-13T10:00:00.000Z" }),
      protocol({ id: "draft", status: "draft", created_at: "2026-08-14T10:00:00.000Z" }),
      protocol({ id: "b-new", created_at: "2026-08-14T10:00:00.000Z" }),
      protocol({ id: "a-new", created_at: "2026-08-14T10:00:00.000Z" }),
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
      protocol({ id: "older", created_at: "2026-08-12T10:00:00.000Z" }),
      protocol({ id: "newer", created_at: "2026-08-13T10:00:00.000Z" }),
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
