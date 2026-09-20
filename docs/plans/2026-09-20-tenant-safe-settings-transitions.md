# Tenant-Safe Settings Transitions Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Ensure account-specific Settings state and asynchronous completions can never cross an authenticated account transition.

**Architecture:** Keep the existing page-local state and stable Supabase client. Add account/request generation refs plus tracked feedback timers, synchronously reset all account-bound UI when `user?.id` changes, and make every async load/save/password completion conditional on the initiating account and current generation. Preserve existing newer-edit and recovery URL contracts.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase JS, Vitest, React Testing Library.

---

### Task 1: Prove and implement tenant-safe Settings transitions

**Objective:** Prevent previous-account state or stale async results from appearing in or mutating the Settings UI after identity changes.

**Files:**
- Modify: `app/dashboard/settings/page.tsx`
- Create: `__tests__/settings-account-transition.test.tsx`
- Verify: `__tests__/settings-profile-save-race.test.tsx`
- Verify: `__tests__/settings-password-feedback.test.tsx`
- Verify: `__tests__/dashboard-settings-supabase-client-identity.test.tsx`

**Step 1: Write failing controlled-promise tests**

Create a stable mutable auth mock and a stable Supabase mock. Cover:

1. account A profile is visible, rerender as account B, and A's name/company/password draft disappear immediately before B's load resolves;
2. a late account A profile-load completion cannot populate account B;
3. a late account A profile-save success/error/rejection/finally cannot alter account B or unlock/lock B's controls;
4. a late account A password success/error/rejection/finally cannot clear B's draft, show feedback, or alter B's pending state;
5. account B's own load/save/password operations still complete normally;
6. unmount ignores pending completions and clears tracked feedback timers.

Use direct DOM values where matcher setup is absent. Keep auth and router mock objects referentially stable.

**Step 2: Run the new test to verify failure**

Run: `npx vitest run __tests__/settings-account-transition.test.tsx --maxWorkers=1`

Expected: FAIL because existing profile fields and async completion handlers are not account/request scoped.

**Step 3: Implement minimal account/request scoping**

In `app/dashboard/settings/page.tsx`:

- derive `accountId = user?.id ?? null`;
- maintain mounted/current-account and separate load/save/password request-generation refs;
- on account identity change, invalidate all prior generations, clear tracked success timers, synchronously reset profile fields/snapshot/errors/success, password draft/errors/success, and pending flags before starting the current profile load;
- maintain an explicit current-account profile-load readiness state and disable profile inputs/save until load settles for that account;
- capture the initiating account ID and request generation in save/password handlers;
- before every state update in success, returned-error, rejection, and `finally`, require mounted/current-account/current-request equality;
- clear the relevant prior success timer before a new action and store each new timer handle for transition/unmount cleanup;
- preserve `latestProfileFormRef` / `latestPasswordRef` newer-edit checks and recovery query cleanup.

Do not change auth APIs, database contracts, routes, password policy, or copy.

**Step 4: Run focused tests to verify pass**

Run:

`npx vitest run __tests__/settings-account-transition.test.tsx __tests__/settings-profile-save-race.test.tsx __tests__/settings-password-feedback.test.tsx __tests__/dashboard-settings-supabase-client-identity.test.tsx --maxWorkers=1`

Expected: PASS with tenant-transition, existing race, recovery, and stable-client behavior intact.

**Step 5: Run static checks for the touched slice**

Run: `npx eslint app/dashboard/settings/page.tsx __tests__/settings-account-transition.test.tsx`

Expected: PASS.

**Step 6: Commit the implementation**

```bash
git add app/dashboard/settings/page.tsx __tests__/settings-account-transition.test.tsx docs/plans/2026-09-20-tenant-safe-settings-transitions.md scripts/baucompliance-pipeline/proposals/2026-09-20.md scripts/baucompliance-pipeline/decisions/2026-09-20.md
git commit -m "fix: isolate settings across account transitions"
```
