# Finalized Protocol Register Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a dedicated owner-scoped register where users can retrieve and re-download every finalized protocol, including standalone records.

**Architecture:** Introduce a small pure protocol-register adapter that filters finalized records and sorts newest first. Add a client route that loads owner-scoped protocol rows with account-switch privacy protection and regenerates PDFs from the exact clicked persisted record through existing report/PDF contracts. Reuse the shared desktop/mobile navigation list and locale dictionary.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, React-PDF, Vitest, Testing Library.

---

### Task 1: Define the finalized register contract

**Objective:** Provide a pure immutable selector and deterministic filename for finalized persisted protocol rows.

**Files:**
- Create: `lib/protocol-register.ts`
- Test: `__tests__/protocol-register.test.ts`

**Steps:**
1. Write failing tests proving draft/awaiting rows are excluded, finalized rows sort newest-first with deterministic ID tie-breaks, source rows are not mutated, and filenames are PII-safe and ID-based.
2. Run `npm run test -- __tests__/protocol-register.test.ts`; expect failure because the module does not exist.
3. Implement typed `selectFinalizedProtocolRecords()` and `protocolPdfFilename()` helpers using the existing `Protocol` type.
4. Rerun the focused test; expect pass.

### Task 2: Add the owner-scoped register route and retrieval lifecycle

**Objective:** Render finalized records and safely regenerate the exact clicked source record as PDF.

**Files:**
- Create: `app/dashboard/protocols/page.tsx`
- Test: `__tests__/protocol-register-page.test.tsx`

**Steps:**
1. Write failing route tests for owner-scoped finalized query, newest-first cards, standalone/linked context, empty/error states, account-switch privacy, exact clicked record PDF input, deterministic filename, duplicate suppression, stale completion, cleanup, and retry.
2. Run the focused tests; expect failure because the route does not exist.
3. Implement a memoized Supabase client, owner-scoped load, current-user/request guards, and read-only cards.
4. Implement PDF generation using `buildFinalizedProtocolReportFromRecord` and `AuditReportPDF`, with per-record synchronous lock, request/user/record/unmount guards, feedback timer and object URL cleanup.
5. Rerun focused tests; expect pass.

### Task 3: Add navigation and all-language copy

**Objective:** Make the register discoverable on desktop/mobile and fully localized.

**Files:**
- Modify: `components/dashboard/Sidebar.tsx`
- Modify: `locales/index.ts`
- Modify: `__tests__/dashboard-navigation-vault.test.tsx`
- Modify: `__tests__/locales.test.ts`

**Steps:**
1. Extend navigation tests to require `/dashboard/protocols` on desktop/mobile and active mobile title.
2. Add DE/FR/IT/EN keys for navigation, page content, contexts, signature state, and download feedback.
3. Add the nav item using a real Next link and shared nav list.
4. Run focused navigation, locale, helper, and route tests; expect pass.

### Task 4: Review and validate

**Objective:** Prove the implementation matches the approved slice and does not regress the app.

**Files:**
- Modify: `scripts/baucompliance-pipeline/decisions/2026-08-13.md`

**Steps:**
1. Perform a spec-compliance review against the explicit engineering task; fix every gap.
2. Perform a code-quality/security/legal-trust review; fix all critical and important issues.
3. Run `npm run test`; expect all tests pass.
4. Run `npm run lint`; expect no errors.
5. Run `npm run build`; expect successful Next.js production build.
6. Run `git diff --check`; expect no whitespace errors.
7. Record implementation, product review, review gates, and exact validation in today’s decision artifact.
8. Commit only approved code/tests, today’s proposal/decision artifacts, and this plan.
