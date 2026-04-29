import { describe, expect, it } from "vitest";

import {
  canFinalizeLinkedCase,
  getEffectiveSelectedCaseId,
  hasStaleLinkedCase,
} from "../lib/dashboard-linked-case";

describe("dashboard linked case recovery", () => {
  it("does not mark a restored linked case stale before cases finish loading", () => {
    expect(hasStaleLinkedCase("case-1", [], false)).toBe(false);
    expect(getEffectiveSelectedCaseId("case-1", [], false)).toBe("case-1");
    expect(canFinalizeLinkedCase("case-1", [], false)).toBe(false);
  });

  it("does not drop a linked case when case loading fails", () => {
    expect(hasStaleLinkedCase("case-1", [], false)).toBe(false);
    expect(getEffectiveSelectedCaseId("case-1", [], false)).toBe("case-1");
    expect(canFinalizeLinkedCase("case-1", [], false)).toBe(false);
  });

  it("clears a linked case only after a successful load confirms it is missing", () => {
    const userCases = [{ id: "case-2" }];

    expect(hasStaleLinkedCase("case-1", userCases, true)).toBe(true);
    expect(getEffectiveSelectedCaseId("case-1", userCases, true)).toBeNull();
    expect(canFinalizeLinkedCase("case-1", userCases, true)).toBe(false);
  });

  it("keeps the linked case when the loaded case list still contains it", () => {
    const userCases = [{ id: "case-1" }, { id: "case-2" }];

    expect(hasStaleLinkedCase("case-1", userCases, true)).toBe(false);
    expect(getEffectiveSelectedCaseId("case-1", userCases, true)).toBe("case-1");
    expect(canFinalizeLinkedCase("case-1", userCases, true)).toBe(true);
  });
});
