import { toComplianceCaseViewModel } from "@/lib/case-timeline";
import {
  addDays,
  getSwissCalendarDateInputValue,
  normalizeDeadlineReminderOffsets,
  parseDateInputAsUTC,
} from "@/lib/legal-utils";

export const CASE_DEADLINE_PORTFOLIO_PAGE_SIZE = 500;

export interface CaseDeadlinePortfolioSource {
  id: string;
  project_name: string;
  contract_date: string;
  discovery_date: string;
  status: "active" | "review" | "archived";
}

export interface CaseDeadlinePortfolioRow {
  caseId: string;
  projectName: string;
  contractDay: string;
  discoveryDay: string;
  deadline: Date;
  deadlineDay: string;
}

export interface CaseDeadlinePortfolioCalendarCopy {
  summaryTemplate: string;
  deadline: string;
  sourceLabel: string;
  source: string;
  projectLabel: string;
  caseLabel: string;
  contractDateLabel: string;
  discoveryDateLabel: string;
  pointInTimeNotice: string;
  alarmDescriptionSingular: string;
  alarmDescriptionPlural: string;
}

function parseStoredCalendarDay(value: string): { day: string; date: Date } | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(value);
  if (!match) return null;
  const date = parseDateInputAsUTC(match[1]);
  return date ? { day: match[1], date } : null;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Selects active/review Cases with a current fixed legal notice deadline.
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
      if (!contract || !discovery || discovery.day > today) return [];

      try {
        const timeline = toComplianceCaseViewModel({
          id: source.id,
          projectName: source.project_name,
          canton: "",
          contractDate: contract.date,
          discoveryDate: discovery.date,
        });
        if (!timeline.exportCapability.deadlineReminderIcsEligible || !timeline.noticeDeadline) return [];

        const deadlineDay = timeline.noticeDeadline.toISOString().slice(0, 10);
        if (deadlineDay < today) return [];

        return [{
          caseId: source.id,
          projectName: source.project_name,
          contractDay: contract.day,
          discoveryDay: discovery.day,
          deadline: timeline.noticeDeadline,
          deadlineDay,
        }];
      } catch {
        return [];
      }
    })
    .sort(
      (left, right) =>
        compareText(left.deadlineDay, right.deadlineDay) ||
        compareText(left.projectName, right.projectName) ||
        compareText(left.caseId, right.caseId)
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

function stableUID(caseId: string, deadlineDay: string): string {
  return `baucompliance-case-${encodeURIComponent(normalizeICSControls(caseId))}-${deadlineDay.replace(/-/g, "")}@baucompliance.ch`;
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
    const description = [
      `${copy.sourceLabel}: ${copy.source}`,
      `${copy.projectLabel}: ${row.projectName}`,
      `${copy.caseLabel}: ${row.caseId}`,
      `${copy.contractDateLabel}: ${row.contractDay}`,
      `${copy.discoveryDateLabel}: ${row.discoveryDay}`,
      copy.pointInTimeNotice,
    ].join("\n");
    const summary = replaceCopyTokens(copy.summaryTemplate, {
      deadline: copy.deadline,
      project: row.projectName,
    });

    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeICSText(stableUID(row.caseId, row.deadlineDay))}`,
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
        `DESCRIPTION:${escapeICSText(replaceCopyTokens(alarmTemplate, { days: offset }))}`,
        `TRIGGER:-P${offset}D`,
        "END:VALARM"
      );
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldICSContentLine).join("\r\n")}\r\n`;
}
