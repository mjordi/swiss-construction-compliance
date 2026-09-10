# Vault-to-Case Project Creation Handoff Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make every Vault project-creation CTA open and focus the existing Case creation form while preserving unrelated URL state.

**Architecture:** Keep Vault links declarative through the existing `buildVaultCreateProjectHref()` helper. Treat `create=1` as a one-time Cases handoff in the existing URL normalization effect, consume only that owned parameter, and reuse the existing create form rather than adding a new workflow or state model.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, React Testing Library.

---

### Task 1: Point all Vault creation links at the Case handoff

**Objective:** Change the shared helper so populated and empty Vault CTAs use the real Case-backed project creation route.

**Files:**
- Modify: `lib/vault.ts:30-32`
- Test: `__tests__/vault.test.ts`
- Test: `__tests__/vault-create-project-links.test.tsx`
- Test: `__tests__/vault-empty-create-project.test.tsx`

**Step 1: Write failing tests**

Add a helper assertion:

```ts
expect(buildVaultCreateProjectHref()).toBe("/dashboard/cases?create=1");
```

Update both Vault component tests to require the same href for every visible create-project link.

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run __tests__/vault.test.ts __tests__/vault-create-project-links.test.tsx __tests__/vault-empty-create-project.test.tsx
```

Expected: FAIL because the helper still returns `/dashboard`.

**Step 3: Write minimal implementation**

Change only the helper return value:

```ts
export function buildVaultCreateProjectHref(): string {
  return "/dashboard/cases?create=1";
}
```

**Step 4: Run tests to verify pass**

Run the same Vitest command. Expected: all selected tests pass.

**Step 5: Commit**

```bash
git add lib/vault.ts __tests__/vault.test.ts __tests__/vault-create-project-links.test.tsx __tests__/vault-empty-create-project.test.tsx
git commit -m "fix: route Vault project creation to Cases"
```

### Task 2: Consume the create handoff in Cases

**Objective:** Open and focus the existing Case form for `create=1`, clean the URL, and preserve every sibling parameter without resetting user input.

**Files:**
- Modify: `app/dashboard/cases/page.tsx:990-1049,2797-2799`
- Test: `__tests__/cases-url-sync.test.tsx`

**Step 1: Write failing tests**

Add focused RTL cases that prove:

```ts
currentSearch = "create=1&q=Riverside+Bridge&status=triage&from=vault";
// form opens, project field is focused, and replace preserves siblings
expect(screen.getByLabelText("cases-project-name")).toBe(document.activeElement);
expect(replaceMock).toHaveBeenCalledWith(
  "/dashboard/cases?q=Riverside+Bridge&status=triage&from=vault",
  { scroll: false }
);
```

Also prove `create=yes` is removed without opening the form, and prove an externally introduced `create=1` handoff after initial render opens the form once without a replace loop.

**Step 2: Run tests to verify failure**

Run:

```bash
npx vitest run __tests__/cases-url-sync.test.tsx
```

Expected: FAIL because Cases does not yet consume `create`.

**Step 3: Write minimal implementation**

In the existing URL hydration effect:

- read `rawCreateHandoff = params.get("create")`
- set `shouldOpenCreateForm = rawCreateHandoff === "1"`
- delete `create` from `sanitizedParams` whenever it is present
- when `shouldOpenCreateForm` is true, clear only `createError` and set `showForm(true)`; do not reset `formData`
- add `autoFocus` to the existing required project-name input so a newly mounted handoff form receives focus

Do not change filter synchronization, date handoff behavior, form validation, or other query parameters.

**Step 4: Run tests to verify pass**

Run:

```bash
npx vitest run __tests__/cases-url-sync.test.tsx __tests__/vault.test.ts __tests__/vault-create-project-links.test.tsx __tests__/vault-empty-create-project.test.tsx
```

Expected: all selected tests pass.

**Step 5: Commit**

```bash
git add app/dashboard/cases/page.tsx __tests__/cases-url-sync.test.tsx
git commit -m "feat: open Case creation from Vault handoff"
```

### Task 3: Integration validation and artifact commit

**Objective:** Prove the handoff integrates without regressions and record the daily product decision.

**Files:**
- Add: `scripts/baucompliance-pipeline/proposals/2026-09-10.md`
- Add: `scripts/baucompliance-pipeline/decisions/2026-09-10.md`
- Add: `docs/plans/2026-09-10-vault-case-creation-handoff.md`

**Step 1: Run focused integration tests**

```bash
npx vitest run __tests__/cases-url-sync.test.tsx __tests__/vault.test.ts __tests__/vault-create-project-links.test.tsx __tests__/vault-empty-create-project.test.tsx __tests__/vault-url-sync.test.tsx
```

Expected: all selected tests pass.

**Step 2: Run required validation**

```bash
npm run test
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0.

**Step 3: Commit artifacts**

```bash
git add scripts/baucompliance-pipeline/proposals/2026-09-10.md scripts/baucompliance-pipeline/decisions/2026-09-10.md docs/plans/2026-09-10-vault-case-creation-handoff.md
git commit -m "docs: record 2026-09-10 product improvement"
```
