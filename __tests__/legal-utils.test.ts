import { describe, it, expect } from "vitest";
import {
  determineLegalRegime,
  calculateRuegefrist,
  addDays,
  OR_REVISION_DATE,
} from "../lib/legal-utils";

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
