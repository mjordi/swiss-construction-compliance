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
  noticeDeadlineNotFixed: "No fixed deadline",
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
    "evidence-uploaded": "Evidence uploaded",
    "protocol-finalized": "Linked protocol finalized",
    "notice-dispatched": "Notice dispatch recorded",
    "notice-deadline": "Notice deadline",
  },
  dispatchChannels: {
    "registered-mail": "Registered post",
    "a-mail-plus": "A Mail Plus",
    courier: "Localized courier",
    "hand-delivery": "Hand delivery",
  },
  supportingEvidence: "User-linked supporting evidence",
  supportingEvidenceId: "Evidence ID",
  supportingEvidenceAssociationId: "Association ID",
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
      noticeDispatches: [{
        id: "dispatch-1",
        user_id: "user-1",
        case_id: "case-1",
        notice_draft_id: "draft-revision-1",
        dispatched_at: "2026-03-02T10:00:00.000Z",
        channel: "registered-mail",
        reference: "TRACK-1",
        created_at: "2026-03-02T10:01:00.000Z",
      }],
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
    expect(report.milestones.some((milestone) => milestone.sourceId === "protocol-final")).toBe(true);
    expect(report.milestones.some((milestone) => milestone.sourceId === "protocol-draft")).toBe(false);
    expect(report.milestones.find((milestone) => milestone.kind === "notice-dispatched")).toEqual(
      expect.objectContaining({
        label: "Notice dispatch recorded",
        sourceId: "draft-revision-1",
        sourceName: "Registered post · TRACK-1",
      })
    );
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

  it("includes only source-consistent user-linked supporting evidence", () => {
    const report = buildCaseAuditDossier({
      item, checklist: item.checklistDefaults, linkedProtocols: [],
      noticeDispatches: [{
        id: "dispatch-1", user_id: "user-1", case_id: "case-1", notice_draft_id: "draft-1",
        dispatched_at: "2026-03-02T10:00:00.000Z", channel: "courier", reference: null,
        created_at: "2026-03-02T10:01:00.000Z",
      }],
      dispatchEvidence: [{
        id: "association-1", user_id: "user-1", case_id: "case-1", dispatch_id: "dispatch-1",
        evidence_id: "evidence-1", created_at: "2026-03-03T10:00:00.000Z",
      }],
      evidence: [{
        id: "evidence-1", user_id: "user-1", case_id: "case-1", original_name: "receipt.jpg",
        storage_path: "user-1/case-1/receipt.jpg", mime_type: "image/jpeg", size_bytes: 50,
        created_at: "2026-03-01T10:00:00.000Z",
      }],
      labels, generatedAt: new Date("2026-07-30T12:00:00.000Z"),
    });
    expect(report.milestones.find((entry) => entry.kind === "notice-dispatched")).toMatchObject({
      supportingEvidenceName: "receipt.jpg",
      supportingEvidenceId: "evidence-1",
      supportingEvidenceAssociationId: "association-1",
    });
    expect(report.labels.supportingEvidence).toBe("User-linked supporting evidence");
    expect(report.labels.supportingEvidenceId).toBe("Evidence ID");
    expect(report.labels.supportingEvidenceAssociationId).toBe("Association ID");
  });

  it("omits an inapplicable calendar reminder and localizes the old-law deadline", () => {
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

    expect(report.noticeDeadline).toBe("No fixed deadline");
    expect(report.readiness.completed).toBe(2);
    expect(report.readiness.total).toBe(3);
    expect(report.readiness.ready).not.toContain("Calendar reminder exported");
    expect(report.readiness.missing).not.toContain("Calendar reminder exported");
  });
});
