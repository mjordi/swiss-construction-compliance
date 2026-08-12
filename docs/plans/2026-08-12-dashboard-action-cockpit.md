# Dashboard Priority Action Cockpit Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Put the most time-critical linked Cases and their legal next actions at the top of the dashboard so users can triage compliance work before starting a new protocol.

**Architecture:** Reuse the dashboard's existing owner-scoped Cases load and `ComplianceCaseViewModel` contract. Add one pure selector that ranks actionable Cases, then render a localized read-only cockpit with direct native links into the existing filtered Cases workflow; no new persistence, legal calculation, or query is introduced.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, existing localization and Case timeline helpers.

---

### Task 1: Define and test priority Case selection

**Objective:** Establish a deterministic, bounded selector for dashboard triage.

**Files:**
- Create: `lib/dashboard-action-cockpit.ts`
- Create: `__tests__/dashboard-action-cockpit.test.ts`

**Step 1: Write failing tests**

Cover urgency ordering (`expired`, `immediate-notice`, `urgent`, `warning`), nearest deadline tie-breaking, exclusion of on-track Cases, and a maximum of three results.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/dashboard-action-cockpit.test.ts`
Expected: FAIL because the selector module does not exist.

**Step 3: Write minimal implementation**

Export `selectDashboardPriorityCases(cases, limit = 3)` using only the existing `ComplianceCaseViewModel` fields and immutable sorting.

**Step 4: Run test to verify pass**

Run: `npm run test -- __tests__/dashboard-action-cockpit.test.ts`
Expected: PASS.

### Task 2: Render the cockpit and localized Cases handoffs

**Objective:** Show target users the urgent legal queue before the protocol wizard with direct links to act.

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `locales/index.ts`
- Modify: `__tests__/dashboard-linked-case-retry.test.tsx`
- Modify: `__tests__/locales.test.ts`

**Step 1: Write failing UI test**

Load urgent, expired, warning, and on-track Cases. Assert the cockpit names only the three highest-priority Cases, shows their existing localized status/next-action/countdown context, and links each to `/dashboard/cases?q=<project>&status=triage` only where triage semantics apply.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/dashboard-linked-case-retry.test.tsx -t "priority action cockpit"`
Expected: FAIL because the cockpit is absent.

**Step 3: Write minimal implementation**

Derive Case view models from the already loaded rows, select the top three, render a localized dashboard region before the wizard, preserve native `Link` semantics, and add DE/FR/IT/EN translation parity. Do not change the Cases query, wizard, protocol finalization, deadlines, notice drafts, evidence, reminders, schema, or persistence.

**Step 4: Run focused tests**

Run: `npm run test -- __tests__/dashboard-action-cockpit.test.ts __tests__/dashboard-linked-case-retry.test.tsx __tests__/locales.test.ts`
Expected: PASS.

### Task 3: Review and validate

**Objective:** Prove the bounded slice is product-meaningful, spec-compliant, and regression-safe.

**Files:**
- Review all changed implementation/test/artifact files.

**Step 1: Spec review**

Verify the dashboard displays only actionable owner Cases, ranking is deterministic, links use existing Cases URL contracts, and no excluded surface changed.

**Step 2: Quality review**

Check legal-status semantics, accessibility, native link behavior, empty/loading/error behavior, localization, test quality, and stale data behavior.

**Step 3: Required validation**

Run:
- `npm run test`
- `npm run lint`
- `npm run build`
- `git diff --check`

Expected: all pass before commit or successful completion.
