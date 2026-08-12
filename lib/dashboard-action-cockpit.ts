import type { ComplianceCaseViewModel } from "@/lib/case-timeline";

const ACTIONABLE_STATUS_PRIORITY: Partial<
  Record<ComplianceCaseViewModel["status"], number>
> = {
  expired: 0,
  "immediate-notice": 1,
  urgent: 2,
  warning: 3,
};

export function selectDashboardPriorityCases(
  cases: readonly ComplianceCaseViewModel[],
  limit = 3
): ComplianceCaseViewModel[] {
  return cases
    .filter((item) => ACTIONABLE_STATUS_PRIORITY[item.status] !== undefined)
    .sort((a, b) => {
      const statusDifference =
        ACTIONABLE_STATUS_PRIORITY[a.status]! - ACTIONABLE_STATUS_PRIORITY[b.status]!;
      if (statusDifference !== 0) return statusDifference;

      const deadlineDifference =
        (a.daysToDeadline ?? Number.POSITIVE_INFINITY) -
        (b.daysToDeadline ?? Number.POSITIVE_INFINITY);
      if (deadlineDifference !== 0) return deadlineDifference;

      const discoveryDifference = b.discoveryDate.getTime() - a.discoveryDate.getTime();
      if (discoveryDifference !== 0) return discoveryDifference;

      return a.id.localeCompare(b.id);
    })
    .slice(0, Math.max(0, limit));
}
