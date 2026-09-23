import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Case } from "@/lib/database.types";
import {
  buildComplianceWorkQueue,
  buildComplianceWorkQueueResult,
} from "@/lib/compliance-work-queue";

const COMPLETE = {
  defectDocumented: true,
  evidenceAttached: true,
  noticeDrafted: true,
  calendarReminderExported: true,
};

function buildCase(overrides: Partial<Case> = {}): Case {
  return {
    id: "case-default",
    user_id: "owner-1",
    project_name: "Alpine Tower",
    canton: "ZH",
    contract_date: "2026-01-10T00:00:00.000Z",
    discovery_date: "2026-07-01T00:00:00.000Z",
    acceptance_date: null,
    notice_recipient_name: null,
    notice_recipient_address: null,
    defect_statement: null,
    checklist: { ...COMPLETE },
    status: "active",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const protocol = (caseId: string, id = `protocol-${caseId}`) => ({
  id,
  case_id: caseId,
});

describe("buildComplianceWorkQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T10:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("orders every priority branch and exact-links every queue row by Case ID", () => {
    const cases = [
      buildCase({ id: "readiness", discovery_date: "2026-08-25T00:00:00.000Z", checklist: { ...COMPLETE, noticeDrafted: false } }),
      buildCase({ id: "review", status: "review", discovery_date: "2026-08-25T00:00:00.000Z" }),
      buildCase({ id: "warning", discovery_date: "2026-07-12T00:00:00.000Z" }),
      buildCase({ id: "urgent", discovery_date: "2026-06-28T00:00:00.000Z" }),
      buildCase({ id: "expired", discovery_date: "2026-06-01T00:00:00.000Z" }),
      buildCase({ id: "immediate", contract_date: "2025-12-20T00:00:00.000Z", discovery_date: "2026-08-25T00:00:00.000Z" }),
    ];

    const rows = buildComplianceWorkQueue(cases, cases.map((item) => protocol(item.id)));

    expect(rows.map((row) => [row.id, row.priority])).toEqual([
      ["expired", "expired"],
      ["immediate", "immediate-notice"],
      ["urgent", "urgent"],
      ["warning", "warning"],
      ["review", "lifecycle-review"],
      ["readiness", "incomplete-readiness"],
    ]);
    expect(rows.map((row) => row.casesHref)).toEqual([
      "/dashboard/cases?case=expired",
      "/dashboard/cases?case=immediate",
      "/dashboard/cases?case=urgent",
      "/dashboard/cases?case=warning",
      "/dashboard/cases?case=review",
      "/dashboard/cases?case=readiness",
    ]);
  });

  it("uses stable deadline, discovery date, then Case ID ties", () => {
    const cases = [
      buildCase({ id: "c", discovery_date: "2026-08-10T00:00:00.000Z" }),
      buildCase({ id: "b", discovery_date: "2026-08-11T00:00:00.000Z" }),
      buildCase({ id: "a", discovery_date: "2026-08-11T00:00:00.000Z" }),
    ];
    const rows = buildComplianceWorkQueue(cases, []);
    expect(rows.map((row) => row.id)).toEqual(["c", "a", "b"]);
  });

  it("excludes archived and fully ready on-track Cases", () => {
    const ready = buildCase({ id: "ready", discovery_date: "2026-08-25T00:00:00.000Z" });
    const rows = buildComplianceWorkQueue(
      [ready, buildCase({ id: "archived", status: "archived", checklist: { ...COMPLETE, noticeDrafted: false } })],
      [protocol("ready"), protocol("archived")]
    );
    expect(rows).toEqual([]);
  });

  it("keeps an otherwise ready active Case for its nearest acceptance milestone", () => {
    vi.setSystemTime(new Date("2028-08-26T10:00:00.000Z"));
    const [row] = buildComplianceWorkQueue([
      buildCase({
        id: "acceptance-ready",
        contract_date: "2026-01-10T00:00:00.000Z",
        discovery_date: "2028-08-25T00:00:00.000Z",
        acceptance_date: "2026-09-05",
      }),
    ], [protocol("acceptance-ready")]);

    expect(row).toMatchObject({
      id: "acceptance-ready",
      priority: "urgent",
      acceptanceMilestone: {
        kind: "warranty-2y",
        deadlineDay: "2028-09-05",
        daysRemaining: 10,
      },
      readinessReasons: [],
    });
  });

  it("uses the five-year limitation milestone after the warranty milestone has passed", () => {
    vi.setSystemTime(new Date("2031-08-26T10:00:00.000Z"));
    const [row] = buildComplianceWorkQueue([
      buildCase({
        id: "limitation-ready",
        contract_date: "2026-01-10",
        discovery_date: "2031-08-25",
        acceptance_date: "2026-09-05",
      }),
    ], [protocol("limitation-ready")]);

    expect(row.acceptanceMilestone).toEqual({
      kind: "limitation-5y",
      deadlineDay: "2031-09-05",
      daysRemaining: 10,
    });
  });

  it("includes only acceptance milestones 0 to 30 calendar days away with the specified priority bands", () => {
    vi.setSystemTime(new Date("2028-08-26T10:00:00.000Z"));
    const cases = [
      buildCase({ id: "today", contract_date: "2026-01-01", discovery_date: "2028-08-25", acceptance_date: "2026-08-26" }),
      buildCase({ id: "fourteen", contract_date: "2026-01-01", discovery_date: "2028-08-25", acceptance_date: "2026-09-09" }),
      buildCase({ id: "fifteen", contract_date: "2026-01-01", discovery_date: "2028-08-25", acceptance_date: "2026-09-10" }),
      buildCase({ id: "thirty", contract_date: "2026-01-01", discovery_date: "2028-08-25", acceptance_date: "2026-09-25" }),
      buildCase({ id: "thirty-one", contract_date: "2026-01-01", discovery_date: "2028-08-25", acceptance_date: "2026-09-26" }),
      buildCase({ id: "past", contract_date: "2026-01-01", discovery_date: "2028-08-25", acceptance_date: "2026-08-25" }),
    ];

    expect(buildComplianceWorkQueue(cases, cases.map((item) => protocol(item.id))).map((row) => [
      row.id,
      row.priority,
      row.acceptanceMilestone?.daysRemaining,
    ])).toEqual([
      ["today", "urgent", 0],
      ["fourteen", "urgent", 14],
      ["fifteen", "warning", 15],
      ["thirty", "warning", 30],
    ]);
  });

  it("preserves expired and immediate notice priority while combining other priorities by urgency", () => {
    vi.setSystemTime(new Date("2028-08-26T10:00:00.000Z"));
    const cases = [
      buildCase({ id: "expired-acceptance", contract_date: "2026-01-01", discovery_date: "2028-06-01", acceptance_date: "2026-09-05" }),
      buildCase({ id: "immediate-acceptance", contract_date: "2025-01-01", discovery_date: "2028-08-25", acceptance_date: "2026-09-05" }),
      buildCase({ id: "notice-warning-acceptance-urgent", contract_date: "2026-01-01", discovery_date: "2028-07-12", acceptance_date: "2026-09-05" }),
      buildCase({ id: "notice-urgent-acceptance-warning", contract_date: "2026-01-01", discovery_date: "2028-06-28", acceptance_date: "2026-09-10" }),
    ];

    expect(buildComplianceWorkQueue(cases, cases.map((item) => protocol(item.id))).map((row) => [
      row.id,
      row.priority,
      row.primarySignal,
    ])).toEqual([
      ["expired-acceptance", "expired", "notice"],
      ["immediate-acceptance", "immediate-notice", "notice"],
      ["notice-urgent-acceptance-warning", "urgent", "notice"],
      ["notice-warning-acceptance-urgent", "urgent", "acceptance"],
    ]);
  });

  it("selects the earlier legal date for equal priority and preserves notice on an exact tie", () => {
    vi.setSystemTime(new Date("2028-08-26T10:00:00.000Z"));
    const cases = [
      buildCase({
        id: "acceptance-earlier-warning",
        contract_date: "2026-01-01",
        discovery_date: "2028-07-13",
        acceptance_date: "2026-09-10",
      }),
      buildCase({
        id: "notice-earlier-urgent",
        contract_date: "2026-01-01",
        discovery_date: "2028-06-28",
        acceptance_date: "2026-09-05",
      }),
      buildCase({
        id: "exact-tie",
        contract_date: "2026-01-01",
        discovery_date: "2028-06-28",
        acceptance_date: "2026-08-27",
      }),
    ];

    const rows = buildComplianceWorkQueue(cases, cases.map((item) => protocol(item.id)));
    expect(Object.fromEntries(rows.map((row) => [row.id, [row.priority, row.primarySignal]]))).toEqual({
      "acceptance-earlier-warning": ["warning", "acceptance"],
      "notice-earlier-urgent": ["urgent", "notice"],
      "exact-tie": ["urgent", "notice"],
    });
  });

  it("makes an urgent acceptance milestone primary over on-track notice and readiness work", () => {
    vi.setSystemTime(new Date("2028-08-26T10:00:00.000Z"));
    const [row] = buildComplianceWorkQueue([
      buildCase({
        id: "acceptance-over-readiness",
        contract_date: "2026-01-01",
        discovery_date: "2028-08-25",
        acceptance_date: "2026-09-05",
        checklist: { ...COMPLETE, noticeDrafted: false },
      }),
    ], []);

    expect(row).toMatchObject({
      priority: "urgent",
      primarySignal: "acceptance",
      timeline: { status: "ok" },
      acceptanceMilestone: { daysRemaining: 10 },
    });
  });

  it("sorts acceptance-driven peers by their relevant earliest legal date with stable existing ties", () => {
    vi.setSystemTime(new Date("2028-08-26T10:00:00.000Z"));
    const cases = [
      buildCase({ id: "b", contract_date: "2026-01-01", discovery_date: "2028-08-25", acceptance_date: "2026-09-05" }),
      buildCase({ id: "a", contract_date: "2026-01-01", discovery_date: "2028-08-25", acceptance_date: "2026-09-05" }),
      buildCase({ id: "earlier", contract_date: "2026-01-01", discovery_date: "2028-08-25", acceptance_date: "2026-09-01" }),
    ];

    expect(buildComplianceWorkQueue(cases, cases.map((item) => protocol(item.id))).map((row) => row.id)).toEqual([
      "earlier",
      "a",
      "b",
    ]);
  });

  it("rejects non-string or empty acceptance_date but tolerates invalid date and chronology as no milestone", () => {
    const result = buildComplianceWorkQueueResult([
      buildCase({ id: "non-string", acceptance_date: 123 as unknown as string }),
      buildCase({ id: "empty", acceptance_date: "  " }),
      buildCase({ id: "invalid-date", acceptance_date: "2024-02-30", checklist: { ...COMPLETE, noticeDrafted: false } }),
      buildCase({ id: "invalid-chronology", acceptance_date: "2026-08-26", checklist: { ...COMPLETE, noticeDrafted: false } }),
    ], []);

    expect(result.rejectedCaseCount).toBe(2);
    expect(result.rows.map((row) => [row.id, row.acceptanceMilestone])).toEqual([
      ["invalid-chronology", undefined],
      ["invalid-date", undefined],
    ]);
  });

  it("treats a missing pre-migration acceptance_date as null", () => {
    const preMigrationCase = buildCase({
      id: "pre-migration",
      discovery_date: "2026-08-25T00:00:00.000Z",
      checklist: { ...COMPLETE, noticeDrafted: false },
    }) as Case & { acceptance_date?: string | null };
    delete preMigrationCase.acceptance_date;

    const result = buildComplianceWorkQueueResult([preMigrationCase], []);

    expect(result.rejectedCaseCount).toBe(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: "pre-migration",
      acceptanceMilestone: undefined,
    });
  });

  it("overlays persisted checklist values on timeline defaults and reports concrete readiness reasons", () => {
    const oldLaw = buildCase({
      id: "old",
      contract_date: "2025-12-20T00:00:00.000Z",
      discovery_date: "2026-08-25T00:00:00.000Z",
      canton: "ZH",
      checklist: {
        defectDocumented: false,
        evidenceAttached: true,
        noticeDrafted: false,
        calendarReminderExported: false,
      },
    });
    const [row] = buildComplianceWorkQueue([oldLaw], []);
    expect(row.checklist).toEqual({
      defectDocumented: false,
      evidenceAttached: true,
      noticeDrafted: false,
      calendarReminderExported: false,
    });
    expect(row.checklistProgress).toEqual({ completed: 1, total: 4 });
    expect(row.readinessReasons).toEqual([
      "defect-not-documented",
      "notice-not-drafted",
      "protocol-missing",
    ]);
    expect(row.linkedProtocolCount).toBe(0);
  });

  it("uses timeline defaults when persisted checklist is missing", () => {
    const input = buildCase({
      id: "defaults",
      canton: "VD",
      checklist: undefined as unknown as Case["checklist"],
      discovery_date: "2026-08-25T00:00:00.000Z",
    });
    const [row] = buildComplianceWorkQueue([input], [protocol("defaults")]);
    expect(row.checklist).toEqual({
      defectDocumented: true,
      evidenceAttached: false,
      noticeDrafted: false,
      calendarReminderExported: false,
    });
    expect(row.readinessReasons).toEqual([
      "evidence-not-attached",
      "notice-not-drafted",
      "calendar-not-exported",
    ]);
  });

  it("accepts a nullable persisted checklist as missing state", () => {
    const result = buildComplianceWorkQueueResult([
      buildCase({
        id: "nullable-checklist",
        canton: "VD",
        checklist: null,
        discovery_date: "2026-08-25T00:00:00.000Z",
      }),
    ], [protocol("nullable-checklist")]);

    expect(result.rejectedCaseCount).toBe(0);
    expect(result.rows[0].checklist).toEqual({
      defectDocumented: true,
      evidenceAttached: false,
      noticeDrafted: false,
      calendarReminderExported: false,
    });
  });

  it("skips malformed timeline rows without dropping valid siblings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cases = [
      buildCase({ id: "bad", contract_date: "not-a-date" }),
      buildCase({ id: "reversed", contract_date: "2026-08-20T00:00:00.000Z", discovery_date: "2026-08-10T00:00:00.000Z" }),
      buildCase({ id: "valid", discovery_date: "2026-08-25T00:00:00.000Z", checklist: { ...COMPLETE, noticeDrafted: false } }),
    ];
    expect(buildComplianceWorkQueue(cases, []).map((row) => row.id)).toEqual(["valid"]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("reports every malformed Case while preserving valid siblings", () => {
    const result = buildComplianceWorkQueueResult([
      null,
      buildCase({ id: "bad-date", contract_date: "not-a-date" }),
      buildCase({ id: "valid", discovery_date: "2026-08-25T00:00:00.000Z", checklist: { ...COMPLETE, noticeDrafted: false } }),
    ], []);

    expect(result.rows.map((row) => row.id)).toEqual(["valid"]);
    expect(result.rejectedCaseCount).toBe(2);
    expect(result.rejectedProtocolCount).toBe(0);
  });

  it("excludes archived Cases before reporting malformed queue inputs", () => {
    const result = buildComplianceWorkQueueResult([
      buildCase({
        id: "archived-malformed",
        status: "archived",
        checklist: { ...COMPLETE, noticeDrafted: "yes" } as unknown as Case["checklist"],
      }),
      buildCase({
        id: "active-valid",
        checklist: { ...COMPLETE, noticeDrafted: false },
      }),
    ], []);

    expect(result.rows.map((row) => row.id)).toEqual(["active-valid"]);
    expect(result.rejectedCaseCount).toBe(0);
  });

  it("reports all-malformed Cases and protocols instead of treating them as an affirmative empty queue", () => {
    const result = buildComplianceWorkQueueResult(
      [{ status: "active" }, "bad-case"],
      [null, { id: "protocol-without-required-fields" }]
    );

    expect(result.rows).toEqual([]);
    expect(result.rejectedCaseCount).toBe(2);
    expect(result.rejectedProtocolCount).toBe(2);
  });

  it("reports malformed protocols while counting valid siblings", () => {
    const result = buildComplianceWorkQueueResult(
      [buildCase({ id: "valid", checklist: { ...COMPLETE, noticeDrafted: false } })],
      [undefined, protocol("valid")]
    );

    expect(result.rows[0].linkedProtocolCount).toBe(1);
    expect(result.rejectedProtocolCount).toBe(1);
  });

  it("preserves the source inputs and exposes the established timeline contract", () => {
    const cases = [buildCase({ id: "immutable", discovery_date: "2026-08-24T00:00:00.000Z", checklist: { ...COMPLETE, evidenceAttached: false } })];
    const protocols = [protocol("immutable")];
    const casesBefore = structuredClone(cases);
    const protocolsBefore = structuredClone(protocols);

    const [row] = buildComplianceWorkQueue(cases, protocols);

    expect(cases).toEqual(casesBefore);
    expect(protocols).toEqual(protocolsBefore);
    expect(row.projectName).toBe("Alpine Tower");
    expect(row.canton).toBe("ZH");
    expect(row.timeline).toMatchObject({
      id: "immutable",
      regime: "new",
      status: "ok",
      daysToDeadline: 58,
      nextAction: "Draft notice package and schedule legal review.",
    });
    expect(row.linkedProtocolCount).toBe(1);
    expect(row.casesHref).toBe("/dashboard/cases?case=immutable");
  });
});
