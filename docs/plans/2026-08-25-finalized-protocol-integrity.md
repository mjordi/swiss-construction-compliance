# Finalized Protocol Integrity Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Align the database lifecycle contract with the product’s “finalized protocol” promise and explain the exact content/signature, individual-deletion, Case-unlink, account-deletion, and retention boundaries to users.

**Architecture:** An idempotent Supabase migration removes the legacy owner-wide CRUD policy and authenticated grants, then restores only owner-scoped reads and finalized-only inserts with column-limited insert privileges. Linked inserts require an owner-matching Case; standalone inserts remain valid. Existing server-side timestamp enforcement and Case `ON DELETE SET NULL` behavior remain unchanged. The Protocol Register adds localized factual copy; static migration tests and focused RTL coverage prove the contract without expanding into revisioning or retention redesign.

**Tech Stack:** PostgreSQL/Supabase RLS and grants, Next.js 16, React 19, TypeScript, Vitest, Testing Library, repository localization map.

---

### Task 1: Lock finalized protocol rows at the database boundary

**Objective:** Permit authenticated owners to create finalized standalone records or records linked to their own Cases and read their own records, while denying authenticated content/signature updates and individual protocol deletion.

**Files:**
- Create: `supabase/migrations/20260825000000_finalized_protocol_integrity.sql`
- Modify/Test: `__tests__/protocol-register.test.ts`

**Step 1: Write failing migration-contract tests**

Extend `__tests__/protocol-register.test.ts` to read the new migration and assert it:
- drops `Users can CRUD own protocols`
- revokes authenticated/anonymous table privileges
- creates owner-scoped SELECT and finalized-only INSERT policies, rejecting foreign-owner Case links while preserving `case_id IS NULL`
- grants authenticated SELECT and column-limited INSERT only
- does not grant authenticated UPDATE or DELETE
- rejects `FOR ALL` policies and table- or column-level authenticated UPDATE/DELETE grants
- documents content/signature locking, individual protocol deletion denial, Case unlinking, account deletion, and the lack of external retention/absolute immutability
- leaves the existing `set_protocol_finalized_at` trigger in force rather than replacing it

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/protocol-register.test.ts`
Expected: FAIL because the migration does not exist.

**Step 3: Write the minimal idempotent migration**

Create the migration with explicit policy drops, privilege revocation, SELECT/INSERT policies, SELECT and insert-column grants, no authenticated UPDATE/DELETE grant, and truthful SQL comments. The insert policy must require `auth.uid() = protocols.user_id`, `protocols.status = 'finalized'`, and either `protocols.case_id IS NULL` or an existing `public.cases` row whose ID matches and whose owner is `auth.uid()`; qualify identifiers to avoid ambiguity. Grant only columns the current dashboard finalization insert supplies: `user_id`, `case_id`, `project_name`, `contractor`, `client`, `defect_description`, `signature_data`, and `status`; database defaults/triggers continue to own `id`, `created_at`, and `finalized_at`.

**Step 4: Run focused test to verify pass**

Run: `npm run test -- __tests__/protocol-register.test.ts`
Expected: PASS.

### Task 2: Explain the integrity boundary in the Protocol Register

**Objective:** Tell users exactly what is protected and the truthful Case-deletion, account-deletion, and retention limitations.

**Files:**
- Modify: `app/dashboard/protocols/page.tsx`
- Modify: `locales/index.ts`
- Modify/Test: `__tests__/protocol-register-page.test.tsx`
- Test: `__tests__/locales.test.ts`

**Step 1: Write failing UI test**

Add `protocols-integrity-note` to the test translator and assert the Protocol Register renders a visible factual note explaining that finalized content/signatures cannot be changed, authenticated users cannot individually delete a protocol, linked Case deletion clears only the Case association, account deletion removes protocol records, and no external retention/absolute immutability is provided.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/protocol-register-page.test.tsx __tests__/locales.test.ts`
Expected: FAIL because the page/key do not exist.

**Step 3: Add minimal UI and localization**

Render one compact non-alarm integrity note below the page header. Add semantically equivalent DE/FR/IT/EN translations, with locale tests covering the Case-delete association caveat. Do not claim external retention, qualified signatures, acceptance, delivery, cryptographic verification, or that the entire row is immutable.

**Step 4: Run focused tests to verify pass**

Run: `npm run test -- __tests__/protocol-register.test.ts __tests__/protocol-register-page.test.tsx __tests__/locales.test.ts`
Expected: PASS.

### Task 3: Review and validate the bounded slice

**Objective:** Prove the migration preserves existing reads and that the implementation remains within the approved scope.

**Files:**
- Review all changed files
- Regression test: `__tests__/dashboard-protocol.test.ts`
- Regression test: `__tests__/vault-audit-export.test.ts`

**Step 1: Run focused integration regressions**

Run: `npm run test -- __tests__/protocol-register.test.ts __tests__/protocol-register-page.test.tsx __tests__/dashboard-protocol.test.ts __tests__/vault-audit-export.test.ts __tests__/locales.test.ts`
Expected: PASS.

**Step 2: Perform spec-compliance review**

Verify existing finalization still inserts only allowed columns with `status: "finalized"`, Protocol Register details remain readable, Vault protocol counting remains SELECT-only, no UPDATE/DELETE client path is required, and no excluded surface changed.

**Step 3: Perform code-quality/security review**

Review policy role scoping, privilege revocation, idempotency, comments, truthful i18n, and static tests for false-positive regexes.

**Step 4: Run required validation**

Run exactly:
- `npm run test`
- `npm run lint`
- `npm run build`
- `git diff --check`

Expected: all pass before commit/PR.

**Step 5: Commit**

Stage only the approved implementation, today’s proposal/decision artifacts, and this plan. Commit with a conventional message such as `fix: lock finalized protocol records`.
