import { describe, expect, it } from "vitest";

import {
  EMPTY_FOLLOW_UP_CHECKLIST,
  normalizeFollowUpChecklistState,
  toggleFollowUpChecklistState,
} from "../lib/cases-checklist";

describe("cases checklist helpers", () => {
  it("normalizes missing checklist fields to a stable all-false shape", () => {
    expect(normalizeFollowUpChecklistState(null)).toEqual(EMPTY_FOLLOW_UP_CHECKLIST);
    expect(
      normalizeFollowUpChecklistState({
        defectDocumented: true,
      })
    ).toEqual({
      defectDocumented: true,
      evidenceAttached: false,
      noticeDrafted: false,
      calendarReminderExported: false,
    });
    expect(
      normalizeFollowUpChecklistState({
        defectDocumented: "" as unknown as boolean,
        evidenceAttached: "yes" as unknown as boolean,
        noticeDrafted: 0 as unknown as boolean,
        calendarReminderExported: 1 as unknown as boolean,
      })
    ).toEqual({
      defectDocumented: false,
      evidenceAttached: true,
      noticeDrafted: false,
      calendarReminderExported: true,
    });
  });

  it("toggles a single checklist item without dropping sibling state", () => {
    expect(
      toggleFollowUpChecklistState(
        {
          defectDocumented: true,
          evidenceAttached: false,
          noticeDrafted: true,
          calendarReminderExported: false,
        },
        "evidenceAttached"
      )
    ).toEqual({
      defectDocumented: true,
      evidenceAttached: true,
      noticeDrafted: true,
      calendarReminderExported: false,
    });
  });
});
