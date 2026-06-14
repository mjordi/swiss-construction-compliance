import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const loginMock = vi.fn();
const signUpMock = vi.fn();

const translations: Record<string, string> = {
  "btn-login": "Log in",
  "login-subtitle": "Access your compliance dashboard",
  "login-email-label": "Work email",
  "login-email-placeholder": "name@example.ch",
  "login-password-label": "Password",
  "login-password-placeholder": "••••••••",
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
}));

vi.mock("@/lib/marketing-attribution", () => ({
  captureMarketingAttributionFromLocation: () => null,
  getStoredMarketingAttribution: () => null,
}));

import LoginPage from "@/app/login/page";

describe("login form label accessibility", () => {
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
});
