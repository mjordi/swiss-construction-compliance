import {
  calculateRuegefrist,
  determineLegalRegime,
  formatDateCH,
  type LegalRegime,
  type DeadlineResult,
} from "@/lib/legal-utils";

export type CaseDeadlineStatus = DeadlineResult["status"] | "immediate-notice";

export interface ComplianceCaseInput {
  id: string;
  projectName: string;
  canton: string;
  contractDate: Date;
  discoveryDate: Date;
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
  noticeDeadline: Date | null;
  noticeDeadlineLabel: string;
  status: CaseDeadlineStatus;
  statusLabel: string;
  nextAction: string;
}

export function toComplianceCaseViewModel(
  input: ComplianceCaseInput
): ComplianceCaseViewModel {
  const regime = determineLegalRegime(input.contractDate);
  const result = calculateRuegefrist(input.contractDate, input.discoveryDate);

  if (regime === "old") {
    return {
      ...input,
      contractDateLabel: formatDateCH(input.contractDate),
      discoveryDateLabel: formatDateCH(input.discoveryDate),
      regime,
      regimeLabel: "Old law",
      noticeDeadline: null,
      noticeDeadlineLabel: "No fixed 60-day deadline",
      status: "immediate-notice",
      statusLabel: "Immediate notice",
      nextAction: "Send defect notice immediately and document delivery.",
    };
  }

  const deadline = result.ruegefrist60!;

  return {
    ...input,
    contractDateLabel: formatDateCH(input.contractDate),
    discoveryDateLabel: formatDateCH(input.discoveryDate),
    regime,
    regimeLabel: "New law",
    noticeDeadline: deadline.date,
    noticeDeadlineLabel: formatDateCH(deadline.date),
    status: deadline.status,
    statusLabel: mapStatusToLabel(deadline.status),
    nextAction: getNextAction(deadline.status),
  };
}

export function buildComplianceCaseTimeline(
  cases: ComplianceCaseInput[]
): ComplianceCaseViewModel[] {
  return cases.map(toComplianceCaseViewModel);
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
