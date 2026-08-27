import type { Case, Protocol } from "@/lib/database.types";
import {
  buildComplianceCaseTimeline,
  validateComplianceCaseInput,
  type ComplianceCaseViewModel,
  type FollowUpChecklistState,
} from "@/lib/case-timeline";
import { normalizeFollowUpChecklistState } from "@/lib/cases-checklist";
import { buildVaultProjectCasesHref } from "@/lib/vault";

export type ComplianceWorkQueuePriority =
  | "expired"
  | "immediate-notice"
  | "urgent"
  | "warning"
  | "lifecycle-review"
  | "incomplete-readiness";

export type ComplianceWorkQueueReadinessReason =
  | "defect-not-documented"
  | "evidence-not-attached"
  | "notice-not-drafted"
  | "calendar-not-exported"
  | "protocol-missing";

export type ComplianceWorkQueueProtocolIdentity = Pick<
  Protocol,
  "id" | "case_id" | "project_name"
>;

export interface ComplianceWorkQueueRow {
  id: string;
  projectName: string;
  canton: string;
  lifecycleStatus: Exclude<Case["status"], "archived">;
  priority: ComplianceWorkQueuePriority;
  timeline: ComplianceCaseViewModel;
  checklist: FollowUpChecklistState;
  checklistProgress: {
    completed: number;
    total: number;
  };
  readinessReasons: ComplianceWorkQueueReadinessReason[];
  linkedProtocolCount: number;
  casesHref: string;
}

export interface ComplianceWorkQueueResult {
  rows: ComplianceWorkQueueRow[];
  rejectedCaseCount: number;
  rejectedProtocolCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValidChecklist(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (!isRecord(value)) return false;

  return [
    "defectDocumented",
    "evidenceAttached",
    "noticeDrafted",
    "calendarReminderExported",
  ].every((key) => value[key] === undefined || typeof value[key] === "boolean");
}

function isEvaluableCase(value: unknown): value is Case {
  if (!isRecord(value)) return false;
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.project_name) ||
    !isNonEmptyString(value.canton) ||
    !isNonEmptyString(value.contract_date) ||
    !isNonEmptyString(value.discovery_date) ||
    (value.status !== "active" && value.status !== "review" && value.status !== "archived") ||
    !hasValidChecklist(value.checklist)
  ) {
    return false;
  }

  return validateComplianceCaseInput({
    id: value.id,
    projectName: value.project_name,
    canton: value.canton,
    contractDate: new Date(value.contract_date),
    discoveryDate: new Date(value.discovery_date),
  }) === null;
}

function isEvaluableProtocol(value: unknown): value is ComplianceWorkQueueProtocolIdentity {
  return isRecord(value) &&
    isNonEmptyString(value.id) &&
    (value.case_id === null || isNonEmptyString(value.case_id)) &&
    isNonEmptyString(value.project_name);
}

export function buildComplianceWorkQueueResult(
  cases: readonly unknown[],
  protocols: readonly unknown[]
): ComplianceWorkQueueResult {
  const queueCases = cases.filter(
    (value) => !isRecord(value) || value.status !== "archived"
  );
  const validCases = queueCases.filter(isEvaluableCase);
  const validProtocols = protocols.filter(isEvaluableProtocol);

  return {
    rows: buildComplianceWorkQueue(validCases, validProtocols),
    rejectedCaseCount: queueCases.length - validCases.length,
    rejectedProtocolCount: protocols.length - validProtocols.length,
  };
}

const priorityRank: Record<ComplianceWorkQueuePriority, number> = {
  expired: 0,
  "immediate-notice": 1,
  urgent: 2,
  warning: 3,
  "lifecycle-review": 4,
  "incomplete-readiness": 5,
};

function readinessReasons(
  timeline: ComplianceCaseViewModel,
  checklist: FollowUpChecklistState,
  linkedProtocolCount: number
): ComplianceWorkQueueReadinessReason[] {
  return [
    ...(checklist.defectDocumented ? [] : ["defect-not-documented" as const]),
    ...(checklist.evidenceAttached ? [] : ["evidence-not-attached" as const]),
    ...(checklist.noticeDrafted ? [] : ["notice-not-drafted" as const]),
    ...(!timeline.noticeApplies || checklist.calendarReminderExported
      ? []
      : ["calendar-not-exported" as const]),
    ...(linkedProtocolCount > 0 ? [] : ["protocol-missing" as const]),
  ];
}

function getPriority(
  item: ComplianceCaseViewModel,
  lifecycleStatus: Exclude<Case["status"], "archived">
): ComplianceWorkQueuePriority {
  if (item.status === "expired") return "expired";
  if (item.status === "immediate-notice") return "immediate-notice";
  if (item.status === "urgent") return "urgent";
  if (item.status === "warning") return "warning";
  if (lifecycleStatus === "review") return "lifecycle-review";
  return "incomplete-readiness";
}

function isTriageStatus(status: ComplianceCaseViewModel["status"]): boolean {
  return status === "expired" || status === "immediate-notice" || status === "urgent";
}

export function buildComplianceWorkQueue(
  cases: readonly Case[],
  protocols: readonly ComplianceWorkQueueProtocolIdentity[]
): ComplianceWorkQueueRow[] {
  const activeCases = cases.filter(
    (item): item is Case & { status: Exclude<Case["status"], "archived"> } =>
      item.status !== "archived"
  );
  const timeline = buildComplianceCaseTimeline(
    activeCases.map((item) => ({
      id: item.id,
      projectName: item.project_name,
      canton: item.canton,
      contractDate: new Date(item.contract_date),
      discoveryDate: new Date(item.discovery_date),
    }))
  );
  const caseById = new Map(activeCases.map((item) => [item.id, item]));
  const protocolCountByCase = new Map<string, number>();

  for (const protocol of protocols) {
    if (!protocol.case_id) continue;
    protocolCountByCase.set(
      protocol.case_id,
      (protocolCountByCase.get(protocol.case_id) ?? 0) + 1
    );
  }

  return timeline
    .flatMap((item): ComplianceWorkQueueRow[] => {
      const source = caseById.get(item.id);
      if (!source) return [];

      const checklist = normalizeFollowUpChecklistState({
        ...item.checklistDefaults,
        ...(source.checklist ?? {}),
      });
      const linkedProtocolCount = protocolCountByCase.get(item.id) ?? 0;
      const reasons = readinessReasons(item, checklist, linkedProtocolCount);

      if (item.status === "ok" && source.status === "active" && reasons.length === 0) {
        return [];
      }

      return [{
        id: item.id,
        projectName: item.projectName,
        canton: item.canton,
        lifecycleStatus: source.status,
        priority: getPriority(item, source.status),
        timeline: item,
        checklist,
        checklistProgress: {
          completed: Object.values(checklist).filter(Boolean).length,
          total: Object.keys(checklist).length,
        },
        readinessReasons: reasons,
        linkedProtocolCount,
        casesHref: buildVaultProjectCasesHref({
          projectName: item.projectName,
          prefillTriage: isTriageStatus(item.status),
        }),
      }];
    })
    .sort((left, right) => {
      const priorityDifference = priorityRank[left.priority] - priorityRank[right.priority];
      if (priorityDifference !== 0) return priorityDifference;

      const leftDeadline = left.timeline.noticeDeadline?.getTime() ?? Number.POSITIVE_INFINITY;
      const rightDeadline = right.timeline.noticeDeadline?.getTime() ?? Number.POSITIVE_INFINITY;
      if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;

      const leftDays = left.timeline.daysToDeadline ?? Number.POSITIVE_INFINITY;
      const rightDays = right.timeline.daysToDeadline ?? Number.POSITIVE_INFINITY;
      if (leftDays !== rightDays) return leftDays - rightDays;

      const discoveryDifference =
        left.timeline.discoveryDate.getTime() - right.timeline.discoveryDate.getTime();
      if (discoveryDifference !== 0) return discoveryDifference;

      return left.id.localeCompare(right.id);
    });
}
