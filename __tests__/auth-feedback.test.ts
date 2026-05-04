import { describe, expect, it } from "vitest";
import { getAuthFeedback } from "../lib/auth-feedback";
import { CONFIG_ERROR_MESSAGE } from "../lib/supabase";

describe("getAuthFeedback", () => {
  it("maps the placeholder config error to a translation key", () => {
    expect(getAuthFeedback(CONFIG_ERROR_MESSAGE)).toEqual({
      kind: "translation",
      key: "login-error-config",
    });
  });

  it("maps common Supabase login and signup errors to translation keys", () => {
    expect(getAuthFeedback("Invalid login credentials")).toEqual({
      kind: "translation",
      key: "login-error-invalid-credentials",
    });

    expect(getAuthFeedback("Email not confirmed")).toEqual({
      kind: "translation",
      key: "login-error-email-not-confirmed",
    });

    expect(getAuthFeedback("User already registered")).toEqual({
      kind: "translation",
      key: "login-error-user-exists",
    });

    expect(getAuthFeedback("Password should be at least 6 characters")).toEqual({
      kind: "translation",
      key: "login-error-password-too-short",
    });

    expect(getAuthFeedback("Signups not allowed for this instance")).toEqual({
      kind: "translation",
      key: "login-error-signup-disabled",
    });
  });

  it("preserves unknown provider messages for debugging visibility", () => {
    expect(getAuthFeedback("Unexpected upstream outage")).toEqual({
      kind: "raw",
      message: "Unexpected upstream outage",
    });
  });

  it("returns null for empty input", () => {
    expect(getAuthFeedback(null)).toBeNull();
    expect(getAuthFeedback(undefined)).toBeNull();
    expect(getAuthFeedback("")).toBeNull();
  });
});
