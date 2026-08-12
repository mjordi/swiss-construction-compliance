import { describe, expect, it } from "vitest";

import {
  buildCaseNoticeDraftReport,
  caseNoticeDraftPdfFilename,
  type CaseNoticeDraftReportLabels,
} from "@/lib/case-notice-draft-report";
import type { CaseNoticeDraft } from "@/lib/database.types";

const labels: CaseNoticeDraftReportLabels = {
  title: "Saved notice draft",
  saved: "Saved",
  notApproved: "Not approved",
  notSent: "Not sent",
  reviewDisclaimer: "Review all source facts before using this draft.",
  legalDisclaimer: "This draft is not legal advice and may be legally incomplete.",
  draftId: "Revision ID",
  createdAt: "Saved at",
  projectName: "Project",
  canton: "Canton",
  recipientName: "Recipient",
  recipientAddress: "Recipient address",
  defectStatement: "Defect statement",
  contractDate: "Contract date",
  discoveryDate: "Discovery date",
  noticeDeadline: "Stored notice deadline",
  noticeDeadlineNotFixed: "Not stored",
  regime: "Legal regime",
  regimes: { old: "Old law", new: "New law" },
};

const draft: CaseNoticeDraft = {
  id: "draft-7/unsafe person@example.com",
  user_id: "user-1",
  case_id: "case-1",
  project_name: "Alpine Tower — saved",
  canton: "ZH",
  notice_recipient_name: "Saved Builder AG",
  notice_recipient_address: "Saved Road 1\n8000 Zürich",
  defect_statement: "Saved immutable defect.\nSecond factual paragraph.",
  contract_date: "2026-03-01",
  discovery_date: "2026-03-21",
  notice_deadline: "2026-05-20",
  regime: "new",
  created_at: "2026-08-09T08:30:00.123Z",
};

describe("buildCaseNoticeDraftReport", () => {
  it("copies only the immutable saved revision and localized labels without rewriting source fields", () => {
    const report = buildCaseNoticeDraftReport(draft, labels);

    expect(report).toEqual({
      labels,
      draftId: draft.id,
      createdAt: draft.created_at,
      projectName: draft.project_name,
      canton: draft.canton,
      recipientName: draft.notice_recipient_name,
      recipientAddress: draft.notice_recipient_address,
      defectStatement: draft.defect_statement,
      contractDate: draft.contract_date,
      discoveryDate: draft.discovery_date,
      noticeDeadline: draft.notice_deadline,
      regime: draft.regime,
    });
    expect(report).not.toHaveProperty("caseId");
    expect(report).not.toHaveProperty("userId");
  });

  it("preserves a stored null deadline instead of deriving one", () => {
    expect(buildCaseNoticeDraftReport({ ...draft, notice_deadline: null }, labels).noticeDeadline).toBeNull();
  });
});

describe("caseNoticeDraftPdfFilename", () => {
  it("uses only the exact draft ID in the deterministic PII-safe filename", () => {
    expect(caseNoticeDraftPdfFilename("draft-7")).toBe("baucompliance-notice-draft-draft-7.pdf");
  });
});
