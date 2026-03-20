import { describe, expect, it } from "vitest";
import {
  applyComplianceCaseView,
  buildComplianceCaseTimeline,
  filterComplianceCases,
  sortComplianceCases,
  toComplianceCaseViewModel,
  type ComplianceCaseInput,
} from "../lib/case-timeline";

function daysFromToday(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

describe("case timeline view model", () => {
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
  });
});

describe("case timeline filtering and sorting", () => {
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
