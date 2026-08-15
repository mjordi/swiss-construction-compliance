import { NO_VISIBLE_DEFECTS_CONFIRMED_MARKER } from "@/lib/dashboard-protocol";

export type ProtocolDefectEvidence =
  | { kind: "documented"; description: string }
  | { kind: "none-visible-confirmed" }
  | { kind: "not-recorded" };

export interface FinalizedProtocolReport {
  status: "finalized";
  defectEvidence: ProtocolDefectEvidence;
  signatureCaptured: boolean;
  linkedCaseId: string | null;
  finalizedAt: string;
}

export interface FinalizedProtocolReportInput {
  defectDescription: string;
  noDefectsConfirmed: boolean;
  signatureCaptured: boolean;
  linkedCaseId: string | null;
  finalizedAt: string;
}

export interface PersistedFinalizedProtocolReportInput {
  status: "finalized";
  defect_description: string | null;
  signature_data: string | null;
  case_id: string | null;
  finalized_at: string;
}

export function buildFinalizedProtocolReport(
  input: FinalizedProtocolReportInput
): FinalizedProtocolReport {
  const description = input.defectDescription.trim();
  const defectEvidence: ProtocolDefectEvidence = description
    ? { kind: "documented", description }
    : input.noDefectsConfirmed
      ? { kind: "none-visible-confirmed" }
      : { kind: "not-recorded" };

  return {
    status: "finalized",
    defectEvidence,
    signatureCaptured: input.signatureCaptured,
    linkedCaseId: input.linkedCaseId,
    finalizedAt: input.finalizedAt,
  };
}

export function buildFinalizedProtocolReportFromRecord(
  record: PersistedFinalizedProtocolReportInput
): FinalizedProtocolReport {
  const noDefectsConfirmed =
    record.defect_description === NO_VISIBLE_DEFECTS_CONFIRMED_MARKER;

  return buildFinalizedProtocolReport({
    defectDescription: noDefectsConfirmed ? "" : (record.defect_description ?? ""),
    noDefectsConfirmed,
    signatureCaptured: Boolean(record.signature_data?.trim()),
    linkedCaseId: record.case_id,
    finalizedAt: record.finalized_at,
  });
}
