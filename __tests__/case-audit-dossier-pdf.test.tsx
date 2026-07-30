import { Children, isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { CaseAuditDossierPDF } from "@/components/dashboard/CaseAuditDossierPDF";
import type { CaseAuditDossierReport } from "@/lib/case-audit-dossier";

function collectText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return Children.toArray(node.props.children).map(collectText).join(" ");
}

const report: CaseAuditDossierReport = {
  title: "Case audit dossier",
  generatedAtLabel: "Generated at",
  generatedAt: "2026-07-30T12:00:00.000Z",
  labels: {
    caseId: "Case ID",
    projectName: "Project",
    canton: "Canton",
    regime: "Legal regime",
    status: "Legal status",
    contractDate: "Contract date",
    discoveryDate: "Defect discovered",
    noticeDeadline: "Notice deadline",
    nextAction: "Next legal action",
    checklist: "Readiness checklist",
    checklistReady: "Ready",
    checklistMissing: "Missing",
    linkedProtocols: "Linked finalized protocols",
    chronology: "Legal chronology",
  },
  caseId: "case-1",
  projectName: "Alpine Tower",
  canton: "ZH",
  regime: "New law",
  status: "Urgent",
  contractDate: "01.02.2026",
  discoveryDate: "01.03.2026",
  noticeDeadline: "30.04.2026",
  nextAction: "Send the notice today.",
  readiness: {
    completed: 2,
    total: 4,
    ready: ["Defect documented", "Notice drafted"],
    missing: ["Evidence attached", "Calendar reminder exported"],
  },
  linkedProtocolsSummary: "1",
  milestones: [
    {
      kind: "protocol-finalized",
      label: "Linked protocol finalized",
      date: "2026-03-03T10:00:00.000Z",
      dateLabel: "03.03.2026, 11:00",
      sourceId: "protocol-1",
    },
  ],
  legalDisclaimer: "This report is informational and is not legal advice.",
};

describe("CaseAuditDossierPDF", () => {
  it("renders the factual case, readiness, and chronology contract without certification claims", () => {
    const text = collectText(CaseAuditDossierPDF({ report }));

    expect(text).toContain("Case audit dossier");
    expect(text).toContain("case-1");
    expect(text).toContain("Alpine Tower");
    expect(text).toContain("Urgent");
    expect(text).toContain("30.04.2026");
    expect(text).toContain("Send the notice today.");
    expect(text).toContain("2 / 4");
    expect(text).toContain("Evidence attached");
    expect(text).toContain("protocol-1");
    expect(text).toContain("Legal chronology");
    expect(text).toContain("not legal advice");
    expect(text).not.toContain("COMPLIANT");
    expect(text).not.toContain("certified");
  });
});
