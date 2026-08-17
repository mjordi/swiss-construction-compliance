import { describe, expect, it } from "vitest";
import {
  CASE_NOTICE_DISPATCH_CHANNELS,
  buildCaseNoticeDispatchPayload,
  normalizeCaseNoticeDispatch,
  normalizeCaseNoticeDispatchEvidence,
  parseSwissDispatchWallClock,
  selectLatestNoticeDispatchByCase,
  selectNoticeDispatchEvidenceByDispatch,
} from "@/lib/case-notice-dispatch";

const now = new Date("2026-08-15T12:00:00.000Z");

describe("case notice dispatch", () => {
  it("accepts only fixed channels and normalizes an optional bounded reference", () => {
    expect(CASE_NOTICE_DISPATCH_CHANNELS).toEqual([
      "registered-mail", "a-mail-plus", "courier", "hand-delivery",
    ]);
    expect(buildCaseNoticeDispatchPayload({
      dispatchedAt: "2026-08-15T10:30:00.000Z",
      channel: "registered-mail",
      reference: "  CH-123  ",
    }, now)).toEqual({
      dispatched_at: "2026-08-15T10:30:00.000Z",
      channel: "registered-mail",
      reference: "CH-123",
    });
    expect(buildCaseNoticeDispatchPayload({
      dispatchedAt: "2026-08-15T10:30:00.000Z", channel: "courier", reference: "   ",
    }, now)?.reference).toBeNull();
    expect(buildCaseNoticeDispatchPayload({
      dispatchedAt: "2026-08-15T10:30:00.000Z", channel: "email" as never,
    }, now)).toBeNull();
    expect(buildCaseNoticeDispatchPayload({
      dispatchedAt: "2026-08-15T12:00:01.000Z", channel: "courier",
    }, now)).toBeNull();
    expect(buildCaseNoticeDispatchPayload({
      dispatchedAt: "invalid", channel: "courier",
    }, now)).toBeNull();
    expect(buildCaseNoticeDispatchPayload({
      dispatchedAt: "2026-08-15T10:00:00Z", channel: "courier", reference: "x".repeat(201),
    }, now)).toBeNull();
  });

  it("rejects malformed persisted records", () => {
    expect(normalizeCaseNoticeDispatch({ id: "", user_id: "u" })).toBeNull();
    expect(normalizeCaseNoticeDispatch({
      id: "d", user_id: "u", case_id: "c", notice_draft_id: "n",
      dispatched_at: "bad", channel: "courier", reference: null,
      created_at: "2026-08-15T10:00:00Z",
    })).toBeNull();
  });

  it("parses browser wall-clock values in Europe/Zurich and rejects DST gaps or overlaps", () => {
    expect(parseSwissDispatchWallClock("2026-08-01T10:30")?.toISOString()).toBe("2026-08-01T08:30:00.000Z");
    expect(parseSwissDispatchWallClock("2026-08-01T10:30:45")?.toISOString()).toBe("2026-08-01T08:30:45.000Z");
    expect(parseSwissDispatchWallClock("2026-01-15T10:30")?.toISOString()).toBe("2026-01-15T09:30:00.000Z");
    expect(parseSwissDispatchWallClock("2026-03-29T02:30")).toBeNull();
    expect(parseSwissDispatchWallClock("2026-10-25T02:30")).toBeNull();
    expect(parseSwissDispatchWallClock("2026-02-30T10:30")).toBeNull();
  });

  it("selects the deterministic latest valid dispatch per Case", () => {
    const base = {
      user_id: "u", case_id: "c", notice_draft_id: "n", channel: "courier",
      reference: null, created_at: "2026-08-15T11:00:00.000Z",
    };
    const latest = selectLatestNoticeDispatchByCase([
      { ...base, id: "a", dispatched_at: "2026-08-15T10:00:00.000Z" },
      { ...base, id: "b", dispatched_at: "2026-08-15T10:00:00.000Z" },
      { ...base, id: "bad", dispatched_at: "not-a-date" },
    ]);
    expect(latest.c?.id).toBe("b");
  });

  it("strictly normalizes and deterministically indexes evidence associations by dispatch", () => {
    const first = {
      id: "link-1", user_id: "u", case_id: "c", dispatch_id: "dispatch-1",
      evidence_id: "evidence-1", created_at: "2026-08-17T08:00:00Z",
    };
    expect(normalizeCaseNoticeDispatchEvidence(first)).toEqual({
      ...first, created_at: "2026-08-17T08:00:00.000Z",
    });
    expect(normalizeCaseNoticeDispatchEvidence({ ...first, evidence_id: "" })).toBeNull();
    for (const field of ["id", "user_id", "case_id", "dispatch_id", "evidence_id"] as const) {
      expect(normalizeCaseNoticeDispatchEvidence({ ...first, [field]: " \t\n " })).toBeNull();
    }
    expect(normalizeCaseNoticeDispatchEvidence({ ...first, created_at: "bad" })).toBeNull();
    expect(selectNoticeDispatchEvidenceByDispatch([
      { ...first, id: "link-2", evidence_id: "evidence-2" },
      first,
      { dispatch_id: "dispatch-2" },
    ])).toEqual({ "dispatch-1": { ...first, created_at: "2026-08-17T08:00:00.000Z" } });
  });
});
