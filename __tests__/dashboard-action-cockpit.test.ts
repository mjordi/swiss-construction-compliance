import { describe, expect, it } from "vitest";
import type { ComplianceCaseViewModel } from "@/lib/case-timeline";
import { selectDashboardPriorityCases } from "@/lib/dashboard-action-cockpit";

function buildCase(
  id: string,
  status: ComplianceCaseViewModel["status"],
  daysToDeadline: number | null,
  discoveryDate: string
): ComplianceCaseViewModel {
  return {
    id,
    status,
    daysToDeadline,
    discoveryDate: new Date(discoveryDate),
    projectName: `Project ${id}`,
  } as ComplianceCaseViewModel;
}

describe("dashboard priority action cockpit selector", () => {
  it("orders actionable cases by status priority", () => {
    const cases = [
      buildCase("warning", "warning", 8, "2026-07-04T00:00:00.000Z"),
      buildCase("urgent", "urgent", 2, "2026-07-03T00:00:00.000Z"),
      buildCase("immediate", "immediate-notice", null, "2026-07-02T00:00:00.000Z"),
      buildCase("expired", "expired", -1, "2026-07-01T00:00:00.000Z"),
    ];

    expect(selectDashboardPriorityCases(cases, 4).map(({ id }) => id)).toEqual([
      "expired",
      "immediate",
      "urgent",
      "warning",
    ]);
  });

  it("excludes on-track cases and returns at most three by default", () => {
    const cases = [
      buildCase("ok", "ok", 40, "2026-07-05T00:00:00.000Z"),
      buildCase("expired-1", "expired", -2, "2026-07-04T00:00:00.000Z"),
      buildCase("expired-2", "expired", -1, "2026-07-03T00:00:00.000Z"),
      buildCase("urgent", "urgent", 1, "2026-07-02T00:00:00.000Z"),
      buildCase("warning", "warning", 8, "2026-07-01T00:00:00.000Z"),
    ];

    expect(selectDashboardPriorityCases(cases).map(({ id }) => id)).toEqual([
      "expired-1",
      "expired-2",
      "urgent",
    ]);
  });

  it("breaks status ties by nearest non-null deadline, newer discovery, then id", () => {
    const cases = [
      buildCase("z-null", "urgent", null, "2026-07-10T00:00:00.000Z"),
      buildCase("z-newer", "urgent", 2, "2026-07-09T00:00:00.000Z"),
      buildCase("b-same", "urgent", 2, "2026-07-08T00:00:00.000Z"),
      buildCase("a-same", "urgent", 2, "2026-07-08T00:00:00.000Z"),
      buildCase("farther", "urgent", 3, "2026-07-11T00:00:00.000Z"),
    ];

    expect(selectDashboardPriorityCases(cases, 5).map(({ id }) => id)).toEqual([
      "z-newer",
      "a-same",
      "b-same",
      "farther",
      "z-null",
    ]);
  });

  it("does not mutate the input array", () => {
    const cases = [
      buildCase("warning", "warning", 8, "2026-07-01T00:00:00.000Z"),
      buildCase("expired", "expired", -1, "2026-07-02T00:00:00.000Z"),
    ];
    const originalOrder = [...cases];

    selectDashboardPriorityCases(cases);

    expect(cases).toEqual(originalOrder);
  });
});
