import { describe, it, expect } from "vitest";
import {
  determineLegalRegime,
  calculateRuegefrist,
  addDays,
  generateDeadlineICS,
  generateDeadlineCalendarICS,
  validateRuegefristInput,
  parseDateInput,
  parseDateInputAsUTC,
  sanitizeDateQueryParam,
  sanitizeDeadlineReminderQueryParam,
  serializeDeadlineReminderQueryParam,
  normalizeDeadlineReminderOffsets,
  OR_REVISION_DATE,
} from "../lib/legal-utils";

describe("parseDateInput", () => {
  it("parses valid YYYY-MM-DD inputs", () => {
    const parsed = parseDateInput("2026-04-30");
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(3);
    expect(parsed?.getDate()).toBe(30);
  });

  it("returns null for invalid calendar dates", () => {
    expect(parseDateInput("2026-02-30")).toBeNull();
    expect(parseDateInput("2026-13-01")).toBeNull();
    expect(parseDateInput("not-a-date")).toBeNull();
  });
});

describe("parseDateInputAsUTC", () => {
  it("preserves the entered calendar day when serialized as ISO", () => {
    const parsed = parseDateInputAsUTC("2026-04-30");
    expect(parsed).not.toBeNull();
    expect(parsed?.toISOString().split("T")[0]).toBe("2026-04-30");
  });

  it("returns null for invalid calendar dates", () => {
    expect(parseDateInputAsUTC("2026-02-30")).toBeNull();
    expect(parseDateInputAsUTC("not-a-date")).toBeNull();
  });
});

describe("sanitizeDateQueryParam", () => {
  it("preserves valid YYYY-MM-DD query values", () => {
    expect(sanitizeDateQueryParam("2026-04-30")).toBe("2026-04-30");
  });

  it("clears malformed or invalid query values", () => {
    expect(sanitizeDateQueryParam("foo")).toBe("");
    expect(sanitizeDateQueryParam("2026-02-30")).toBe("");
    expect(sanitizeDateQueryParam(null)).toBe("");
  });
});

describe("deadline reminder query helpers", () => {
  it("normalizes reminder offsets to the supported canonical order", () => {
    expect(normalizeDeadlineReminderOffsets([7, 30, 7, 1, 99])).toEqual([30, 7, 1]);
  });

  it("preserves valid reminder query values and supports the none sentinel", () => {
    expect(sanitizeDeadlineReminderQueryParam("30,3")).toEqual([30, 3]);
    expect(sanitizeDeadlineReminderQueryParam("none")).toEqual([]);
  });

  it("falls back to defaults for malformed or unsupported reminder query values", () => {
    expect(sanitizeDeadlineReminderQueryParam("foo,99")).toEqual([14, 7, 1]);
    expect(sanitizeDeadlineReminderQueryParam("3foo,1e2,07x")).toEqual([14, 7, 1]);
    expect(sanitizeDeadlineReminderQueryParam(null)).toEqual([14, 7, 1]);
  });

  it("serializes reminders using canonical order and the none sentinel", () => {
    expect(serializeDeadlineReminderQueryParam([7, 30, 1])).toBe("30,7,1");
    expect(serializeDeadlineReminderQueryParam([])).toBe("none");
  });
});

describe("determineLegalRegime", () => {
  it("returns 'old' for contracts before 2026-01-01", () => {
    expect(determineLegalRegime(new Date("2025-12-31"))).toBe("old");
    expect(determineLegalRegime(new Date("2020-06-15"))).toBe("old");
  });

  it("returns 'new' for contracts on or after 2026-01-01", () => {
    expect(determineLegalRegime(new Date("2026-01-01"))).toBe("new");
    expect(determineLegalRegime(new Date("2026-06-15"))).toBe("new");
    expect(determineLegalRegime(new Date("2027-01-01"))).toBe("new");
  });
});

describe("addDays", () => {
  it("adds 60 days correctly", () => {
    const base = new Date("2026-03-01");
    const result = addDays(base, 60);
    expect(result.toISOString().split("T")[0]).toBe("2026-04-30");
  });

  it("handles month/year boundaries", () => {
    const base = new Date("2026-12-15");
    const result = addDays(base, 60);
    expect(result.toISOString().split("T")[0]).toBe("2027-02-13");
  });
});

describe("generateDeadlineICS", () => {
  it("uses non-inclusive DTEND for all-day single-day events", () => {
    const ics = generateDeadlineICS(
      new Date("2026-04-30"),
      "Deadline",
      "Description"
    );

    expect(ics).toContain("DTSTART;VALUE=DATE:20260430");
    expect(ics).toContain("DTEND;VALUE=DATE:20260501");
  });

  it("creates reminders 14, 7 and 1 day before the deadline", () => {
    const ics = generateDeadlineICS(
      new Date("2026-04-30"),
      "Deadline",
      "Description"
    );

    expect(ics).toContain("TRIGGER;VALUE=DATE:20260416");
    expect(ics).toContain("TRIGGER;VALUE=DATE:20260423");
    expect(ics).toContain("TRIGGER;VALUE=DATE:20260429");
  });

  it("creates configurable reminders for single deadline exports", () => {
    const ics = generateDeadlineICS(
      new Date("2026-04-30"),
      "Deadline",
      "Description",
      [30, 3]
    );

    expect(ics).toContain("TRIGGER;VALUE=DATE:20260331");
    expect(ics).toContain("TRIGGER;VALUE=DATE:20260427");
    expect(ics).not.toContain("TRIGGER;VALUE=DATE:20260416");
    expect(ics).not.toContain("TRIGGER;VALUE=DATE:20260423");
  });

  it("escapes ICS reserved characters in title and description", () => {
    const ics = generateDeadlineICS(
      new Date("2026-04-30"),
      "Deadline, Legal; Notice \\ Check",
      "Line 1, detail; note\nPath \\server"
    );

    const summaryLine = ics.split("\n").find((line) => line.startsWith("SUMMARY:"));
    const descriptionLine = ics.split("\n").find((line) => line.startsWith("DESCRIPTION:"));

    expect(summaryLine).toBe(String.raw`SUMMARY:Deadline\, Legal\; Notice \\ Check`);
    expect(descriptionLine).toBe(String.raw`DESCRIPTION:Line 1\, detail\; note\nPath \\server`);
  });
});

describe("generateDeadlineCalendarICS", () => {
  it("creates one VEVENT per deadline and includes 14/7/1 day reminders", () => {
    const ics = generateDeadlineCalendarICS(
      [
        { key: "60-Tage-Rügefrist", date: new Date("2026-04-30") },
        { key: "2-Jahres-SIA-Frist", date: new Date("2028-03-01") },
      ],
      "01.03.2026"
    );

    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(2);
    expect(ics).toContain("SUMMARY:BauCompliance: 60-Tage-Rügefrist (Abnahme 01.03.2026)");
    expect(ics).toContain("SUMMARY:BauCompliance: 2-Jahres-SIA-Frist (Abnahme 01.03.2026)");
    expect(ics).toContain("TRIGGER;VALUE=DATE:20260416"); // -14 days
    expect(ics).toContain("TRIGGER;VALUE=DATE:20260423"); // -7 days
    expect(ics).toContain("TRIGGER;VALUE=DATE:20260429"); // -1 day
  });
});

describe("validateRuegefristInput", () => {
  it("returns error when discovery date is before contract date", () => {
    expect(
      validateRuegefristInput(new Date("2026-03-01"), new Date("2026-02-28"))
    ).toBe("discovery-before-contract");
  });

  it("returns null when discovery date is on or after contract date", () => {
    expect(
      validateRuegefristInput(new Date("2026-03-01"), new Date("2026-03-01"))
    ).toBeNull();
    expect(
      validateRuegefristInput(new Date("2026-03-01"), new Date("2026-03-10"))
    ).toBeNull();
  });
});

describe("calculateRuegefrist", () => {
  it("returns null ruegefrist60 for old law contracts", () => {
    const result = calculateRuegefrist(
      new Date("2025-06-01"),
      new Date("2026-03-01")
    );
    expect(result.regime).toBe("old");
    expect(result.ruegefrist60).toBeNull();
  });

  it("returns 60-day deadline for new law contracts", () => {
    const result = calculateRuegefrist(
      new Date("2026-02-01"),
      new Date("2026-03-01")
    );
    expect(result.regime).toBe("new");
    expect(result.ruegefrist60).not.toBeNull();
    expect(result.ruegefrist60!.date.toISOString().split("T")[0]).toBe(
      "2026-04-30"
    );
  });

  it("OR_REVISION_DATE is 2026-01-01", () => {
    expect(OR_REVISION_DATE.toISOString().split("T")[0]).toBe("2026-01-01");
  });
});
