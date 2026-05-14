# Cases Load Error Retry Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a visible initial-load error state with retry support to the cases dashboard.

**Architecture:** Keep the change inside `app/dashboard/cases/page.tsx` by tracking a localized initial-load error state alongside the existing loading flow. Reuse the existing refresh trigger for retry, preserve the current empty/filter states on successful loads, and cover the failure/recovery behavior with focused component tests.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, Testing Library

---

### Task 1: Add failing tests for initial load failure and retry recovery

**Objective:** Capture the missing UX before implementation.

**Files:**
- Modify: `__tests__/cases-url-sync.test.tsx`
- Test: `__tests__/cases-url-sync.test.tsx`

**Step 1: Write failing tests**

Add tests that:
1. mock an initial `cases` fetch failure and assert a localized error message plus retry button render instead of the empty state.
2. click retry, resolve the next fetch successfully, and assert the error clears and the normal page content renders.

**Step 2: Run test to verify failure**

Run: `npm run test -- cases-url-sync`
Expected: FAIL because the page does not yet render a load error state or retry action.

**Step 3: Commit**

Do not commit yet.

### Task 2: Implement a narrow cases-page load error state

**Objective:** Add a localized initial-load error and retry path without changing successful-load behavior.

**Files:**
- Modify: `app/dashboard/cases/page.tsx`
- Modify: `locales/index.ts`
- Modify: `__tests__/locales.test.ts`

**Step 1: Write minimal implementation**

Implementation requirements:
- track an `initialLoadError` translation key or `null`
- when either initial `cases` or `protocols` fetch fails, clear stale case/protocol data, stop loading, and show an inline error card with retry CTA
- reuse `triggerCasesRefresh()` for the retry button
- preserve the existing empty-state and filter behavior when loads succeed
- keep the retry copy localized in all locales

**Step 2: Run focused tests**

Run: `npm run test -- cases-url-sync locales`
Expected: PASS

**Step 3: Commit**

Use:
```bash
git add app/dashboard/cases/page.tsx __tests__/cases-url-sync.test.tsx __tests__/locales.test.ts locales/index.ts scripts/baucompliance-pipeline/proposals/2026-05-14.md scripts/baucompliance-pipeline/decisions/2026-05-14.md docs/plans/2026-05-14-cases-load-retry.md
git commit -m "fix: add cases load retry state"
```

### Task 3: Validate the focused change

**Objective:** Confirm the patch is reviewable and safe.

**Files:**
- Modify: none

**Step 1: Run focused validation**

Run:
- `npm run test -- cases-url-sync`
- `npm run test -- locales`
- `npm run lint`
- `npm run build`

**Step 2: Verify**

Expected:
- tests pass
- lint passes
- build passes best-effort

**Step 3: Commit**

If validation needs no code changes, keep the prior commit.
