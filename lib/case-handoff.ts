export function parseCaseHandoffId(value: string | null): string | null {
  const caseId = value?.trim();
  return caseId || null;
}

export function buildCaseHandoffHref(caseId: string): string {
  const trimmedCaseId = caseId.trim();
  if (!trimmedCaseId) {
    return "/dashboard/cases";
  }

  const searchParams = new URLSearchParams({ case: trimmedCaseId });
  return `/dashboard/cases?${searchParams.toString()}`;
}
