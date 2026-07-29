import { describe, expect, it } from "vitest";

import { buildFinalizedProtocolReport } from "@/lib/protocol-report";

describe("buildFinalizedProtocolReport", () => {
  it("preserves source-bound finalized protocol evidence", () => {
    expect(
      buildFinalizedProtocolReport({
        defectDescription: "  Cracked balcony edge  ",
        noDefectsConfirmed: false,
        signatureCaptured: true,
        linkedCaseId: "case-1",
        finalizedAt: "2026-07-29T21:30:00.000Z",
      })
    ).toEqual({
      status: "finalized",
      defectEvidence: {
        kind: "documented",
        description: "Cracked balcony edge",
      },
      signatureCaptured: true,
      linkedCaseId: "case-1",
      finalizedAt: "2026-07-29T21:30:00.000Z",
    });
  });

  it("distinguishes an explicit no-visible-defects confirmation", () => {
    expect(
      buildFinalizedProtocolReport({
        defectDescription: "",
        noDefectsConfirmed: true,
        signatureCaptured: true,
        linkedCaseId: null,
        finalizedAt: "2026-07-29T21:30:00.000Z",
      }).defectEvidence
    ).toEqual({ kind: "none-visible-confirmed" });
  });

  it("does not invent evidence when raw input is incomplete", () => {
    expect(
      buildFinalizedProtocolReport({
        defectDescription: "   ",
        noDefectsConfirmed: false,
        signatureCaptured: false,
        linkedCaseId: null,
        finalizedAt: "2026-07-29T21:30:00.000Z",
      })
    ).toEqual({
      status: "finalized",
      defectEvidence: { kind: "not-recorded" },
      signatureCaptured: false,
      linkedCaseId: null,
      finalizedAt: "2026-07-29T21:30:00.000Z",
    });
  });
});
