# Governed Shared Compliance Queue Phase 1 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Let an owner grant and revoke one existing BauCompliance account’s read-only access to the owner’s derived compliance work queue, with tenant isolation and immutable membership audit facts.

**Architecture:** Add a narrow Supabase membership/audit boundary and security-definer RPCs rather than broadening table RLS for Cases or Protocols. The existing work queue continues to consume a JSON snapshot, but requests an explicitly authorized owner context. The page adds owner grant/revoke controls and a collaborator owner selector while preserving all existing owner-only behavior and stale-request protections.

**Tech Stack:** PostgreSQL/Supabase RLS and RPC, Next.js 16/React 19, TypeScript, Vitest/Testing Library, localized strings in `locales/index.ts`.

---

### Task 1: Define tenant-isolated queue membership and audit contracts

**Objective:** Create the database authorization boundary and prove its security properties from the migration contract.

**Files:**
- Create: `supabase/migrations/20260831000000_shared_compliance_queue.sql`
- Create: `__tests__/shared-compliance-queue-migration.test.ts`

**Step 1: Write failing migration tests**

Assert that the migration defines:
- `compliance_queue_memberships` with owner/collaborator UUIDs, active/revoked timestamps, no self-grant, and one active relationship.
- immutable `compliance_queue_membership_events` for grant/revoke facts.
- authenticated-only grants and no anonymous table/RPC access.
- exact-email grant lookup without an account directory.
- owner-only grant/revoke RPCs.
- owner and active-collaborator listing RPCs.
- an authorized snapshot RPC that accepts a target owner and checks self-or-active-membership before selecting Cases/Protocols.
- no new collaborator insert/update/delete policies on legal records.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/shared-compliance-queue-migration.test.ts`
Expected: FAIL because the migration does not exist.

**Step 3: Write minimal migration**

Create membership and event tables, restrictive RLS/grants, helper authorization, grant/revoke/list RPCs, and `get_compliance_work_queue_snapshot(target_owner_id uuid default auth.uid())`. Use security-definer functions with fixed `search_path`, explicit `auth.uid()` checks, and non-enumerating grant errors. Snapshot JSON contains only the Case/Protocol fields already required by `buildComplianceWorkQueueResult`.

**Step 4: Run test to verify pass**

Run: `npm run test -- __tests__/shared-compliance-queue-migration.test.ts`
Expected: PASS.

### Task 2: Add typed collaboration contracts

**Objective:** Give the page a narrow, validated contract for owned grants and shared owners.

**Files:**
- Modify: `lib/database.types.ts`
- Create: `lib/compliance-queue-sharing.ts`
- Create: `__tests__/compliance-queue-sharing.test.ts`

**Step 1: Write failing domain tests**

Cover safe parsing of owned grants/shared owners, rejection of malformed IDs/names/emails, deterministic owner labels, and owner-as-default target selection.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/compliance-queue-sharing.test.ts`
Expected: FAIL because the helper does not exist.

**Step 3: Implement minimal typed parser/helper**

Expose only the fields the UI needs. Keep unknown RPC payloads outside durable page state until validated.

**Step 4: Run test to verify pass**

Run: `npm run test -- __tests__/compliance-queue-sharing.test.ts`
Expected: PASS.

### Task 3: Add owner grant/revoke and collaborator queue selection UI

**Objective:** Make the phase-1 shared queue visible and usable without adding any collaborator mutation path.

**Files:**
- Modify: `app/dashboard/work/page.tsx`
- Modify: `__tests__/compliance-work-queue-page.test.tsx`

**Step 1: Write failing page tests**

Cover:
- owner-only default still loads the authenticated owner snapshot.
- owner grants an exact existing-account email and sees the active grant.
- owner revokes and the grant disappears after confirmed success.
- collaborator selects an explicitly shared owner and the snapshot RPC receives that owner ID.
- shared context is clearly marked read-only and Case handoffs are suppressed for collaborator-owned rows, because destination table RLS remains owner-only.
- account changes clear prior grants/shared owners/rows synchronously.
- stale list, grant, revoke, and snapshot completions cannot repopulate another account’s state.
- grant/revoke pending states lock conflicting controls and duplicate submissions.
- failures are retryable/non-enumerating and preserve confirmed state.

**Step 2: Run focused test to verify failure**

Run: `npm run test -- __tests__/compliance-work-queue-page.test.tsx`
Expected: FAIL on the new sharing behavior.

**Step 3: Implement the minimal UI**

Load owned grants and incoming shared-owner memberships alongside the queue. Keep the authenticated owner as default target. Let owners grant by exact email and revoke confirmed grants. Render a shared-owner selector only for authorized memberships. Pass the selected owner ID to the snapshot RPC. Clearly label shared views read-only and do not render owner-only Case handoff links there. Retain stable Supabase identity, mounted/request guards, and midnight refresh.

**Step 4: Run focused test to verify pass**

Run: `npm run test -- __tests__/compliance-work-queue-page.test.tsx`
Expected: PASS.

### Task 4: Localize and integrate the complete slice

**Objective:** Ship clear German/English/French collaboration and trust-boundary copy without regressions.

**Files:**
- Modify: `locales/index.ts`
- Modify: `__tests__/locales.test.ts`
- Test: `__tests__/compliance-work-queue.test.ts`

**Step 1: Add failing locale assertions**

Require every new key in all supported locales and ensure the read-only boundary does not claim assignments, approvals, notification delivery, or evidence sharing.

**Step 2: Run focused integration set**

Run: `npm run test -- __tests__/shared-compliance-queue-migration.test.ts __tests__/compliance-queue-sharing.test.ts __tests__/compliance-work-queue.test.ts __tests__/compliance-work-queue-page.test.tsx __tests__/locales.test.ts`
Expected before locale implementation: FAIL for missing keys.

**Step 3: Add translations and resolve focused integration issues**

Use concise owner/collaborator language and preserve current queue terminology.

**Step 4: Run focused set and required validation**

Run:
- `npm run test -- __tests__/shared-compliance-queue-migration.test.ts __tests__/compliance-queue-sharing.test.ts __tests__/compliance-work-queue.test.ts __tests__/compliance-work-queue-page.test.tsx __tests__/locales.test.ts`
- `npm run test`
- `npm run lint`
- `npm run build`

Expected: all pass. If any required command remains failing, the run is not complete.

### Task 5: Product and security review

**Objective:** Confirm the implementation remains the approved read-only strategic slice.

**Files:**
- Review all files changed from `origin/main`.

**Step 1: Spec review**

Verify exact-email existing-account grant, immediate revoke, authorized target-owner snapshot, immutable event facts, no collaborator mutation path, no account directory, and owner-only fallback.

**Step 2: Code-quality/security review**

Check fixed function search paths, explicit grants/revokes, RLS enabled, no security-definer email leakage, stable React dependencies, stale async guards, pending locks, accessible labels, and focused regression coverage.

**Step 3: Final diff and validation review**

Run `git diff --check origin/main...HEAD` after committing and verify required validation results before push/PR.
