import type { FollowUpChecklistKey, FollowUpChecklistState } from "@/lib/case-timeline";

export const EMPTY_FOLLOW_UP_CHECKLIST: FollowUpChecklistState = {
  defectDocumented: false,
  evidenceAttached: false,
  noticeDrafted: false,
  calendarReminderExported: false,
};

export function normalizeFollowUpChecklistState(
  checklist: Partial<FollowUpChecklistState> | null | undefined
): FollowUpChecklistState {
  return {
    defectDocumented: Boolean(checklist?.defectDocumented),
    evidenceAttached: Boolean(checklist?.evidenceAttached),
    noticeDrafted: Boolean(checklist?.noticeDrafted),
    calendarReminderExported: Boolean(checklist?.calendarReminderExported),
  };
}

export function toggleFollowUpChecklistState(
  checklist: Partial<FollowUpChecklistState> | null | undefined,
  key: FollowUpChecklistKey
): FollowUpChecklistState {
  const normalized = normalizeFollowUpChecklistState(checklist);

  return {
    ...normalized,
    [key]: !normalized[key],
  };
}
