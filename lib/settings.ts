export interface SettingsProfileSnapshot {
  fullName: string;
  company: string;
}

const EMPTY_PROFILE: SettingsProfileSnapshot = {
  fullName: "",
  company: "",
};

export function normalizeSettingsProfileSnapshot(
  snapshot: Partial<SettingsProfileSnapshot> | null | undefined
): SettingsProfileSnapshot {
  return {
    fullName: snapshot?.fullName?.trim() ?? EMPTY_PROFILE.fullName,
    company: snapshot?.company?.trim() ?? EMPTY_PROFILE.company,
  };
}

export function hasSettingsProfileChanges(
  currentSnapshot: Partial<SettingsProfileSnapshot>,
  loadedSnapshot: Partial<SettingsProfileSnapshot> | null | undefined
): boolean {
  const current = normalizeSettingsProfileSnapshot(currentSnapshot);
  const loaded = loadedSnapshot
    ? normalizeSettingsProfileSnapshot(loadedSnapshot)
    : EMPTY_PROFILE;

  return current.fullName !== loaded.fullName || current.company !== loaded.company;
}
