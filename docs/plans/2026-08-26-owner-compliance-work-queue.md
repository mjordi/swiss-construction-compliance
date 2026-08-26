# Owner-Only Compliance Work Queue Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a complete, prioritized, read-only owner compliance work queue at `/dashboard/work` using established Case, checklist, protocol, and legal-timeline contracts.

**Architecture:** A pure adapter converts the existing owner-scoped Vault snapshot into immutable queue rows and deterministic priorities. A client page performs one stable Supabase RPC load, guards owner/request/unmount transitions, renders localized point-in-time queue states, and links into the existing Cases page without adding persistence or new legal calculations.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, Vitest, React Testing Library, existing localization context.

---

### Task 1: Define and test the pure queue contract

**Objective:** Derive every actionable non-archived Case from the existing snapshot with deterministic ordering and concrete readiness reasons.

**Files:**
- Create: `lib/compliance-work-queue.ts`
- Create: `__tests__/compliance-work-queue.test.ts`

**Step 1: Write failing tests**

Cover:
- priorities in order: `expired`, `immediate-notice`, `urgent`, `warning`, lifecycle `review`, incomplete readiness
- archived and fully ready/on-track exclusions
- protocol-count and normalized checklist readiness gaps
- legal timeline values reused rather than recalculated
- deadline, discovery-date, then Case-ID deterministic tie-breaks
- malformed timeline source skipped without dropping valid siblings
- input arrays/objects remain unmodified

The adapter input should accept the exact snapshot shape (`Case[]` plus protocol identity/Case links) and return rows containing Case identity/project, timeline status/regime/countdown/next-action contract, checklist progress, readiness reason keys, protocol count, and a contextual `/dashboard/cases` href.

**Step 2: Run tests to verify failure**

Run: `npm run test -- __tests__/compliance-work-queue.test.ts`
Expected: FAIL because `lib/compliance-work-queue.ts` does not exist.

**Step 3: Implement the minimal pure adapter**

Reuse:
- `buildComplianceCaseTimeline` / `ComplianceCaseViewModel` from `lib/case-timeline.ts`
- `normalizeFollowUpChecklistState` from `lib/cases-checklist.ts`
- `buildVaultProjectCasesHref` from `lib/vault.ts`

Do not mutate inputs, duplicate legal calculations, include archived Cases, or add persistence semantics. Treat warning/urgent/expired/immediate-notice as legal reasons; lifecycle `review` and incomplete checklist/protocol readiness are lower-priority reasons. Ensure a Case is represented once even when it has multiple reasons.

**Step 4: Run tests to verify pass**

Run: `npm run test -- __tests__/compliance-work-queue.test.ts`
Expected: PASS.

---

### Task 2: Add the owner-scoped queue page and navigation

**Objective:** Make the complete personal point-in-time queue available in authenticated desktop/mobile navigation with truthful localization and resilient loading.

**Files:**
- Create: `app/dashboard/work/page.tsx`
- Create: `__tests__/compliance-work-queue-page.test.tsx`
- Modify: `components/dashboard/Sidebar.tsx`
- Modify: `__tests__/dashboard-navigation-vault.test.tsx`
- Modify: `locales/index.ts`
- Modify: `__tests__/locales.test.ts`

**Step 1: Write failing page/navigation/localization tests**

Cover:
- one `get_vault_audit_snapshot` RPC load and complete queue rendering
- native contextual Cases href semantics (triage only for expired/immediate/urgent; search-only where broader triage is not semantically valid)
- loading, retryable error, empty, and malformed-snapshot states
- prior-owner rows hidden synchronously during account changes
- stale older request completion ignored after a newer owner succeeds
- unmounted completion ignored
- a fresh-returning `getSupabase()` mock still called only once per mount
- no assignment, approval, active monitoring, or notification-delivery claim
- desktop/mobile `/dashboard/work` navigation and active title
- semantic DE/FR/IT/EN locale parity for title, description, boundary, states, reason/readiness labels, and action

**Step 2: Run tests to verify failure**

Run: `npm run test -- __tests__/compliance-work-queue-page.test.tsx __tests__/dashboard-navigation-vault.test.tsx __tests__/locales.test.ts`
Expected: FAIL because the page, navigation entry, and translations do not exist.

**Step 3: Implement the minimal page and navigation**

- Stabilize `getSupabase()` with `useMemo(() => getSupabase(), [])`.
- Call only `supabase.rpc("get_vault_audit_snapshot")` for the authenticated owner.
- Validate both snapshot arrays before adapting.
- Clear/hide visible rows during owner transitions and use request ID, current owner, and mounted guards before committing async results.
- Render localized loading, retryable error, empty, and queue states.
- State clearly that the queue is personal and point-in-time and does not assign work, monitor deadlines, or send notifications.
- Use native `Link` elements for Cases handoffs.
- Add one shared nav item so `MobileNav` receives it from `navItems`.
- Keep scope read-only: no schema, mutations, status changes, completion controls, or new legal calculations.

**Step 4: Run focused tests to verify pass**

Run: `npm run test -- __tests__/compliance-work-queue.test.ts __tests__/compliance-work-queue-page.test.tsx __tests__/dashboard-navigation-vault.test.tsx __tests__/locales.test.ts`
Expected: PASS.

---

### Task 3: Review and validate the complete slice

**Objective:** Prove the implementation remains a meaningful, owner-isolated, reviewable product improvement.

**Files:**
- Review all files changed by Tasks 1–2.

**Step 1: Spec review**

Verify every approved requirement and exclusion: complete non-archived owner queue, deterministic priorities, existing legal/checklist/protocol contracts, truthful point-in-time boundary, contextual links, privacy/stale guards, four locales, and no mutations/governance/notification claims.

**Step 2: Code-quality/security review**

Inspect malformed data handling, referential stability, async request lifecycle, owner isolation, sorting determinism, input immutability, accessible native links/buttons, locale semantics, and adjacent mocks/contracts.

**Step 3: Run required validation**

Run individually:
- `npm run test`
- `npm run lint`
- `npm run build`
- `git diff --check`

Expected: all commands PASS. If any required command fails, isolate/rerun only when evidence supports a pre-existing flake; do not report the run complete while the normal required command remains failing.
