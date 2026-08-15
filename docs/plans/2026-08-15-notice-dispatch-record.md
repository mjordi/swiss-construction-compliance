# Immutable Notice Dispatch Record Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Let an owner record and retrieve the factual dispatch of an exact immutable notice draft without claiming delivery or receipt.

**Architecture:** Add an append-only owner-scoped dispatch table whose database constraints bind user, Case, and saved draft. Keep normalization and display derivation in a small domain helper, then integrate the latest dispatch into the existing Case notice, timeline, chronology CSV, and audit dossier contracts. Reuse existing page load/mutation and test-double conventions; do not add delivery providers or team authorization.

**Tech Stack:** Next.js/React/TypeScript, Supabase/PostgreSQL RLS, Vitest/Testing Library, React PDF, existing locale dictionary.

---

### Task 1: Define the append-only dispatch persistence contract

**Objective:** Persist source-bound factual dispatch events safely.

**Files:**
- Create: `supabase/migrations/20260815000000_case_notice_dispatches.sql`
- Modify: `lib/database.types.ts`
- Test: `__tests__/case-notice-dispatch-migration.test.ts`

**Steps:**
1. Write a failing migration contract test covering UUID IDs, owner/Case/draft foreign keys, dispatch timestamp, bounded channel/reference fields, RLS, insert/select-only policies, and prevention of cross-owner or cross-Case draft binding.
2. Run `npm run test -- __tests__/case-notice-dispatch-migration.test.ts`; expect failure because the migration is absent.
3. Add the migration and TypeScript row type. Use database constraints/triggers consistent with existing immutable notice/protocol records; do not permit update/delete.
4. Rerun the focused test; expect pass.

### Task 2: Normalize dispatch inputs and derive display facts

**Objective:** Centralize supported channels, timestamps, optional references, and latest-record selection.

**Files:**
- Create: `lib/case-notice-dispatch.ts`
- Test: `__tests__/case-notice-dispatch.test.ts`

**Steps:**
1. Write failing tests for supported channels, trimmed references, blank reference normalization, invalid/future timestamps, malformed records, and deterministic latest selection.
2. Run the focused test; expect failure because the helper is absent.
3. Implement the minimal typed helper and stable translation-key mapping. Do not call browser APIs or Supabase from the helper.
4. Rerun the focused test; expect pass.

### Task 3: Record dispatch from the Case notice workflow

**Objective:** Let an owner record dispatch against the exact latest saved revision with race-safe feedback.

**Files:**
- Modify: `app/dashboard/cases/page.tsx`
- Modify: `locales/index.ts`
- Modify if required by method-surface changes: `lib/supabase.ts`
- Test: `__tests__/cases-notice-dispatch.test.tsx`
- Test: `__tests__/locales.test.ts`

**Steps:**
1. Add failing tests proving no action is offered without a saved draft; the exact latest draft ID/Case/user are inserted; channel/time/reference are shown; duplicate/conflicting row actions are locked while pending; returned and thrown errors do not report dispatch; and stale account/request completions are ignored.
2. Run the focused UI and locale tests; expect the new behavior to fail.
3. Extend the owner-scoped load to fetch dispatches and add a narrow dispatch form beside the saved notice revision. Capture a submitted snapshot, guard duplicate submits synchronously, disable conflicting row actions while pending, and use precise copy: “dispatch recorded,” not “delivered.”
4. Update DE/FR/IT/EN keys with parity.
5. Rerun focused tests; expect pass.

### Task 4: Include dispatch in readiness and audit outputs

**Objective:** Make the factual dispatch event retrievable wherever Case audit history is exported.

**Files:**
- Modify: `lib/case-timeline.ts`
- Modify: `lib/case-audit-dossier.ts`
- Modify: `components/dashboard/CaseAuditDossierPDF.tsx`
- Modify: `app/dashboard/cases/page.tsx`
- Test: `__tests__/case-timeline.test.ts`
- Test: `__tests__/case-audit-dossier.test.ts`
- Test: `__tests__/case-audit-dossier-pdf.test.tsx`
- Test: `__tests__/cases-notice-dispatch.test.tsx`

**Steps:**
1. Add failing tests for deterministic `notice-dispatched` timeline ordering, chronology CSV source/revision facts, dossier data/PDF rendering, and scan/readiness display.
2. Run the focused suites; expect failures.
3. Extend existing timeline/dossier contracts with factual dispatch fields and localized channel labels. Preserve current callers with optional/default parameters where practical.
4. Rerun focused suites; expect pass.

### Task 5: Review and validate the complete slice

**Objective:** Prove the approved user outcome and repository quality gates.

**Files:** All files above plus today’s proposal/decision artifacts.

**Steps:**
1. Review spec compliance: exact saved revision, append-only owner scope, dispatch-not-delivery wording, no out-of-scope provider/reviewer work.
2. Review code quality: authorization constraints, async stale completion/locks, timezone handling, stable mocks, no sparse/default-state regressions.
3. Run all relevant focused suites together; if parallel flake appears, rerun focused and then normal suite before changing unrelated code.
4. Run required gates exactly: `npm run test`, `npm run lint`, `npm run build`. All must pass before completion.
5. Update the decision artifact with final implementation/validation/PR state, commit on `pipeline/2026-08-15-notice-dispatch-record`, push, and open a PR.
