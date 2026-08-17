import { normalizeFollowUpChecklistState } from "@/lib/cases-checklist";
import {
  deriveCaseLegalMilestones,
  type CaseDeadlineStatus,
  type CaseLegalMilestoneKind,
  type ComplianceCaseViewModel,
  type FollowUpChecklistKey,
  type FollowUpChecklistState,
  type LinkedCaseProtocolEvent,
} from "@/lib/case-timeline";
import type { LegalRegime } from "@/lib/legal-utils";
import type {
  CaseNoticeDispatch,
  CaseNoticeDispatchChannel,
  CaseNoticeDispatchEvidence,
} from "@/lib/case-notice-dispatch";
import type { CaseEvidence } from "@/lib/database.types";

export interface CaseAuditDossierLabels {
  title: string;
  generatedAt: string;
  caseId: string;
  projectName: string;
  canton: string;
  regime: string;
  status: string;
  contractDate: string;
  discoveryDate: string;
  noticeDeadline: string;
  noticeDeadlineNotFixed: string;
  nextAction: string;
  checklist: string;
  checklistReady: string;
  checklistMissing: string;
  linkedProtocols: string;
  chronology: string;
  noLinkedProtocols: string;
  legalDisclaimer: string;
  regimes: Record<LegalRegime, string>;
  statuses: Record<CaseDeadlineStatus, string>;
  checklistItems: Record<FollowUpChecklistKey, string>;
  milestones: Record<CaseLegalMilestoneKind, string>;
  dispatchChannels?: Partial<Record<CaseNoticeDispatchChannel, string>>;
  supportingEvidence?: string;
}

export interface CaseAuditDossierMilestone {
  kind: CaseLegalMilestoneKind;
  label: string;
  date: string;
  dateLabel: string;
  sourceId: string | null;
  sourceName: string | null;
  supportingEvidenceId?: string | null;
  supportingEvidenceAssociationId?: string | null;
  supportingEvidenceName?: string | null;
}

export interface CaseAuditDossierReport {
  title: string;
  generatedAtLabel: string;
  generatedAt: string;
  labels: Pick<
    CaseAuditDossierLabels,
    | "caseId"
    | "projectName"
    | "canton"
    | "regime"
    | "status"
    | "contractDate"
    | "discoveryDate"
    | "noticeDeadline"
    | "nextAction"
    | "checklist"
    | "checklistReady"
    | "checklistMissing"
    | "linkedProtocols"
    | "chronology"
    | "supportingEvidence"
  >;
  caseId: string;
  projectName: string;
  canton: string;
  regime: string;
  status: string;
  contractDate: string;
  discoveryDate: string;
  noticeDeadline: string;
  nextAction: string;
  readiness: {
    completed: number;
    total: number;
    ready: string[];
    missing: string[];
  };
  linkedProtocolsSummary: string;
  milestones: CaseAuditDossierMilestone[];
  legalDisclaimer: string;
}

const checklistKeys: FollowUpChecklistKey[] = [
  "defectDocumented",
  "evidenceAttached",
  "noticeDrafted",
  "calendarReminderExported",
];

export function buildCaseAuditDossier({
  item,
  checklist,
  linkedProtocols,
  noticeDispatches = [],
  dispatchEvidence = [],
  evidence = [],
  labels,
  generatedAt,
}: {
  item: ComplianceCaseViewModel;
  checklist: FollowUpChecklistState;
  linkedProtocols: LinkedCaseProtocolEvent[];
  noticeDispatches?: CaseNoticeDispatch[];
  dispatchEvidence?: CaseNoticeDispatchEvidence[];
  evidence?: CaseEvidence[];
  labels: CaseAuditDossierLabels;
  generatedAt: Date;
}): CaseAuditDossierReport {
  const normalizedChecklist = normalizeFollowUpChecklistState(checklist);
  const applicableChecklistKeys = item.noticeApplies
    ? checklistKeys
    : checklistKeys.filter((key) => key !== "calendarReminderExported");
  const ready = applicableChecklistKeys
    .filter((key) => normalizedChecklist[key])
    .map((key) => labels.checklistItems[key]);
  const missing = applicableChecklistKeys
    .filter((key) => !normalizedChecklist[key])
    .map((key) => labels.checklistItems[key]);
  const milestones = deriveCaseLegalMilestones(
    item,
    linkedProtocols,
    [],
    noticeDispatches,
    labels.dispatchChannels,
    dispatchEvidence,
    evidence
  ).map((milestone) => ({
    kind: milestone.kind,
    label: labels.milestones[milestone.kind],
    date: milestone.date.toISOString(),
    dateLabel: milestone.dateLabel,
    sourceId: milestone.sourceId ?? (
      milestone.kind === "protocol-finalized" && milestone.id
        ? milestone.id.replace(/^protocol-finalized-/, "")
        : null
    ),
    sourceName: milestone.sourceName ?? null,
    supportingEvidenceId: milestone.supportingEvidenceId ?? null,
    supportingEvidenceAssociationId: milestone.supportingEvidenceAssociationId ?? null,
    supportingEvidenceName: milestone.supportingEvidenceName ?? null,
  }));
  const finalizedProtocolCount = milestones.filter(
    (milestone) => milestone.kind === "protocol-finalized"
  ).length;

  return {
    title: labels.title,
    generatedAtLabel: labels.generatedAt,
    generatedAt: generatedAt.toISOString(),
    labels: {
      caseId: labels.caseId,
      projectName: labels.projectName,
      canton: labels.canton,
      regime: labels.regime,
      status: labels.status,
      contractDate: labels.contractDate,
      discoveryDate: labels.discoveryDate,
      noticeDeadline: labels.noticeDeadline,
      nextAction: labels.nextAction,
      checklist: labels.checklist,
      checklistReady: labels.checklistReady,
      checklistMissing: labels.checklistMissing,
      linkedProtocols: labels.linkedProtocols,
      chronology: labels.chronology,
      supportingEvidence: labels.supportingEvidence,
    },
    caseId: item.id,
    projectName: item.projectName,
    canton: item.canton,
    regime: labels.regimes[item.regime],
    status: labels.statuses[item.status],
    contractDate: item.contractDateLabel,
    discoveryDate: item.discoveryDateLabel,
    noticeDeadline: item.noticeApplies
      ? item.noticeDeadlineLabel
      : labels.noticeDeadlineNotFixed,
    nextAction: item.nextAction,
    readiness: {
      completed: ready.length,
      total: applicableChecklistKeys.length,
      ready,
      missing,
    },
    linkedProtocolsSummary:
      finalizedProtocolCount > 0 ? String(finalizedProtocolCount) : labels.noLinkedProtocols,
    milestones,
    legalDisclaimer: labels.legalDisclaimer,
  };
}
