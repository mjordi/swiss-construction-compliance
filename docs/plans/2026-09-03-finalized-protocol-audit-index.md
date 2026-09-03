# Finalized Protocol Audit Index Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a safe, localized CSV audit-index export for every finalized protocol loaded in the owner-scoped Protocol Register.

**Architecture:** Extend the existing pure `lib/protocol-register.ts` contract with deterministic CSV and filename helpers, then add one page-level export workflow that consumes the already paginated owner-scoped register state. Reuse the established Vault CSV safety/lifecycle patterns without adding data access or persistence.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase projection reads, Vitest, React Testing Library.

---

### Task 1: Add the pure CSV audit-index contract

**Objective:** Serialize finalized register records into a deterministic spreadsheet-safe CSV with localized labels and a non-PII filename.

**Files:**
- Modify: `lib/protocol-register.ts`
- Test: `__tests__/protocol-register.test.ts`

**Step 1: Write failing tests**

Add focused tests asserting:
- UTF-8 BOM and CRLF output;
- stable deterministic record ordering;
- metadata rows identify generation time and point-in-time finalized-register scope;
- columns cover protocol ID, Case/standalone context, project, contractor, client, finalized timestamp, and signature state;
- commas, quotes, and newlines are escaped;
- formula-capable values are neutralized even after leading whitespace;
- filename uses only the UTC calendar date.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/protocol-register.test.ts`
Expected: FAIL because the CSV helper and filename do not exist.

**Step 3: Write minimal implementation**

Add typed label/row input contracts and pure helpers such as `buildProtocolRegisterAuditCsv(...)` and `protocolRegisterAuditCsvFilename(...)`. Keep localized display values supplied by the caller; do not import UI/i18n state into the helper.

**Step 4: Run test to verify pass**

Run: `npm run test -- __tests__/protocol-register.test.ts`
Expected: PASS.

### Task 2: Add the owner-scoped register export action

**Objective:** Download the complete loaded register as CSV with robust pending and stale-completion behavior.

**Files:**
- Modify: `app/dashboard/protocols/page.tsx`
- Test: `__tests__/protocol-register-page.test.tsx`

**Step 1: Write failing tests**

Add page tests proving:
- the export action appears only after successful non-empty owner-scoped load;
- all loaded pages/records are exported, independent of per-row PDF retrieval;
- duplicate synchronous activation creates one export;
- URL creation/revocation and deterministic filename are used;
- success/error feedback is localized and expires;
- account switch or unmount invalidates pending export feedback/work;
- loading/error/empty states do not expose the export action.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/protocol-register-page.test.tsx`
Expected: FAIL because no register export action exists.

**Step 3: Write minimal implementation**

Add a header-level action over `visibleRecords`, stable request/in-flight refs, current-owner checks, object-URL cleanup, and a dedicated feedback timer. Do not alter the existing per-record PDF flow or Supabase queries.

**Step 4: Run test to verify pass**

Run: `npm run test -- __tests__/protocol-register-page.test.tsx`
Expected: PASS.

### Task 3: Localize and integrate the audit-index contract

**Objective:** Provide truthful DE/FR/IT/EN export copy and verify semantic parity.

**Files:**
- Modify: `locales/index.ts`
- Modify: `__tests__/locales.test.ts`
- Test: `__tests__/protocol-register-page.test.tsx`

**Step 1: Write failing tests**

Assert every locale has action, pending, guidance, success/error, scope metadata, column, standalone, and signature-state keys; semantic tests must preserve point-in-time/no-legal-completeness wording.

**Step 2: Run test to verify failure**

Run: `npm run test -- __tests__/locales.test.ts __tests__/protocol-register-page.test.tsx`
Expected: FAIL because the new translation keys do not exist.

**Step 3: Write minimal implementation**

Add complete translations and wire them into the serializer/action. Guidance must say the CSV is a point-in-time index, not proof of legal completeness, delivery, acceptance, or external retention.

**Step 4: Run focused tests to verify pass**

Run: `npm run test -- __tests__/protocol-register.test.ts __tests__/protocol-register-page.test.tsx __tests__/locales.test.ts`
Expected: PASS.

### Task 4: Validate the integrated slice

**Objective:** Prove the approved change is reviewable and regression-free.

**Files:**
- Review all modified files.

**Step 1: Run focused tests together**

Run: `npm run test -- __tests__/protocol-register.test.ts __tests__/protocol-register-page.test.tsx __tests__/locales.test.ts`
Expected: PASS.

**Step 2: Run required validation**

Run: `npm run test`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

Run: `git diff --check`
Expected: PASS.

**Step 3: Product review**

Verify the action exports the full loaded owner register, remains visibly point-in-time, and does not add queries, mutations, evidence contents, bundling, monitoring, delivery/acceptance, retention, or completeness claims.
