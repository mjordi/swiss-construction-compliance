import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  getSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: mocks.getSupabase,
}));

import { AuthProvider, useAuth } from "@/context/AuthContext";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function makeUser(id: string, email: string): User {
  return {
    id,
    email,
    user_metadata: {},
  } as unknown as User;
}

function makeSession(user: User): Session {
  return { user } as unknown as Session;
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

type AuthCallback = (event: string, session: Session | null) => Promise<void> | void;
type SessionResult = { data: { session: Session | null } };
type SignOutResult = { error: null };

type Harness = {
  authCallback: () => AuthCallback;
  getSession: ReturnType<typeof vi.fn>;
  onAuthStateChange: ReturnType<typeof vi.fn>;
  profileSingle: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
};

function createHarness(
  getSessionPromise: Promise<SessionResult>,
  options: {
    signOutPromise?: Promise<SignOutResult>;
    freshClientOnEveryFactoryCall?: boolean;
  } = {}
): Harness {
  let callback: AuthCallback | undefined;
  const profileSingle = vi.fn();
  const unsubscribe = vi.fn();
  const getSession = vi.fn(() => getSessionPromise);
  const onAuthStateChange = vi.fn((nextCallback: AuthCallback) => {
    callback = nextCallback;
    return { data: { subscription: { unsubscribe } } };
  });
  const signOut = vi.fn(() => options.signOutPromise ?? Promise.resolve({ error: null }));
  const makeClient = () => ({
    auth: {
      getSession,
      onAuthStateChange,
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut,
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ single: profileSingle }),
      }),
    })),
  });

  if (options.freshClientOnEveryFactoryCall) {
    mocks.getSupabase.mockImplementation(makeClient);
  } else {
    mocks.getSupabase.mockReturnValue(makeClient());
  }

  return {
    authCallback: () => {
      if (!callback) throw new Error("Auth callback was not registered");
      return callback;
    },
    getSession,
    onAuthStateChange,
    profileSingle,
    signOut,
    unsubscribe,
  };
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );
}

async function emitAuth(harness: Harness, session: Session | null) {
  await act(async () => {
    void harness.authCallback()(session ? "SIGNED_IN" : "SIGNED_OUT", session);
  });
}

beforeEach(() => {
  mocks.getSupabase.mockReset();
});

describe("AuthProvider async session consistency", () => {
  it("keeps the newest account when an older profile lookup resolves last", async () => {
    const userAProfile = deferred<{ data: { full_name: string } }>();
    const userBProfile = deferred<{ data: { full_name: string } }>();
    const harness = createHarness(Promise.resolve({ data: { session: null } }));
    harness.profileSingle
      .mockReturnValueOnce(userAProfile.promise)
      .mockReturnValueOnce(userBProfile.promise);

    renderProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    await emitAuth(harness, makeSession(makeUser("user-a", "a@example.test")));
    expect(screen.getByTestId("user-id").textContent).toBe("user-a");

    await emitAuth(harness, makeSession(makeUser("user-b", "b@example.test")));
    expect(screen.getByTestId("user-id").textContent).toBe("user-b");

    await act(async () => {
      userBProfile.resolve({ data: { full_name: "User B" } });
      await userBProfile.promise;
    });
    expect(screen.getByTestId("user-name").textContent).toBe("User B");

    await act(async () => {
      userAProfile.resolve({ data: { full_name: "User A" } });
      await userAProfile.promise;
    });

    expect(screen.getByTestId("user-id").textContent).toBe("user-b");
    expect(screen.getByTestId("user-name").textContent).toBe("User B");
  });

  it("ignores a late initial session success after a newer auth event", async () => {
    const initialSession = deferred<SessionResult>();
    const userBProfile = deferred<{ data: { full_name: string } }>();
    const harness = createHarness(initialSession.promise);
    harness.profileSingle.mockReturnValueOnce(userBProfile.promise);

    renderProvider();
    await waitFor(() => expect(harness.onAuthStateChange).toHaveBeenCalledTimes(1));

    await emitAuth(harness, makeSession(makeUser("user-b", "b@example.test")));
    await act(async () => {
      userBProfile.resolve({ data: { full_name: "User B" } });
      await userBProfile.promise;
    });

    await act(async () => {
      initialSession.resolve({
        data: { session: makeSession(makeUser("user-a", "a@example.test")) },
      });
      await initialSession.promise;
    });

    expect(screen.getByTestId("user-id").textContent).toBe("user-b");
    expect(screen.getByTestId("user-name").textContent).toBe("User B");
    expect(harness.profileSingle).toHaveBeenCalledTimes(1);
  });

  it("ignores a late initial session rejection after a newer auth event", async () => {
    const initialSession = deferred<SessionResult>();
    const userBProfile = deferred<{ data: { full_name: string } }>();
    const harness = createHarness(initialSession.promise);
    harness.profileSingle.mockReturnValueOnce(userBProfile.promise);

    renderProvider();
    await waitFor(() => expect(harness.onAuthStateChange).toHaveBeenCalledTimes(1));

    await emitAuth(harness, makeSession(makeUser("user-b", "b@example.test")));
    await act(async () => {
      userBProfile.resolve({ data: { full_name: "User B" } });
      await userBProfile.promise;
    });

    await act(async () => {
      initialSession.reject(new Error("late hydration failure"));
      await initialSession.promise.catch(() => undefined);
    });

    expect(screen.getByTestId("user-id").textContent).toBe("user-b");
    expect(screen.getByTestId("user-name").textContent).toBe("User B");
  });

  it("invalidates pending profile work as soon as logout starts", async () => {
    const profile = deferred<{ data: { full_name: string } }>();
    const signOut = deferred<SignOutResult>();
    const harness = createHarness(Promise.resolve({ data: { session: null } }), {
      signOutPromise: signOut.promise,
    });
    harness.profileSingle.mockReturnValueOnce(profile.promise);

    renderProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    await emitAuth(harness, makeSession(makeUser("user-a", "a@example.test")));

    fireEvent.click(screen.getByRole("button", { name: "logout" }));
    expect(harness.signOut).toHaveBeenCalledTimes(1);

    await act(async () => {
      profile.resolve({ data: { full_name: "Stale User A" } });
      await profile.promise;
    });
    expect(screen.getByTestId("user-name").textContent).toBe("a");

    await act(async () => {
      signOut.resolve({ error: null });
      await signOut.promise;
    });
    expect(screen.getByTestId("user-id").textContent).toBe("none");
  });

  it("invalidates pending profile work and unsubscribes on unmount", async () => {
    const profile = deferred<{ data: { full_name: string } }>();
    const harness = createHarness(Promise.resolve({ data: { session: null } }));
    harness.profileSingle.mockReturnValueOnce(profile.promise);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { unmount } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    await emitAuth(harness, makeSession(makeUser("user-a", "a@example.test")));

    unmount();
    await act(async () => {
      profile.resolve({ data: { full_name: "Stale User A" } });
      await profile.promise;
    });

    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("keeps one Supabase client for the provider lifetime", async () => {
    const harness = createHarness(Promise.resolve({ data: { session: null } }), {
      freshClientOnEveryFactoryCall: true,
    });

    const { rerender } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    rerender(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await act(async () => undefined);
    expect(mocks.getSupabase).toHaveBeenCalledTimes(1);
    expect(harness.getSession).toHaveBeenCalledTimes(1);
    expect(harness.onAuthStateChange).toHaveBeenCalledTimes(1);
  });
});
