import { describe, expect, it } from "vitest";

import {
  MAX_SIGNATURE_IMAGE_BYTES,
  buildFinalizedProtocolReport,
  buildFinalizedProtocolReportFromRecord,
  normalizeSignatureImageData,
} from "@/lib/protocol-report";
import { NO_VISIBLE_DEFECTS_CONFIRMED_MARKER } from "@/lib/dashboard-protocol";

const finalizedAt = "2026-07-29T21:30:00.000Z";
const pngSignature = "data:image/png;base64,iVBORw0KGgo=";
const jpegSignature = "data:image/jpeg;base64,/9j/2Q==";

describe("buildFinalizedProtocolReport", () => {
  it("preserves source-bound finalized protocol evidence", () => {
    expect(
      buildFinalizedProtocolReport({
        defectDescription: "  Cracked balcony edge  ",
        noDefectsConfirmed: false,
        signatureCaptured: true,
        signatureData: pngSignature,
        linkedCaseId: "case-1",
        finalizedAt,
      })
    ).toEqual({
      status: "finalized",
      defectEvidence: {
        kind: "documented",
        description: "Cracked balcony edge",
      },
      signatureCaptured: true,
      signatureImageData: pngSignature,
      linkedCaseId: "case-1",
      finalizedAt,
    });
  });

  it("distinguishes an explicit no-visible-defects confirmation", () => {
    expect(
      buildFinalizedProtocolReport({
        defectDescription: "",
        noDefectsConfirmed: true,
        signatureCaptured: true,
        linkedCaseId: null,
        finalizedAt,
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
        finalizedAt,
      })
    ).toEqual({
      status: "finalized",
      defectEvidence: { kind: "not-recorded" },
      signatureCaptured: false,
      signatureImageData: null,
      linkedCaseId: null,
      finalizedAt,
    });
  });
});

describe("normalizeSignatureImageData", () => {
  it("preserves exact PNG and JPEG base64 data URIs", () => {
    expect(normalizeSignatureImageData(pngSignature)).toBe(pngSignature);
    expect(normalizeSignatureImageData(jpegSignature)).toBe(jpegSignature);
  });

  it.each([
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "https://example.com/signature.png",
    "data:image/png;base64,not base64",
    "data:image/png;base64,AAA=AAAA",
    "data:image/png;base64,AB==",
    "data:image/png;base64,",
  ])("rejects an unsafe or non-canonical source: %s", (source) => {
    expect(normalizeSignatureImageData(source)).toBeNull();
  });

  it("rejects payloads above the exported decoded-byte limit", () => {
    const oversizedPayload = "A".repeat(
      4 * Math.ceil((MAX_SIGNATURE_IMAGE_BYTES + 1) / 3)
    );

    expect(
      normalizeSignatureImageData(`data:image/png;base64,${oversizedPayload}`)
    ).toBeNull();
  });
});

describe("buildFinalizedProtocolReportFromRecord", () => {
  it("reconstructs documented finalized evidence from the persisted protocol row", () => {
    expect(
      buildFinalizedProtocolReportFromRecord({
        status: "finalized",
        defect_description: "  Cracked balcony edge  ",
        signature_data: jpegSignature,
        case_id: "case-1",
        finalized_at: finalizedAt,
      })
    ).toEqual({
      status: "finalized",
      defectEvidence: { kind: "documented", description: "Cracked balcony edge" },
      signatureCaptured: true,
      signatureImageData: jpegSignature,
      linkedCaseId: "case-1",
      finalizedAt,
    });
  });

  it("interprets the persisted explicit no-visible-defects marker", () => {
    expect(
      buildFinalizedProtocolReportFromRecord({
        status: "finalized",
        defect_description: NO_VISIBLE_DEFECTS_CONFIRMED_MARKER,
        signature_data: pngSignature,
        case_id: "case-1",
        finalized_at: finalizedAt,
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
        finalized_at: finalizedAt,
      })
    ).toEqual({
      status: "finalized",
      defectEvidence: { kind: "not-recorded" },
      signatureCaptured: false,
      signatureImageData: null,
      linkedCaseId: null,
      finalizedAt,
    });
  });

  it("treats empty and whitespace-only signature payloads as missing", () => {
    for (const signature_data of ["", "   "]) {
      expect(buildFinalizedProtocolReportFromRecord({
        status: "finalized",
        defect_description: null,
        signature_data,
        case_id: null,
        finalized_at: finalizedAt,
      })).toMatchObject({ signatureCaptured: false, signatureImageData: null });
    }
  });

  it("keeps historical capture state when an unsafe image cannot be rendered", () => {
    expect(buildFinalizedProtocolReportFromRecord({
      status: "finalized",
      defect_description: null,
      signature_data: "https://example.com/historical-signature.png",
      case_id: null,
      finalized_at: finalizedAt,
    })).toMatchObject({
      signatureCaptured: true,
      signatureImageData: null,
    });
  });
});
