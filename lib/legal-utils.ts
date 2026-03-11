/**
 * Legal utility functions for Swiss construction law deadlines.
 *
 * Key dates:
 * - 2026-01-01: OR revision enters into force (Art. 370 nOR — 60-day notice period)
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
 * Add calendar days to a date.
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
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
 * Art. 370 nOR: The client must notify the contractor of defects discovered
 * after acceptance within 60 days of discovery.
 *
 * @param contractDate - Date the construction contract was signed
 * @param discoveryDate - Date the defect was discovered
 * @returns RuegefristResult with deadline or regime info
 */
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
export function generateDeadlineICS(
  deadlineDate: Date,
  title: string,
  description: string
): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const dateStr = deadlineDate.toISOString().split("T")[0].replace(/-/g, "");
  const reminderDate = addDays(deadlineDate, -7);
  const reminderStr = reminderDate.toISOString().split("T")[0].replace(/-/g, "");

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//BauCompliance.ch//Ruegefrist Rechner//DE
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:baucompliance-ruegefrist-${stamp}@baucompliance.ch
DTSTAMP:${stamp}
DTSTART;VALUE=DATE:${dateStr}
DTEND;VALUE=DATE:${dateStr}
SUMMARY:${title}
DESCRIPTION:${description.replace(/\n/g, "\\n")}
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Rügefrist läuft in 7 Tagen ab!
TRIGGER;VALUE=DATE:${reminderStr}
END:VALARM
END:VEVENT
END:VCALENDAR`;
}
