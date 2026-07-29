import { Children, isValidElement, type ReactNode } from "react";
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

describe("AuditReportPDF", () => {
  it("renders source-bound protocol evidence without fabricated compliance claims", () => {
    const report = AuditReportPDF({
      fileName: "Alpine Tower",
      date: "29.07.2026",
      caseId: "record-1",
      contractor: "Builder AG",
      client: "Owner GmbH",
      report: {
        status: "finalized",
        defectEvidence: {
          kind: "documented",
          description: "Cracked balcony edge",
        },
        signatureCaptured: true,
        linkedCaseId: "case-1",
      },
    });
    const text = collectText(report);

    expect(text).toContain("Finalized Protocol Record");
    expect(text).toContain("Cracked balcony edge");
    expect(text).toContain("CAPTURED");
    expect(text).toContain("case-1");
    expect(text).not.toContain("98%");
    expect(text).not.toContain("Passed 12/12 Mandatory Checks");
    expect(text).not.toContain("COMPLIANT");
    expect(text).not.toContain("RECOMMENDATION");
  });

  it("states explicit no-visible-defect evidence without inventing a score", () => {
    const report = AuditReportPDF({
      fileName: "Alpine Tower",
      date: "29.07.2026",
      report: {
        status: "finalized",
        defectEvidence: { kind: "none-visible-confirmed" },
        signatureCaptured: true,
        linkedCaseId: null,
      },
    });

    expect(collectText(report)).toContain("No visible defects confirmed");
  });
});
