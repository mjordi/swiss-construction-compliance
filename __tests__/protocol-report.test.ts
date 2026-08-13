import { describe, expect, it } from "vitest";

import {
  buildFinalizedProtocolReport,
  buildFinalizedProtocolReportFromRecord,
} from "@/lib/protocol-report";
import { NO_VISIBLE_DEFECTS_CONFIRMED_MARKER } from "@/lib/dashboard-protocol";

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

describe("buildFinalizedProtocolReportFromRecord", () => {
  it("reconstructs documented finalized evidence from the persisted protocol row", () => {
    expect(
      buildFinalizedProtocolReportFromRecord({
        status: "finalized",
        defect_description: "  Cracked balcony edge  ",
        signature_data: "data:image/png;base64,signature",
        case_id: "case-1",
        finalized_at: "2026-07-29T21:30:00.000Z",
      })
    ).toEqual({
      status: "finalized",
      defectEvidence: { kind: "documented", description: "Cracked balcony edge" },
      signatureCaptured: true,
      linkedCaseId: "case-1",
      finalizedAt: "2026-07-29T21:30:00.000Z",
    });
  });

  it("interprets the persisted explicit no-visible-defects marker", () => {
    expect(
      buildFinalizedProtocolReportFromRecord({
        status: "finalized",
        defect_description: NO_VISIBLE_DEFECTS_CONFIRMED_MARKER,
        signature_data: "data:image/png;base64,signature",
        case_id: "case-1",
        finalized_at: "2026-07-29T21:30:00.000Z",
      }).defectEvidence
    ).toEqual({ kind: "none-visible-confirmed" });
  });

  it("does not invent evidence from missing persisted fields", () => {
    expect(
      buildFinalizedProtocolReportFromRecord({
        status: "finalized",
        defect_description: null,
        signature_data: null,
        case_id: null,
        finalized_at: "2026-07-29T21:30:00.000Z",
      })
    ).toEqual({
      status: "finalized",
      defectEvidence: { kind: "not-recorded" },
      signatureCaptured: false,
      linkedCaseId: null,
      finalizedAt: "2026-07-29T21:30:00.000Z",
    });
  });

  it("treats empty and whitespace-only signature payloads as missing", () => {
    expect(buildFinalizedProtocolReportFromRecord({
      status: "finalized",
      defect_description: null,
      signature_data: "",
      case_id: null,
      finalized_at: "2026-07-29T21:30:00.000Z",
    }).signatureCaptured).toBe(false);
    expect(buildFinalizedProtocolReportFromRecord({
      status: "finalized",
      defect_description: null,
      signature_data: "   ",
      case_id: null,
      finalized_at: "2026-07-29T21:30:00.000Z",
    }).signatureCaptured).toBe(false);
  });
});
