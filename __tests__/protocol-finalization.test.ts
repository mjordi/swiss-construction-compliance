import { describe, expect, it } from "vitest";
import {
  hasLinkedCaseDefectDescription,
  shouldMarkLinkedCaseDefectDocumented,
} from "../lib/protocol-finalization";

describe("protocol finalization guards", () => {
  it("requires a non-empty defect description when a case is linked", () => {
    expect(hasLinkedCaseDefectDescription("case-1", "")).toBe(false);
    expect(hasLinkedCaseDefectDescription("case-1", "   ")).toBe(false);
    expect(hasLinkedCaseDefectDescription("case-1", "Cracked tile in entrance")).toBe(true);
  });

  it("allows blank defect descriptions for standalone protocols", () => {
    expect(hasLinkedCaseDefectDescription(null, "")).toBe(true);
  });

  it("only marks linked cases as defect-documented when a real description was captured", () => {
    expect(shouldMarkLinkedCaseDefectDocumented("case-1", "", false)).toBe(false);
    expect(shouldMarkLinkedCaseDefectDocumented("case-1", "   ", false)).toBe(false);
    expect(shouldMarkLinkedCaseDefectDocumented("case-1", "Loose railing", true)).toBe(false);
    expect(shouldMarkLinkedCaseDefectDocumented("case-1", "Loose railing", false)).toBe(true);
    expect(shouldMarkLinkedCaseDefectDocumented(null, "Loose railing", false)).toBe(false);
  });
});
