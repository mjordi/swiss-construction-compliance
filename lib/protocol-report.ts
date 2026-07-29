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
