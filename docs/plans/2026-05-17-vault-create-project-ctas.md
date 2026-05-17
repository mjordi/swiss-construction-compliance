# Tech Vault Create-Project CTA Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make the Tech Vault’s visible “new/create project” calls to action actually navigate users into the dashboard workflow where they can start a new project/protocol.

**Architecture:** Keep the change narrow inside the Vault surface by introducing a tiny shared href helper in `lib/vault.ts`, then reuse it for both existing create-project CTAs in `app/dashboard/vault/page.tsx`. Cover the behavior with a focused component test so future refactors do not silently reintroduce dead CTAs.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, Testing Library

---

### Task 1: Wire the Vault create-project CTAs to the dashboard workflow

**Objective:** Turn the dead Tech Vault “new/create project” CTAs into working links to `/dashboard`.

**Files:**
- Modify: `lib/vault.ts`
- Modify: `app/dashboard/vault/page.tsx`
- Create: `__tests__/vault-create-project-links.test.tsx`

**Step 1: Write failing test**

Add a focused test in `__tests__/vault-create-project-links.test.tsx` that renders `TechVault`, waits for the page shell, and asserts:
- the header CTA named `vault-new-project` is a link with `href="/dashboard"`
- the grid CTA named `vault-create-project` is a link with `href="/dashboard"`

Reuse the same lightweight mocks as the existing vault component tests (`LanguageContext`, `AuthContext`, `framer-motion`, `case-timeline`, and `supabase`) so the test exercises the real rendered markup without extra product-state noise.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/vault-create-project-links.test.tsx`
Expected: FAIL because the current CTAs are rendered as non-navigating `button`/`div` elements with no dashboard href.

**Step 3: Write minimal implementation**

- Add a small helper in `lib/vault.ts` named `buildVaultCreateProjectHref()` that returns `"/dashboard"`.
- Update `app/dashboard/vault/page.tsx` to import that helper.
- Convert the header CTA from a dead `button` to an anchor with `href={buildVaultCreateProjectHref()}` while preserving the existing visual classes and icon.
- Convert the dashed grid CTA from a decorative `div` to an anchor with the same helper and current styling.
- Do not add new routing state, locale keys, or unrelated Vault behavior in this task.

**Step 4: Run tests to verify pass**

Run: `npm run test -- __tests__/vault-create-project-links.test.tsx __tests__/vault-follow-up-link.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add lib/vault.ts app/dashboard/vault/page.tsx __tests__/vault-create-project-links.test.tsx docs/plans/2026-05-17-vault-create-project-ctas.md scripts/baucompliance-pipeline/proposals/2026-05-17.md scripts/baucompliance-pipeline/decisions/2026-05-17.md
git commit -m "feat: link vault create-project ctas"
```
