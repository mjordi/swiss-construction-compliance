import { describe, expect, it } from "vitest";
import {
  buildCaseDeadlinePortfolio,
  generateCaseDeadlinePortfolioICS,
  type CaseDeadlinePortfolioCalendarCopy,
  type CaseDeadlinePortfolioSource,
} from "@/lib/case-deadline-portfolio";

const NOW = new Date("2026-06-01T10:00:00.000Z");
const EN_COPY: CaseDeadlinePortfolioCalendarCopy = {
  summaryTemplate: "BauCompliance: {deadline} — {project}",
  deadlineLabels: {
    notice: "60-day notice deadline",
    "warranty-2y": "2-year warranty deadline",
    "limitation-5y": "5-year limitation deadline",
  },
  sourceLabel: "Source",
  source: "BauCompliance.ch",
  projectLabel: "Project",
  caseLabel: "Case ID",
  contractDateLabel: "Contract date",
  discoveryDateLabel: "Discovery date",
  acceptanceDateLabel: "Acceptance date",
  pointInTimeNotice: "Point-in-time export; import this .ics file into your calendar. No email or in-app reminders.",
  alarmDescriptionSingular: "{deadline} in 1 day",
  alarmDescriptionPlural: "{deadline} in {days} days",
};

function generate(rows: Parameters<typeof generateCaseDeadlinePortfolioICS>[0], offsets: number[], at = NOW) {
  return generateCaseDeadlinePortfolioICS(rows, offsets, EN_COPY, at);
}

function source(
  id: string,
  projectName: string,
  discoveryDate: string,
  overrides: Partial<CaseDeadlinePortfolioSource> = {}
): CaseDeadlinePortfolioSource {
  return {
    id,
    project_name: projectName,
    contract_date: "2026-01-15",
    discovery_date: discoveryDate,
    acceptance_date: null,
    status: "active",
    ...overrides,
  };
}

describe("Case deadline portfolio", () => {
  it("includes due-today and future fixed notice deadlines while excluding ineligible Cases", () => {
    const rows = buildCaseDeadlinePortfolio(
      [
        source("future", "Future", "2026-05-01"),
        source("due-today", "Due today", "2026-04-02"),
        source("expired", "Expired", "2026-04-01"),
        source("archived", "Archived", "2026-05-01", { status: "archived" }),
        source("future-discovery", "Future discovery", "2026-06-02"),
        source("old-law", "Old law", "2026-05-01", { contract_date: "2025-12-31" }),
        source("bad-date", "Bad date", "not-a-date"),
        source("bad-order", "Bad order", "2026-01-14"),
        source("impossible-date", "Impossible", "2026-02-30"),
      ],
      NOW
    );

    expect(rows.map((row) => row.caseId)).toEqual(["due-today", "future"]);
    expect(rows.map((row) => row.deadlineDay)).toEqual(["2026-06-01", "2026-06-30"]);
    expect(rows.map((row) => row.kind)).toEqual(["notice", "notice"]);
    expect(rows.map((row) => row.acceptanceDay)).toEqual([null, null]);
  });

  it("adds current acceptance milestones while ignoring null, invalid, and expired acceptance dates", () => {
    const rows = buildCaseDeadlinePortfolio(
      [
        source("valid", "Valid", "2026-05-01", { acceptance_date: "2024-06-01" }),
        source("null", "Null", "2026-05-01"),
        source("invalid", "Invalid", "2026-05-01", { acceptance_date: "2024-02-30" }),
        source("expired", "Expired milestones", "2026-05-01", { acceptance_date: "2020-05-31" }),
      ],
      NOW
    );

    expect(rows.map(({ caseId, kind, deadlineDay, acceptanceDay }) => ({ caseId, kind, deadlineDay, acceptanceDay }))).toEqual([
      { caseId: "valid", kind: "warranty-2y", deadlineDay: "2026-06-01", acceptanceDay: "2024-06-01" },
      { caseId: "expired", kind: "notice", deadlineDay: "2026-06-30", acceptanceDay: null },
      { caseId: "invalid", kind: "notice", deadlineDay: "2026-06-30", acceptanceDay: null },
      { caseId: "null", kind: "notice", deadlineDay: "2026-06-30", acceptanceDay: null },
      { caseId: "valid", kind: "notice", deadlineDay: "2026-06-30", acceptanceDay: null },
      { caseId: "valid", kind: "limitation-5y", deadlineDay: "2029-06-01", acceptanceDay: "2024-06-01" },
    ]);
  });

  it.each(["2024-06-01T", "2024-06-01Tgarbage"])(
    "ignores malformed acceptance timestamp %s while retaining its valid notice milestone",
    (acceptanceDate) => {
      const rows = buildCaseDeadlinePortfolio(
        [source("malformed", "Malformed acceptance", "2026-05-01", { acceptance_date: acceptanceDate })],
        NOW
      );

      expect(rows.map(({ caseId, kind, acceptanceDay }) => ({ caseId, kind, acceptanceDay }))).toEqual([
        { caseId: "malformed", kind: "notice", acceptanceDay: null },
      ]);
    }
  );

  it("uses calendar-year arithmetic for leap-day acceptance milestones", () => {
    const rows = buildCaseDeadlinePortfolio(
      [source("leap", "Leap", "2025-01-01", {
        contract_date: "2025-01-01",
        acceptance_date: "2024-02-29T12:00:00.000Z",
      })],
      new Date("2026-02-28T12:00:00.000Z")
    );

    expect(rows.map(({ kind, deadlineDay, acceptanceDay }) => ({ kind, deadlineDay, acceptanceDay }))).toEqual([
      { kind: "warranty-2y", deadlineDay: "2026-02-28", acceptanceDay: "2024-02-29" },
      { kind: "limitation-5y", deadlineDay: "2029-02-28", acceptanceDay: "2024-02-29" },
    ]);
  });

  it("keeps UTC acceptance anniversaries stable across host timezones and DST", () => {
    const originalTimezone = process.env.TZ;

    try {
      for (const timezone of ["Europe/Zurich", "America/Los_Angeles", "Pacific/Kiritimati"]) {
        process.env.TZ = timezone;
        const rows = buildCaseDeadlinePortfolio(
          [source("utc", "UTC anniversary", "invalid", {
            contract_date: "invalid",
            acceptance_date: "2024-03-31T23:30:00.000-07:00",
          })],
          new Date("2026-01-01T12:00:00.000Z")
        );

        expect(rows.map(({ kind, deadlineDay }) => ({ kind, deadlineDay })), timezone).toEqual([
          { kind: "warranty-2y", deadlineDay: "2026-03-31" },
          { kind: "limitation-5y", deadlineDay: "2029-03-31" },
        ]);
      }
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it("omits malformed notice source dates from acceptance rows and calendar descriptions", () => {
    const rows = buildCaseDeadlinePortfolio(
      [source("acceptance-only", "Acceptance only", "not-a-discovery-date", {
        contract_date: "not-a-contract-date",
        acceptance_date: "2024-06-01",
      })],
      NOW
    );

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.kind !== "notice" && row.contractDay === null && row.discoveryDay === null)).toBe(true);

    const unfolded = generate(rows, [], NOW).replace(/\r\n[ \t]/g, "");
    expect(unfolded).not.toContain("Contract date:");
    expect(unfolded).not.toContain("Discovery date:");
    expect(unfolded.match(/Acceptance date: 2024-06-01/g)).toHaveLength(2);
  });

  it("uses the Europe/Zurich calendar day when rejecting future discoveries", () => {
    const justAfterSwissMidnight = new Date("2026-05-31T22:30:00.000Z");

    expect(
      buildCaseDeadlinePortfolio(
        [source("today", "Swiss today", "2026-06-01"), source("tomorrow", "Swiss tomorrow", "2026-06-02")],
        justAfterSwissMidnight
      ).map((row) => row.caseId)
    ).toEqual(["today"]);
  });

  it("sorts deterministically by deadline, project, Case ID, then stable milestone kind", () => {
    const rows = buildCaseDeadlinePortfolio(
      [
        source("z", "Beta", "2026-05-01"),
        source("b", "Alpha", "2026-05-01"),
        source("a", "Alpha", "2026-05-01", { acceptance_date: "2024-06-30" }),
        source("first", "Zulu", "2026-04-20"),
      ],
      NOW
    );

    expect(rows.map((row) => `${row.caseId}:${row.kind}`)).toEqual([
      "first:notice",
      "a:notice",
      "a:warranty-2y",
      "b:notice",
      "z:notice",
      "a:limitation-5y",
    ]);
  });

  it("serializes one escaped all-day VEVENT per row with normalized reminders and source context", () => {
    const rows = buildCaseDeadlinePortfolio(
      [source("case,1", "Alpine, Tower; Phase \\ A\nNorth", "2026-05-01")],
      NOW
    );
    const ics = generate(rows, [7, 30, 7, 0, 99], new Date("2026-06-01T12:34:56.000Z"));
    const unfolded = ics.replace(/\r\n[ \t]/g, "");

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("DTSTAMP:20260601T123456Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260630");
    expect(ics).toContain("DTEND;VALUE=DATE:20260701");
    expect(unfolded).toContain("SUMMARY:BauCompliance: 60-day notice deadline — Alpine\\, Tower\\; Phase \\\\ A\\nNorth");
    expect(unfolded).toContain("Project: Alpine\\, Tower\\; Phase \\\\ A\\nNorth");
    expect(unfolded).toContain("Case ID: case\\,1");
    expect(unfolded).toContain("Contract date: 2026-01-15");
    expect(unfolded).toContain("Discovery date: 2026-05-01");
    const portfolioDescription = unfolded.match(/^DESCRIPTION:(Source: BauCompliance\.ch.+)$/m)?.[1];
    expect(portfolioDescription).toContain("Source: BauCompliance.ch\\nProject:");
    expect(portfolioDescription).not.toContain("\\\\n");
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics).toContain("TRIGGER:-P30D");
    expect(ics).toContain("TRIGGER:-P7D");
  });

  it("keeps UIDs stable across generations and project renames", () => {
    const rows = buildCaseDeadlinePortfolio([source("case-42", "Original project", "2026-05-01")], NOW);
    const first = generate(rows, [7], new Date("2026-06-01T00:00:00.000Z"));
    const renamed = generate(
      [{ ...rows[0], projectName: "Renamed project" }],
      [30],
      new Date("2026-06-02T00:00:00.000Z")
    );
    const uid = first.match(/^UID:(.+)$/m)?.[1];

    expect(uid).toBeTruthy();
    expect(uid).toBe("baucompliance-case-case-42-20260630@baucompliance.ch");
    expect(renamed).toContain(`UID:${uid}`);
    expect(renamed).not.toContain("DTSTAMP:20260601T000000Z");
  });

  it("creates distinct kind-qualified UIDs for same-Case same-day milestones and keeps them stable across renames", () => {
    const rows = buildCaseDeadlinePortfolio(
      [source("case-42", "Original project", "2026-05-01", { acceptance_date: "2024-06-30" })],
      NOW
    );
    const first = generate(rows, [], new Date("2026-06-01T00:00:00.000Z"));
    const renamed = generate(
      rows.map((row) => ({ ...row, projectName: "Renamed project" })),
      [],
      new Date("2026-06-02T00:00:00.000Z")
    );
    const firstUids = [...first.matchAll(/^UID:(.+)$/gm)].map((match) => match[1]);
    const renamedUids = [...renamed.matchAll(/^UID:(.+)$/gm)].map((match) => match[1]);

    expect(firstUids).toHaveLength(3);
    expect(new Set(firstUids).size).toBe(3);
    expect(firstUids.some((uid) => uid.includes("case-42-20260630@"))).toBe(true);
    expect(firstUids.some((uid) => uid.includes("-notice-"))).toBe(false);
    expect(firstUids.some((uid) => uid.includes("-warranty-2y-20260630"))).toBe(true);
    expect(renamedUids).toEqual(firstUids);
  });

  it("keeps acceptance UIDs distinct for Case IDs that differ only by control characters", () => {
    const rows = buildCaseDeadlinePortfolio(
      [
        source("caseid", "Plain", "invalid", { contract_date: "invalid", acceptance_date: "2024-06-30" }),
        source("case\u0001id", "Controlled", "invalid", { contract_date: "invalid", acceptance_date: "2024-06-30" }),
      ],
      NOW
    );
    const unfolded = generate(rows, [], NOW).replace(/\r\n[ \t]/g, "");
    const uids = [...unfolded.matchAll(/^UID:(.+)\r$/gm)].map((match) => match[1]);

    expect(uids).toHaveLength(4);
    expect(new Set(uids).size).toBe(4);
    expect(uids.some((uid) => uid.includes("case%01id-warranty-2y-20260630"))).toBe(true);
    expect(uids.some((uid) => uid.includes("caseid-warranty-2y-20260630"))).toBe(true);
  });

  it("emits no VALARM when no reminders are selected", () => {
    const rows = buildCaseDeadlinePortfolio([source("case-1", "No reminders", "2026-05-01")], NOW);
    const ics = generate(rows, [], NOW);

    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).not.toContain("BEGIN:VALARM");
  });

  it("localizes generated content without changing factual Case values", () => {
    const rows = buildCaseDeadlinePortfolio(
      [source("case-7", "Casa Élite", "2026-05-01", { acceptance_date: "2024-06-01" })],
      NOW
    );
    const italian: CaseDeadlinePortfolioCalendarCopy = {
      ...EN_COPY,
      summaryTemplate: "BauCompliance: {deadline} — {project}",
      deadlineLabels: {
        notice: "termine di notifica di 60 giorni",
        "warranty-2y": "termine di garanzia di 2 anni",
        "limitation-5y": "termine di prescrizione di 5 anni",
      },
      projectLabel: "Progetto",
      caseLabel: "ID del caso",
      contractDateLabel: "Data del contratto",
      discoveryDateLabel: "Data della scoperta",
      acceptanceDateLabel: "Data di accettazione",
      pointInTimeNotice: "Esportazione istantanea; importa il file. Nessun promemoria via e-mail.",
      alarmDescriptionSingular: "{deadline} tra 1 giorno",
      alarmDescriptionPlural: "{deadline} tra {days} giorni",
    };

    const ics = generateCaseDeadlinePortfolioICS(rows, [1, 7], italian, NOW).replace(/\r\n /g, "");
    expect(ics).toContain("SUMMARY:BauCompliance: termine di notifica di 60 giorni — Casa Élite");
    expect(ics).toContain("SUMMARY:BauCompliance: termine di garanzia di 2 anni — Casa Élite");
    expect(ics).toContain("SUMMARY:BauCompliance: termine di prescrizione di 5 anni — Casa Élite");
    expect(ics).toContain("Progetto: Casa Élite\\nID del caso: case-7");
    expect(ics.match(/Data di accettazione: 2024-06-01/g)).toHaveLength(2);
    expect(ics).toContain("DESCRIPTION:termine di garanzia di 2 anni tra 1 giorno");
    expect(ics).toContain("DESCRIPTION:termine di prescrizione di 5 anni tra 7 giorni");
  });

  it.each([
    ["ASCII", "A".repeat(220)],
    ["multibyte", "Progetto 🏗️ Zürich façade ".repeat(12)],
  ])("folds long %s content at 75 UTF-8 octets and unfolds losslessly", (_kind, projectName) => {
    const rows = buildCaseDeadlinePortfolio([source("case-long", projectName, "2026-05-01")], NOW);
    const ics = generate(rows, [30], NOW);
    const encoder = new TextEncoder();

    for (const physicalLine of ics.split("\r\n")) {
      expect(encoder.encode(physicalLine).length).toBeLessThanOrEqual(75);
    }

    const unfolded = ics.replace(/\r\n[ \t]/g, "");
    expect(unfolded).toContain(`SUMMARY:BauCompliance: 60-day notice deadline — ${projectName}`);
    expect(unfolded).toContain(`Project: ${projectName}`);
  });

  it("escapes newlines and removes unsafe C0/C1 controls from content values", () => {
    const rows = buildCaseDeadlinePortfolio([source("case-ctrl", "Safe\nInjected\u0000\u0007\u0085Text", "2026-05-01")], NOW);
    const ics = generate(rows, [], NOW).replace(/\r\n /g, "");

    expect(ics).toContain("Safe\\nInjectedText");
    expect(ics).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/);
  });
});
