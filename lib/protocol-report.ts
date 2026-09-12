import { NO_VISIBLE_DEFECTS_CONFIRMED_MARKER } from "@/lib/dashboard-protocol";

export const MAX_SIGNATURE_IMAGE_BYTES = 256 * 1024;

const SIGNATURE_IMAGE_DATA_URI_PATTERN =
  /^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function normalizeSignatureImageData(
  value: string | null | undefined
): string | null {
  if (!value) return null;

  const match = SIGNATURE_IMAGE_DATA_URI_PATTERN.exec(value);
  if (!match) return null;

  const payload = match[1];
  if (payload.length % 4 !== 0) return null;

  const paddingLength = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const unpaddedLength = payload.length - paddingLength;
  if (payload.slice(0, unpaddedLength).includes("=")) return null;

  if (paddingLength === 2) {
    const finalSextet = BASE64_ALPHABET.indexOf(payload[unpaddedLength - 1]);
    if (finalSextet < 0 || (finalSextet & 0b1111) !== 0) return null;
  } else if (paddingLength === 1) {
    const finalSextet = BASE64_ALPHABET.indexOf(payload[unpaddedLength - 1]);
    if (finalSextet < 0 || (finalSextet & 0b11) !== 0) return null;
  }

  const decodedByteLength = (payload.length / 4) * 3 - paddingLength;
  return decodedByteLength <= MAX_SIGNATURE_IMAGE_BYTES ? value : null;
}

export type ProtocolDefectEvidence =
  | { kind: "documented"; description: string }
  | { kind: "none-visible-confirmed" }
  | { kind: "not-recorded" };

export interface FinalizedProtocolReport {
  status: "finalized";
  defectEvidence: ProtocolDefectEvidence;
  signatureCaptured: boolean;
  signatureImageData: string | null;
  linkedCaseId: string | null;
  finalizedAt: string;
}

export interface FinalizedProtocolReportInput {
  defectDescription: string;
  noDefectsConfirmed: boolean;
  signatureCaptured: boolean;
  signatureData?: string | null;
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
    signatureImageData: normalizeSignatureImageData(input.signatureData),
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
    signatureData: record.signature_data,
    linkedCaseId: record.case_id,
    finalizedAt: record.finalized_at,
  });
}
