import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { Image } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import { AuditReportPDF } from "@/components/dashboard/AuditReportPDF";

function collectText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return "";
  }

  return Children.toArray(node.props.children).map(collectText).join(" ");
}

function collectElementsByType(
  node: ReactNode,
  type: unknown,
  matches: ReactElement[] = []
): ReactElement[] {
  if (!isValidElement<{ children?: ReactNode }>(node)) return matches;
  if (node.type === type) matches.push(node);
  Children.forEach(node.props.children, (child) => collectElementsByType(child, type, matches));
  return matches;
}

describe("AuditReportPDF", () => {
  it("renders source-bound protocol evidence without fabricated compliance claims", () => {
    const report = AuditReportPDF({
      fileName: "Alpine Tower",
      caseId: "reference-1",
      contractor: "Builder AG",
      client: "Owner GmbH",
      report: {
        status: "finalized",
        defectEvidence: {
          kind: "documented",
          description: "Cracked balcony edge",
        },
        signatureCaptured: true,
        signatureImageData: null,
        linkedCaseId: "case-1",
        finalizedAt: "2026-07-29T21:30:00.000Z",
      },
    });
    const text = collectText(report);

    expect(text).toContain("Finalized Protocol Record");
    expect(text).toContain("Cracked balcony edge");
    expect(text).toContain("CAPTURED");
    expect(text).toContain("case-1");
    expect(text).toContain("Finalization Date");
    expect(text).toContain("Case / Reference ID");
    expect(text).not.toContain("Record ID");
    expect(text).not.toContain("98%");
    expect(text).not.toContain("Passed 12/12 Mandatory Checks");
    expect(text).not.toContain("COMPLIANT");
    expect(text).not.toContain("RECOMMENDATION");
  });

  it("states explicit no-visible-defect evidence without inventing a score", () => {
    const report = AuditReportPDF({
      fileName: "Alpine Tower",
      report: {
        status: "finalized",
        defectEvidence: { kind: "none-visible-confirmed" },
        signatureCaptured: true,
        signatureImageData: null,
        linkedCaseId: null,
        finalizedAt: "2026-07-29T21:30:00.000Z",
      },
    });

    expect(collectText(report)).toContain("No visible defects confirmed");
  });

  it("renders one bounded PDF image for normalized signature evidence", () => {
    const signatureImageData = "data:image/png;base64,iVBORw0KGgo=";
    const report = AuditReportPDF({
      fileName: "Alpine Tower",
      report: {
        status: "finalized",
        defectEvidence: { kind: "not-recorded" },
        signatureCaptured: true,
        signatureImageData,
        linkedCaseId: null,
        finalizedAt: "2026-07-29T21:30:00.000Z",
      },
    });

    const images = collectElementsByType(report, Image) as ReactElement<{ src?: string }>[];
    expect(images).toHaveLength(1);
    expect(images[0].props.src).toBe(signatureImageData);
  });

  it("states when a captured signature image is unavailable without rendering an image", () => {
    const report = AuditReportPDF({
      fileName: "Alpine Tower",
      report: {
        status: "finalized",
        defectEvidence: { kind: "not-recorded" },
        signatureCaptured: true,
        signatureImageData: null,
        linkedCaseId: null,
        finalizedAt: "2026-07-29T21:30:00.000Z",
      },
    });

    expect(collectText(report)).toContain("CAPTURED — IMAGE UNAVAILABLE");
    expect(collectElementsByType(report, Image)).toHaveLength(0);
  });

  it("keeps the missing-signature state distinct and renders no image", () => {
    const report = AuditReportPDF({
      fileName: "Alpine Tower",
      report: {
        status: "finalized",
        defectEvidence: { kind: "not-recorded" },
        signatureCaptured: false,
        signatureImageData: null,
        linkedCaseId: null,
        finalizedAt: "2026-07-29T21:30:00.000Z",
      },
    });

    expect(collectText(report)).toContain("NOT CAPTURED");
    expect(collectText(report)).not.toContain("IMAGE UNAVAILABLE");
    expect(collectElementsByType(report, Image)).toHaveLength(0);
  });
});
