import { describe, expect, it } from "vitest";
import {
  buildVaultAuditCsv,
  vaultAuditCsvFilename,
  type VaultAuditCsvLabels,
  type VaultAuditExportRow,
} from "../lib/vault-audit-export";

const labels: VaultAuditCsvLabels = {
  generatedAt: "Generated at",
  scope: "Scope",
  scopeValue: "Complete owner-visible portfolio; point-in-time snapshot; not proof of legal completeness.",
  caseId: "Case ID",
  project: "Project",
  lifecycleStatus: "Lifecycle status",
  legalStatus: "Legal status",
  legalRegime: "Legal regime",
  deadlineContext: "Deadline context",
  checklistCompleted: "Checklist completed",
  checklistTotal: "Checklist total",
  missingAuditItems: "Missing audit items",
  linkedProtocols: "Linked protocols",
  sourceUpdatedAt: "Source updated at",
  noMissingItems: "None",
  unavailable: "Unavailable",
};

function row(overrides: Partial<VaultAuditExportRow> = {}): VaultAuditExportRow {
  return {
    caseId: "case-b",
    project: "Riverside Bridge",
    lifecycleStatus: "Review",
    legalStatus: "Urgent",
    legalRegime: "Revised law",
    deadlineContext: "2 days left",
    checklistCompleted: 2,
    checklistTotal: 4,
    missingAuditItems: ["Evidence attached", "Notice drafted"],
    linkedProtocols: 1,
    sourceUpdatedAt: "2026-08-19T12:00:00.000Z",
    ...overrides,
  };
}

describe("buildVaultAuditCsv", () => {
  it("writes snapshot metadata, every required column, and rows ordered by stable Case ID", () => {
    const csv = buildVaultAuditCsv(
      [
        row(),
        row({ caseId: "case-a", project: "Alpine Tower", missingAuditItems: [] }),
      ],
      labels,
      new Date("2026-08-20T08:15:30.000Z"),
    );

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Generated at","2026-08-20T08:15:30.000Z"\r\n');
    expect(csv).toContain('"Scope","Complete owner-visible portfolio; point-in-time snapshot; not proof of legal completeness."\r\n');
    expect(csv).toContain('"Case ID","Project","Lifecycle status","Legal status","Legal regime","Deadline context","Checklist completed","Checklist total","Missing audit items","Linked protocols","Source updated at"\r\n');
    expect(csv.indexOf('"case-a","Alpine Tower"')).toBeLessThan(csv.indexOf('"case-b","Riverside Bridge"'));
    expect(csv).toContain('"case-a","Alpine Tower","Review","Urgent","Revised law","2 days left","2","4","None","1","2026-08-19T12:00:00.000Z"');
    expect(csv).toContain('"Evidence attached; Notice drafted"');
    expect(csv.split("\r\n").at(-1)).toBe("");
  });

  it("escapes CSV punctuation and neutralizes spreadsheet formulas in every textual cell", () => {
    const csv = buildVaultAuditCsv(
      [row({
        caseId: "@case",
        project: '=HYPERLINK("https://example.invalid","click")',
        lifecycleStatus: "+active",
        legalStatus: "-1",
        legalRegime: " @hidden",
        deadlineContext: "line one\nline two, quoted \"value\"",
        missingAuditItems: ["=CMD()"],
      })],
      { ...labels, project: "=Project" },
      new Date("2026-08-20T00:00:00.000Z"),
    );

    expect(csv).toContain('"\'=Project"');
    expect(csv).toContain('"\'@case"');
    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"",""click"")"');
    expect(csv).toContain('"\'+active","\'-1","\' @hidden"');
    expect(csv).toContain('"line one\nline two, quoted ""value"""');
    expect(csv).toContain('"\'=CMD()"');
  });

  it("uses unavailable labels for missing legal context", () => {
    const csv = buildVaultAuditCsv(
      [row({ legalStatus: null, legalRegime: null, deadlineContext: null })],
      labels,
      new Date("2026-08-20T00:00:00.000Z"),
    );

    expect(csv).toContain('"Unavailable","Unavailable","Unavailable"');
  });
});

describe("vaultAuditCsvFilename", () => {
  it("uses a deterministic UTC date without personal data", () => {
    expect(vaultAuditCsvFilename(new Date("2026-08-20T23:59:59.000Z"))).toBe(
      "baucompliance-vault-audit-2026-08-20.csv",
    );
  });
});
