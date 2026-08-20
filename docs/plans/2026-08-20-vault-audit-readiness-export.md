# Vault Portfolio Audit-Readiness Export Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Let an authenticated Vault user download one safe, localized CSV snapshot of audit readiness across every loaded active and archived Case.

**Architecture:** Add a pure `lib/vault-audit-export.ts` module that accepts already-normalized Vault rows and localized labels, then deterministically produces BOM-prefixed RFC-style CSV and a date-based filename. Integrate a client-only download action into the existing owner-scoped Vault load without new queries or mutations, guarded against duplicate and stale async completions.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest/RTL, existing locale dictionaries, browser Blob/Object URL APIs.

---

### Task 1: Add the pure audit CSV contract

**Objective:** Serialize complete normalized portfolio rows safely and deterministically.

**Files:**
- Create: `lib/vault-audit-export.ts`
- Create: `__tests__/vault-audit-export.test.ts`

**Step 1: Write failing tests**

Cover stable Case-ID ordering, generation metadata, every required column, UTF-8 BOM/CRLF, quotes/newlines/commas, formula-prefix protection for `=`, `+`, `-`, and `@`, empty missing-item lists, and deterministic `baucompliance-vault-audit-YYYY-MM-DD.csv` naming.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/vault-audit-export.test.ts`
Expected: FAIL because `lib/vault-audit-export.ts` does not exist.

**Step 3: Write minimal implementation**

Define exported row/labels types, `buildVaultAuditCsv(...)`, and `vaultAuditCsvFilename(...)`. Keep localization outside the helper except for supplied labels/values. Prefix dangerous spreadsheet values with an apostrophe before CSV escaping; escape quotes by doubling them; wrap every cell in quotes; emit BOM and CRLF.

**Step 4: Run test to verify pass**

Run: `npm run test -- __tests__/vault-audit-export.test.ts`
Expected: all helper tests PASS.

### Task 2: Add the guarded Vault download action

**Objective:** Export all owner-visible loaded projects—not only the current tab/search—from the existing Vault data.

**Files:**
- Modify: `app/dashboard/vault/page.tsx`
- Create: `__tests__/vault-audit-export-ui.test.tsx`

**Step 1: Write failing UI tests**

Mock active plus archived rows and assert: the action appears only after a successful non-empty load; clicking from a filtered active view exports both rows; blob download uses the deterministic filename; rapid duplicate activation produces one export; success/error feedback appears; and stale completion after owner change is ignored.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/vault-audit-export-ui.test.tsx`
Expected: FAIL because the export action does not exist.

**Step 3: Write minimal integration**

Add a header export button and concise point-in-time scope guidance. Map complete `projects` state to helper rows using existing normalized checklist/status/missing-item contracts. Add an in-flight ref, request/version ref, mounted/current-owner checks, feedback timer cleanup, Blob/object-URL creation/revocation, and retryable error feedback. Invalidate feedback/requests on owner change and unmount. Do not change loading queries, legal math, card behavior, archive mutations, or evidence panels.

**Step 4: Run focused tests**

Run: `npm run test -- __tests__/vault-audit-export.test.ts __tests__/vault-audit-export-ui.test.tsx __tests__/vault-load-retry.test.tsx __tests__/vault-follow-up-link.test.tsx`
Expected: all focused tests PASS.

### Task 3: Localize and verify the product contract

**Objective:** Make the export understandable and truthful in DE/FR/IT/EN.

**Files:**
- Modify: `locales/index.ts`
- Modify: `__tests__/locales.test.ts`

**Step 1: Add failing locale assertions**

Require title/action/preparing/success/error/guidance and CSV column/value keys in all four locales. Assert guidance states the complete portfolio scope, point-in-time snapshot, and no legal-completeness claim.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/locales.test.ts -t 'vault audit export'`
Expected: FAIL because the new keys do not exist.

**Step 3: Add complete localized copy**

Add matching keys to every locale dictionary and consume them from the Vault mapping/UI.

**Step 4: Run focused regression set**

Run: `npm run test -- __tests__/vault-audit-export.test.ts __tests__/vault-audit-export-ui.test.tsx __tests__/vault-load-retry.test.tsx __tests__/vault-follow-up-link.test.tsx __tests__/locales.test.ts`
Expected: all tests PASS.

### Task 4: Review and required validation

**Objective:** Prove the approved slice is safe, reviewable, and integrated.

**Files:**
- Review all changed implementation, test, locale, plan, proposal, and decision files.

**Step 1: Spec review**

Verify complete portfolio scope, existing normalized data only, required columns, safe CSV, stale/duplicate guards, truthful copy, and excluded surfaces.

**Step 2: Code-quality review**

Check formula injection, object URL cleanup, timer/unmount/owner lifecycle, mock stability, localization parity, test coverage, and no overlap with open PR #193.

**Step 3: Run required validation**

Run exactly:
- `npm run test`
- `npm run lint`
- `npm run build`
- `git diff --check`

Expected: all commands PASS. The run is not complete if any required command remains failing.
