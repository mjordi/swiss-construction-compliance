import type { Protocol } from "@/lib/database.types";

export type ProtocolRegisterRecord = Pick<
  Protocol,
  "id" | "user_id" | "case_id" | "project_name" | "contractor" | "client" | "status"
> & { finalized_at: string; signature_captured: boolean };

export interface ProtocolRegisterAuditCsvLabels {
  generatedAt: string;
  scope: string;
  scopeValue: string;
  protocolId: string;
  caseId: string;
  standalone: string;
  project: string;
  contractor: string;
  client: string;
  finalizedAt: string;
  signatureState: string;
  signatureCaptured: string;
  signatureMissing: string;
}

const SPREADSHEET_FORMULA_PREFIX = /^[\t\n\r ]*[=+\-@]/;

function csvCell(value: string): string {
  const safeValue = SPREADSHEET_FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

function csvLine(values: readonly string[]): string {
  return values.map(csvCell).join(",");
}

export function selectFinalizedProtocolRecords<
  RecordType extends Pick<Protocol, "id" | "status"> & { finalized_at: string },
>(records: readonly RecordType[]): RecordType[] {
  return [...records]
    .filter((record) => record.status === "finalized")
    .sort((left, right) => {
      const newestFirst = right.finalized_at.localeCompare(left.finalized_at);
      return newestFirst || left.id.localeCompare(right.id);
    });
}

export function protocolPdfFilename(protocolId: string): string {
  const safeId = protocolId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `baucompliance-protocol-${safeId || "record"}.pdf`;
}

export function buildProtocolRegisterAuditCsv(
  records: readonly ProtocolRegisterRecord[],
  labels: ProtocolRegisterAuditCsvLabels,
  generatedAt: Date,
): string {
  const lines = [
    csvLine([labels.generatedAt, generatedAt.toISOString()]),
    csvLine([labels.scope, labels.scopeValue]),
    "",
    csvLine([
      labels.protocolId,
      labels.caseId,
      labels.project,
      labels.contractor,
      labels.client,
      labels.finalizedAt,
      labels.signatureState,
    ]),
    ...selectFinalizedProtocolRecords(records).map((record) =>
      csvLine([
        record.id,
        record.case_id ?? labels.standalone,
        record.project_name,
        record.contractor,
        record.client,
        record.finalized_at,
        record.signature_captured ? labels.signatureCaptured : labels.signatureMissing,
      ]),
    ),
  ];

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function protocolRegisterAuditCsvFilename(generatedAt: Date): string {
  return `baucompliance-protocol-register-audit-${generatedAt.toISOString().slice(0, 10)}.csv`;
}
