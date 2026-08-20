import type {
  CaseNoticeDispatch as CaseNoticeDispatchRow,
  CaseNoticeDispatchEvidence as CaseNoticeDispatchEvidenceRow,
} from "@/lib/database.types";

export const CASE_NOTICE_DISPATCH_CHANNELS = [
  "registered-mail",
  "a-mail-plus",
  "courier",
  "hand-delivery",
] as const;

export type CaseNoticeDispatchChannel = typeof CASE_NOTICE_DISPATCH_CHANNELS[number];
export type CaseNoticeDispatch = CaseNoticeDispatchRow;
export type CaseNoticeDispatchEvidence = CaseNoticeDispatchEvidenceRow;

export const CASE_NOTICE_DISPATCH_CHANNEL_KEYS: Record<CaseNoticeDispatchChannel, string> = {
  "registered-mail": "cases-notice-dispatch-channel-registered-mail",
  "a-mail-plus": "cases-notice-dispatch-channel-a-mail-plus",
  courier: "cases-notice-dispatch-channel-courier",
  "hand-delivery": "cases-notice-dispatch-channel-hand-delivery",
};

export interface CaseNoticeDispatchPayload {
  dispatched_at: string;
  channel: CaseNoticeDispatchChannel;
  reference: string | null;
}

function isChannel(value: unknown): value is CaseNoticeDispatchChannel {
  return typeof value === "string" && CASE_NOTICE_DISPATCH_CHANNELS.includes(value as CaseNoticeDispatchChannel);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(new Date(value).getTime());
}

function normalizedReference(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= 200 ? trimmed : undefined;
}

const swissWallClockFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Zurich",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function swissWallClockParts(date: Date): string {
  const parts = Object.fromEntries(
    swissWallClockFormatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * Parse a timezone-less browser datetime-local value as a Europe/Zurich wall
 * clock. Zurich currently has only UTC+1/+2 offsets; requiring exactly one
 * matching instant rejects both spring DST gaps and ambiguous autumn times.
 */
export function parseSwissDispatchWallClock(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const expected = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const naiveUtc = Date.UTC(
    Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)
  );
  const candidates = [1, 2]
    .map((offsetHours) => new Date(naiveUtc - offsetHours * 60 * 60 * 1000))
    .filter((candidate) => swissWallClockParts(candidate) === expected);
  return candidates.length === 1 ? candidates[0] : null;
}

export function buildCaseNoticeDispatchPayload(
  input: { dispatchedAt: string; channel: CaseNoticeDispatchChannel; reference?: string | null },
  now = new Date()
): CaseNoticeDispatchPayload | null {
  if (!isChannel(input.channel)) return null;
  const isWallClock = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(input.dispatchedAt);
  const dispatchedAt = isWallClock
    ? parseSwissDispatchWallClock(input.dispatchedAt)
    : (validDate(input.dispatchedAt) ? new Date(input.dispatchedAt) : null);
  if (!dispatchedAt || Number.isNaN(now.getTime()) || dispatchedAt.getTime() > now.getTime()) return null;
  const reference = normalizedReference(input.reference);
  if (reference === undefined) return null;
  return { dispatched_at: dispatchedAt.toISOString(), channel: input.channel, reference };
}

export function normalizeCaseNoticeDispatch(value: unknown): CaseNoticeDispatch | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" || !row.id ||
    typeof row.user_id !== "string" || !row.user_id ||
    typeof row.case_id !== "string" || !row.case_id ||
    typeof row.notice_draft_id !== "string" || !row.notice_draft_id ||
    !validDate(row.dispatched_at) || !validDate(row.created_at) || !isChannel(row.channel)
  ) return null;
  const reference = normalizedReference(row.reference);
  if (reference === undefined) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    case_id: row.case_id,
    notice_draft_id: row.notice_draft_id,
    dispatched_at: new Date(row.dispatched_at).toISOString(),
    channel: row.channel,
    reference,
    created_at: new Date(row.created_at).toISOString(),
  };
}

export function normalizeCaseNoticeDispatchEvidence(value: unknown): CaseNoticeDispatchEvidence | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" || !row.id.trim() ||
    typeof row.user_id !== "string" || !row.user_id.trim() ||
    typeof row.case_id !== "string" || !row.case_id.trim() ||
    typeof row.dispatch_id !== "string" || !row.dispatch_id.trim() ||
    typeof row.evidence_id !== "string" || !row.evidence_id.trim() ||
    !validDate(row.created_at)
  ) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    case_id: row.case_id,
    dispatch_id: row.dispatch_id,
    evidence_id: row.evidence_id,
    created_at: new Date(row.created_at).toISOString(),
  };
}

export function selectNoticeDispatchEvidenceByDispatch(
  values: unknown[]
): Record<string, CaseNoticeDispatchEvidence> {
  const result: Record<string, CaseNoticeDispatchEvidence> = {};
  for (const value of values) {
    const row = normalizeCaseNoticeDispatchEvidence(value);
    if (!row) continue;
    const current = result[row.dispatch_id];
    if (!current || row.created_at < current.created_at
      || (row.created_at === current.created_at && row.id.localeCompare(current.id) < 0)) {
      result[row.dispatch_id] = row;
    }
  }
  return result;
}

export function selectLatestNoticeDispatchByCase(values: unknown[]): Record<string, CaseNoticeDispatch> {
  const result: Record<string, CaseNoticeDispatch> = {};
  for (const value of values) {
    const row = normalizeCaseNoticeDispatch(value);
    if (!row) continue;
    const current = result[row.case_id];
    if (!current || row.dispatched_at > current.dispatched_at ||
      (row.dispatched_at === current.dispatched_at && row.id.localeCompare(current.id) > 0)) {
      result[row.case_id] = row;
    }
  }
  return result;
}
