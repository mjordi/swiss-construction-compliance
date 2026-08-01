export const CASE_EVIDENCE_BUCKET = "case-evidence";
export const CASE_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const CASE_EVIDENCE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type CaseEvidenceMimeType = (typeof CASE_EVIDENCE_MIME_TYPES)[number];
export type CaseEvidenceValidationError = "empty" | "too-large" | "unsupported-type";

const extensionByMimeType: Record<CaseEvidenceMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function isCaseEvidenceMimeType(type: string): type is CaseEvidenceMimeType {
  return CASE_EVIDENCE_MIME_TYPES.includes(type as CaseEvidenceMimeType);
}

export function validateCaseEvidenceFile(file: Pick<File, "type" | "size">): CaseEvidenceValidationError | null {
  if (file.size < 1) return "empty";
  if (file.size > CASE_EVIDENCE_MAX_BYTES) return "too-large";
  if (!isCaseEvidenceMimeType(file.type)) return "unsupported-type";
  return null;
}

function assertSafePathSegment(segment: string, label: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw new Error(`${label} is not a safe storage path segment`);
  }
}

export function buildCaseEvidencePath(
  userId: string,
  caseId: string,
  mimeType: string,
  createId: () => string = () => crypto.randomUUID()
): string {
  assertSafePathSegment(userId, "userId");
  assertSafePathSegment(caseId, "caseId");
  if (!isCaseEvidenceMimeType(mimeType)) throw new Error("Unsupported evidence MIME type");
  const objectId = createId();
  assertSafePathSegment(objectId, "objectId");
  return `${userId}/${caseId}/${objectId}.${extensionByMimeType[mimeType]}`;
}

export function sanitizeCaseEvidenceDownloadName(name: string): string {
  const basename = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const sanitized = basename.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim();
  return (sanitized || "evidence").slice(0, 180);
}
