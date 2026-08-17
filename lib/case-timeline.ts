import {
  calculateRuegefrist,
  determineLegalRegime,
  formatDateCH,
  formatTimestampDateCH,
  generateDeadlineICS,
  validateRuegefristInput,
  type LegalRegime,
  type DeadlineResult,
} from "@/lib/legal-utils";
import type {
  CaseNoticeDispatch,
  CaseNoticeDispatchChannel,
  CaseNoticeDispatchEvidence,
} from "@/lib/case-notice-dispatch";
import type { CaseEvidence } from "@/lib/database.types";

export type CaseDeadlineStatus = DeadlineResult["status"] | "immediate-notice";

export type CaseRegimeFilter = LegalRegime | "all";
export type CaseStatusFilter = DeadlineResult["status"] | "triage" | "all";
export type CaseSortMode = "nearest-deadline" | "most-urgent";

export type FollowUpChecklistKey =
  | "defectDocumented"
  | "evidenceAttached"
  | "noticeDrafted"
  | "calendarReminderExported";

export interface FollowUpChecklistState {
  defectDocumented: boolean;
  evidenceAttached: boolean;
  noticeDrafted: boolean;
  calendarReminderExported: boolean;
}

export interface CaseChecklistProgress {
  completed: number;
  total: number;
  label: string;
}

export interface CaseReminderExportCapability {
  deadlineReminderIcsEligible: boolean;
}

export interface ComplianceCaseInput {
  id: string;
  projectName: string;
  canton: string;
  contractDate: Date;
  discoveryDate: Date;
}

export type ComplianceCaseInputValidationError =
  | "discovery-before-contract"
  | "invalid-date";

export function validateComplianceCaseInput(
  input: ComplianceCaseInput
): ComplianceCaseInputValidationError | null {
  const contract = new Date(input.contractDate);
  const discovery = new Date(input.discoveryDate);

  if (Number.isNaN(contract.getTime()) || Number.isNaN(discovery.getTime())) {
    return "invalid-date";
  }

  return validateRuegefristInput(contract, discovery);
}

export interface ComplianceCaseViewModel {
  id: string;
  projectName: string;
  canton: string;
  contractDate: Date;
  contractDateLabel: string;
  discoveryDate: Date;
  discoveryDateLabel: string;
  regime: LegalRegime;
  regimeLabel: "Old law" | "New law";
  noticeApplies: boolean;
  noticeDeadline: Date | null;
  noticeDeadlineLabel: string;
  daysToDeadline: number | null;
  deadlineCountdownLabel: string;
  deadlineCountdownTone: "neutral" | "warning" | "urgent" | "expired";
  status: CaseDeadlineStatus;
  statusLabel: string;
  nextAction: string;
  reminderReadiness: {
    calendarExportReady: boolean;
    emailReminderPlanned: boolean;
    evidenceComplete: boolean;
  };
  exportCapability: CaseReminderExportCapability;
  checklistDefaults: FollowUpChecklistState;
}

export type CaseLegalMilestoneKind =
  | "contract"
  | "discovery"
  | "evidence-uploaded"
  | "protocol-finalized"
  | "notice-dispatched"
  | "notice-deadline";

export interface LinkedCaseProtocolEvent {
  id: string;
  status: "draft" | "awaiting-signature" | "finalized";
  createdAt: string | Date;
}

export interface LinkedCaseEvidenceEvent {
  id: string;
  evidenceId: string;
  eventType: "evidence_uploaded";
  sourceName: string;
  occurredAt: string | Date;
}

export interface CaseLegalMilestone {
  id?: string;
  kind: CaseLegalMilestoneKind;
  date: Date;
  dateLabel: string;
  sourceId?: string;
  sourceName?: string;
  supportingEvidenceId?: string;
  supportingEvidenceAssociationId?: string;
  supportingEvidenceName?: string;
}

export interface CaseLegalChronologyCsvLabels {
  title: string;
  generatedAt: string;
  caseId: string;
  projectName: string;
  canton: string;
  date: string;
  milestone: string;
  sourceId: string;
  sourceName: string;
  milestones: Record<CaseLegalMilestoneKind, string>;
  dispatchChannels?: Partial<Record<CaseNoticeDispatchChannel, string>>;
  supportingEvidenceId?: string;
  supportingEvidenceAssociationId?: string;
  supportingEvidenceName?: string;
}

export interface CaseAuditRegisterCsvRow {
  item: ComplianceCaseViewModel;
  checklist: FollowUpChecklistState;
  protocolCount: number;
}

export interface CaseAuditRegisterCsvLabels {
  title: string;
  generatedAt: string;
  caseId: string;
  projectName: string;
  canton: string;
  regime: string;
  status: string;
  noticeDeadline: string;
  checklistProgress: string;
  linkedProtocols: string;
  auditReadiness: string;
  regimes: Record<LegalRegime, string>;
  statuses: Record<CaseDeadlineStatus, string>;
}

export function toComplianceCaseViewModel(
  input: ComplianceCaseInput
): ComplianceCaseViewModel {
  const validationError = validateComplianceCaseInput(input);

  if (validationError === "invalid-date") {
    throw new Error(
      `Invalid compliance case dates for case ${input.id}: expected valid contract and discovery dates.`
    );
  }

  if (validationError === "discovery-before-contract") {
    throw new Error(
      `Invalid compliance case timeline for case ${input.id}: discovery date cannot be before contract date.`
    );
  }

  const regime = determineLegalRegime(input.contractDate);
  const result = calculateRuegefrist(input.contractDate, input.discoveryDate);
  const evidenceComplete = input.canton !== "VD";

  if (regime === "old") {
    return {
      ...input,
      contractDateLabel: formatDateCH(input.contractDate),
      discoveryDateLabel: formatDateCH(input.discoveryDate),
      regime,
      regimeLabel: "Old law",
      noticeApplies: false,
      noticeDeadline: null,
      noticeDeadlineLabel: "No fixed 60-day deadline",
      daysToDeadline: null,
      deadlineCountdownLabel: "Notify immediately",
      deadlineCountdownTone: "urgent",
      status: "immediate-notice",
      statusLabel: "Immediate notice",
      nextAction: "Send defect notice immediately and document delivery.",
      reminderReadiness: {
        calendarExportReady: false,
        emailReminderPlanned: false,
        evidenceComplete,
      },
      exportCapability: {
        deadlineReminderIcsEligible: false,
      },
      checklistDefaults: {
        defectDocumented: true,
        evidenceAttached: evidenceComplete,
        noticeDrafted: false,
        calendarReminderExported: false,
      },
    };
  }

  const deadline = result.ruegefrist60!;

  return {
    ...input,
    contractDateLabel: formatDateCH(input.contractDate),
    discoveryDateLabel: formatDateCH(input.discoveryDate),
    regime,
    regimeLabel: "New law",
    noticeApplies: true,
    noticeDeadline: deadline.date,
    noticeDeadlineLabel: formatDateCH(deadline.date),
    daysToDeadline: deadline.daysRemaining,
    deadlineCountdownLabel: getCountdownLabel(deadline.daysRemaining),
    deadlineCountdownTone: mapStatusToTone(deadline.status),
    status: deadline.status,
    statusLabel: mapStatusToLabel(deadline.status),
    nextAction: getNextAction(deadline.status),
    reminderReadiness: {
      calendarExportReady: true,
      emailReminderPlanned: false,
      evidenceComplete,
    },
    exportCapability: {
      deadlineReminderIcsEligible: true,
    },
    checklistDefaults: {
      defectDocumented: true,
      evidenceAttached: evidenceComplete,
      noticeDrafted: false,
      calendarReminderExported: false,
    },
  };
}

export function buildComplianceCaseTimeline(
  cases: ComplianceCaseInput[]
): ComplianceCaseViewModel[] {
  return cases.flatMap((input) => {
    try {
      return [toComplianceCaseViewModel(input)];
    } catch (error) {
      console.warn(
        `[case-timeline] Skipping invalid compliance case ${input.id}`,
        error
      );
      return [];
    }
  });
}

export function deriveCaseLegalMilestones(
  item: ComplianceCaseViewModel,
  linkedProtocols: LinkedCaseProtocolEvent[] = [],
  evidenceEvents: LinkedCaseEvidenceEvent[] = [],
  noticeDispatches: CaseNoticeDispatch[] = [],
  dispatchChannelLabels: Partial<Record<CaseNoticeDispatchChannel, string>> = {},
  dispatchEvidence: CaseNoticeDispatchEvidence[] = [],
  evidence: CaseEvidence[] = []
): CaseLegalMilestone[] {
  const milestones: CaseLegalMilestone[] = [
    {
      kind: "contract",
      date: item.contractDate,
      dateLabel: item.contractDateLabel,
    },
    {
      kind: "discovery",
      date: item.discoveryDate,
      dateLabel: item.discoveryDateLabel,
    },
  ];

  if (item.noticeDeadline) {
    milestones.push({
      kind: "notice-deadline",
      date: item.noticeDeadline,
      dateLabel: item.noticeDeadlineLabel,
    });
  }

  for (const protocol of linkedProtocols) {
    if (protocol.status !== "finalized") continue;

    const finalizedAt = new Date(protocol.createdAt);
    if (Number.isNaN(finalizedAt.getTime())) continue;

    milestones.push({
      id: `protocol-finalized-${protocol.id}`,
      kind: "protocol-finalized",
      date: finalizedAt,
      dateLabel: formatTimestampDateCH(finalizedAt),
    });
  }

  for (const event of evidenceEvents) {
    if (event.eventType !== "evidence_uploaded") continue;

    const occurredAt = new Date(event.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) continue;

    milestones.push({
      id: `evidence-uploaded-${event.id}`,
      kind: "evidence-uploaded",
      date: occurredAt,
      dateLabel: formatTimestampDateCH(occurredAt),
      sourceId: event.evidenceId,
      sourceName: event.sourceName,
    });
  }

  for (const dispatch of noticeDispatches) {
    if (dispatch.case_id !== item.id) continue;
    const dispatchedAt = new Date(dispatch.dispatched_at);
    if (Number.isNaN(dispatchedAt.getTime())) continue;

    const association = dispatchEvidence.find((link) =>
      link.dispatch_id === dispatch.id && link.case_id === item.id && link.user_id === dispatch.user_id
    );
    const linkedEvidence = association && evidence.find((record) =>
      record.id === association.evidence_id && record.case_id === item.id && record.user_id === dispatch.user_id
    );

    milestones.push({
      id: `notice-dispatched-${dispatch.id}`,
      kind: "notice-dispatched",
      date: dispatchedAt,
      dateLabel: formatTimestampDateCH(dispatchedAt),
      sourceId: dispatch.notice_draft_id,
      sourceName: dispatch.reference
        ? `${dispatchChannelLabels[dispatch.channel] ?? dispatch.channel} · ${dispatch.reference}`
        : (dispatchChannelLabels[dispatch.channel] ?? dispatch.channel),
      ...(association && linkedEvidence ? {
        supportingEvidenceId: linkedEvidence.id,
        supportingEvidenceAssociationId: association.id,
        supportingEvidenceName: linkedEvidence.original_name,
      } : {}),
    });
  }

  const milestoneOrder: Record<CaseLegalMilestoneKind, number> = {
    contract: 0,
    discovery: 1,
    "evidence-uploaded": 2,
    "protocol-finalized": 3,
    "notice-dispatched": 4,
    "notice-deadline": 5,
  };

  return milestones.sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      milestoneOrder[a.kind] - milestoneOrder[b.kind] ||
      (a.id ?? a.kind).localeCompare(b.id ?? b.kind)
  );
}

export function buildCaseAuditRegisterCsv(
  rows: CaseAuditRegisterCsvRow[],
  labels: CaseAuditRegisterCsvLabels,
  generatedAt: Date
): string {
  const csvRows: string[][] = [
    [labels.title],
    [labels.generatedAt, generatedAt.toISOString()],
    [""],
    [
      labels.caseId,
      labels.projectName,
      labels.canton,
      labels.regime,
      labels.status,
      labels.noticeDeadline,
      labels.checklistProgress,
      labels.linkedProtocols,
      labels.auditReadiness,
    ],
    ...rows.map(({ item, checklist, protocolCount }) => {
      const checklistProgress = deriveChecklistProgress(checklist);
      const auditCompleted = [
        checklist.defectDocumented,
        checklist.evidenceAttached,
        checklist.noticeDrafted,
        !item.noticeApplies || checklist.calendarReminderExported,
        protocolCount > 0,
      ].filter(Boolean).length;

      return [
        item.id,
        item.projectName,
        item.canton,
        labels.regimes[item.regime],
        labels.statuses[item.status],
        item.noticeDeadline ? formatSwissCalendarDate(item.noticeDeadline) : "",
        `${checklistProgress.completed}/${checklistProgress.total}`,
        String(protocolCount),
        `${auditCompleted}/5`,
      ];
    }),
  ];

  return `\ufeff${csvRows.map((row) => row.map(quoteCsvField).join(",")).join("\r\n")}`;
}

export function buildCaseLegalChronologyCsv(
  item: ComplianceCaseViewModel,
  linkedProtocols: LinkedCaseProtocolEvent[],
  evidenceEvents: LinkedCaseEvidenceEvent[],
  labels: CaseLegalChronologyCsvLabels,
  generatedAt: Date,
  noticeDispatches: CaseNoticeDispatch[] = [],
  dispatchEvidence: CaseNoticeDispatchEvidence[] = [],
  evidence: CaseEvidence[] = []
): string {
  const protocolSourceIds = new Map(
    linkedProtocols.map((protocol) => [`protocol-finalized-${protocol.id}`, protocol.id])
  );
  const rows: string[][] = [
    [labels.title],
    [labels.generatedAt, generatedAt.toISOString()],
    [labels.caseId, item.id],
    [labels.projectName, item.projectName],
    [labels.canton, item.canton],
    [""],
    [labels.date, labels.milestone, labels.sourceId, labels.sourceName,
      ...(labels.supportingEvidenceName ? [labels.supportingEvidenceName,
        labels.supportingEvidenceId ?? "Supporting evidence ID",
        labels.supportingEvidenceAssociationId ?? "Association ID"] : [])],
    ...deriveCaseLegalMilestones(
      item,
      linkedProtocols,
      evidenceEvents,
      noticeDispatches,
      labels.dispatchChannels,
      dispatchEvidence,
      evidence
    ).map((milestone) => [
      formatSwissCalendarDate(milestone.date),
      labels.milestones[milestone.kind],
      milestone.sourceId ?? (milestone.id ? (protocolSourceIds.get(milestone.id) ?? "") : ""),
      milestone.sourceName ?? "",
      ...(labels.supportingEvidenceName ? [milestone.supportingEvidenceName ?? "",
        milestone.supportingEvidenceId ?? "", milestone.supportingEvidenceAssociationId ?? ""] : []),
    ]),
  ];

  return `\ufeff${rows.map((row) => row.map(quoteCsvField).join(",")).join("\r\n")}`;
}

const swissCalendarDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Zurich",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatSwissCalendarDate(date: Date): string {
  const parts = Object.fromEntries(
    swissCalendarDateFormatter
      .formatToParts(date)
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function quoteCsvField(value: string): string {
  const spreadsheetSafeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${spreadsheetSafeValue.replaceAll('"', '""')}"`;
}

export function filterComplianceCases(
  cases: ComplianceCaseViewModel[],
  regimeFilter: CaseRegimeFilter,
  statusFilter: CaseStatusFilter
): ComplianceCaseViewModel[] {
  return cases.filter((item) => {
    const regimeMatch = regimeFilter === "all" || item.regime === regimeFilter;
    const statusMatch =
      statusFilter === "all" ||
      item.status === statusFilter ||
      (statusFilter === "triage" && (item.status === "urgent" || item.status === "expired")) ||
      (item.status === "immediate-notice" && (statusFilter === "urgent" || statusFilter === "triage"));

    return regimeMatch && statusMatch;
  });
}

export function sortComplianceCases(
  cases: ComplianceCaseViewModel[],
  sortMode: CaseSortMode
): ComplianceCaseViewModel[] {
  const clone = [...cases];

  if (sortMode === "nearest-deadline") {
    return clone.sort((a, b) => {
      const aDays = a.daysToDeadline ?? Number.POSITIVE_INFINITY;
      const bDays = b.daysToDeadline ?? Number.POSITIVE_INFINITY;
      if (aDays !== bDays) return aDays - bDays;
      return b.discoveryDate.getTime() - a.discoveryDate.getTime();
    });
  }

  return clone.sort((a, b) => {
    const urgencyDiff = getUrgencyRank(a.status) - getUrgencyRank(b.status);
    if (urgencyDiff !== 0) return urgencyDiff;

    const aDays = a.daysToDeadline ?? Number.POSITIVE_INFINITY;
    const bDays = b.daysToDeadline ?? Number.POSITIVE_INFINITY;
    return aDays - bDays;
  });
}

export function applyComplianceCaseView(
  cases: ComplianceCaseViewModel[],
  regimeFilter: CaseRegimeFilter,
  statusFilter: CaseStatusFilter,
  sortMode: CaseSortMode
): ComplianceCaseViewModel[] {
  return sortComplianceCases(
    filterComplianceCases(cases, regimeFilter, statusFilter),
    sortMode
  );
}

export function deriveChecklistProgress(
  checklist: FollowUpChecklistState
): CaseChecklistProgress {
  const values = Object.values(checklist);
  const completed = values.filter(Boolean).length;
  const total = values.length;

  return {
    completed,
    total,
    label: `${completed}/${total} complete`,
  };
}

export function isDeadlineReminderIcsExportEligible(
  item: ComplianceCaseViewModel
): boolean {
  return item.regime === "new" && item.noticeApplies && item.noticeDeadline !== null;
}

export function buildCaseDeadlineReminderICS(item: ComplianceCaseViewModel): string | null {
  if (!isDeadlineReminderIcsExportEligible(item) || !item.noticeDeadline) {
    return null;
  }

  return generateDeadlineICS(
    item.noticeDeadline,
    `BauCompliance: 60-day notice deadline (${item.projectName})`,
    `Case: ${item.projectName} (${item.canton})\nDefect discovered: ${item.discoveryDateLabel}\nDeadline: ${item.noticeDeadlineLabel}`
  );
}

function mapStatusToLabel(status: DeadlineResult["status"]): string {
  if (status === "ok") return "On track";
  if (status === "warning") return "Attention";
  if (status === "urgent") return "Urgent";
  return "Expired";
}

function getNextAction(status: DeadlineResult["status"]): string {
  if (status === "ok") return "Draft notice package and schedule legal review.";
  if (status === "warning") return "Finalize and send notice this week.";
  if (status === "urgent") return "Send notice today via traceable channel.";
  return "Escalate to legal counsel for mitigation options.";
}

function mapStatusToTone(
  status: DeadlineResult["status"]
): "neutral" | "warning" | "urgent" | "expired" {
  if (status === "ok") return "neutral";
  if (status === "warning") return "warning";
  if (status === "urgent") return "urgent";
  return "expired";
}

function getCountdownLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

function getUrgencyRank(status: CaseDeadlineStatus): number {
  if (status === "expired") return 0;
  if (status === "immediate-notice") return 1;
  if (status === "urgent") return 2;
  if (status === "warning") return 3;
  return 4;
}
