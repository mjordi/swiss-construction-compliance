/**
 * Legal utility functions for Swiss construction law deadlines.
 *
 * Key dates:
 * - 2026-01-01: OR revision enters into force (Art. 370 OR 2026 — 60-day notice period)
 * - Transitional law: Contracts signed before 2026-01-01 follow old law (immediate notice, no 60-day grace)
 */

/** Date when the OR revision 2026 enters into force */
export const OR_REVISION_DATE = new Date("2026-01-01");

export type LegalRegime = "old" | "new";

export interface DeadlineResult {
  /** Deadline date */
  date: Date;
  /** Days remaining from today (negative = expired) */
  daysRemaining: number;
  /** Traffic light status */
  status: "ok" | "warning" | "urgent" | "expired";
}

export type RuegefristInputValidationError = "discovery-before-contract";

export interface RuegefristResult {
  /** Which legal regime applies */
  regime: LegalRegime;
  /** 60-day notice deadline (only under new law) */
  ruegefrist60: DeadlineResult | null;
  /** Info text about the applicable regime */
  regimeInfo: string;
  /** Discovery date used */
  discoveryDate: Date;
  /** Contract date used (determines regime) */
  contractDate: Date;
}

/**
 * Parse an HTML date input value (YYYY-MM-DD) as a local calendar date.
 * Avoids timezone shifts from `new Date("YYYY-MM-DD")` (parsed as UTC).
 */
export function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, y, m, d] = match;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));

  if (
    parsed.getFullYear() !== Number(y) ||
    parsed.getMonth() !== Number(m) - 1 ||
    parsed.getDate() !== Number(d)
  ) {
    return null;
  }

  return parsed;
}

/**
 * Determine which legal regime applies based on contract date.
 * Contracts signed on or after 2026-01-01 fall under the new OR.
 */
export function determineLegalRegime(contractDate: Date): LegalRegime {
  const normalized = new Date(contractDate);
  normalized.setHours(0, 0, 0, 0);

  const revisionDate = new Date(OR_REVISION_DATE);
  revisionDate.setHours(0, 0, 0, 0);

  return normalized >= revisionDate ? "new" : "old";
}

/**
 * Add calendar years to a date.
 */
export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/**
 * Add calendar days to a date.
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Calculate the number of days remaining from today to a target date.
 */
export function getDaysRemaining(target: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(target);
  t.setHours(0, 0, 0, 0);
  return Math.floor((t.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get traffic light status based on days remaining.
 */
export function getStatus(
  days: number
): "ok" | "warning" | "urgent" | "expired" {
  if (days < 0) return "expired";
  if (days <= 7) return "urgent";
  if (days <= 21) return "warning";
  return "ok";
}

/**
 * Calculate the 60-day Rügefrist (notice period) under the new OR.
 *
 * Art. 370 OR (Revision 2026): The client must notify the contractor of defects discovered
 * after acceptance within 60 days of discovery.
 *
 * @param contractDate - Date the construction contract was signed
 * @param discoveryDate - Date the defect was discovered
 * @returns RuegefristResult with deadline or regime info
 */
export function validateRuegefristInput(
  contractDate: Date,
  discoveryDate: Date
): RuegefristInputValidationError | null {
  const c = new Date(contractDate);
  c.setHours(0, 0, 0, 0);
  const d = new Date(discoveryDate);
  d.setHours(0, 0, 0, 0);

  if (d < c) return "discovery-before-contract";
  return null;
}

export function calculateRuegefrist(
  contractDate: Date,
  discoveryDate: Date
): RuegefristResult {
  const regime = determineLegalRegime(contractDate);

  if (regime === "old") {
    return {
      regime: "old",
      ruegefrist60: null,
      regimeInfo: "old-law-info",
      discoveryDate,
      contractDate,
    };
  }

  const deadlineDate = addDays(discoveryDate, 60);
  const daysRemaining = getDaysRemaining(deadlineDate);

  return {
    regime: "new",
    ruegefrist60: {
      date: deadlineDate,
      daysRemaining,
      status: getStatus(daysRemaining),
    },
    regimeInfo: "new-law-info",
    discoveryDate,
    contractDate,
  };
}

/**
 * Format a date for display in Swiss locale.
 */
export function formatDateCH(date: Date): string {
  return date.toLocaleDateString("de-CH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Generate an ICS calendar file for a single deadline.
 */
function escapeICSText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function generateDeadlineICS(
  deadlineDate: Date,
  title: string,
  description: string
): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const dateStr = deadlineDate.toISOString().split("T")[0].replace(/-/g, "");
  // RFC5545: DTEND for DATE values is non-inclusive, so single-day all-day events
  // must end on the following date to render correctly across calendar clients.
  const endDateStr = addDays(deadlineDate, 1)
    .toISOString()
    .split("T")[0]
    .replace(/-/g, "");
  const reminderOffsets = [14, 7, 1] as const;
  const alarms = reminderOffsets
    .map((offset) => {
      const reminderStr = addDays(deadlineDate, -offset)
        .toISOString()
        .split("T")[0]
        .replace(/-/g, "");
      return `BEGIN:VALARM\nACTION:DISPLAY\nDESCRIPTION:Rügefrist läuft in ${offset} ${offset === 1 ? "Tag" : "Tagen"} ab!\nTRIGGER;VALUE=DATE:${reminderStr}\nEND:VALARM`;
    })
    .join("\n");

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//BauCompliance.ch//Ruegefrist Rechner//DE
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:baucompliance-ruegefrist-${stamp}@baucompliance.ch
DTSTAMP:${stamp}
DTSTART;VALUE=DATE:${dateStr}
DTEND;VALUE=DATE:${endDateStr}
SUMMARY:${escapeICSText(title)}
DESCRIPTION:${escapeICSText(description)}
${alarms}
END:VEVENT
END:VCALENDAR`;
}

export interface CalendarDeadlineInput {
  key: string;
  date: Date;
}

export function generateDeadlineCalendarICS(
  deadlines: CalendarDeadlineInput[],
  acceptanceDateLabel: string,
  reminderOffsets: number[] = [14, 7, 1]
): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const sortedOffsets = [...new Set(reminderOffsets)]
    .filter((offset) => Number.isFinite(offset) && offset >= 1)
    .sort((a, b) => b - a);

  const events = deadlines
    .map((deadline, index) => {
      const dateStr = deadline.date.toISOString().split("T")[0].replace(/-/g, "");
      const endDateStr = addDays(deadline.date, 1).toISOString().split("T")[0].replace(/-/g, "");
      const alarms = sortedOffsets
        .map((offset) => {
          const reminderStr = addDays(deadline.date, -offset)
            .toISOString()
            .split("T")[0]
            .replace(/-/g, "");
          return `BEGIN:VALARM\nACTION:DISPLAY\nDESCRIPTION:Frist läuft in ${offset} ${offset === 1 ? "Tag" : "Tagen"} ab\nTRIGGER;VALUE=DATE:${reminderStr}\nEND:VALARM`;
        })
        .join("\n");

      return `BEGIN:VEVENT
UID:baucompliance-deadline-${index}-${stamp}@baucompliance.ch
DTSTAMP:${stamp}
DTSTART;VALUE=DATE:${dateStr}
DTEND;VALUE=DATE:${endDateStr}
SUMMARY:${escapeICSText(`BauCompliance: ${deadline.key} (Abnahme ${acceptanceDateLabel})`)}
DESCRIPTION:${escapeICSText(`Fristablauf gemäss BauCompliance.ch\nAbnahmedatum: ${acceptanceDateLabel}`)}
${alarms}
END:VEVENT`;
    })
    .join("\n");

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//BauCompliance.ch//Deadline Calculator//DE
CALSCALE:GREGORIAN
METHOD:PUBLISH
${events}
END:VCALENDAR`;
}
