# Saved Case Acceptance Milestones Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Persist an optional Case acceptance date and include its upcoming two-year SIA and five-year OR milestones in the saved Case deadline portfolio and ICS export.

**Architecture:** Treat acceptance as an explicit nullable Case source fact. Keep deadline derivation pure in `lib/case-deadline-portfolio.ts`, emit typed milestone rows, and let the deadlines page localize/render/export those rows. Preserve current notice-deadline rules and all existing async ownership/staleness guards.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/PostgreSQL migrations, Vitest/Testing Library.

---

### Task 1: Persist the explicit Case acceptance source fact

**Objective:** Add nullable acceptance-date storage plus optional create/edit controls without changing notice-date validity rules.

**Files:**
- Create: `supabase/migrations/20260901000000_case_acceptance_date.sql`
- Modify: `lib/database.types.ts`
- Modify: `app/dashboard/cases/page.tsx`
- Test: `__tests__/case-acceptance-date-migration.test.ts`
- Test: `__tests__/cases-inline-edit.test.tsx`
- Test: `__tests__/cases-mutation-feedback.test.tsx`

**Steps:**
1. Write failing migration/type and focused form-persistence tests proving: `acceptance_date date` is nullable; blank create/edit persists `null`; entered values persist exactly; edit hydration displays the stored date; the field remains locked during existing pending mutations.
2. Run the focused tests and verify they fail because the field/schema contract is absent.
3. Add the idempotent migration, nullable `Case.acceptance_date`, `acceptanceDate` form state, labeled optional date inputs, and explicit create/update payloads.
4. Run the focused tests and verify they pass.

### Task 2: Derive typed portfolio milestones and distinct ICS events

**Objective:** Extend the pure portfolio model with notice, two-year SIA, and five-year OR milestone kinds while preserving deterministic eligibility and sorting.

**Files:**
- Modify: `lib/case-deadline-portfolio.ts`
- Test: `__tests__/case-deadline-portfolio.test.ts`

**Steps:**
1. Write failing tests for nullable acceptance, exact UTC calendar arithmetic via the existing `addYears`, future-only inclusion (including due today), deterministic deadline/project/Case/kind ordering, typed labels, and distinct stable UIDs for same-Case milestones.
2. Run the focused test and verify failure.
3. Add `acceptance_date`, a milestone kind union, optional source context, and row expansion. Use existing legal helpers; do not alter notice calculations. Include milestone kind in stable UID.
4. Generalize calendar copy so each kind gets a localized deadline label/summary while source descriptions truthfully include acceptance only where present.
5. Run the focused test and verify pass.

### Task 3: Integrate typed milestones into the deadline portfolio UI and localization

**Objective:** Load acceptance dates, show milestone types, and export localized multi-kind portfolio events.

**Files:**
- Modify: `app/dashboard/deadlines/page.tsx`
- Modify: `locales/index.ts`
- Test: `__tests__/deadlines-portfolio.test.tsx`
- Test: `__tests__/locales.test.ts`

**Steps:**
1. Write failing page tests proving the Case query selects `acceptance_date`, a Case can render multiple labeled milestone rows, old/archived/expired eligibility remains correct, and export receives localized per-kind copy.
2. Run the focused tests and verify failure.
3. Update the owner-scoped query, row keys/rendering, calendar copy, and DE/FR/IT/EN strings. Keep the existing point-in-time/no-active-monitoring guidance and export staleness/duplicate guards.
4. Run the focused integration and locale tests and verify pass.
5. Run `git diff --check` and inspect scope against the PM guardrails.

### Final validation

Run exactly:
- `npm run test`
- `npm run lint`
- `npm run build`
- `git diff --check`

Expected: all commands pass before commit/PR creation.
