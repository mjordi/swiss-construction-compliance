export type WizardDraft = {
  name?: string;
  contractor?: string;
  client?: string;
  defectDescription?: string;
  noDefectsConfirmed?: boolean;
  selectedCaseId?: string | null;
  updatedAt?: string;
};

export const NO_VISIBLE_DEFECTS_CONFIRMED_MARKER = "__NO_VISIBLE_DEFECTS_CONFIRMED__";

export function buildProtocolDefectDescription(
  defectDescription: string,
  noDefectsConfirmed: boolean,
): string | null {
  const trimmedDescription = defectDescription.trim();

  if (trimmedDescription.length > 0) {
    return trimmedDescription;
  }

  if (noDefectsConfirmed) {
    return NO_VISIBLE_DEFECTS_CONFIRMED_MARKER;
  }

  return null;
}

export function buildWizardDraft(
  draft: Omit<WizardDraft, "updatedAt"> & { updatedAt: string },
): WizardDraft {
  return {
    name: draft.name ?? "",
    contractor: draft.contractor ?? "",
    client: draft.client ?? "",
    defectDescription: draft.defectDescription ?? "",
    noDefectsConfirmed: Boolean(draft.noDefectsConfirmed),
    selectedCaseId: draft.selectedCaseId ?? null,
    updatedAt: draft.updatedAt,
  };
}

export function getProtocolFinalizeReadiness(
  defectDescription: string,
  noDefectsConfirmed: boolean,
  hasSignature: boolean,
): {
  hasDefectInput: boolean;
  hasSignature: boolean;
  canFinalize: boolean;
} {
  const hasDefectInput = defectDescription.trim().length > 0 || noDefectsConfirmed;

  return {
    hasDefectInput,
    hasSignature,
    canFinalize: hasDefectInput && hasSignature,
  };
}
