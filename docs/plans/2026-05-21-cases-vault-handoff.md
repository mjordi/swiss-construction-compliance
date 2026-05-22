# Cases-to-Vault Handoff Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Let users jump directly from a case card into the matching Tech Vault context, with the Vault search hydrated from and synchronized back to the URL.

**Architecture:** Keep the change inside the existing Cases + Vault surfaces by adding a tiny shared Vault href helper in `lib/vault.ts`, reusing Next.js search-param state on the Vault page, and exposing a focused per-case CTA in the Cases card actions. Cover the behavior with targeted unit/component tests so future refactors do not silently break the handoff or URL-state continuity.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, Testing Library

---

### Task 1: Add failing tests for the new Cases-to-Vault handoff helper and CTA

**Objective:** Capture the missing navigation behavior before implementation.

**Files:**
- Modify: `__tests__/vault.test.ts`
- Modify: `__tests__/cases-url-sync.test.tsx`
- Test: `__tests__/vault.test.ts`
- Test: `__tests__/cases-url-sync.test.tsx`

**Step 1: Write failing tests**

Add focused tests that assert:
1. `buildCaseVaultHref({ projectName: "Alpine Tower" })` returns `/dashboard/vault?q=Alpine+Tower`.
2. blank project names fall back to `/dashboard/vault`.
3. each rendered case card includes a visible link with the new localization key `cases-open-in-vault` and an href pointing at the matching Tech Vault project query.

Reuse the existing `cases-url-sync` mocks for `next/navigation`, `LanguageContext`, `AuthContext`, `PageHeader`, `case-timeline`, and `supabase` so the test exercises the real rendered Cases markup without adding unrelated product-state noise.

**Step 2: Run test to verify failure**

Run:
- `npm run test -- __tests__/vault.test.ts __tests__/cases-url-sync.test.tsx`

Expected: FAIL because there is no Cases-to-Vault helper yet and the case cards do not render a Vault handoff CTA.

**Step 3: Commit**

Do not commit yet.

### Task 2: Add failing tests for Vault query hydration and URL synchronization

**Objective:** Define the expected Vault URL-state behavior before wiring the page.

**Files:**
- Create: `__tests__/vault-url-sync.test.tsx`
- Test: `__tests__/vault-url-sync.test.tsx`

**Step 1: Write failing tests**

Add focused tests that render `TechVault` with mocked `next/navigation` hooks and assert:
1. an initial `?q=Riverside+Bridge` search param hydrates the visible Vault search input.
2. editing the search input calls `router.replace` with `/dashboard/vault?q=<value>`.
3. clearing the search input removes the query string and calls `router.replace("/dashboard/vault", { scroll: false })`.
4. when the external search params change and the component rerenders, the input re-hydrates to the new `q` value.

Mock `usePathname`, `useRouter`, and `useSearchParams` with a shared mutable `currentSearch` string, mirroring the existing Cases URL-sync test style so rerender behavior remains referentially stable.

**Step 2: Run test to verify failure**

Run:
- `npm run test -- __tests__/vault-url-sync.test.tsx`

Expected: FAIL because the Vault page currently stores search only in local component state and does not read or write the URL.

**Step 3: Commit**

Do not commit yet.

### Task 3: Implement the shared href helper, Cases CTA, and Vault URL synchronization

**Objective:** Ship the bounded product bridge from case triage into Tech Vault evidence review.

**Files:**
- Modify: `lib/vault.ts`
- Modify: `app/dashboard/cases/page.tsx`
- Modify: `app/dashboard/vault/page.tsx`
- Modify: `locales/index.ts`
- Modify: `__tests__/locales.test.ts`

**Step 1: Write minimal implementation**

Implementation requirements:
- add a helper in `lib/vault.ts` named `buildCaseVaultHref(projectName: string)` that returns `/dashboard/vault?q=<trimmed project>` and falls back to `/dashboard/vault` when blank.
- import that helper into `app/dashboard/cases/page.tsx` and render a new `Link` CTA next to the existing protocol CTA on each case card.
- use the new translation key `cases-open-in-vault` for the CTA label in all locales.
- update `app/dashboard/vault/page.tsx` to read `q` from `useSearchParams()` on first render and on external rerenders.
- keep the Vault search input synchronized back into the URL with `router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })`, matching the existing Cases URL-sync pattern.
- preserve current Vault filtering, empty-state behavior, and retry behavior; do not add new tabs, server calls, or unrelated Vault workflow changes.

**Step 2: Run focused tests**

Run:
- `npm run test -- __tests__/vault.test.ts __tests__/cases-url-sync.test.tsx __tests__/vault-url-sync.test.tsx __tests__/locales.test.ts`

Expected: PASS.

**Step 3: Commit**

Use:
```bash
git add lib/vault.ts app/dashboard/cases/page.tsx app/dashboard/vault/page.tsx locales/index.ts __tests__/vault.test.ts __tests__/cases-url-sync.test.tsx __tests__/vault-url-sync.test.tsx __tests__/locales.test.ts docs/plans/2026-05-21-cases-vault-handoff.md scripts/baucompliance-pipeline/proposals/2026-05-21.md scripts/baucompliance-pipeline/decisions/2026-05-21.md
git commit -m "feat: add cases to vault handoff"
```

### Task 4: Validate the focused change

**Objective:** Confirm the handoff is reviewable and safe.

**Files:**
- Modify: none

**Step 1: Run validation**

Run:
- `npm run test -- __tests__/vault.test.ts __tests__/cases-url-sync.test.tsx __tests__/vault-url-sync.test.tsx __tests__/locales.test.ts`
- `npm run lint`
- `npm run build`

**Step 2: Verify**

Expected:
- focused tests pass
- lint passes
- build passes best-effort

**Step 3: Commit**

If validation needs no code changes, keep the prior commit.
