# Source-Bound Defect-Notice Preview Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a localized, read-only Case notice preview that exposes only persisted source facts and existing date context, and clearly communicates draft/not-sent/review-required status.

**Architecture:** Keep the slice inside the existing Cases page and locale contract. Use a small per-Case disclosure state or semantic disclosure control, gate preview availability from the same persisted three-field completeness contract already used by the source-basis review, and render only existing Case/view-model values. Extend the established Cases RTL test to prove incomplete gating and exact complete-source rendering; extend locale coverage through the existing locale-key parity suite.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Vitest, React Testing Library, repository `useLanguage()` translations.

---

### Task 1: Specify complete and incomplete preview behavior

**Objective:** Add failing regression coverage that defines source completeness, disclosure behavior, exact source rendering, and safety copy.

**Files:**
- Modify: `__tests__/cases-inline-edit.test.tsx`

**Step 1: Write failing tests**

Extend the existing complete/incomplete source-basis test or add a focused test that:

```tsx
const completeCard = (await screen.findByText("Alpine Tower")).closest("article") as HTMLElement;
const incompleteCard = screen.getByText("Riverside Hall").closest("article") as HTMLElement;

expect(within(incompleteCard).getByRole("button", { name: "cases-notice-preview-open" })).toBeDisabled();
fireEvent.click(within(completeCard).getByRole("button", { name: "cases-notice-preview-open" }));

const preview = within(completeCard).getByTestId("cases-notice-preview-case-1");
expect(within(preview).getByText("Alpine Build AG")).toBeTruthy();
expect(within(preview).getByText("Werkstrasse 4\n8000 Zürich")).toBeTruthy();
expect(within(preview).getByText("Water ingress at the north facade.")).toBeTruthy();
expect(within(preview).getByText("Alpine Tower")).toBeTruthy();
expect(within(preview).getByText("2026-03-01")).toBeTruthy();
expect(within(preview).getByText("2026-03-21")).toBeTruthy();
expect(within(preview).getByText("2026-05-20")).toBeTruthy();
expect(within(preview).getByText("cases-notice-preview-safety")).toBeTruthy();
```

Use scoped/duplicate-safe queries where the same persisted value already exists in the source-basis section.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/cases-inline-edit.test.tsx -t 'notice preview'`

Expected: FAIL because the preview control and section do not exist.

**Step 3: Commit**

Do not commit the red test separately in this unattended run; continue immediately to the minimal implementation, then commit the complete reviewed slice.

---

### Task 2: Implement the localized, source-bound preview

**Objective:** Make the focused regression pass without introducing artifact generation, persistence, or delivery.

**Files:**
- Modify: `app/dashboard/cases/page.tsx`
- Modify: `locales/index.ts`
- Test: `__tests__/cases-inline-edit.test.tsx`

**Step 1: Add locale keys in all four locale dictionaries**

Add equivalent DE/FR/IT/EN keys for:

```ts
"cases-notice-preview-open"
"cases-notice-preview-unavailable"
"cases-notice-preview-title"
"cases-notice-preview-status"
"cases-notice-preview-safety"
"cases-notice-preview-subject"
"cases-notice-preview-context"
"cases-notice-preview-deadline"
```

Copy must unambiguously state that the preview is a draft, has not been sent, requires review, and does not itself complete the notice workflow.

**Step 2: Add the minimal UI**

Near the existing `cases-notice-source-*` section:

- Derive availability from persisted `notice_recipient_name`, `notice_recipient_address`, and `defect_statement`, not edit-form state.
- Render a labeled preview action disabled for incomplete source facts, with localized unavailable guidance.
- On activation, reveal `data-testid={`cases-notice-preview-${item.id}`}`.
- Render only the persisted recipient/address/defect facts and existing `item.projectName`, `item.canton`, `item.contractDateLabel`, `item.discoveryDateLabel`, and `item.noticeDeadlineLabel`.
- Preserve multiline address/defect formatting.
- Show prominent localized draft/not-sent/review-required status and safety text.
- Do not add mutation, export, PDF, clipboard, send, approval, signature, or new date/legal calculations.

A minimal semantic shape is:

```tsx
<button type="button" disabled={!hasCompleteNoticeSource} aria-expanded={isPreviewOpen}>
  {t("cases-notice-preview-open")}
</button>
{isPreviewOpen && hasCompleteNoticeSource && (
  <section data-testid={`cases-notice-preview-${item.id}`}>
    <h3>{t("cases-notice-preview-title")}</h3>
    <p>{t("cases-notice-preview-status")}</p>
    {/* persisted source facts + existing view-model labels only */}
    <p>{t("cases-notice-preview-safety")}</p>
  </section>
)}
```

Use per-Case state so opening one preview does not expose unrelated Cases.

**Step 3: Run focused tests**

Run: `npm run test -- __tests__/cases-inline-edit.test.tsx __tests__/locales.test.ts`

Expected: PASS.

**Step 4: Run adjacent Cases tests**

Run: `npm run test -- __tests__/cases-*.test.tsx __tests__/cases-checklist.test.ts`

Expected: PASS. If the shell does not expand this pattern as intended, run the explicit relevant files or rely on the required full suite.

**Step 5: Commit**

After review and full required validation:

```bash
git add app/dashboard/cases/page.tsx locales/index.ts __tests__/cases-inline-edit.test.tsx scripts/baucompliance-pipeline/proposals/2026-08-08.md scripts/baucompliance-pipeline/decisions/2026-08-08.md docs/plans/2026-08-08-source-bound-notice-preview.md
git commit -m "feat: preview source-bound defect notices"
```

---

### Task 3: Review and validate the complete slice

**Objective:** Prove the implementation is source-bound, reviewable, and repository-safe.

**Files:**
- Review all modified files from Tasks 1–2.

**Step 1: Spec-compliance review**

Verify complete-source gating, persisted-only facts, existing date labels, per-Case disclosure, localized safety copy, and all explicit exclusions.

**Step 2: Code-quality review**

Check accessible button/disclosure semantics, duplicate text-query stability, multiline rendering, no durable translated strings in state, and no changes to mutation/checklist/evidence/protocol behavior.

**Step 3: Required validation**

Run exactly:

```bash
npm run test
npm run lint
npm run build
git diff --check
```

Expected: all pass. Do not treat the run as complete if any required command fails.
