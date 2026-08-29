# Exact Case Handoffs Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make every existing cross-workflow action that already knows a Case ID open that exact owner-scoped Case through a canonical URL contract.

**Architecture:** Add one pure href/parser module, consume `case=` independently from existing list filters on the Cases page, and migrate existing producers to the shared builder. The existing owner-scoped Cases query remains the authorization boundary; unavailable IDs use one generic recovery state so record existence is not disclosed.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, React Testing Library, existing locale dictionary.

---

### Task 1: Add the canonical exact-Case URL contract

**Objective:** Provide a small pure module that normalizes a non-empty Case ID and builds an encoded Cases href.

**Files:**
- Create: `lib/case-handoff.ts`
- Create: `__tests__/case-handoff.test.ts`

**Step 1: Write failing tests**

Cover trimming/encoding, empty IDs falling back to `/dashboard/cases`, parsing a non-empty `case` value, and parsing empty/missing values as `null`.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/case-handoff.test.ts`
Expected: FAIL because `@/lib/case-handoff` does not exist.

**Step 3: Write minimal implementation**

Export `parseCaseHandoffId(value: string | null): string | null` and `buildCaseHandoffHref(caseId: string): string`. Use `URLSearchParams`; do not concatenate unescaped IDs or add project-name/status semantics.

**Step 4: Run test to verify pass**

Run: `npm run test -- __tests__/case-handoff.test.ts`
Expected: PASS.

### Task 2: Consume exact Case identity on the Cases page

**Objective:** Let `case=` select exactly one owner-loaded Case independently from list filters and present a generic recovery state when unavailable.

**Files:**
- Modify: `app/dashboard/cases/page.tsx`
- Modify: `locales/index.ts`
- Modify: `__tests__/cases-url-sync.test.tsx`
- Modify: `__tests__/locales.test.ts`

**Step 1: Write failing tests**

Add focused tests proving: a valid `case=` displays only that Case despite conflicting `q`/status filters; an unknown ID does not display unrelated Cases and renders generic recovery feedback; clearing the handoff returns to `/dashboard/cases` while preserving unrelated/filter params intentionally; existing URL normalization does not remove valid `case=` or loop.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/cases-url-sync.test.tsx __tests__/locales.test.ts`
Expected: FAIL because exact handoff behavior and locale keys are absent.

**Step 3: Write minimal implementation**

Parse the requested ID from `searchParamString`. Derive `visibleCases` as the one matching owner-loaded timeline row when a handoff exists; otherwise retain existing filtering. Render one generic localized alert/recovery link when loading has completed and no owned match exists. Do not issue an unscoped lookup, distinguish foreign/missing/deleted IDs, reset list filters, or mutate Case state. Keep navigation mocks and hook dependencies referentially stable.

**Step 4: Run test to verify pass**

Run: `npm run test -- __tests__/cases-url-sync.test.tsx __tests__/locales.test.ts`
Expected: PASS.

### Task 3: Migrate existing Case-aware handoff producers

**Objective:** Use stable Case identity on every selected source surface that already has a Case ID.

**Files:**
- Modify: `lib/compliance-work-queue.ts`
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/vault/page.tsx`
- Modify: `app/dashboard/deadlines/page.tsx`
- Modify: `app/dashboard/protocols/page.tsx`
- Modify focused tests under `__tests__/compliance-work-queue*.test.*`, `__tests__/dashboard-*.test.*`, `__tests__/vault-*.test.*`, `__tests__/deadlines-portfolio.test.tsx`, and `__tests__/protocol-register-page.test.tsx` only where contracts change.

**Step 1: Write failing tests**

Assert generated actions use `/dashboard/cases?case=<encoded-id>` rather than project-name search. Assert Protocol Register only links non-null `case_id` rows and standalone protocols remain non-links. Retain native `Link` semantics.

**Step 2: Run focused tests to verify failure**

Run the exact touched test files together with `npm run test -- <files>`.
Expected: FAIL on old project-search hrefs or missing links.

**Step 3: Write minimal implementation**

Import `buildCaseHandoffHref` at producers and pass the source Case ID. Do not redesign cards, add persistence, change filters, or modify protocol/deadline math. Keep `buildVaultProjectCasesHref` for genuinely project-scoped use where no Case ID exists.

**Step 4: Run focused tests to verify pass**

Run the same grouped focused command.
Expected: PASS.

### Task 4: Integration verification

**Objective:** Prove the coherent slice is reviewable and regression-safe.

**Files:** No additional files unless review finds a concrete defect.

**Step 1: Run focused integration set**

Run all touched tests together. Expected: PASS.

**Step 2: Run required validation**

Run: `npm run test`
Run: `npm run lint`
Run: `npm run build`
Expected: all PASS. If a command fails, isolate/rerun only to distinguish a confirmed flake; do not report completion while required validation remains failing.

**Step 3: Product review**

Verify duplicate project names cannot make a generated handoff ambiguous, owner scoping remains unchanged, unavailable IDs do not disclose record existence, and the final diff contains no assignment/collaboration/persistence scope.

**Step 4: Commit**

Stage only the approved code/tests, this plan, and today’s proposal/decision artifacts. Commit with: `feat: add exact case handoffs`.
