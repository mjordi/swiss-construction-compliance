import { describe, it, expect } from "vitest";
import { de, fr, it as itLocale, en } from "../locales/index";

const locales = { de, fr, it: itLocale, en };
const referenceKeys = Object.keys(de).sort();

describe("locales", () => {
  it("includes vault localization keys in every locale", () => {
    const requiredVaultKeys = [
      "vault-title",
      "vault-subtitle",
      "vault-tab-projects",
      "vault-tab-archived",
      "vault-search-placeholder",
      "vault-loading",
      "vault-error-load",
      "vault-status-active",
      "vault-status-review",
      "vault-status-archived",
      "vault-docs-label",
      "vault-last-prefix",
      "vault-last-updated",
      "vault-updated-prefix",
      "vault-updated-unit-hours",
      "vault-updated-unit-days",
      "vault-updated-unit-weeks",
      "vault-updated-less-than-hour",
      "vault-empty-search-title",
      "vault-empty-search-body-projects",
      "vault-empty-search-body-archived",
      "vault-empty-archived-title",
      "vault-empty-archived-body",
      "vault-empty-archived-body-no-active",
      "vault-empty-projects-title",
      "vault-empty-projects-body",
      "vault-empty-projects-body-no-archived",
      "vault-empty-action-clear-search",
      "vault-empty-action-show-projects",
      "vault-empty-action-show-archived",
      "vault-new-project",
      "vault-create-project",
    ] as const;

    for (const [lang, translations] of Object.entries(locales)) {
      for (const key of requiredVaultKeys) {
        expect(translations[key], `Locale '${lang}' missing vault key '${key}'`).toBeDefined();
      }
    }
  });

  it("preserves the vault empty-search query placeholder across locales", () => {
    for (const [lang, translations] of Object.entries(locales)) {
      expect(
        translations["vault-empty-search-title"],
        `Locale '${lang}' must preserve the {query} placeholder`
      ).toContain("{query}");
    }
  });

  it("preserves the vault last-updated placeholder across locales", () => {
    for (const [lang, translations] of Object.entries(locales)) {
      expect(
        translations["vault-last-updated"],
        `Locale '${lang}' must preserve the {relative} placeholder`
      ).toContain("{relative}");
    }
  });

  it("all locales export the same keys as 'de'", () => {
    for (const [lang, translations] of Object.entries(locales)) {
      const keys = Object.keys(translations).sort();
      expect(keys, `Locale '${lang}' key mismatch`).toEqual(referenceKeys);
    }
  });

  it("no locale has empty string values (except intentionally empty period fields)", () => {
    // Some keys are intentionally empty (e.g. plan-enterprise-period has no billing period)
    const allowEmpty = new Set(["plan-enterprise-period", "stakes-stat3-unit"]);
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
