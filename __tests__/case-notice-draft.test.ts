import { describe, expect, it } from "vitest";
import { buildCaseNoticeDraftPayload } from "@/lib/case-notice-draft";
import type { Case } from "@/lib/database.types";
import type { ComplianceCaseViewModel } from "@/lib/case-timeline";

function persistedCase(overrides: Partial<Case> = {}): Case {
  return {
    id: "case-1",
    user_id: "user-1",
    project_name: "Alpine Tower",
    canton: "ZH",
    contract_date: "2026-03-01T00:00:00.000Z",
    discovery_date: "2026-03-21T00:00:00.000Z",
    notice_recipient_name: "Alpine Build AG",
    notice_recipient_address: "Werkstrasse 4\n8000 Zürich",
    defect_statement: "Water ingress at the north facade.",
    checklist: { defectDocumented: true, evidenceAttached: false, noticeDrafted: false, calendarReminderExported: false },
    status: "active",
    created_at: "2026-03-21T00:00:00.000Z",
    updated_at: "2026-03-21T00:00:00.000Z",
    ...overrides,
  };
}

function context(overrides: Partial<ComplianceCaseViewModel> = {}): ComplianceCaseViewModel {
  return {
    id: "case-1",
    projectName: "Alpine Tower",
    canton: "ZH",
    contractDate: new Date("2026-03-01T00:00:00.000Z"),
    contractDateLabel: "2026-03-01",
    discoveryDate: new Date("2026-03-21T00:00:00.000Z"),
    discoveryDateLabel: "2026-03-21",
    regime: "new",
    regimeLabel: "New law",
    noticeApplies: true,
    noticeDeadline: new Date("2026-05-20T00:00:00.000Z"),
    noticeDeadlineLabel: "2026-05-20",
    daysToDeadline: 60,
    deadlineCountdownLabel: "60 days left",
    deadlineCountdownTone: "neutral",
    status: "ok",
    statusLabel: "On track",
    nextAction: "Draft notice",
    reminderReadiness: { calendarExportReady: true, emailReminderPlanned: true, evidenceComplete: false },
    exportCapability: { deadlineReminderIcsEligible: true },
    checklistDefaults: { defectDocumented: true, evidenceAttached: false, noticeDrafted: false, calendarReminderExported: false },
    ...overrides,
  };
}

describe("buildCaseNoticeDraftPayload", () => {
  it("builds the exact new-law insert snapshot from persisted facts and existing context", () => {
    expect(buildCaseNoticeDraftPayload(persistedCase(), context())).toEqual({
      project_name: "Alpine Tower",
      canton: "ZH",
      notice_recipient_name: "Alpine Build AG",
      notice_recipient_address: "Werkstrasse 4\n8000 Zürich",
      defect_statement: "Water ingress at the north facade.",
      contract_date: "2026-03-01",
      discovery_date: "2026-03-21",
      notice_deadline: "2026-05-20",
      regime: "new",
    });
  });

  it("preserves old-law context with a null existing deadline", () => {
    expect(buildCaseNoticeDraftPayload(persistedCase(), context({ regime: "old", regimeLabel: "Old law", noticeApplies: false, noticeDeadline: null }))).toMatchObject({
      notice_deadline: null,
      regime: "old",
    });
  });

  it.each([null, "", "   "])("rejects a missing or blank source fact (%s)", (missing) => {
    expect(buildCaseNoticeDraftPayload(persistedCase({ defect_statement: missing }), context())).toBeNull();
  });

  it.each([
    { project_name: "   " },
    { project_name: "x".repeat(201) },
    { canton: "ZHH" },
    { notice_recipient_name: "x".repeat(201) },
    { notice_recipient_address: "x".repeat(1001) },
    { defect_statement: "x".repeat(4001) },
  ])("rejects source text outside the persisted revision constraints: %o", (overrides) => {
    expect(buildCaseNoticeDraftPayload(persistedCase(overrides), context())).toBeNull();
  });

  it("trims all persisted text without changing dates or legal context", () => {
    const payload = buildCaseNoticeDraftPayload(
      persistedCase({
        project_name: "  Alpine Tower  ",
        canton: " ZH ",
        notice_recipient_name: "  Alpine Build AG ",
        notice_recipient_address: "  Werkstrasse 4\n8000 Zürich  ",
        defect_statement: "  Water ingress.  ",
      }),
      context()
    );
    expect(payload).toMatchObject({
      project_name: "Alpine Tower",
      canton: "ZH",
      notice_recipient_name: "Alpine Build AG",
      notice_recipient_address: "Werkstrasse 4\n8000 Zürich",
      defect_statement: "Water ingress.",
      notice_deadline: "2026-05-20",
      regime: "new",
    });
  });

  it("returns a stable value snapshot after source objects change", () => {
    const source = persistedCase();
    const derived = context();
    const snapshot = buildCaseNoticeDraftPayload(source, derived);
    source.project_name = "Edited live case";
    source.defect_statement = "Edited defect";
    derived.noticeDeadline = new Date("2030-01-01T00:00:00.000Z");
    expect(snapshot).toMatchObject({
      project_name: "Alpine Tower",
      defect_statement: "Water ingress at the north facade.",
      notice_deadline: "2026-05-20",
    });
  });
});
