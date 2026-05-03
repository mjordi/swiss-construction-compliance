import { describe, expect, it } from "vitest";
import { hasSettingsProfileChanges, normalizeSettingsProfileSnapshot } from "../lib/settings";

describe("settings profile helpers", () => {
  it("normalizes missing and surrounding whitespace values", () => {
    expect(
      normalizeSettingsProfileSnapshot({
        fullName: "  Max Muster  ",
        company: undefined,
      })
    ).toEqual({
      fullName: "Max Muster",
      company: "",
    });
  });

  it("treats whitespace-only edits as unchanged against the loaded profile", () => {
    expect(
      hasSettingsProfileChanges(
        { fullName: " Max Muster ", company: " Bau AG  " },
        { fullName: "Max Muster", company: "Bau AG" }
      )
    ).toBe(false);
  });

  it("detects meaningful edits against the loaded profile", () => {
    expect(
      hasSettingsProfileChanges(
        { fullName: "Max Muster", company: "Neue Bau AG" },
        { fullName: "Max Muster", company: "Bau AG" }
      )
    ).toBe(true);
  });

  it("treats newly entered values as changes when no profile snapshot loaded yet", () => {
    expect(
      hasSettingsProfileChanges(
        { fullName: "Max Muster", company: "Bau AG" },
        null
      )
    ).toBe(true);

    expect(
      hasSettingsProfileChanges(
        { fullName: "   ", company: "" },
        null
      )
    ).toBe(false);
  });
});
