import { describe, it, expect } from "vitest";
import { de, fr, it as itLocale, rm, en } from "../locales/index";

const locales = { de, fr, it: itLocale, rm, en };
const referenceKeys = Object.keys(de).sort();

describe("locales", () => {
  it("all locales export the same keys as 'de'", () => {
    for (const [lang, translations] of Object.entries(locales)) {
      const keys = Object.keys(translations).sort();
      expect(keys, `Locale '${lang}' key mismatch`).toEqual(referenceKeys);
    }
  });

  it("no locale has empty string values (except intentionally empty period fields)", () => {
    // Some keys are intentionally empty (e.g. plan-enterprise-period has no billing period)
    const allowEmpty = new Set(["plan-enterprise-period"]);
    for (const [lang, translations] of Object.entries(locales)) {
      for (const [key, value] of Object.entries(translations)) {
        if (allowEmpty.has(key)) continue;
        expect(value, `Locale '${lang}' key '${key}' is empty`).not.toBe("");
      }
    }
  });

  it("all locales have at least the expected number of keys", () => {
    const minKeys = 50;
    for (const [lang, translations] of Object.entries(locales)) {
      expect(
        Object.keys(translations).length,
        `Locale '${lang}' has fewer than ${minKeys} keys`
      ).toBeGreaterThanOrEqual(minKeys);
    }
  });
});
