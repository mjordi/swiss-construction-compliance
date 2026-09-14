# Exact Case Evidence Handoff Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make the notice-dispatch evidence CTA open the exact owner-scoped Vault Case with its evidence controls ready, rather than relying on project-name search.

**Architecture:** Encode the Case identity and one-time evidence intent in the existing Vault href helper, sanitize them with pure helpers, and let the Vault resolve the identity only against its loaded owner-scoped snapshot. Pass a one-time activation prop into the existing evidence panel so it expands, loads, and focuses its file input without changing persistence.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase client, Vitest, React Testing Library.

---

### Task 1: Define the exact Vault handoff contract

**Objective:** Add pure helpers for building and parsing a bounded exact-Case evidence handoff.

**Files:**
- Modify: `lib/vault.ts`
- Test: `__tests__/vault.test.ts`

**Step 1: Write failing tests**

Add tests proving that a Case ID plus project name creates `/dashboard/vault?q=...&case=...&evidence=1`, blank IDs do not emit exact-action parameters, and parsing accepts only a trimmed non-empty Case ID paired with `evidence=1`.

**Step 2: Run test to verify failure**

Run: `npx vitest run __tests__/vault.test.ts`
Expected: FAIL because the new exact handoff contract is absent.

**Step 3: Write minimal implementation**

Extend `buildCaseVaultHref` with a backward-compatible optional Case ID and export a pure parser for the owned `case`/`evidence` parameters. Keep project-name `q` fallback behavior and use `URLSearchParams`.

**Step 4: Run test to verify pass**

Run: `npx vitest run __tests__/vault.test.ts`
Expected: PASS.

**Step 5: Commit checkpoint**

Do not commit yet; this daily slice is committed once after all cross-file behavior and required validation pass.

### Task 2: Wire the Case CTA and one-time Vault selection

**Objective:** Route notice-dispatch users to the exact owner-scoped card while preserving URL state and truthful failure behavior.

**Files:**
- Modify: `app/dashboard/cases/page.tsx`
- Modify: `app/dashboard/vault/page.tsx`
- Test: `__tests__/cases-notice-dispatch.test.tsx`
- Test: `__tests__/vault-url-sync.test.tsx`
- Test: `__tests__/case-evidence-vault-integration.test.tsx`

**Step 1: Write failing tests**

Add focused tests for the exact CTA href; valid active and archived Case handoffs; owned-param cleanup with unrelated parameters preserved; exact-ID matching rather than same-name matching; missing/unauthorized IDs returning to normal Vault state; and post-cleanup rerenders not re-triggering the handoff.

**Step 2: Run tests to verify failure**

Run: `npx vitest run __tests__/vault.test.ts __tests__/cases-notice-dispatch.test.tsx __tests__/vault-url-sync.test.tsx __tests__/case-evidence-vault-integration.test.tsx --maxWorkers=1`
Expected: FAIL on the new exact handoff assertions.

**Step 3: Write minimal implementation**

Pass `item.id` from the notice-dispatch CTA. In Vault, capture the parsed handoff, resolve it only after the owner snapshot loads, select the matching tab, scope the visible list to the exact ID, and remove only `case` and `evidence` while preserving valid sibling/unrelated params. Do not substitute a same-named record when the ID is absent.

**Step 4: Run tests to verify pass**

Run the same focused command.
Expected: PASS.

**Step 5: Commit checkpoint**

Do not commit yet; include this task in the final validated daily commit.

### Task 3: Activate and focus the existing evidence panel

**Objective:** Make the destination action-ready without changing evidence persistence.

**Files:**
- Modify: `components/dashboard/CaseEvidencePanel.tsx`
- Modify: `app/dashboard/vault/page.tsx`
- Test: `__tests__/case-evidence-panel.test.tsx`
- Test: `__tests__/case-evidence-vault-integration.test.tsx`

**Step 1: Write failing tests**

Add tests that a one-time activation expands the panel, loads evidence once, focuses the upload input for an active Case, preserves read-only behavior for archived Cases, and is not replayed after URL cleanup/rerender.

**Step 2: Run tests to verify failure**

Run: `npx vitest run __tests__/case-evidence-panel.test.tsx __tests__/case-evidence-vault-integration.test.tsx --maxWorkers=1`
Expected: FAIL because the panel has no activation prop.

**Step 3: Write minimal implementation**

Add an optional activation token/flag handled by an effect with a consumed-token ref. Expand and load once, then focus the file input after render when writable; focus the evidence toggle/region for read-only archived records. Preserve existing context-reset and request guards.

**Step 4: Run tests to verify pass**

Run the same focused command.
Expected: PASS.

**Step 5: Required validation and commit**

Run:
- `npm run test`
- `npm run lint`
- `npm run build`
- `git diff --check`

Expected: all pass. Then stage only the approved code/tests plus `scripts/baucompliance-pipeline/proposals/2026-09-14.md`, `scripts/baucompliance-pipeline/decisions/2026-09-14.md`, and this plan; commit with `feat: open exact Case evidence from notice dispatch`.
