export function hasLinkedCaseDefectDescription(caseId: string | null, defectDescription: string): boolean {
  if (!caseId) return true;
  return defectDescription.trim().length > 0;
}

export function shouldMarkLinkedCaseDefectDocumented(
  caseId: string | null,
  defectDescription: string,
  defectDocumented: boolean | undefined
): boolean {
  return Boolean(caseId) && defectDescription.trim().length > 0 && !defectDocumented;
}
