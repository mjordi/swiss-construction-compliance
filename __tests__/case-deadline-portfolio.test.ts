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
  deadline: "60-day notice deadline",
  sourceLabel: "Source",
  source: "BauCompliance.ch",
  projectLabel: "Project",
  caseLabel: "Case ID",
  contractDateLabel: "Contract date",
  discoveryDateLabel: "Discovery date",
  pointInTimeNotice: "Point-in-time export; import this .ics file into your calendar. No email or in-app reminders.",
  alarmDescriptionSingular: "Notice deadline in 1 day",
  alarmDescriptionPlural: "Notice deadline in {days} days",
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

  it("sorts deterministically by deadline, project, then Case ID", () => {
    const rows = buildCaseDeadlinePortfolio(
      [
        source("z", "Beta", "2026-05-01"),
        source("b", "Alpha", "2026-05-01"),
        source("a", "Alpha", "2026-05-01"),
        source("first", "Zulu", "2026-04-20"),
      ],
      NOW
    );

    expect(rows.map((row) => row.caseId)).toEqual(["first", "a", "b", "z"]);
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
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics).toContain("TRIGGER:-P30D");
    expect(ics).toContain("TRIGGER:-P7D");
  });

  it("keeps UIDs stable across generations and derives them only from Case ID and deadline day", () => {
    const rows = buildCaseDeadlinePortfolio([source("case-42", "Original project", "2026-05-01")], NOW);
    const first = generate(rows, [7], new Date("2026-06-01T00:00:00.000Z"));
    const renamed = generate(
      [{ ...rows[0], projectName: "Renamed project" }],
      [30],
      new Date("2026-06-02T00:00:00.000Z")
    );
    const uid = first.match(/^UID:(.+)$/m)?.[1];

    expect(uid).toBeTruthy();
    expect(renamed).toContain(`UID:${uid}`);
    expect(renamed).not.toContain("DTSTAMP:20260601T000000Z");
  });

  it("emits no VALARM when no reminders are selected", () => {
    const rows = buildCaseDeadlinePortfolio([source("case-1", "No reminders", "2026-05-01")], NOW);
    const ics = generate(rows, [], NOW);

    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).not.toContain("BEGIN:VALARM");
  });

  it("localizes generated content without changing factual Case values", () => {
    const rows = buildCaseDeadlinePortfolio([source("case-7", "Casa Élite", "2026-05-01")], NOW);
    const italian: CaseDeadlinePortfolioCalendarCopy = {
      ...EN_COPY,
      summaryTemplate: "BauCompliance: {deadline} — {project}",
      deadline: "termine di notifica di 60 giorni",
      projectLabel: "Progetto",
      caseLabel: "ID del caso",
      contractDateLabel: "Data del contratto",
      discoveryDateLabel: "Data della scoperta",
      pointInTimeNotice: "Esportazione istantanea; importa il file. Nessun promemoria via e-mail.",
      alarmDescriptionSingular: "Scadenza tra 1 giorno",
      alarmDescriptionPlural: "Scadenza tra {days} giorni",
    };

    const ics = generateCaseDeadlinePortfolioICS(rows, [1, 7], italian, NOW).replace(/\r\n /g, "");
    expect(ics).toContain("SUMMARY:BauCompliance: termine di notifica di 60 giorni — Casa Élite");
    expect(ics).toContain("Progetto: Casa Élite\\nID del caso: case-7");
    expect(ics).toContain("DESCRIPTION:Scadenza tra 1 giorno");
    expect(ics).toContain("DESCRIPTION:Scadenza tra 7 giorni");
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
