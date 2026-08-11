# Source-bound Notice Draft PDF Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Let a user download the exact latest saved defect-notice draft revision as a localized, truthful PDF review artifact.

**Architecture:** Add a pure adapter in `lib/case-notice-draft-report.ts` that converts one immutable `CaseNoticeDraft` into a render-ready localized report without reading live Case state. Render it through a dedicated multi-page React-PDF component, then wire a guarded per-Case client-side download action into the existing saved-revision section. Reuse existing request-token, object-URL, timer, and row-lock patterns.

**Tech Stack:** Next.js 16, React 19, TypeScript, `@react-pdf/renderer`, Vitest, React Testing Library, existing DE/FR/IT/EN translation contract.

---

### Task 1: Define and test the immutable report contract

**Objective:** Convert exactly one persisted revision snapshot into a localized report model with no live Case or legal-math dependency.

**Files:**
- Create: `lib/case-notice-draft-report.ts`
- Create: `__tests__/case-notice-draft-report.test.ts`

**Step 1: Write failing tests**

Test that the adapter preserves exact user-entered strings, revision ID, server timestamp, stored dates/deadline/null, and regime; accepts localized labels; and builds `baucompliance-notice-draft-{draftId}.pdf` without project/recipient PII. Mutate an unrelated live Case fixture afterward and prove the report stays unchanged.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/case-notice-draft-report.test.ts`
Expected: FAIL because the report module does not exist.

**Step 3: Write minimal implementation**

Export a `CaseNoticeDraftReport` type, label type, `buildCaseNoticeDraftReport(draft, labels)` pure adapter, and deterministic filename helper. Copy primitive snapshot fields only; do not translate or normalize user facts and do not calculate a deadline.

**Step 4: Run test to verify pass**

Run: `npm run test -- __tests__/case-notice-draft-report.test.ts`
Expected: PASS.

### Task 2: Render a truthful multi-page PDF

**Objective:** Render the report contract as an A4 artifact that remains unmistakably a saved, non-approved, non-sent draft.

**Files:**
- Create: `components/dashboard/CaseNoticeDraftPDF.tsx`
- Create: `__tests__/case-notice-draft-pdf.test.tsx`

**Step 1: Write failing component tests**

Collect rendered React text and assert revision identity, server time, source facts, stored legal context, line breaks/long defect content, explicit draft status, and legal-review disclaimer are present. Assert approval, signature, finality, delivery, and certification claims are absent.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/case-notice-draft-pdf.test.tsx`
Expected: FAIL because the PDF component does not exist.

**Step 3: Write minimal implementation**

Create a dedicated `Document`/A4 `Page` component using wrapping text and a repeated status/footer. Render labels and factual values from the report only. Do not build domain state inline in the component.

**Step 4: Run test to verify pass**

Run: `npm run test -- __tests__/case-notice-draft-pdf.test.tsx`
Expected: PASS.

### Task 3: Add localized guarded download behavior

**Objective:** Download only the clicked latest saved revision with PII-safe naming and reliable per-Case feedback/lock lifecycle.

**Files:**
- Modify: `app/dashboard/cases/page.tsx`
- Modify: `locales/index.ts`
- Test: `__tests__/cases-inline-edit.test.tsx`
- Test: `__tests__/locales.test.ts`

**Step 1: Write failing UI and locale tests**

Test that the latest saved section has a localized download action; clicking it passes the exact saved revision into the report/PDF path, uses `baucompliance-notice-draft-{draftId}.pdf`, and never reads later edited live Case values. Add controlled promises for duplicate suppression, disabled same-row sibling actions, success/error retry, and stale completion after user/revision change. Add DE/FR/IT/EN parity assertions.

**Step 2: Run tests to verify failure**

Run: `npm run test -- __tests__/cases-inline-edit.test.tsx __tests__/locales.test.ts`
Expected: FAIL because the download action/copy does not exist.

**Step 3: Write minimal implementation**

Import the adapter/PDF component. Add per-Case generation state, synchronous in-flight set, request IDs, mounted/current-user checks, object-URL cleanup, and temporary localized feedback. Capture `latestNoticeDraft.id` and the complete draft object at click time. Scope lockout to the affected Case. Add no persistence/checklist mutation.

**Step 4: Run focused regression set**

Run: `npm run test -- __tests__/case-notice-draft-report.test.ts __tests__/case-notice-draft-pdf.test.tsx __tests__/cases-inline-edit.test.tsx __tests__/locales.test.ts`
Expected: PASS.

### Task 4: Review and required validation

**Objective:** Prove the slice is spec-compliant, safe, and merge-ready.

**Files:**
- Review all changed implementation, tests, translations, and pipeline artifacts.

**Step 1: Spec review**

Verify exact snapshot-only export, status truth, PII-safe filename, stale guards, locale parity, and all excluded persistence/legal/delivery surfaces.

**Step 2: Code-quality review**

Review multi-page wrapping, source fidelity, request/timer/object-URL cleanup, scoped row lockout, mock contracts, and tests for duplicate/failure/stale completion.

**Step 3: Required validation**

Run: `npm run test`
Expected: all tests pass.

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: successful Next.js production build.

Run: `git diff --check`
Expected: no whitespace errors.

**Step 4: Commit**

Stage only the approved implementation, tests, plan, and 2026-08-11 proposal/decision artifacts. Commit with `feat: export saved notice draft revisions`.
