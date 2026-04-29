import {
  calculateRuegefrist,
  determineLegalRegime,
  formatDateCH,
  generateDeadlineICS,
  validateRuegefristInput,
  type LegalRegime,
  type DeadlineResult,
} from "@/lib/legal-utils";

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
        emailReminderPlanned: true,
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
      emailReminderPlanned: true,
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
