import type { Case } from "@/lib/database.types";

export function buildDashboardProtocolHref(caseId: string): string {
  const searchParams = new URLSearchParams({ case: caseId });
  return `/dashboard?${searchParams.toString()}`;
}

export function hasStaleLinkedCase(
  selectedCaseId: string | null,
  userCases: Pick<Case, "id">[],
  casesLoadedSuccessfully: boolean
): boolean {
  if (!selectedCaseId || !casesLoadedSuccessfully) {
    return false;
  }

  return !userCases.some((item) => item.id === selectedCaseId);
}

export function getEffectiveSelectedCaseId(
  selectedCaseId: string | null,
  userCases: Pick<Case, "id">[],
  casesLoadedSuccessfully: boolean
): string | null {
  return hasStaleLinkedCase(selectedCaseId, userCases, casesLoadedSuccessfully)
    ? null
    : selectedCaseId;
}
