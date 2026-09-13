import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
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
  const { user, isLoading, login, logout } = useAuth();
  return (
    <>
      <output data-testid="user-id">{user?.id ?? "none"}</output>
      <output data-testid="user-name">{user?.name ?? "none"}</output>
      <output data-testid="loading">{String(isLoading)}</output>
      <button onClick={() => void login("a@example.test", "password")}>login</button>
      <button onClick={() => void logout()}>logout</button>
    </>
  );
}

type AuthCallback = (event: string, session: Session | null) => Promise<void> | void;
type SessionResult = { data: { session: Session | null } };
type SignInResult = { data: { session: Session | null }; error: null };
type SignOutResult = { error: null };

type Harness = {
  authCallback: () => AuthCallback;
  activeSubscriptions: () => number;
  getSession: ReturnType<typeof vi.fn>;
  onAuthStateChange: ReturnType<typeof vi.fn>;
  profileSingle: ReturnType<typeof vi.fn>;
  signInWithPassword: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
};

function createHarness(
  getSessionPromise: Promise<SessionResult>,
  options: {
    signInPromise?: Promise<SignInResult>;
    signOutPromise?: Promise<SignOutResult>;
    freshClientOnEveryFactoryCall?: boolean;
  } = {}
): Harness {
  let callback: AuthCallback | undefined;
  let activeSubscriptions = 0;
  const profileSingle = vi.fn();
  const unsubscribe = vi.fn(() => {
    activeSubscriptions -= 1;
  });
  const getSession = vi.fn(() => getSessionPromise);
  const onAuthStateChange = vi.fn((nextCallback: AuthCallback) => {
    callback = nextCallback;
    activeSubscriptions += 1;
    return { data: { subscription: { unsubscribe } } };
  });
  const signInWithPassword = vi.fn(() =>
    options.signInPromise ?? Promise.resolve({ data: { session: null }, error: null })
  );
  const signOut = vi.fn(() => options.signOutPromise ?? Promise.resolve({ error: null }));
  const makeClient = () => ({
    auth: {
      getSession,
      onAuthStateChange,
      signInWithPassword,
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
    activeSubscriptions: () => activeSubscriptions,
    getSession,
    onAuthStateChange,
    profileSingle,
    signInWithPassword,
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
  it("returns from the auth callback before profile enrichment settles", async () => {
    const profile = deferred<{ data: { full_name: string } }>();
    const harness = createHarness(Promise.resolve({ data: { session: null } }));
    harness.profileSingle.mockReturnValueOnce(profile.promise);

    renderProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    let callbackResult: ReturnType<AuthCallback> = Promise.resolve();
    act(() => {
      callbackResult = harness.authCallback()(
        "SIGNED_IN",
        makeSession(makeUser("user-a", "a@example.test"))
      );
    });

    expect(callbackResult).toBeUndefined();
    expect(harness.profileSingle).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("user-id").textContent).toBe("user-a");
    expect(screen.getByTestId("user-name").textContent).toBe("a");

    await act(async () => {
      profile.resolve({ data: { full_name: "User A" } });
      await profile.promise;
    });
    expect(screen.getByTestId("user-name").textContent).toBe("User A");
  });

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

  it("does not republish a delayed login response after a newer auth event", async () => {
    const loginResponse = deferred<SignInResult>();
    const userBProfile = deferred<{ data: { full_name: string } }>();
    const harness = createHarness(Promise.resolve({ data: { session: null } }), {
      signInPromise: loginResponse.promise,
    });
    harness.profileSingle.mockReturnValueOnce(userBProfile.promise);

    renderProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    fireEvent.click(screen.getByRole("button", { name: "login" }));
    expect(harness.signInWithPassword).toHaveBeenCalledWith({
      email: "a@example.test",
      password: "password",
    });

    await emitAuth(harness, makeSession(makeUser("user-b", "b@example.test")));
    await act(async () => {
      userBProfile.resolve({ data: { full_name: "User B" } });
      await userBProfile.promise;
    });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => {
      loginResponse.resolve({
        data: { session: makeSession(makeUser("user-a", "a@example.test")) },
        error: null,
      });
      await loginResponse.promise;
    });

    for (const [message] of consoleError.mock.calls) {
      expect(String(message)).toContain("Not implemented: navigation");
    }
    consoleError.mockRestore();
    expect(screen.getByTestId("user-id").textContent).toBe("user-b");
    expect(screen.getByTestId("user-name").textContent).toBe("User B");
    expect(harness.profileSingle).toHaveBeenCalledTimes(1);
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

  it("keeps exactly one active auth subscription during StrictMode replay", async () => {
    const harness = createHarness(Promise.resolve({ data: { session: null } }));

    const { unmount } = render(
      <StrictMode>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </StrictMode>
    );

    await waitFor(() => expect(harness.onAuthStateChange).toHaveBeenCalledTimes(2));
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.activeSubscriptions()).toBe(1);

    unmount();
    expect(harness.unsubscribe).toHaveBeenCalledTimes(2);
    expect(harness.activeSubscriptions()).toBe(0);
  });
});
