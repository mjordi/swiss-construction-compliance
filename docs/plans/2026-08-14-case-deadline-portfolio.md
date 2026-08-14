# Case Deadline Portfolio Calendar Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Let an authenticated user download one truthful, deterministic `.ics` snapshot containing every eligible upcoming fixed notice deadline across their active Cases.

**Architecture:** Add a pure domain helper that converts owner-scoped Case records into validated, sorted portfolio events and serializes those events with stable UIDs. Integrate it additively into the existing dashboard deadlines page with stale-request/user guards, current reminder presets, localized status/copy, and no persistence or legal-calculation changes.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase client, Vitest, React Testing Library, RFC 5545 `.ics` text.

---

### Task 1: Add the pure Case portfolio selector and calendar serializer

**Objective:** Produce deterministic eligible portfolio rows and stable calendar events without UI or persistence concerns.

**Files:**
- Create: `lib/case-deadline-portfolio.ts`
- Create: `__tests__/case-deadline-portfolio.test.ts`

**Step 1: Write failing tests**

Cover active new-law Cases with valid dates; exclusion of archived, invalid, future-discovery, old-law, and expired rows; deterministic deadline/project/ID ordering; one `VEVENT` per item; stable Case/deadline-derived `UID` across repeated generation; source/project escaping; reminders; and no-reminder output.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/case-deadline-portfolio.test.ts`
Expected: FAIL because `lib/case-deadline-portfolio.ts` does not exist.

**Step 3: Write minimal implementation**

Reuse the established Case legal timeline/calculation contract rather than implementing deadline math again. Accept only the Case fields needed by the selector. Keep `DTSTAMP` dynamic but make each `UID` depend only on Case ID and deadline day. Escape RFC 5545 text fields and use a non-inclusive next-day `DTEND` for all-day events.

**Step 4: Run test to verify pass**

Run: `npm run test -- __tests__/case-deadline-portfolio.test.ts`
Expected: PASS.

### Task 2: Add the authenticated portfolio section to the deadlines page

**Objective:** Load the current owner’s Cases safely and expose one portfolio download using the page’s existing reminder choices and truthful delivery guidance.

**Files:**
- Modify: `app/dashboard/deadlines/page.tsx`
- Modify: `__tests__/deadlines-share-link.test.tsx`
- Modify: `locales/index.ts`
- Modify: `__tests__/locales.test.ts`

**Step 1: Write failing UI tests**

Mock a referentially stable auth user and Supabase client. Cover owner-scoped query, loading/error/empty states, count and eligible project display, exclusions, one download with current reminder offsets, deterministic filename, duplicate suppression, blob preparation failure/retry, and stale completion after account change.

**Step 2: Run focused tests to verify failure**

Run: `npm run test -- __tests__/case-deadline-portfolio.test.ts __tests__/deadlines-share-link.test.tsx __tests__/locales.test.ts`
Expected: FAIL because the portfolio UI and translations are absent.

**Step 3: Write minimal UI implementation**

Memoize the Supabase client. Query `cases` by `user_id`; keep prior-owner data hidden during transitions; reject stale request/user completions; derive portfolio rows with the pure helper; render localized loading/error/empty/count states; and create/download the portfolio file inside `try/catch` with synchronous duplicate suppression, current-request guards, URL cleanup, retryable feedback, and the existing point-in-time/import-required/no-email-or-in-app guidance. Do not update Case checklist state when exporting the aggregate artifact.

**Step 4: Run focused tests to verify pass**

Run: `npm run test -- __tests__/case-deadline-portfolio.test.ts __tests__/deadlines-share-link.test.tsx __tests__/locales.test.ts`
Expected: PASS.

### Task 3: Review and validate the integrated slice

**Objective:** Prove the implementation matches the approved user outcome and does not regress the product.

**Files:**
- Review all changed implementation, test, locale, proposal, decision, and plan files.

**Step 1: Spec-compliance review**

Verify exact eligibility rules, owner isolation, stable UIDs, deterministic ordering, existing reminder presets, truthful automation boundary, and every excluded surface.

**Step 2: Code-quality/security review**

Inspect date validation, ICS escaping, stale user/request behavior, duplicate export suppression, object-URL cleanup, error retry, test-double stability, locale parity, and scope overlap with open PR #190.

**Step 3: Run required validation**

Run exactly:
- `npm run test`
- `npm run lint`
- `npm run build`
- `git diff --check`

Expected: every command passes. The run is not complete and must not be committed/presented as shipped if any required validation remains failing.

**Step 4: Commit**

Stage only the approved implementation, tests, locales, and today’s proposal/decision/plan artifacts. Commit with a focused product message.
