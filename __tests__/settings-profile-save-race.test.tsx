import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logoutMock = vi.fn();
const updateUserMock = vi.fn();
const profileUpdateEqMock = vi.fn();

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "settings-marker": "Einstellungen",
        "settings-title": "Einstellungen",
        "settings-subtitle": "Profil verwalten",
        "settings-profile-title": "Profil",
        "settings-email": "E-Mail",
        "settings-name": "Name",
        "settings-company": "Firma",
        "settings-save": "Speichern",
        "settings-saved": "Gespeichert",
        "settings-profile-load-error": "Profil konnte nicht geladen werden.",
        "settings-profile-save-error": "Profil konnte nicht gespeichert werden.",
        "settings-password-title": "Passwort",
        "settings-new-password": "Neues Passwort",
        "settings-password-min": "Mindestens 6 Zeichen",
        "settings-update-password": "Passwort aktualisieren",
        "settings-password-updated": "Passwort aktualisiert",
        "settings-signout-all": "Abmelden",
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock("@/context/AuthContext", () => {
  const user = { id: "user-1", name: "Max Muster", email: "max@example.test" };

  return {
    useAuth: () => ({
      user,
      logout: logoutMock,
    }),
  };
});

vi.mock("@/components/dashboard/PageHeader", () => ({
  default: ({ title, subtitle, marker }: { title: string; subtitle: string; marker: string }) => (
    <div>
      <div>{marker}</div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  ),
}));

vi.mock("@/lib/supabase", () => {
  let supabase: {
    from: () => {
      select: () => { eq: () => { maybeSingle: () => Promise<{ data: { full_name: string; company: string }; error: null }> } };
      update: () => { eq: typeof profileUpdateEqMock };
    };
    auth: { updateUser: typeof updateUserMock };
  } | null = null;

  return {
    getSupabase: () => {
      supabase ??= {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { full_name: "Max Muster", company: "Bau AG" },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: profileUpdateEqMock,
          }),
        }),
        auth: {
          updateUser: updateUserMock,
        },
      };

      return supabase;
    },
  };
});

import SettingsPage from "@/app/dashboard/settings/page";

describe("settings profile save races", () => {
  beforeEach(() => {
    logoutMock.mockReset();
    updateUserMock.mockReset();
    profileUpdateEqMock.mockReset();
    updateUserMock.mockResolvedValue({ error: null });
  });

  it("does not overwrite newer profile edits when an older save resolves", async () => {
    let resolveProfileUpdate!: (value: { error: null }) => void;
    const pendingProfileUpdate = new Promise<{ error: null }>((resolve) => {
      resolveProfileUpdate = resolve;
    });
    profileUpdateEqMock.mockReturnValueOnce(pendingProfileUpdate);

    render(<SettingsPage />);

    const nameInput = await screen.findByDisplayValue("Max Muster") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Max Pending" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(profileUpdateEqMock).toHaveBeenCalledTimes(1);
    fireEvent.change(nameInput, { target: { value: "Max Newer" } });

    await act(async () => {
      resolveProfileUpdate({ error: null });
      await pendingProfileUpdate;
    });

    await waitFor(() => {
      expect(nameInput.value).toBe("Max Newer");
    });
    expect(screen.queryByRole("button", { name: "Gespeichert" })).toBeNull();
    expect(screen.getByRole("button", { name: "Speichern" }).getAttribute("disabled")).toBeNull();
  });
});
