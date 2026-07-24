import { describe, expect, it, vi } from "vitest";
import {
  applyComplianceCaseView,
  buildCaseDeadlineReminderICS,
  buildComplianceCaseTimeline,
  deriveCaseLegalMilestones,
  deriveChecklistProgress,
  filterComplianceCases,
  isDeadlineReminderIcsExportEligible,
  sortComplianceCases,
  toComplianceCaseViewModel,
  validateComplianceCaseInput,
  type ComplianceCaseInput,
} from "../lib/case-timeline";

function daysFromToday(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

describe("case timeline view model", () => {
  it("derives an ordered legal milestone sequence for new-law cases", () => {
    const vm = toComplianceCaseViewModel({
      id: "timeline-new",
      projectName: "Milestone Project",
      canton: "ZH",
      contractDate: new Date("2026-01-10"),
      discoveryDate: new Date("2026-03-01"),
    });

    expect(deriveCaseLegalMilestones(vm)).toEqual([
      { kind: "contract", date: new Date("2026-01-10"), dateLabel: vm.contractDateLabel },
      { kind: "discovery", date: new Date("2026-03-01"), dateLabel: vm.discoveryDateLabel },
      { kind: "notice-deadline", date: vm.noticeDeadline, dateLabel: vm.noticeDeadlineLabel },
    ]);
  });

  it("omits a fixed notice deadline from old-law case milestones", () => {
    const vm = toComplianceCaseViewModel({
      id: "timeline-old",
      projectName: "Legacy Milestone Project",
      canton: "BE",
      contractDate: new Date("2025-12-20"),
      discoveryDate: new Date("2026-03-01"),
    });

    expect(deriveCaseLegalMilestones(vm).map((milestone) => milestone.kind)).toEqual([
      "contract",
      "discovery",
    ]);
  });

  it("rejects impossible timelines where discovery is before contract", () => {
    const input = {
      id: "invalid-1",
      projectName: "Broken timeline",
      canton: "ZH",
      contractDate: new Date("2026-03-01"),
      discoveryDate: new Date("2026-02-28"),
    };

    expect(validateComplianceCaseInput(input)).toBe("discovery-before-contract");
    expect(() => toComplianceCaseViewModel(input)).toThrow(
      "discovery date cannot be before contract date"
    );
  });

  it("maps contracts before 2026-01-01 to old law", () => {
    const vm = toComplianceCaseViewModel({
      id: "old-1",
      projectName: "Legacy Project",
      canton: "BE",
      contractDate: new Date("2025-12-20"),
      discoveryDate: new Date("2026-03-01"),
    });

    expect(vm.regime).toBe("old");
    expect(vm.noticeDeadline).toBeNull();
    expect(vm.status).toBe("immediate-notice");
    expect(vm.noticeApplies).toBe(false);
    expect(vm.deadlineCountdownLabel).toBe("Notify immediately");
    expect(vm.exportCapability.deadlineReminderIcsEligible).toBe(false);
  });

  it("adds 60-day deadline and countdown details under the new law", () => {
    const vm = toComplianceCaseViewModel({
      id: "new-1",
      projectName: "New Project",
      canton: "ZH",
      contractDate: new Date("2026-01-01"),
      discoveryDate: new Date("2026-03-01"),
    });

    expect(vm.regime).toBe("new");
    expect(vm.noticeDeadline).not.toBeNull();
    expect(vm.noticeDeadline!.toISOString().split("T")[0]).toBe("2026-04-30");
    expect(vm.noticeApplies).toBe(true);
    expect(vm.reminderReadiness.calendarExportReady).toBe(true);
    expect(vm.exportCapability.deadlineReminderIcsEligible).toBe(true);
  });
});

describe("case timeline filtering and sorting", () => {
  it("skips malformed cases instead of aborting timeline rendering", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const timeline = buildComplianceCaseTimeline([
      {
        id: "valid",
        projectName: "Valid case",
        canton: "ZH",
        contractDate: new Date("2026-01-10"),
        discoveryDate: new Date("2026-02-01"),
      },
      {
        id: "invalid",
        projectName: "Broken case",
        canton: "BE",
        contractDate: new Date("2026-03-01"),
        discoveryDate: new Date("2026-02-01"),
      },
    ]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0].id).toBe("valid");
    expect(warn).toHaveBeenCalledWith(
      "[case-timeline] Skipping invalid compliance case invalid",
      expect.any(Error)
    );

    warn.mockRestore();
  });

  const baseCases: ComplianceCaseInput[] = [
    {
      id: "old",
      projectName: "Old law case",
      canton: "ZH",
      contractDate: new Date("2025-06-01"),
      discoveryDate: daysFromToday(-3),
    },
    {
      id: "ok",
      projectName: "OK case",
      canton: "AG",
      contractDate: new Date("2026-01-20"),
      discoveryDate: daysFromToday(-10),
    },
    {
      id: "urgent",
      projectName: "Urgent case",
      canton: "VD",
      contractDate: new Date("2026-01-22"),
      discoveryDate: daysFromToday(-59),
    },
    {
      id: "expired",
      projectName: "Expired case",
      canton: "TI",
      contractDate: new Date("2026-01-25"),
      discoveryDate: daysFromToday(-70),
    },
  ];

  const timeline = buildComplianceCaseTimeline(baseCases);

  it("filters by regime", () => {
    const newLaw = filterComplianceCases(timeline, "new", "all");
    expect(newLaw).toHaveLength(3);
    expect(newLaw.every((item) => item.regime === "new")).toBe(true);
  });

  it("treats immediate notice as urgent when filtering by status", () => {
    const urgent = filterComplianceCases(timeline, "all", "urgent");
    const ids = urgent.map((item) => item.id);
    expect(ids).toContain("old");
    expect(ids).toContain("urgent");
  });

  it("sorts by nearest deadline with no-deadline cases last", () => {
    const sorted = sortComplianceCases(timeline, "nearest-deadline");
    expect(sorted[0].id).toBe("expired");
    expect(sorted.at(-1)?.id).toBe("old");
  });

  it("sorts by urgency and supports combined filters", () => {
    const viewed = applyComplianceCaseView(timeline, "all", "all", "most-urgent");
    expect(viewed[0].id).toBe("expired");

    const filtered = applyComplianceCaseView(timeline, "new", "expired", "most-urgent");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("expired");
  });
});

describe("checklist progress and export eligibility", () => {
  it("derives checklist completion ratio and label", () => {
    const progress = deriveChecklistProgress({
      defectDocumented: true,
      evidenceAttached: false,
      noticeDrafted: true,
      calendarReminderExported: false,
    });

    expect(progress.completed).toBe(2);
    expect(progress.total).toBe(4);
    expect(progress.label).toBe("2/4 complete");
  });

  it("enables ICS export only for new-law cases with notice deadline", () => {
    const oldLaw = toComplianceCaseViewModel({
      id: "old-2",
      projectName: "Old law",
      canton: "BE",
      contractDate: new Date("2025-12-31"),
      discoveryDate: new Date("2026-03-05"),
    });

    const newLaw = toComplianceCaseViewModel({
      id: "new-2",
      projectName: "New law",
      canton: "SG",
      contractDate: new Date("2026-01-02"),
      discoveryDate: new Date("2026-03-05"),
    });

    expect(isDeadlineReminderIcsExportEligible(oldLaw)).toBe(false);
    expect(isDeadlineReminderIcsExportEligible(newLaw)).toBe(true);
    expect(buildCaseDeadlineReminderICS(oldLaw)).toBeNull();

    const ics = buildCaseDeadlineReminderICS(newLaw);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:BauCompliance: 60-day notice deadline");
  });
});
