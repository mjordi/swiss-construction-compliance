import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let currentLang: "de" | "en" = "de";
const logoutMock = vi.fn();
const updateUserMock = vi.fn();

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const translations = {
        de: {
          "settings-marker": "Einstellungen",
          "settings-title": "Einstellungen",
          "settings-subtitle": "Profil verwalten",
          "settings-profile-title": "Profil",
          "settings-email": "E-Mail",
          "settings-name": "Name",
          "settings-company": "Firma",
          "settings-save": "Speichern",
          "settings-saved": "Gespeichert",
          "settings-password-title": "Passwort",
          "settings-new-password": "Neues Passwort",
          "settings-password-min": "Mindestens 6 Zeichen",
          "settings-update-password": "Passwort aktualisieren",
          "settings-password-updated": "Passwort aktualisiert",
          "settings-signout-all": "Abmelden",
        },
        en: {
          "settings-marker": "Settings",
          "settings-title": "Settings",
          "settings-subtitle": "Manage profile",
          "settings-profile-title": "Profile",
          "settings-email": "Email",
          "settings-name": "Name",
          "settings-company": "Company",
          "settings-save": "Save",
          "settings-saved": "Saved",
          "settings-password-title": "Password",
          "settings-new-password": "New password",
          "settings-password-min": "Minimum 6 characters",
          "settings-update-password": "Update password",
          "settings-password-updated": "Password updated",
          "settings-signout-all": "Sign out",
        },
      } as const;

      return translations[currentLang][key as keyof (typeof translations)[typeof currentLang]] ?? key;
    },
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    logout: logoutMock,
  }),
}));

vi.mock("@/components/dashboard/PageHeader", () => ({
  default: ({ title, subtitle, marker }: { title: string; subtitle: string; marker: string }) => (
    <div>
      <div>{marker}</div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  ),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
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
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
    auth: {
      updateUser: updateUserMock,
    },
  }),
}));

import SettingsPage from "@/app/dashboard/settings/page";

describe("settings password feedback", () => {
  beforeEach(() => {
    currentLang = "de";
    logoutMock.mockReset();
    updateUserMock.mockReset();
    updateUserMock.mockResolvedValue({ error: null });
  });

  it("associates settings field labels with their inputs", () => {
    render(<SettingsPage />);

    expect(screen.getByLabelText("Name")).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText("Firma")).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText("Neues Passwort")).toBeInstanceOf(HTMLInputElement);
  });

  it("re-translates the minimum password error when the language changes", async () => {
    const { rerender } = render(<SettingsPage />);

    const passwordInput = screen.getByPlaceholderText("••••••••");
    fireEvent.change(passwordInput, { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Passwort aktualisieren" }));

    const errorBanners = screen.getAllByText("Mindestens 6 Zeichen");
    expect(errorBanners.length).toBe(2);
    expect(errorBanners[1].tagName).toBe("DIV");

    currentLang = "en";
    rerender(<SettingsPage />);

    const translatedBanners = screen.getAllByText("Minimum 6 characters");
    expect(translatedBanners.length).toBe(2);
    expect(translatedBanners[1].tagName).toBe("DIV");
    expect(screen.queryByText("Mindestens 6 Zeichen")).toBeNull();
  });

  it("clears stale password feedback while the user edits the field", () => {
    render(<SettingsPage />);

    const passwordInput = screen.getByPlaceholderText("••••••••");
    fireEvent.change(passwordInput, { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Passwort aktualisieren" }));

    expect(screen.getAllByText("Mindestens 6 Zeichen").length).toBe(2);

    fireEvent.change(passwordInput, { target: { value: "1234" } });

    expect(screen.getAllByText("Mindestens 6 Zeichen").length).toBe(1);
  });

  it("recovers from rejected password updates and shows the raw error message", async () => {
    updateUserMock.mockRejectedValueOnce(new Error("Network down"));
    render(<SettingsPage />);

    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Passwort aktualisieren" }));

    const networkError = await screen.findByText("Network down");
    expect(networkError).toBeTruthy();

    const updateButton = screen.getByRole("button", { name: "Passwort aktualisieren" });
    expect(updateButton.getAttribute("disabled")).toBeNull();
  });

  it("does not show stale success or clear newer edits after a pending password update resolves", async () => {
    let resolveUpdate: (value: { error: null }) => void = () => {};
    updateUserMock.mockReturnValueOnce(
      new Promise<{ error: null }>((resolve) => {
        resolveUpdate = resolve;
      })
    );
    render(<SettingsPage />);

    const passwordInput = screen.getByPlaceholderText("••••••••") as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Passwort aktualisieren" }));

    await waitFor(() => expect(updateUserMock).toHaveBeenCalledWith({ password: "123456" }));

    fireEvent.change(passwordInput, { target: { value: "newer-password" } });

    await act(async () => {
      resolveUpdate({ error: null });
    });

    expect(passwordInput.value).toBe("newer-password");
    expect(screen.queryByRole("button", { name: "Passwort aktualisiert" })).toBeNull();

    const updateButton = screen.getByRole("button", { name: "Passwort aktualisieren" });
    expect(updateButton.getAttribute("disabled")).toBeNull();
  });
});
