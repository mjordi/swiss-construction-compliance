# Technical Vault Localization Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Localize the Technical Vault shell and empty-state copy so the page matches the product’s multilingual experience.

**Architecture:** Keep the change narrow by reusing the existing `useLanguage()` translation flow. Convert the vault empty-state helper from raw strings to translation-key metadata, then update the Vault page to render translated strings and localized status/search/loading copy from `locales/index.ts`.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, locale dictionary in `locales/index.ts`

---

### Task 1: Localize Vault helper output and page shell

**Objective:** Replace hardcoded English Vault UI strings with translation keys and keep empty-state branching behavior intact.

**Files:**
- Modify: `lib/vault.ts`
- Modify: `app/dashboard/vault/page.tsx`
- Modify: `locales/index.ts`
- Test: `__tests__/vault.test.ts`
- Test: `__tests__/locales.test.ts`

**Step 1: Write failing tests**

Add tests in `__tests__/vault.test.ts` that assert `getVaultEmptyState()` returns translation keys/metadata instead of hardcoded English strings, including query interpolation metadata for search-empty states.

Add or extend tests so localized Vault labels can be asserted via the translation dictionaries (for example, checking that the new English and German keys exist and produce non-empty values).

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/vault.test.ts __tests__/locales.test.ts`
Expected: FAIL because the helper still returns raw English strings and the new locale keys do not exist yet.

**Step 3: Write minimal implementation**

- Update `lib/vault.ts` so `getVaultEmptyState()` returns translation-key fields (plus optional interpolation payload for the search query) instead of raw strings.
- Update `app/dashboard/vault/page.tsx` to use `useLanguage()` for all currently hardcoded shell copy: header, subtitle, tab labels, search placeholder, loading/error copy, status chip labels, docs label, relative-update prefix, empty-state button text, and create-project CTAs.
- Add the necessary translation keys to `locales/index.ts` for all supported locales already covered by tests (`de`, `fr`, `it`, `en`).

**Step 4: Run tests to verify pass**

Run: `npm run test -- __tests__/vault.test.ts __tests__/locales.test.ts`
Expected: PASS.

**Step 5: Run focused regression checks**

Run: `npm run lint`
Run: `npm run test`
Expected: PASS.

**Step 6: Commit**

```bash
git add app/dashboard/vault/page.tsx lib/vault.ts locales/index.ts __tests__/vault.test.ts __tests__/locales.test.ts scripts/baucompliance-pipeline/proposals/2026-05-02.md scripts/baucompliance-pipeline/decisions/2026-05-02.md docs/plans/2026-05-02-vault-localization.md
git commit -m "feat: localize technical vault shell"
```
