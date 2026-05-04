"use client";

import { useMemo, useState } from "react";
import { Lock, Loader2, UserPlus, LogIn, FlaskConical } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import SiteHeader from "@/components/SiteHeader";
import { getAuthFeedback, type AuthFeedback } from "@/lib/auth-feedback";
import { CONFIG_ERROR_MESSAGE, isSupabaseConfigured } from "@/lib/supabase";
import type { TranslationKey } from "@/locales";
import {
  captureMarketingAttributionFromLocation,
  getStoredMarketingAttribution,
  type MarketingAttribution,
} from "@/lib/marketing-attribution";

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<AuthFeedback | null>(null);
  const [successKey, setSuccessKey] = useState<TranslationKey | null>(null);
  const { login, signUp } = useAuth();
  const { t } = useLanguage();
  const supabaseConfigured = isSupabaseConfigured();
  const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL;
  const demoPassword = process.env.NEXT_PUBLIC_DEMO_PASSWORD;

  const attribution = useMemo<MarketingAttribution | null>(() => {
    captureMarketingAttributionFromLocation();
    return getStoredMarketingAttribution();
  }, []);

  const errorMessage = error?.kind === "translation" ? t(error.key) : error?.message ?? null;
  const successMessage = successKey ? t(successKey) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessKey(null);
    setIsLoading(true);

    try {
      if (!supabaseConfigured) {
        setError(getAuthFeedback(CONFIG_ERROR_MESSAGE));
        setIsLoading(false);
        return;
      }

      if (isSignUp) {
        if (!fullName.trim()) {
          setError({ kind: "translation", key: "login-error-name-required" });
          setIsLoading(false);
          return;
        }
        const { error: signUpError } = await signUp(email, password, fullName, attribution);
        if (signUpError) {
          setError(getAuthFeedback(signUpError.message));
          setIsLoading(false);
        } else {
          setSuccessKey("login-signup-success");
          setIsLoading(false);
        }
      } else {
        const { error: loginError } = await login(email, password);
        if (loginError) {
          setError(getAuthFeedback(loginError.message));
          setIsLoading(false);
        }
        // On success, login() triggers window.location.href = "/dashboard"
        // which does a full page reload — keep spinner visible during navigation.
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? getAuthFeedback(err.message) ?? { kind: "translation", key: "login-error-generic" }
          : { kind: "translation", key: "login-error-generic" }
      );
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    if (!demoEmail || !demoPassword) return;
    setError(null);
    setSuccessKey(null);
    setIsSignUp(false);
    setEmail(demoEmail);
    setPassword(demoPassword);
    setIsLoading(true);
    try {
      const { error: loginError } = await login(demoEmail, demoPassword);
      if (loginError) {
        setError(getAuthFeedback(loginError.message));
        setIsLoading(false);
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? getAuthFeedback(err.message) ?? { kind: "translation", key: "login-error-generic" }
          : { kind: "translation", key: "login-error-generic" }
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col noise-overlay">
      <div className="h-[2px] bg-gradient-to-r from-accent via-accent/40 to-transparent" />

      <SiteHeader />

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05] relative">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent via-accent/30 to-transparent" />

            <div className="mb-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-accent/[0.08] border border-accent/15 flex items-center justify-center mx-auto mb-5">
                {isSignUp ? (
                  <UserPlus className="w-5 h-5 text-accent" />
                ) : (
                  <Lock className="w-5 h-5 text-accent" />
                )}
              </div>
              <h1 className="text-2xl font-[family-name:var(--font-display)] italic text-cream mb-1.5">
                {isSignUp ? t("login-signup-title") : t("btn-login")}
              </h1>
              <p className="text-[13px] text-muted">
                {isSignUp ? t("login-signup-subtitle") : t("login-subtitle")}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">
                    {t("login-name-label")}
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t("login-name-placeholder")}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-[14px] text-cream placeholder-muted/50 focus:outline-none focus:border-accent/40 transition-colors duration-200"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">
                  {t("login-email-label")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("login-email-placeholder")}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-[14px] text-cream placeholder-muted/50 focus:outline-none focus:border-accent/40 transition-colors duration-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">
                  {t("login-password-label")}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("login-password-placeholder")}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-[14px] text-cream placeholder-muted/50 focus:outline-none focus:border-accent/40 transition-colors duration-200"
                />
              </div>

              {!supabaseConfigured && (
                <div className="text-red-400 text-[13px] bg-red-400/[0.06] border border-red-400/15 rounded-lg px-4 py-2.5">
                  {t("login-error-config")}
                </div>
              )}

              {errorMessage && (
                <div className="text-red-400 text-[13px] bg-red-400/[0.06] border border-red-400/15 rounded-lg px-4 py-2.5">
                  {errorMessage}
                </div>
              )}

              {successMessage && (
                <div className="text-emerald-400 text-[13px] bg-emerald-400/[0.06] border border-emerald-400/15 rounded-lg px-4 py-2.5">
                  {successMessage}
                </div>
              )}

              <button
                disabled={isLoading || !supabaseConfigured}
                className="w-full bg-accent hover:bg-accent/90 text-white font-semibold py-2.5 rounded-lg shadow-lg shadow-accent/10 transition-all duration-200 flex items-center justify-center gap-2 mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> {t("login-authenticating")}
                  </>
                ) : isSignUp ? (
                  <>
                    <UserPlus className="w-4 h-4" /> {t("login-signup-btn")}
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" /> {t("btn-login")}
                  </>
                )}
              </button>
            </form>

            {demoEmail && demoPassword && (
              <div className="mt-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-white/[0.06]" />
                  <span className="text-[11px] text-muted/50 uppercase tracking-[0.1em]">{t("login-demo-divider")}</span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
                <button
                  type="button"
                  onClick={handleDemoLogin}
                  disabled={isLoading || !supabaseConfigured}
                  className="w-full bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] hover:border-accent/30 text-muted hover:text-cream font-semibold py-2.5 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FlaskConical className="w-4 h-4" />
                  {t("login-demo-account")}
                </button>
              </div>
            )}

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  setSuccessKey(null);
                }}
                className="text-[13px] text-muted hover:text-accent transition-colors duration-200"
              >
                {isSignUp ? t("login-have-account") : t("login-no-account")}
              </button>
            </div>

            <div className="mt-4 text-center text-[10px] text-muted/40 tracking-wide">
              {t("login-encryption")}
            </div>

            {attribution?.utm_source && (
              <div className="mt-2 text-center text-[10px] text-muted/40 tracking-wide">
                {t("login-source-prefix")} {attribution.utm_source}
                {attribution.utm_campaign ? ` · ${attribution.utm_campaign}` : ""}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
