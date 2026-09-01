import { toComplianceCaseViewModel } from "@/lib/case-timeline";
import {
  addDays,
  getSwissCalendarDateInputValue,
  normalizeDeadlineReminderOffsets,
  parseDateInputAsUTC,
  validateAcceptanceChronology,
} from "@/lib/legal-utils";

export const CASE_DEADLINE_PORTFOLIO_PAGE_SIZE = 500;

export interface CaseDeadlinePortfolioSource {
  id: string;
  project_name: string;
  contract_date: string;
  discovery_date: string;
  acceptance_date: string | null;
  status: "active" | "review" | "archived";
}

export const CASE_DEADLINE_MILESTONE_KINDS = ["notice", "warranty-2y", "limitation-5y"] as const;
export type CaseDeadlineMilestoneKind = typeof CASE_DEADLINE_MILESTONE_KINDS[number];
export type CaseAcceptanceDeadlineMilestoneKind = Exclude<CaseDeadlineMilestoneKind, "notice">;

interface CaseDeadlinePortfolioRowBase {
  caseId: string;
  projectName: string;
  deadline: Date;
  deadlineDay: string;
}

export interface CaseNoticeDeadlinePortfolioRow extends CaseDeadlinePortfolioRowBase {
  kind: "notice";
  contractDay: string;
  discoveryDay: string;
  acceptanceDay: null;
}

export interface CaseAcceptanceDeadlinePortfolioRow extends CaseDeadlinePortfolioRowBase {
  kind: CaseAcceptanceDeadlineMilestoneKind;
  contractDay: string | null;
  discoveryDay: string | null;
  acceptanceDay: string;
}

export type CaseDeadlinePortfolioRow =
  | CaseNoticeDeadlinePortfolioRow
  | CaseAcceptanceDeadlinePortfolioRow;

export interface CaseDeadlinePortfolioCalendarCopy {
  summaryTemplate: string;
  deadlineLabels: Record<CaseDeadlineMilestoneKind, string>;
  sourceLabel: string;
  source: string;
  projectLabel: string;
  caseLabel: string;
  contractDateLabel: string;
  discoveryDateLabel: string;
  acceptanceDateLabel: string;
  pointInTimeNotice: string;
  alarmDescriptionSingular: string;
  alarmDescriptionPlural: string;
}

function parseStoredCalendarDay(value: string): { day: string; date: Date } | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))?)?$/.exec(value);
  if (!match) return null;
  const date = parseDateInputAsUTC(match[1]);
  return date ? { day: match[1], date } : null;
}

/** Adds UTC calendar years and clamps missing anniversaries to month end. */
function addUTCCalendarYears(date: Date, years: number): Date {
  const targetYear = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, month, Math.min(date.getUTCDate(), lastDayOfTargetMonth)));
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

const MILESTONE_TYPE_ORDER: Record<CaseDeadlineMilestoneKind, number> = {
  notice: 0,
  "warranty-2y": 1,
  "limitation-5y": 2,
};

/**
 * Selects active/review Cases with current fixed notice and acceptance milestones.
 * Legal regime and deadline calculation remain owned by case-timeline/legal-utils.
 */
export function buildCaseDeadlinePortfolio(
  sources: readonly CaseDeadlinePortfolioSource[],
  now: Date = new Date()
): CaseDeadlinePortfolioRow[] {
  const today = getSwissCalendarDateInputValue(now);

  return sources
    .flatMap((source): CaseDeadlinePortfolioRow[] => {
      if (source.status === "archived" || !source.id.trim() || !source.project_name.trim()) return [];

      const contract = parseStoredCalendarDay(source.contract_date);
      const discovery = parseStoredCalendarDay(source.discovery_date);
      const rows: CaseDeadlinePortfolioRow[] = [];

      if (typeof source.acceptance_date === "string") {
        const acceptance = parseStoredCalendarDay(source.acceptance_date);
        if (
          acceptance &&
          contract &&
          discovery &&
          !validateAcceptanceChronology(contract.day, acceptance.day, discovery.day, today)
        ) {
          for (const [kind, years] of [["warranty-2y", 2], ["limitation-5y", 5]] as const) {
            const deadline = addUTCCalendarYears(acceptance.date, years);
            const deadlineDay = deadline.toISOString().slice(0, 10);
            if (deadlineDay >= today) {
              rows.push({
                kind,
                caseId: source.id,
                projectName: source.project_name,
                contractDay: contract?.day ?? null,
                discoveryDay: discovery?.day ?? null,
                acceptanceDay: acceptance.day,
                deadline,
                deadlineDay,
              });
            }
          }
        }
      }

      if (contract && discovery && discovery.day <= today) {
        try {
          const timeline = toComplianceCaseViewModel({
            id: source.id,
            projectName: source.project_name,
            canton: "",
            contractDate: contract.date,
            discoveryDate: discovery.date,
          });
          if (!timeline.exportCapability.deadlineReminderIcsEligible || !timeline.noticeDeadline) return rows;

          const deadlineDay = timeline.noticeDeadline.toISOString().slice(0, 10);
          if (deadlineDay < today) return rows;

          rows.push({
            kind: "notice",
            caseId: source.id,
            projectName: source.project_name,
            contractDay: contract.day,
            discoveryDay: discovery.day,
            acceptanceDay: null,
            deadline: timeline.noticeDeadline,
            deadlineDay,
          });
        } catch {
          // Acceptance milestones remain valid when notice inputs are ineligible.
        }
      }

      return rows;
    })
    .sort(
      (left, right) =>
        compareText(left.deadlineDay, right.deadlineDay) ||
        compareText(left.projectName, right.projectName) ||
        compareText(left.caseId, right.caseId) ||
        MILESTONE_TYPE_ORDER[left.kind] - MILESTONE_TYPE_ORDER[right.kind]
    );
}

/** Removes characters that RFC 5545 content values cannot safely carry. */
function normalizeICSControls(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");
}

function escapeICSText(value: string): string {
  return normalizeICSControls(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function replaceCopyTokens(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-z]+)\}/gi, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : token
  );
}

/** RFC 5545 folds physical content lines at 75 UTF-8 octets. */
export function foldICSContentLine(line: string): string {
  const encoder = new TextEncoder();
  const physicalLines: string[] = [];
  let current = "";
  let octets = 0;

  for (const codePoint of line) {
    const size = encoder.encode(codePoint).length;
    const limit = physicalLines.length === 0 ? 75 : 74;
    if (current && octets + size > limit) {
      physicalLines.push(current);
      current = codePoint;
      octets = size;
    } else {
      current += codePoint;
      octets += size;
    }
  }
  physicalLines.push(current);
  return physicalLines.map((part, index) => index === 0 ? part : ` ${part}`).join("\r\n");
}

function formatICSDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function formatICSStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

function stableUID(caseId: string, kind: CaseDeadlineMilestoneKind, deadlineDay: string): string {
  const encodedCaseId = kind === "notice"
    ? encodeURIComponent(normalizeICSControls(caseId))
    : normalizeICSControls(encodeURIComponent(caseId));
  const kindSuffix = kind === "notice" ? "" : `-${kind}`;
  return `baucompliance-case-${encodedCaseId}${kindSuffix}-${deadlineDay.replace(/-/g, "")}@baucompliance.ch`;
}

export function generateCaseDeadlinePortfolioICS(
  rows: readonly CaseDeadlinePortfolioRow[],
  reminderOffsets: readonly number[],
  copy: CaseDeadlinePortfolioCalendarCopy,
  generatedAt: Date = new Date()
): string {
  const stamp = formatICSStamp(generatedAt);
  const offsets = normalizeDeadlineReminderOffsets(reminderOffsets);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BauCompliance.ch//CaseDeadlinePortfolio//NONSGML",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const row of rows) {
    const deadlineLabel = copy.deadlineLabels[row.kind];
    const description = [
      `${copy.sourceLabel}: ${copy.source}`,
      `${copy.projectLabel}: ${row.projectName}`,
      `${copy.caseLabel}: ${row.caseId}`,
      ...(row.contractDay ? [`${copy.contractDateLabel}: ${row.contractDay}`] : []),
      ...(row.discoveryDay ? [`${copy.discoveryDateLabel}: ${row.discoveryDay}`] : []),
      ...(row.acceptanceDay ? [`${copy.acceptanceDateLabel}: ${row.acceptanceDay}`] : []),
      copy.pointInTimeNotice,
    ].join("\n");
    const summary = replaceCopyTokens(copy.summaryTemplate, {
      deadline: deadlineLabel,
      project: row.projectName,
    });

    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeICSText(stableUID(row.caseId, row.kind, row.deadlineDay))}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${formatICSDate(row.deadline)}`,
      `DTEND;VALUE=DATE:${formatICSDate(addDays(row.deadline, 1))}`,
      `SUMMARY:${escapeICSText(summary)}`,
      `DESCRIPTION:${escapeICSText(description)}`
    );

    for (const offset of offsets) {
      const alarmTemplate = offset === 1 ? copy.alarmDescriptionSingular : copy.alarmDescriptionPlural;
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeICSText(replaceCopyTokens(alarmTemplate, { deadline: deadlineLabel, days: offset }))}`,
        `TRIGGER:-P${offset}D`,
        "END:VALARM"
      );
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldICSContentLine).join("\r\n")}\r\n`;
}
