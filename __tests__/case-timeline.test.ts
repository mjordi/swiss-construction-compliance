import { describe, expect, it } from "vitest";
import { toComplianceCaseViewModel } from "../lib/case-timeline";

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
  });

  it("adds 60-day deadline for contracts on/after 2026-01-01", () => {
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
  });
});
