import { describe, expect, it, vi } from "vitest";
import {
  applyComplianceCaseView,
  buildCaseAuditRegisterCsv,
  buildCaseDeadlineReminderICS,
  buildCaseLegalChronologyCsv,
  buildComplianceCaseTimeline,
  deriveCaseLegalMilestones,
  deriveChecklistProgress,
  filterComplianceCases,
  isDeadlineReminderIcsExportEligible,
  sortComplianceCases,
  toComplianceCaseViewModel,
  validateComplianceCaseInput,
  type ComplianceCaseInput,
} from "../lib/case-timeline";

function daysFromToday(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

describe("case timeline view model", () => {
  it("derives an ordered legal milestone sequence for new-law cases", () => {
    const vm = toComplianceCaseViewModel({
      id: "timeline-new",
      projectName: "Milestone Project",
      canton: "ZH",
      contractDate: new Date("2026-01-10"),
      discoveryDate: new Date("2026-03-01"),
    });

    expect(deriveCaseLegalMilestones(vm)).toEqual([
      { kind: "contract", date: new Date("2026-01-10"), dateLabel: vm.contractDateLabel },
      { kind: "discovery", date: new Date("2026-03-01"), dateLabel: vm.discoveryDateLabel },
      { kind: "notice-deadline", date: vm.noticeDeadline, dateLabel: vm.noticeDeadlineLabel },
    ]);
  });

  it("omits a fixed notice deadline from old-law case milestones", () => {
    const vm = toComplianceCaseViewModel({
      id: "timeline-old",
      projectName: "Legacy Milestone Project",
      canton: "BE",
      contractDate: new Date("2025-12-20"),
      discoveryDate: new Date("2026-03-01"),
    });

    expect(deriveCaseLegalMilestones(vm).map((milestone) => milestone.kind)).toEqual([
      "contract",
      "discovery",
    ]);
  });

  it("orders valid finalized linked protocol events with legal milestones", () => {
    const vm = toComplianceCaseViewModel({
      id: "timeline-protocols",
      projectName: "Protocol Timeline Project",
      canton: "ZH",
      contractDate: new Date("2026-01-10"),
      discoveryDate: new Date("2026-03-01"),
    });

    const milestones = deriveCaseLegalMilestones(vm, [
      { id: "protocol-later", status: "finalized", createdAt: "2026-03-20T10:00:00.000Z" },
      { id: "protocol-draft", status: "draft", createdAt: "2026-03-10T10:00:00.000Z" },
      { id: "protocol-invalid", status: "finalized", createdAt: "not-a-date" },
      { id: "protocol-earlier", status: "finalized", createdAt: "2026-03-05T10:00:00.000Z" },
    ]);

    expect(milestones.map((milestone) => milestone.kind)).toEqual([
      "contract",
      "discovery",
      "protocol-finalized",
      "protocol-finalized",
      "notice-deadline",
    ]);
    expect(milestones.filter((milestone) => milestone.kind === "protocol-finalized")).toEqual([
      {
        id: "protocol-finalized-protocol-earlier",
        kind: "protocol-finalized",
        date: new Date("2026-03-05T10:00:00.000Z"),
        dateLabel: "5. März 2026",
      },
      {
        id: "protocol-finalized-protocol-later",
        kind: "protocol-finalized",
        date: new Date("2026-03-20T10:00:00.000Z"),
        dateLabel: "20. März 2026",
      },
    ]);
  });

  it("formats finalized protocol timestamps on the Swiss calendar day", () => {
    const vm = toComplianceCaseViewModel({
      id: "timeline-protocol-midnight",
      projectName: "Protocol Midnight Project",
      canton: "ZH",
      contractDate: new Date("2026-01-10"),
      discoveryDate: new Date("2026-03-01"),
    });

    const milestones = deriveCaseLegalMilestones(vm, [
      { id: "protocol-midnight", status: "finalized", createdAt: "2026-07-31T22:30:00.000Z" },
    ]);

    expect(milestones.find((milestone) => milestone.kind === "protocol-finalized")).toMatchObject({
      id: "protocol-finalized-protocol-midnight",
      dateLabel: "1. August 2026",
    });
  });

  it("orders source-bound evidence uploads with legal and protocol milestones", () => {
    const vm = toComplianceCaseViewModel({
      id: "timeline-evidence",
      projectName: "Evidence Timeline Project",
      canton: "ZH",
      contractDate: new Date("2026-01-10"),
      discoveryDate: new Date("2026-03-01"),
    });

    const milestones = deriveCaseLegalMilestones(
      vm,
      [{ id: "protocol-1", status: "finalized", createdAt: "2026-03-20T10:00:00.000Z" }],
      [
        {
          id: "activity-later",
          evidenceId: "evidence-later",
          eventType: "evidence_uploaded",
          sourceName: "crack-detail.jpg",
          occurredAt: "2026-03-15T23:30:00.000Z",
        },
        {
          id: "activity-invalid",
          evidenceId: "evidence-invalid",
          eventType: "evidence_uploaded",
          sourceName: "invalid.pdf",
          occurredAt: "not-a-date",
        },
      ]
    );

    expect(milestones.map((milestone) => milestone.kind)).toEqual([
      "contract",
      "discovery",
      "evidence-uploaded",
      "protocol-finalized",
      "notice-deadline",
    ]);
    expect(milestones.find((milestone) => milestone.kind === "evidence-uploaded")).toEqual({
      id: "evidence-uploaded-activity-later",
      kind: "evidence-uploaded",
      date: new Date("2026-03-15T23:30:00.000Z"),
      dateLabel: "16. März 2026",
      sourceId: "evidence-later",
      sourceName: "crack-detail.jpg",
    });
  });

  it("rejects impossible timelines where discovery is before contract", () => {
    const input = {
      id: "invalid-1",
      projectName: "Broken timeline",
      canton: "ZH",
      contractDate: new Date("2026-03-01"),
      discoveryDate: new Date("2026-02-28"),
    };

    expect(validateComplianceCaseInput(input)).toBe("discovery-before-contract");
    expect(() => toComplianceCaseViewModel(input)).toThrow(
      "discovery date cannot be before contract date"
    );
  });

  it("maps contracts before 2026-01-01 to old law", () => {
    const vm = toComplianceCaseViewModel({
      id: "old-1",
      projectName: "Legacy Project",
      canton: "BE",
      contractDate: new Date("2025-12-20"),
      discoveryDate: new Date("2026-03-01"),
    });

    expect(vm.regime).toBe("old");
    expect(vm.noticeDeadline).toBeNull();
    expect(vm.status).toBe("immediate-notice");
    expect(vm.noticeApplies).toBe(false);
    expect(vm.deadlineCountdownLabel).toBe("Notify immediately");
    expect(vm.exportCapability.deadlineReminderIcsEligible).toBe(false);
  });

  it("adds 60-day deadline and countdown details under the new law", () => {
    const vm = toComplianceCaseViewModel({
      id: "new-1",
      projectName: "New Project",
      canton: "ZH",
      contractDate: new Date("2026-01-01"),
      discoveryDate: new Date("2026-03-01"),
    });

    expect(vm.regime).toBe("new");
    expect(vm.noticeDeadline).not.toBeNull();
    expect(vm.noticeDeadline!.toISOString().split("T")[0]).toBe("2026-04-30");
    expect(vm.noticeApplies).toBe(true);
    expect(vm.reminderReadiness.calendarExportReady).toBe(true);
    expect(vm.exportCapability.deadlineReminderIcsEligible).toBe(true);
  });
});

describe("case legal chronology CSV", () => {
  const labels = {
    title: "Case chronology",
    generatedAt: "Generated at",
    caseId: "Case ID",
    projectName: "Project",
    canton: "Canton",
    date: "Date",
    milestone: "Milestone",
    sourceId: "Protocol source ID",
    sourceName: "Source name",
    milestones: {
      contract: "Contract concluded",
      discovery: "Defect discovered",
      "evidence-uploaded": "Evidence uploaded",
      "protocol-finalized": "Protocol finalized",
      "notice-deadline": "Notice deadline",
    },
  };

  it("serializes a deterministic, localized, escaped chronology snapshot", () => {
    const vm = toComplianceCaseViewModel({
      id: "case-42",
      projectName: 'Tower, "West"',
      canton: "ZH",
      contractDate: new Date("2026-01-10T00:00:00.000Z"),
      discoveryDate: new Date("2026-03-01T00:00:00.000Z"),
    });
    const csv = buildCaseLegalChronologyCsv(
      vm,
      [{ id: "protocol-7", status: "finalized", createdAt: "2026-03-15T10:30:00.000Z" }],
      [{
        id: "activity-8",
        evidenceId: "evidence-8",
        eventType: "evidence_uploaded",
        sourceName: "balcony crack.jpg",
        occurredAt: "2026-03-18T10:30:00.000Z",
      }],
      labels,
      new Date("2026-07-26T12:34:56.000Z")
    );

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe(
      '\ufeff"Case chronology"\r\n' +
        '"Generated at","2026-07-26T12:34:56.000Z"\r\n' +
        '"Case ID","case-42"\r\n' +
        '"Project","Tower, ""West"""\r\n' +
        '"Canton","ZH"\r\n' +
        '""\r\n' +
        '"Date","Milestone","Protocol source ID","Source name"\r\n' +
        '"2026-01-10","Contract concluded","",""\r\n' +
        '"2026-03-01","Defect discovered","",""\r\n' +
        '"2026-03-15","Protocol finalized","protocol-7",""\r\n' +
        '"2026-03-18","Evidence uploaded","evidence-8","balcony crack.jpg"\r\n' +
        '"2026-04-30","Notice deadline","",""'
    );
  });

  it("neutralizes spreadsheet formulas in project and protocol fields without changing ISO dates", () => {
    const vm = toComplianceCaseViewModel({
      id: "case-safe-export",
      projectName: "=HYPERLINK(\"https://example.test\")",
      canton: "ZH",
      contractDate: new Date("2026-01-10T00:00:00.000Z"),
      discoveryDate: new Date("2026-03-01T00:00:00.000Z"),
    });
    const unsafeProtocolIds = ["+SUM(A1:A2)", "-10", "@command", "\tcommand", "\rcommand"];
    const csv = buildCaseLegalChronologyCsv(
      vm,
      unsafeProtocolIds.map((id, index) => ({
        id,
        status: "finalized" as const,
        createdAt: `2026-03-${String(index + 10).padStart(2, "0")}T10:30:00.000Z`,
      })),
      [],
      labels,
      new Date("2026-07-26T12:34:56.000Z")
    );

    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
    for (const id of unsafeProtocolIds) {
      expect(csv).toContain(`"'${id}"`);
    }
    expect(csv).toContain('"2026-01-10","Contract concluded"');
    expect(csv).not.toContain('"\'2026-01-10"');
    expect(csv).toContain('"Generated at","2026-07-26T12:34:56.000Z"');
  });

  it("exports protocol milestones on their Swiss calendar day", () => {
    const vm = toComplianceCaseViewModel({
      id: "case-midnight-export",
      projectName: "Late protocol",
      canton: "ZH",
      contractDate: new Date("2026-01-10T00:00:00.000Z"),
      discoveryDate: new Date("2026-03-01T00:00:00.000Z"),
    });
    const csv = buildCaseLegalChronologyCsv(
      vm,
      [{ id: "protocol-late", status: "finalized", createdAt: "2026-07-15T22:30:00.000Z" }],
      [],
      labels,
      new Date("2026-07-26T12:34:56.000Z")
    );

    expect(csv).toContain('"2026-07-16","Protocol finalized","protocol-late"');
    expect(csv).not.toContain('"2026-07-15","Protocol finalized","protocol-late"');
  });
});

describe("case audit register CSV", () => {
  const labels = {
    title: "Case audit register",
    generatedAt: "Generated at",
    caseId: "Case ID",
    projectName: "Project",
    canton: "Canton",
    regime: "Legal regime",
    status: "Legal status",
    noticeDeadline: "Notice deadline",
    checklistProgress: "Checklist readiness",
    linkedProtocols: "Linked protocols",
    auditReadiness: "Audit readiness",
    regimes: { old: "Old law", new: "New law" },
    statuses: {
      ok: "On track",
      warning: "Attention",
      urgent: "Urgent",
      expired: "Expired",
      "immediate-notice": "Immediate notice",
    },
  };

  it("exports ordered case status and readiness rows with generated metadata", () => {
    const urgent = toComplianceCaseViewModel({
      id: "case-urgent",
      projectName: "Urgent Tower",
      canton: "ZH",
      contractDate: new Date("2026-01-10T00:00:00.000Z"),
      discoveryDate: new Date("2026-03-01T00:00:00.000Z"),
    });
    const legacy = toComplianceCaseViewModel({
      id: "case-legacy",
      projectName: "Legacy Hall",
      canton: "BE",
      contractDate: new Date("2025-12-10T00:00:00.000Z"),
      discoveryDate: new Date("2026-03-05T00:00:00.000Z"),
    });

    const csv = buildCaseAuditRegisterCsv(
      [
        {
          item: urgent,
          checklist: {
            defectDocumented: true,
            evidenceAttached: true,
            noticeDrafted: false,
            calendarReminderExported: true,
          },
          protocolCount: 2,
        },
        {
          item: legacy,
          checklist: {
            defectDocumented: true,
            evidenceAttached: false,
            noticeDrafted: false,
            calendarReminderExported: false,
          },
          protocolCount: 0,
        },
      ],
      labels,
      new Date("2026-07-27T07:00:00.000Z")
    );

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('\"Generated at\",\"2026-07-27T07:00:00.000Z\"');
    expect(csv).toContain(
      '\"Case ID\",\"Project\",\"Canton\",\"Legal regime\",\"Legal status\",\"Notice deadline\",\"Checklist readiness\",\"Linked protocols\",\"Audit readiness\"'
    );
    expect(csv).toContain(
      `\"case-urgent\",\"Urgent Tower\",\"ZH\",\"New law\",\"${labels.statuses[urgent.status]}\",\"2026-04-30\",\"3/4\",\"2\",\"4/5\"`
    );
    expect(csv).toContain(
      '\"case-legacy\",\"Legacy Hall\",\"BE\",\"Old law\",\"Immediate notice\",\"\",\"1/4\",\"0\",\"2/5\"'
    );
    expect(csv.indexOf('\"case-urgent\"')).toBeLessThan(csv.indexOf('\"case-legacy\"'));
  });

  it("neutralizes spreadsheet formulas in register text fields", () => {
    const item = toComplianceCaseViewModel({
      id: "+case-command",
      projectName: "=HYPERLINK(\"https://example.test\")",
      canton: "ZH",
      contractDate: new Date("2026-01-10T00:00:00.000Z"),
      discoveryDate: new Date("2026-03-01T00:00:00.000Z"),
    });

    const csv = buildCaseAuditRegisterCsv(
      [{ item, checklist: item.checklistDefaults, protocolCount: 0 }],
      labels,
      new Date("2026-07-27T07:00:00.000Z")
    );

    expect(csv).toContain('\"\'+case-command\"');
    expect(csv).toContain('\"\'=HYPERLINK(\"\"https://example.test\"\")\"');
    expect(csv).toContain('\"2026-04-30\"');
  });
});

describe("case timeline filtering and sorting", () => {
  it("skips malformed cases instead of aborting timeline rendering", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const timeline = buildComplianceCaseTimeline([
      {
        id: "valid",
        projectName: "Valid case",
        canton: "ZH",
        contractDate: new Date("2026-01-10"),
        discoveryDate: new Date("2026-02-01"),
      },
      {
        id: "invalid",
        projectName: "Broken case",
        canton: "BE",
        contractDate: new Date("2026-03-01"),
        discoveryDate: new Date("2026-02-01"),
      },
    ]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0].id).toBe("valid");
    expect(warn).toHaveBeenCalledWith(
      "[case-timeline] Skipping invalid compliance case invalid",
      expect.any(Error)
    );

    warn.mockRestore();
  });

  const baseCases: ComplianceCaseInput[] = [
    {
      id: "old",
      projectName: "Old law case",
      canton: "ZH",
      contractDate: new Date("2025-06-01"),
      discoveryDate: daysFromToday(-3),
    },
    {
      id: "ok",
      projectName: "OK case",
      canton: "AG",
      contractDate: new Date("2026-01-20"),
      discoveryDate: daysFromToday(-10),
    },
    {
      id: "urgent",
      projectName: "Urgent case",
      canton: "VD",
      contractDate: new Date("2026-01-22"),
      discoveryDate: daysFromToday(-59),
    },
    {
      id: "expired",
      projectName: "Expired case",
      canton: "TI",
      contractDate: new Date("2026-01-25"),
      discoveryDate: daysFromToday(-70),
    },
  ];

  const timeline = buildComplianceCaseTimeline(baseCases);

  it("filters by regime", () => {
    const newLaw = filterComplianceCases(timeline, "new", "all");
    expect(newLaw).toHaveLength(3);
    expect(newLaw.every((item) => item.regime === "new")).toBe(true);
  });

  it("treats immediate notice as urgent when filtering by status", () => {
    const urgent = filterComplianceCases(timeline, "all", "urgent");
    const ids = urgent.map((item) => item.id);
    expect(ids).toContain("old");
    expect(ids).toContain("urgent");
  });

  it("sorts by nearest deadline with no-deadline cases last", () => {
    const sorted = sortComplianceCases(timeline, "nearest-deadline");
    expect(sorted[0].id).toBe("expired");
    expect(sorted.at(-1)?.id).toBe("old");
  });

  it("sorts by urgency and supports combined filters", () => {
    const viewed = applyComplianceCaseView(timeline, "all", "all", "most-urgent");
    expect(viewed[0].id).toBe("expired");

    const filtered = applyComplianceCaseView(timeline, "new", "expired", "most-urgent");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("expired");
  });
});

describe("checklist progress and export eligibility", () => {
  it("derives checklist completion ratio and label", () => {
    const progress = deriveChecklistProgress({
      defectDocumented: true,
      evidenceAttached: false,
      noticeDrafted: true,
      calendarReminderExported: false,
    });

    expect(progress.completed).toBe(2);
    expect(progress.total).toBe(4);
    expect(progress.label).toBe("2/4 complete");
  });

  it("enables ICS export only for new-law cases with notice deadline", () => {
    const oldLaw = toComplianceCaseViewModel({
      id: "old-2",
      projectName: "Old law",
      canton: "BE",
      contractDate: new Date("2025-12-31"),
      discoveryDate: new Date("2026-03-05"),
    });

    const newLaw = toComplianceCaseViewModel({
      id: "new-2",
      projectName: "New law",
      canton: "SG",
      contractDate: new Date("2026-01-02"),
      discoveryDate: new Date("2026-03-05"),
    });

    expect(isDeadlineReminderIcsExportEligible(oldLaw)).toBe(false);
    expect(isDeadlineReminderIcsExportEligible(newLaw)).toBe(true);
    expect(buildCaseDeadlineReminderICS(oldLaw)).toBeNull();

    const ics = buildCaseDeadlineReminderICS(newLaw);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:BauCompliance: 60-day notice deadline");
  });
});
