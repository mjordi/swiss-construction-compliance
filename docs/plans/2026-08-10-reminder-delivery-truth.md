# Reminder Delivery Truth and Activation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make every existing reminder surface truthful about delivery and tell users that downloaded `.ics` files must be imported to activate reminders.

**Architecture:** Keep the existing local ICS generation and async feedback machinery unchanged. Correct the pure Case timeline readiness model, then add a shared translation contract consumed by Cases and both calculator surfaces. Validate behavior through domain and rendered UI tests before full repository gates.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, React Testing Library, localized translation dictionaries.

---

### Task 1: Lock the reminder-delivery contract with failing tests

**Objective:** Prove current behavior is misleading before changing production code.

**Files:**
- Modify: `__tests__/case-timeline.test.ts`
- Modify: `__tests__/cases-checklist-persistence.test.tsx`
- Modify: `__tests__/deadlines-share-link.test.tsx`
- Modify: `__tests__/ruegefrist-calculator.test.tsx`
- Modify: `__tests__/locales.test.ts`

**Steps:**
1. Assert old- and new-law Case view models set `emailReminderPlanned` to false.
2. Assert the expanded Case reminder status and both calculator preset/export areas explain calendar import activation and absence of email/in-app delivery.
3. Assert successful dashboard/public `.ics` downloads tell the user to import the file.
4. Run `npx vitest run __tests__/case-timeline.test.ts __tests__/cases-checklist-persistence.test.tsx __tests__/deadlines-share-link.test.tsx __tests__/ruegefrist-calculator.test.tsx __tests__/locales.test.ts --maxWorkers=1`.
5. Expected: FAIL on the new truth/activation assertions before production changes.

### Task 2: Implement the minimal truthful reminder contract

**Objective:** Satisfy the focused tests without changing deadline or export behavior.

**Files:**
- Modify: `lib/case-timeline.ts`
- Modify: `app/dashboard/cases/page.tsx`
- Modify: `app/dashboard/deadlines/page.tsx`
- Modify: `components/ruegefrist-calculator.tsx`
- Modify: `locales/index.ts`

**Steps:**
1. Set Case email reminder readiness false for both legal regimes.
2. Add one DE/FR/IT/EN guidance key stating that offsets are embedded in `.ics`, calendar import activates them, and BauCompliance sends no email/in-app reminder.
3. Render that guidance at Case and both calculator reminder/export surfaces.
4. Update existing localized success strings to include the import action; retain existing request/version guards and timeouts.
5. Run the focused command from Task 1. Expected: PASS.
6. Run `git diff --check`. Expected: PASS.

### Task 3: Review and validate the integrated slice

**Objective:** Confirm spec compliance, product meaning, code quality, and repository health.

**Files:** All files changed in Tasks 1–2.

**Steps:**
1. Spec review: verify all three existing reminder workflows are covered and excluded scheduling/math/persistence/notice surfaces remain unchanged.
2. Quality review: inspect i18n parity, accessibility placement, stale async feedback guards, and test stability.
3. Run `npm run test`. Expected: PASS.
4. Run `npm run lint`. Expected: PASS.
5. Run `npm run build`. Expected: PASS.
6. Commit only after every required command passes.
