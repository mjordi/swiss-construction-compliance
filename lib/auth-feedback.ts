import type { TranslationKey } from "@/locales";
import { CONFIG_ERROR_MESSAGE } from "@/lib/supabase";

export type AuthFeedback =
  | { kind: "translation"; key: TranslationKey }
  | { kind: "raw"; message: string };

function normalizeMessage(message: string) {
  return message.trim().toLowerCase();
}

export function getAuthFeedback(message: string | null | undefined): AuthFeedback | null {
  if (!message) return null;

  if (message === CONFIG_ERROR_MESSAGE) {
    return { kind: "translation", key: "login-error-config" };
  }

  const normalized = normalizeMessage(message);

  if (normalized.includes("invalid login credentials")) {
    return { kind: "translation", key: "login-error-invalid-credentials" };
  }

  if (normalized.includes("email not confirmed")) {
    return { kind: "translation", key: "login-error-email-not-confirmed" };
  }

  if (normalized.includes("user already registered")) {
    return { kind: "translation", key: "login-error-user-exists" };
  }

  if (normalized.includes("password should be at least 6 characters")) {
    return { kind: "translation", key: "login-error-password-too-short" };
  }

  if (normalized.includes("signups not allowed") || normalized.includes("signup is disabled")) {
    return { kind: "translation", key: "login-error-signup-disabled" };
  }

  return { kind: "raw", message };
}
