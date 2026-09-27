# Shared Work Queue Acceptance Milestones Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Surface imminent two-year warranty and five-year limitation milestones in the governed Compliance Work Queue for owners and authorized read-only collaborators.

**Architecture:** Extend the existing snapshot RPC with the already-stored `acceptance_date`, then reuse `buildCaseDeadlinePortfolio` inside the queue domain adapter to select the nearest acceptance milestone within 30 days. Keep authorization, legal date arithmetic, sharing, and mutations unchanged; the page only renders the new read-only row contract.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase SQL migrations, Vitest, Testing Library, localized copy in `locales/index.ts`.

---

### Task 1: Extend the narrow shared snapshot

**Objective:** Make `acceptance_date` available through the existing authorized Work Queue RPC without widening access to unrelated Case data.

**Files:**
- Create: `supabase/migrations/20260923000000_compliance_work_queue_acceptance_milestones.sql`
- Create: `__tests__/compliance-work-queue-acceptance-migration.test.ts`

**Step 1: Write failing migration-contract tests**

Assert that the new migration:
- replaces `public.get_compliance_work_queue_snapshot(target_owner_id uuid default auth.uid())`
- retains `security definer`, empty `search_path`, owner-or-active-collaborator authorization, active/review filtering, and authenticated-only execute permissions
- projects `acceptance_date` with existing queue-required fields
- still excludes signature, notice-recipient, defect-statement, and unrelated protocol fields

**Step 2: Run the test to verify failure**

Run: `npm run test -- __tests__/compliance-work-queue-acceptance-migration.test.ts`
Expected: FAIL because the migration does not exist.

**Step 3: Add the forward-only migration**

Copy the current snapshot function's authorization and projections exactly, adding only `'acceptance_date', c.acceptance_date` to each Case JSON object. Reapply revoke/grant statements for the replaced function.

**Step 4: Run the test to verify pass**

Run: `npm run test -- __tests__/compliance-work-queue-acceptance-migration.test.ts`
Expected: PASS.

### Task 2: Derive and prioritize imminent acceptance milestones

**Objective:** Extend the queue domain contract using the existing deadline portfolio calculation.

**Files:**
- Modify: `lib/compliance-work-queue.ts`
- Modify: `__tests__/compliance-work-queue.test.ts`

**Step 1: Write failing domain tests**

Add cases proving:
- a complete active Case with a two-year or five-year acceptance milestone in 0–14 days appears as `urgent`
- 15–30 days appears as `warning`
- more than 30 days does not keep an otherwise complete on-track Case in the queue
- the nearest acceptance milestone is selected and exposes kind, `deadlineDay`, and `daysRemaining`
- expired and immediate-notice work sort before acceptance urgency
- malformed/non-string acceptance data is rejected as malformed snapshot input, while `null` remains valid
- inputs remain immutable and existing notice/readiness behavior remains unchanged

**Step 2: Run tests to verify failure**

Run: `npm run test -- __tests__/compliance-work-queue.test.ts`
Expected: FAIL on the new milestone expectations.

**Step 3: Implement the minimal domain extension**

- Add an optional `acceptanceMilestone` row field with kind `warranty-2y | limitation-5y`, `deadlineDay`, and `daysRemaining`.
- Validate `acceptance_date` as `null` or a non-empty string.
- Call `buildCaseDeadlinePortfolio` once for valid Cases and map the nearest acceptance milestone per Case.
- Calculate days from UTC calendar-day values; include only `0 <= daysRemaining <= 30`.
- Resolve priority by preserving `expired` and `immediate-notice` first, then the most urgent of notice status and acceptance threshold, then lifecycle/readiness.
- Keep otherwise complete on-track Cases only when an imminent acceptance milestone exists.
- Sort equal-priority rows by the relevant earliest legal date, then existing stable tie-breakers.

**Step 4: Run tests to verify pass**

Run: `npm run test -- __tests__/compliance-work-queue.test.ts __tests__/case-deadline-portfolio.test.ts`
Expected: PASS.

### Task 3: Render localized milestone context for owners and collaborators

**Objective:** Make the new legal signal visible and explainable in the Work Queue without changing navigation or sharing authority.

**Files:**
- Modify: `app/dashboard/work/page.tsx`
- Modify: `locales/index.ts`
- Modify: `__tests__/compliance-work-queue-page.test.tsx`
- Modify: `__tests__/locales.test.ts` only if required by established locale parity coverage

**Step 1: Write failing UI tests**

Add owner and shared-view tests proving:
- milestone type, fixed date, countdown, and acceptance-specific next action render
- an otherwise ready Case remains visible because of the milestone
- the shared view renders the same milestone facts but no Case link
- page copy does not claim active monitoring, notification delivery, assignment, or legal advice

**Step 2: Run tests to verify failure**

Run: `npm run test -- __tests__/compliance-work-queue-page.test.tsx __tests__/locales.test.ts`
Expected: FAIL because milestone copy/UI is absent.

**Step 3: Implement the minimal UI and copy**

- Add translation keys for milestone labels, acceptance milestone field labels, countdown forms, and the acceptance-specific review action in every locale.
- When `row.acceptanceMilestone` exists, render its localized type, `deadlineDay`, countdown, and acceptance-specific action; otherwise retain the current notice next-action/countdown display.
- Preserve owner-only native Case links and current read-only collaborator behavior.
- Keep the boundary text truthful: point-in-time derived guidance, not monitoring or legal advice.

**Step 4: Run focused tests to verify pass**

Run: `npm run test -- __tests__/compliance-work-queue-page.test.tsx __tests__/compliance-work-queue.test.ts __tests__/compliance-work-queue-acceptance-migration.test.ts __tests__/locales.test.ts`
Expected: PASS.

### Task 4: Validate and commit

**Objective:** Prove the slice is reviewable and does not regress the product.

**Files:**
- Modify: `scripts/baucompliance-pipeline/decisions/2026-09-23.md` with the verified outcome

**Step 1: Run required validation**

Run:
- `npm run test`
- `npm run lint`
- `npm run build`
- `git diff --check`

Expected: all pass. Any failing required command makes the run incomplete.

**Step 2: Product and scope review**

Verify the implementation gives owners/collaborators a visible imminent acceptance milestone in the Work Queue, uses existing deadline arithmetic, and does not add writes, notifications, assignments, or broadened data exposure.

**Step 3: Commit**

Stage only the approved product changes, today's proposal/decision artifacts, and this plan. Commit with a conventional message such as `feat: surface acceptance milestones in work queue`.
