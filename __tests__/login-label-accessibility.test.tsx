import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loginMock = vi.fn();
const signUpMock = vi.fn();
const resetPasswordForEmailMock = vi.fn();
const supabaseMock = { auth: { resetPasswordForEmail: resetPasswordForEmailMock } };

const translations: Record<string, string> = {
  "btn-login": "Log in",
  "login-subtitle": "Access your compliance dashboard",
  "login-email-label": "Work email",
  "login-email-placeholder": "name@example.ch",
  "login-password-label": "Password",
  "login-password-placeholder": "••••••••",
  "login-forgot-password": "Forgot password?",
  "login-recovery-sending": "Sending recovery link...",
  "login-recovery-email-required": "Enter your work email first.",
  "login-recovery-sent": "If an account exists, a recovery link has been sent.",
  "login-recovery-error": "We couldn't send the recovery link. Please try again.",
  "login-recovery-link-error": "This recovery link is invalid or expired. Request a new link and try again.",
  "login-authenticating": "Authenticating...",
  "login-encryption": "Protected by 256-bit Swiss banking-grade encryption",
  "login-demo-divider": "or",
  "login-demo-account": "Use demo account",
  "login-source-prefix": "Source:",
  "login-signup-title": "Create account",
  "login-signup-subtitle": "Start with BauCompliance",
  "login-signup-btn": "Create account",
  "login-signup-success": "Check your email for a confirmation link.",
  "login-name-label": "Full name",
  "login-name-placeholder": "Max Muster",
  "login-have-account": "Already have an account? Sign in",
  "login-no-account": "No account? Sign up",
  "login-error-config": "Supabase is not configured.",
};

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    login: loginMock,
    signUp: signUpMock,
  }),
}));

vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

vi.mock("@/components/SiteHeader", () => ({
  default: () => <header data-testid="site-header" />,
}));

vi.mock("@/lib/supabase", () => ({
  CONFIG_ERROR_MESSAGE: "Supabase is not configured.",
  isSupabaseConfigured: () => true,
  getSupabase: () => supabaseMock,
}));

vi.mock("@/lib/marketing-attribution", () => ({
  captureMarketingAttributionFromLocation: () => null,
  getStoredMarketingAttribution: () => null,
}));

import LoginPage from "@/app/login/page";

describe("login form label accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPasswordForEmailMock.mockReset();
    delete process.env.NEXT_PUBLIC_DEMO_EMAIL;
    delete process.env.NEXT_PUBLIC_DEMO_PASSWORD;
    window.history.replaceState({}, "", "/login");
  });

  it("exposes sign-in fields by their visible labels", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText("Work email")).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText("Password")).toBeInstanceOf(HTMLInputElement);
    expect(screen.queryByLabelText("Full name")).toBeNull();
  });

  it("keeps controls queryable by label while toggling sign-up and sign-in modes", () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "No account? Sign up" }));

    expect(screen.getByLabelText("Full name")).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText("Work email")).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText("Password")).toBeInstanceOf(HTMLInputElement);

    fireEvent.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));

    expect(screen.queryByLabelText("Full name")).toBeNull();
    expect(screen.getByLabelText("Work email")).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText("Password")).toBeInstanceOf(HTMLInputElement);
  });

  it("suppresses duplicate sign-in submits while the first login request is pending", () => {
    loginMock.mockReturnValue(new Promise(() => {}));
    render(<LoginPage />);

    const form = screen.getByRole("button", { name: "Log in" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(loginMock).toHaveBeenCalledTimes(1);
  });

  it("suppresses duplicate sign-up submits while the first signup request is pending", () => {
    signUpMock.mockReturnValue(new Promise(() => {}));
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "No account? Sign up" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Max Muster" } });

    const form = screen.getByRole("button", { name: "Create account" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(signUpMock).toHaveBeenCalledTimes(1);
  });

  it("suppresses duplicate demo login clicks while the first demo request is pending", () => {
    process.env.NEXT_PUBLIC_DEMO_EMAIL = "demo@example.ch";
    process.env.NEXT_PUBLIC_DEMO_PASSWORD = "demo-password";
    loginMock.mockReturnValue(new Promise(() => {}));
    render(<LoginPage />);

    const demoLogin = screen.getByRole("button", { name: "Use demo account" });
    fireEvent.click(demoLogin);
    fireEvent.click(demoLogin);

    expect(loginMock).toHaveBeenCalledTimes(1);
    expect(loginMock).toHaveBeenCalledWith("demo@example.ch", "demo-password");
  });

  it("requests a generic password-recovery email once and only in sign-in mode", async () => {
    let resolveRecovery: (value: { error: null }) => void = () => {};
    resetPasswordForEmailMock.mockReturnValueOnce(
      new Promise<{ error: null }>((resolve) => {
        resolveRecovery = resolve;
      })
    );
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByText("Enter your work email first.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: "owner@example.ch" },
    });
    const recoveryButton = screen.getByRole("button", { name: "Forgot password?" });
    fireEvent.click(recoveryButton);
    fireEvent.click(recoveryButton);

    expect(resetPasswordForEmailMock).toHaveBeenCalledTimes(1);
    expect(resetPasswordForEmailMock).toHaveBeenCalledWith("owner@example.ch", {
      redirectTo: `${window.location.origin}/auth/recovery`,
    });

    await act(async () => {
      resolveRecovery({ error: null });
    });
    expect(screen.getByText("If an account exists, a recovery link has been sent.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "No account? Sign up" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Forgot password?" })).toBeNull();
    });
  });

  it("shows generic recovery feedback without exposing auth-provider details", async () => {
    resetPasswordForEmailMock.mockResolvedValueOnce({
      error: { message: "User not found" },
    });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: "unknown@example.ch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));

    expect(await screen.findByText("We couldn't send the recovery link. Please try again.")).toBeTruthy();
    expect(screen.queryByText("User not found")).toBeNull();
  });

  it("explains recovery callback failures from the URL marker", async () => {
    window.history.replaceState({}, "", "/login?recovery_error=1");

    render(<LoginPage />);

    expect(
      await screen.findByText(
        "This recovery link is invalid or expired. Request a new link and try again."
      )
    ).toBeTruthy();
  });
});
