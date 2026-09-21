import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type User = { id: string; name: string; email: string };
type ProfileResult = {
  data: { full_name: string | null; company: string | null } | null;
  error: { message: string } | null;
};
type MutationResult = { error: { message: string } | null };

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

const mocks = vi.hoisted(() => ({
  currentUser: null as User | null,
  profileLoads: new Map<string, Array<Promise<ProfileResult>>>(),
  profileUpdates: new Map<string, Array<Promise<MutationResult>>>(),
  passwordUpdates: [] as Array<Promise<MutationResult>>,
  profileUpdateInvocations: vi.fn(),
  passwordUpdateInvocations: vi.fn(),
  logout: vi.fn(),
  replace: vi.fn(),
  getSupabase: vi.fn(),
  searchParamString: "",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/settings",
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.searchParamString),
}));

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "settings-marker": "Settings",
        "settings-title": "Settings",
        "settings-subtitle": "Manage profile",
        "settings-profile-title": "Profile",
        "settings-email": "Email",
        "settings-name": "Name",
        "settings-company": "Company",
        "settings-save": "Save",
        "settings-saved": "Saved",
        "settings-profile-load-error": "Profile load failed",
        "settings-profile-save-error": "Profile save failed",
        "settings-password-title": "Password",
        "settings-new-password": "New password",
        "settings-password-min": "Minimum 6 characters",
        "settings-update-password": "Update password",
        "settings-password-updated": "Password updated",
        "settings-password-recovery-guidance": "Choose a new password",
        "settings-signout-all": "Sign out",
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: mocks.currentUser, logout: mocks.logout }),
}));

vi.mock("@/components/dashboard/PageHeader", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: mocks.getSupabase,
}));

import SettingsPage from "@/app/dashboard/settings/page";

const userA = { id: "account-a", name: "Alice Account", email: "alice@example.test" };
const userB = { id: "account-b", name: "Bob Account", email: "bob@example.test" };

function queueProfileLoad(accountId: string, promise: Promise<ProfileResult>) {
  const queue = mocks.profileLoads.get(accountId) ?? [];
  queue.push(promise);
  mocks.profileLoads.set(accountId, queue);
}

function queueProfileUpdate(accountId: string, promise: Promise<MutationResult>) {
  const queue = mocks.profileUpdates.get(accountId) ?? [];
  queue.push(promise);
  mocks.profileUpdates.set(accountId, queue);
}

function profile(fullName: string, company: string): ProfileResult {
  return { data: { full_name: fullName, company }, error: null };
}

async function settle<T>(pending: Deferred<T>, value: T) {
  await act(async () => {
    pending.resolve(value);
    await pending.promise;
  });
}

async function reject<T>(pending: Deferred<T>, reason: unknown) {
  await act(async () => {
    pending.reject(reason);
    try {
      await pending.promise;
    } catch {
      // The component handles the rejection.
    }
  });
}

beforeEach(() => {
  mocks.currentUser = userA;
  mocks.profileLoads.clear();
  mocks.profileUpdates.clear();
  mocks.passwordUpdates.length = 0;
  mocks.profileUpdateInvocations.mockReset();
  mocks.passwordUpdateInvocations.mockReset();
  mocks.logout.mockReset();
  mocks.replace.mockReset();
  mocks.getSupabase.mockReset();
  mocks.searchParamString = "";

  mocks.getSupabase.mockReturnValue({
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: (_column: string, accountId: string) => ({
            maybeSingle: () => {
              const next = mocks.profileLoads.get(accountId)?.shift();
              if (!next) throw new Error(`Missing profile load for ${accountId}`);
              return next;
            },
          }),
        }),
        update: (values: { full_name: string; company: string }) => ({
          eq: (_column: string, accountId: string) => {
            mocks.profileUpdateInvocations(accountId, values);
            const next = mocks.profileUpdates.get(accountId)?.shift();
            if (!next) throw new Error(`Missing profile update for ${accountId}`);
            return next;
          },
        }),
      };
    },
    auth: {
      updateUser: (values: { password: string }) => {
        mocks.passwordUpdateInvocations(values);
        const next = mocks.passwordUpdates.shift();
        if (!next) throw new Error("Missing password update");
        return next;
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Settings account transitions", () => {
  it("clears account A fields and feedback immediately and waits for the account B load", async () => {
    const loadB = deferred<ProfileResult>();
    queueProfileLoad(userA.id, Promise.resolve(profile("Alice Secret", "Alice AG")));
    queueProfileLoad(userB.id, loadB.promise);

    const { rerender } = render(<SettingsPage />);
    const nameInputA = await screen.findByDisplayValue("Alice Secret");
    fireEvent.change(nameInputA, { target: { value: "Alice Draft" } });

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(screen.getAllByText("Minimum 6 characters")).toHaveLength(2);

    mocks.currentUser = userB;
    rerender(<SettingsPage />);

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Company") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("");
    expect(screen.getAllByText("Minimum 6 characters")).toHaveLength(1);
    expect(screen.getByLabelText("Name").getAttribute("disabled")).not.toBeNull();
    expect(screen.getByLabelText("Company").getAttribute("disabled")).not.toBeNull();
    const maskedSaveButton = screen.getByRole("button", { name: "Save" });
    const maskedPasswordButton = screen.getByRole("button", { name: "Update password" });
    expect(maskedSaveButton.getAttribute("disabled")).not.toBeNull();
    expect(maskedPasswordButton.getAttribute("disabled")).not.toBeNull();
    fireEvent.click(maskedSaveButton);
    fireEvent.click(maskedPasswordButton);
    expect(mocks.profileUpdateInvocations).not.toHaveBeenCalled();
    expect(mocks.passwordUpdateInvocations).not.toHaveBeenCalled();

    await settle(loadB, profile("Bob Builder", "Bob GmbH"));
    expect(screen.getByDisplayValue("Bob Builder")).toBeTruthy();
    expect(screen.getByDisplayValue("Bob GmbH")).toBeTruthy();
    expect(screen.getByLabelText("Name").getAttribute("disabled")).toBeNull();
  });

  it("ignores an account A profile load that settles after switching to account B", async () => {
    const loadA = deferred<ProfileResult>();
    const loadB = deferred<ProfileResult>();
    queueProfileLoad(userA.id, loadA.promise);
    queueProfileLoad(userB.id, loadB.promise);

    const { rerender } = render(<SettingsPage />);
    mocks.currentUser = userB;
    rerender(<SettingsPage />);

    await settle(loadA, profile("Alice Secret", "Alice AG"));
    expect(screen.queryByDisplayValue("Alice Secret")).toBeNull();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect(screen.getByLabelText("Name").getAttribute("disabled")).not.toBeNull();

    await settle(loadB, profile("Bob Builder", "Bob GmbH"));
    expect(screen.getByDisplayValue("Bob Builder")).toBeTruthy();
    expect(screen.getByDisplayValue("Bob GmbH")).toBeTruthy();
  });

  it.each(["returned error", "rejection"] as const)(
    "ignores a stale account A profile-load %s after switching to account B",
    async (outcome) => {
      const loadA = deferred<ProfileResult>();
      const loadB = deferred<ProfileResult>();
      queueProfileLoad(userA.id, loadA.promise);
      queueProfileLoad(userB.id, loadB.promise);

      const { rerender } = render(<SettingsPage />);
      mocks.currentUser = userB;
      rerender(<SettingsPage />);

      if (outcome === "returned error") {
        await settle(loadA, { data: null, error: { message: "Account A load failed" } });
      } else {
        await reject(loadA, new Error("Account A load rejected"));
      }

      expect(screen.queryByText("Profile load failed")).toBeNull();
      expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
      expect(screen.getByLabelText("Name").getAttribute("disabled")).not.toBeNull();

      await settle(loadB, profile("Bob Builder", "Bob GmbH"));
      expect(screen.getByDisplayValue("Bob Builder")).toBeTruthy();
      expect(screen.queryByText("Profile load failed")).toBeNull();
    }
  );

  it.each(["returned error", "rejection"] as const)(
    "keeps the current profile non-editable after a load %s",
    async (outcome) => {
      const load = deferred<ProfileResult>();
      queueProfileLoad(userA.id, load.promise);

      render(<SettingsPage />);
      if (outcome === "returned error") {
        await settle(load, { data: null, error: { message: "Profile unavailable" } });
      } else {
        await reject(load, new Error("Profile unavailable"));
      }

      expect(screen.getByRole("alert").textContent).toContain("Profile load failed");
      expect(screen.getByLabelText("Name").getAttribute("disabled")).not.toBeNull();
      expect(screen.getByLabelText("Company").getAttribute("disabled")).not.toBeNull();
      expect(screen.getByRole("button", { name: "Save" }).getAttribute("disabled")).not.toBeNull();

      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Unsafe partial profile" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(mocks.profileUpdateInvocations).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toContain("Profile load failed");
    }
  );

  it("in StrictMode ignores the replayed stale load and publishes only the current load", async () => {
    const replayedLoad = deferred<ProfileResult>();
    const currentLoad = deferred<ProfileResult>();
    queueProfileLoad(userA.id, replayedLoad.promise);
    queueProfileLoad(userA.id, currentLoad.promise);

    render(
      <StrictMode>
        <SettingsPage />
      </StrictMode>
    );

    await settle(replayedLoad, profile("Stale Alice", "Stale AG"));
    expect(screen.queryByDisplayValue("Stale Alice")).toBeNull();
    expect(screen.getByLabelText("Name").getAttribute("disabled")).not.toBeNull();

    await settle(currentLoad, profile("Current Alice", "Current AG"));
    expect(screen.getByDisplayValue("Current Alice")).toBeTruthy();
    expect(screen.getByDisplayValue("Current AG")).toBeTruthy();
    expect(screen.queryByDisplayValue("Stale Alice")).toBeNull();
  });

  it("makes all account-bound controls empty and non-actionable when the account disappears", async () => {
    queueProfileLoad(userA.id, Promise.resolve(profile("Alice Secret", "Alice AG")));

    const { rerender } = render(<SettingsPage />);
    const nameInput = await screen.findByDisplayValue("Alice Secret");
    fireEvent.change(nameInput, { target: { value: "Alice Draft" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "alice-password" } });

    mocks.currentUser = null;
    rerender(<SettingsPage />);

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Company") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("");
    expect(screen.getByLabelText("Name").getAttribute("disabled")).not.toBeNull();
    expect(screen.getByLabelText("Company").getAttribute("disabled")).not.toBeNull();
    expect(screen.getByLabelText("New password").getAttribute("disabled")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("disabled")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Update password" }).getAttribute("disabled")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(mocks.profileUpdateInvocations).not.toHaveBeenCalled();
    expect(mocks.passwordUpdateInvocations).not.toHaveBeenCalled();
  });

  it("clears pending profile and password state during an account transition", async () => {
    queueProfileLoad(userA.id, Promise.resolve(profile("Alice", "A AG")));
    const loadB = deferred<ProfileResult>();
    queueProfileLoad(userB.id, loadB.promise);
    const updateProfileA = deferred<MutationResult>();
    const updatePasswordA = deferred<MutationResult>();
    queueProfileUpdate(userA.id, updateProfileA.promise);
    mocks.passwordUpdates.push(updatePasswordA.promise);

    const { rerender } = render(<SettingsPage />);
    const nameInput = await screen.findByDisplayValue("Alice");
    fireEvent.change(nameInput, { target: { value: "Alice Pending" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "alice-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(mocks.profileUpdateInvocations).toHaveBeenCalledTimes(1);
    expect(mocks.profileUpdateInvocations).toHaveBeenCalledWith(userA.id, {
      full_name: "Alice Pending",
      company: "A AG",
    });
    expect(mocks.passwordUpdateInvocations).toHaveBeenCalledTimes(1);
    expect(mocks.passwordUpdateInvocations).toHaveBeenCalledWith({ password: "alice-password" });
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("disabled")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Update password" }).getAttribute("disabled")).not.toBeNull();

    mocks.currentUser = userB;
    rerender(<SettingsPage />);

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("button", { name: "Saved" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Password updated" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("disabled")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Update password" }).getAttribute("disabled")).not.toBeNull();

    await settle(loadB, profile("Bob", "B GmbH"));
    expect(screen.getByDisplayValue("Bob")).toBeTruthy();
    await settle(updateProfileA, { error: null });
    await settle(updatePasswordA, { error: null });
    expect(screen.queryByRole("button", { name: "Saved" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Password updated" })).toBeNull();
  });

  it.each(["success", "error", "rejection"] as const)(
    "ignores late account A profile-save %s and finally while account B save still works",
    async (outcome) => {
      queueProfileLoad(userA.id, Promise.resolve(profile("Alice", "A AG")));
      const loadB = deferred<ProfileResult>();
      queueProfileLoad(userB.id, loadB.promise);
      const updateA = deferred<MutationResult>();
      const updateB = deferred<MutationResult>();
      queueProfileUpdate(userA.id, updateA.promise);
      queueProfileUpdate(userB.id, updateB.promise);

      const { rerender } = render(<SettingsPage />);
      const nameInputA = await screen.findByDisplayValue("Alice");
      fireEvent.change(nameInputA, { target: { value: "Alice Pending" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      mocks.currentUser = userB;
      rerender(<SettingsPage />);
      await settle(loadB, profile("Bob", "B GmbH"));

      const nameInputB = screen.getByDisplayValue("Bob") as HTMLInputElement;
      fireEvent.change(nameInputB, { target: { value: "Bob Pending" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      const saveButton = screen.getByRole("button", { name: "Save" });
      expect(saveButton.getAttribute("disabled")).not.toBeNull();

      if (outcome === "success") {
        await settle(updateA, { error: null });
      } else if (outcome === "error") {
        await settle(updateA, { error: { message: "A save failed" } });
      } else {
        await reject(updateA, new Error("A save rejected"));
      }

      expect(nameInputB.value).toBe("Bob Pending");
      expect(screen.queryByText("Profile save failed")).toBeNull();
      expect(screen.queryByRole("button", { name: "Saved" })).toBeNull();
      expect(saveButton.getAttribute("disabled")).not.toBeNull();

      await settle(updateB, { error: null });
      expect(await screen.findByRole("button", { name: "Saved" })).toBeTruthy();
    }
  );

  it.each(["success", "error", "rejection"] as const)(
    "ignores late account A password %s and finally while account B update still works",
    async (outcome) => {
      mocks.searchParamString = "recovery=1&utm_source=test";
      queueProfileLoad(userA.id, Promise.resolve(profile("Alice", "A AG")));
      queueProfileLoad(userB.id, Promise.resolve(profile("Bob", "B GmbH")));
      const updateA = deferred<MutationResult>();
      const updateB = deferred<MutationResult>();
      mocks.passwordUpdates.push(updateA.promise, updateB.promise);

      const { rerender } = render(<SettingsPage />);
      await screen.findByDisplayValue("Alice");
      fireEvent.change(screen.getByLabelText("New password"), { target: { value: "alice-password" } });
      fireEvent.click(screen.getByRole("button", { name: "Update password" }));

      mocks.currentUser = userB;
      rerender(<SettingsPage />);
      await screen.findByDisplayValue("Bob");
      const passwordInputB = screen.getByLabelText("New password") as HTMLInputElement;
      expect(passwordInputB.value).toBe("");
      fireEvent.change(passwordInputB, { target: { value: "bob-password" } });
      fireEvent.click(screen.getByRole("button", { name: "Update password" }));
      const updateButton = screen.getByRole("button", { name: "Update password" });
      expect(updateButton.getAttribute("disabled")).not.toBeNull();

      if (outcome === "success") {
        await settle(updateA, { error: null });
      } else if (outcome === "error") {
        await settle(updateA, { error: { message: "Account A password failed" } });
      } else {
        await reject(updateA, new Error("Account A password rejected"));
      }

      expect(passwordInputB.value).toBe("bob-password");
      expect(screen.queryByText("Account A password failed")).toBeNull();
      expect(screen.queryByText("Account A password rejected")).toBeNull();
      expect(screen.queryByRole("button", { name: "Password updated" })).toBeNull();
      expect(updateButton.getAttribute("disabled")).not.toBeNull();
      expect(mocks.replace).not.toHaveBeenCalled();

      await settle(updateB, { error: null });
      expect(await screen.findByRole("button", { name: "Password updated" })).toBeTruthy();
      expect(mocks.replace).toHaveBeenCalledWith("/dashboard/settings?utm_source=test", { scroll: false });
    }
  );

  it("clears established success state and both success timers on account transition", async () => {
    vi.useFakeTimers();
    queueProfileLoad(userA.id, Promise.resolve(profile("Alice", "A AG")));
    const loadB = deferred<ProfileResult>();
    queueProfileLoad(userB.id, loadB.promise);
    queueProfileUpdate(userA.id, Promise.resolve({ error: null }));
    mocks.passwordUpdates.push(Promise.resolve({ error: null }));

    const { rerender } = render(<SettingsPage />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.change(screen.getByDisplayValue("Alice"), { target: { value: "Alice Saved" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "alice-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Saved" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Password updated" })).toBeTruthy();
    expect(vi.getTimerCount()).toBe(2);

    mocks.currentUser = userB;
    rerender(<SettingsPage />);

    expect(screen.queryByRole("button", { name: "Saved" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Password updated" })).toBeNull();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("");
    expect(vi.getTimerCount()).toBe(0);

    await settle(loadB, profile("Bob", "B GmbH"));
  });

  it("clears each success timer when a new edit starts", async () => {
    vi.useFakeTimers();
    queueProfileLoad(userA.id, Promise.resolve(profile("Alice", "A AG")));
    queueProfileUpdate(userA.id, Promise.resolve({ error: null }));
    mocks.passwordUpdates.push(Promise.resolve({ error: null }));

    render(<SettingsPage />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.change(screen.getByDisplayValue("Alice"), { target: { value: "Alice Saved" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "alice-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(vi.getTimerCount()).toBe(2);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alice New Draft" } });
    expect(screen.queryByRole("button", { name: "Saved" })).toBeNull();
    expect(vi.getTimerCount()).toBe(1);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password" } });
    expect(screen.queryByRole("button", { name: "Password updated" })).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores completions after unmount and clears success timers", async () => {
    vi.useFakeTimers();
    queueProfileLoad(userA.id, Promise.resolve(profile("Alice", "A AG")));
    const updateProfile = deferred<MutationResult>();
    const updatePassword = deferred<MutationResult>();
    queueProfileUpdate(userA.id, updateProfile.promise);
    mocks.passwordUpdates.push(updatePassword.promise);

    const { unmount } = render(<SettingsPage />);
    await act(async () => {
      await Promise.resolve();
    });
    const nameInput = screen.getByDisplayValue("Alice");
    fireEvent.change(nameInput, { target: { value: "Alice Pending" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "alice-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    unmount();
    await settle(updateProfile, { error: null });
    await settle(updatePassword, { error: null });

    expect(vi.getTimerCount()).toBe(0);
    expect(mocks.replace).not.toHaveBeenCalled();

    queueProfileLoad(userA.id, Promise.resolve(profile("Alice", "A AG")));
    queueProfileUpdate(userA.id, Promise.resolve({ error: null }));
    mocks.passwordUpdates.push(Promise.resolve({ error: null }));
    const second = render(<SettingsPage />);
    await act(async () => {
      await Promise.resolve();
    });
    const secondNameInput = screen.getByDisplayValue("Alice");
    fireEvent.change(secondNameInput, { target: { value: "Alice Saved" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "alice-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Saved" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Password updated" })).toBeTruthy();
    expect(vi.getTimerCount()).toBe(2);

    second.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
