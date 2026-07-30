import { describe, expect, it } from "vitest";

import { buildCaseAuditDossier, type CaseAuditDossierLabels } from "@/lib/case-audit-dossier";
import { toComplianceCaseViewModel } from "@/lib/case-timeline";

const labels: CaseAuditDossierLabels = {
  title: "Case audit dossier",
  generatedAt: "Generated at",
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
  noLinkedProtocols: "No finalized protocol linked",
  legalDisclaimer: "Not legal advice.",
  regimes: { old: "Old law", new: "New law" },
  statuses: {
    ok: "On track",
    warning: "Attention",
    urgent: "Urgent",
    expired: "Expired",
    "immediate-notice": "Immediate notice",
  },
  checklistItems: {
    defectDocumented: "Defect documented",
    evidenceAttached: "Evidence attached",
    noticeDrafted: "Notice drafted",
    calendarReminderExported: "Calendar reminder exported",
  },
  milestones: {
    contract: "Contract concluded",
    discovery: "Defect discovered",
    "protocol-finalized": "Linked protocol finalized",
    "notice-deadline": "Notice deadline",
  },
};

const item = toComplianceCaseViewModel({
  id: "case-1",
  projectName: "Alpine Tower",
  canton: "ZH",
  contractDate: new Date("2026-02-01T00:00:00.000Z"),
  discoveryDate: new Date("2026-03-01T00:00:00.000Z"),
});

describe("buildCaseAuditDossier", () => {
  it("builds a source-bound case snapshot with normalized readiness and finalized protocol chronology", () => {
    const report = buildCaseAuditDossier({
      item,
      checklist: {
        defectDocumented: true,
        evidenceAttached: false,
        noticeDrafted: true,
        calendarReminderExported: false,
      },
      linkedProtocols: [
        { id: "protocol-final", status: "finalized", createdAt: "2026-03-03T10:00:00.000Z" },
        { id: "protocol-draft", status: "draft", createdAt: "2026-03-04T10:00:00.000Z" },
      ],
      labels,
      generatedAt: new Date("2026-07-30T12:00:00.000Z"),
    });

    expect(report.caseId).toBe("case-1");
    expect(report.projectName).toBe("Alpine Tower");
    expect(report.regime).toBe("New law");
    expect(report.status).toBe("Expired");
    expect(report.generatedAt).toBe("2026-07-30T12:00:00.000Z");
    expect(report.readiness.completed).toBe(2);
    expect(report.readiness.total).toBe(4);
    expect(report.readiness.missing).toEqual(["Evidence attached", "Calendar reminder exported"]);
    expect(report.milestones.map((milestone) => milestone.sourceId).filter(Boolean)).toEqual(["protocol-final"]);
    expect(report.milestones.some((milestone) => milestone.sourceId === "protocol-draft")).toBe(false);
    expect(report.legalDisclaimer).toBe("Not legal advice.");
  });

  it("uses the explicit no-finalized-protocol state", () => {
    const report = buildCaseAuditDossier({
      item,
      checklist: item.checklistDefaults,
      linkedProtocols: [],
      labels,
      generatedAt: new Date("2026-07-30T12:00:00.000Z"),
    });

    expect(report.linkedProtocolsSummary).toBe("No finalized protocol linked");
  });

  it("treats the fixed calendar reminder as ready when no fixed notice deadline applies", () => {
    const oldLawItem = toComplianceCaseViewModel({
      id: "old-case",
      projectName: "Legacy project",
      canton: "BE",
      contractDate: new Date("2025-12-01T00:00:00.000Z"),
      discoveryDate: new Date("2026-03-01T00:00:00.000Z"),
    });
    const report = buildCaseAuditDossier({
      item: oldLawItem,
      checklist: oldLawItem.checklistDefaults,
      linkedProtocols: [],
      labels,
      generatedAt: new Date("2026-07-30T12:00:00.000Z"),
    });

    expect(report.readiness.missing).not.toContain("Calendar reminder exported");
    expect(report.readiness.ready).toContain("Calendar reminder exported");
  });
});
