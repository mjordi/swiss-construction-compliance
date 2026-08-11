import type { CaseNoticeDraft } from "@/lib/database.types";

export interface CaseNoticeDraftReportLabels {
  title: string;
  saved: string;
  notApproved: string;
  notSent: string;
  reviewDisclaimer: string;
  legalDisclaimer: string;
  draftId: string;
  createdAt: string;
  projectName: string;
  canton: string;
  recipientName: string;
  recipientAddress: string;
  defectStatement: string;
  contractDate: string;
  discoveryDate: string;
  noticeDeadline: string;
  noticeDeadlineNotFixed: string;
  regime: string;
  regimes: Record<CaseNoticeDraft["regime"], string>;
}

export interface CaseNoticeDraftReport {
  labels: CaseNoticeDraftReportLabels;
  draftId: string;
  createdAt: string;
  projectName: string;
  canton: string;
  recipientName: string;
  recipientAddress: string;
  defectStatement: string;
  contractDate: string;
  discoveryDate: string;
  noticeDeadline: string | null;
  regime: CaseNoticeDraft["regime"];
}

export function buildCaseNoticeDraftReport(
  draft: CaseNoticeDraft,
  labels: CaseNoticeDraftReportLabels
): CaseNoticeDraftReport {
  return {
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
  };
}

export function caseNoticeDraftPdfFilename(draftId: string): string {
  return `baucompliance-notice-draft-${draftId}.pdf`;
}
