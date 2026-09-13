# Auth Session Consistency Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Ensure `AuthProvider` never lets an older initial-session or profile request overwrite the newest authenticated identity.

**Architecture:** Keep one memoized Supabase client for the provider lifetime. Use separate monotonic refs for auth-event ordering and profile-enrichment ordering, plus a mounted ref, so the provider can ignore late asynchronous completions without changing Supabase APIs or route behavior. Prove the contract with a provider consumer and controlled promises.

**Tech Stack:** Next.js 16, React 19 hooks/context, TypeScript, Supabase JS, Vitest 4, React Testing Library.

---

### Task 1: Add a provider-level race test harness

**Objective:** Render the real provider with a stable mocked Supabase client and observable context state.

**Files:**
- Create: `__tests__/auth-context-race.test.tsx`
- Modify later: `context/AuthContext.tsx`

**Step 1: Write the failing test harness**

Mock `@/lib/supabase` with one shared client object. Capture the callback passed to `onAuthStateChange`, expose a consumer that renders `user?.id`, `user?.name`, and `isLoading`, and use controlled promises for `getSession()` and profile `.single()` calls. Use Supabase-shaped users/sessions with only required test fields cast through `unknown` where needed.

```tsx
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function Consumer() {
  const { user, isLoading, logout } = useAuth();
  return (
    <>
      <output data-testid="user-id">{user?.id ?? "none"}</output>
      <output data-testid="user-name">{user?.name ?? "none"}</output>
      <output data-testid="loading">{String(isLoading)}</output>
      <button onClick={() => void logout()}>logout</button>
    </>
  );
}
```

**Step 2: Add the first race assertion**

Start user A profile resolution, emit a user B auth event, resolve B, then resolve A. Assert the consumer remains user B with B's profile name.

**Step 3: Run the focused test to verify failure**

Run: `npm run test -- __tests__/auth-context-race.test.tsx`

Expected: FAIL because the late user A profile completion currently calls `setUser` unconditionally.

---

### Task 2: Guard auth and profile publication by request generation

**Objective:** Make the newest auth state authoritative across initial hydration, callbacks, login enrichment, logout, and unmount.

**Files:**
- Modify: `context/AuthContext.tsx:3-122`
- Test: `__tests__/auth-context-race.test.tsx`

**Step 1: Stabilize the client and add lifecycle refs**

```tsx
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";

const supabase = useMemo(() => getSupabase(), []);
const mountedRef = useRef(true);
const authEventVersionRef = useRef(0);
const profileRequestVersionRef = useRef(0);
```

**Step 2: Centralize guarded session synchronization**

Use a memoized callback with this behavior:

```tsx
const syncSession = useCallback(async (session: Session | null) => {
  const profileRequestVersion = ++profileRequestVersionRef.current;

  if (!session?.user) {
    if (mountedRef.current) {
      setUser(null);
      setIsLoading(false);
    }
    return;
  }

  if (mountedRef.current) {
    setUser(mapUser(session.user));
    setIsLoading(false);
  }

  const fullName = await resolveProfileName(supabase, session.user.id);
  if (
    mountedRef.current &&
    profileRequestVersion === profileRequestVersionRef.current
  ) {
    setUser(mapUser(session.user, fullName));
  }
}, [supabase]);
```

**Step 3: Guard initial hydration against later auth events**

Capture `authEventVersionRef.current` before calling `getSession()`. Apply either its success or failure only if the provider remains mounted and no auth callback has incremented that version. In `onAuthStateChange`, increment the auth-event version before calling `syncSession(session)`.

**Step 4: Reuse guarded synchronization for login and invalidate on logout**

After successful login, call `void syncSession(data.session)` instead of starting an unguarded profile callback. Increment `profileRequestVersionRef.current` when logout begins. Preserve the existing full-page redirect destinations and public method return types.

**Step 5: Invalidate work on cleanup**

Set `mountedRef.current = true` when the effect starts. In cleanup, set it false, increment both version refs, and unsubscribe.

**Step 6: Run focused tests**

Run: `npm run test -- __tests__/auth-context-race.test.tsx`

Expected: PASS.

---

### Task 3: Cover every stale completion boundary

**Objective:** Prove that no alternate asynchronous path can re-publish obsolete identity state.

**Files:**
- Modify: `__tests__/auth-context-race.test.tsx`
- Review: `context/AuthContext.tsx`

**Step 1: Add late initial-session tests**

- Emit user B before a pending `getSession()` resolves with user A; assert A is ignored.
- Emit user B before pending `getSession()` rejects; assert the rejection does not clear B.

**Step 2: Add logout and unmount tests**

- Begin a profile lookup, start/complete logout, then resolve the profile; assert the old user is not restored.
- Unmount with a profile lookup pending, resolve it, and assert no post-unmount state-update warning or publication occurs.

**Step 3: Add stable-client coverage**

Make the mocked `getSupabase()` return a fresh object on every call. Rerender the consumer and assert the factory, initial session load, and subscription were each created only once for the provider lifetime.

**Step 4: Run regression and project checks**

Run: `npm run test -- __tests__/auth-context-race.test.tsx __tests__/auth-feedback.test.ts __tests__/auth-redirect.test.ts`

Expected: all focused files pass.

Run: `git diff --check`

Expected: no whitespace errors.

**Step 5: Commit**

```bash
git add context/AuthContext.tsx __tests__/auth-context-race.test.tsx \
  docs/plans/2026-09-13-auth-session-consistency.md \
  scripts/baucompliance-pipeline/proposals/2026-09-13.md \
  scripts/baucompliance-pipeline/decisions/2026-09-13.md
git commit -m "fix: keep auth session state current"
```
