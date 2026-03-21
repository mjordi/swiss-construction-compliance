"use client";

import { useState } from "react";
import { Lock, Loader2, UserPlus, LogIn } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import SiteHeader from "@/components/SiteHeader";
import { CONFIG_ERROR_MESSAGE, isSupabaseConfigured } from "@/lib/supabase";

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { login, signUp } = useAuth();
  const { t } = useLanguage();
  const supabaseConfigured = isSupabaseConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      if (!supabaseConfigured) {
        setError(CONFIG_ERROR_MESSAGE);
        return;
      }

      if (isSignUp) {
        if (!fullName.trim()) {
          setError("Please enter your name.");
          setIsLoading(false);
          return;
        }
        const { error: signUpError } = await signUp(email, password, fullName);
        if (signUpError) {
          setError(signUpError.message);
        } else {
          setSuccess("Check your email for a confirmation link.");
        }
      } else {
        const { error: loginError } = await login(email, password);
        if (loginError) {
          setError(loginError.message);
        }
      }
    } finally {
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
                    placeholder="Max Muster"
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
                  placeholder="name@example.ch"
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
                  placeholder="••••••••"
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-[14px] text-cream placeholder-muted/50 focus:outline-none focus:border-accent/40 transition-colors duration-200"
                />
              </div>

              {!supabaseConfigured && (
                <div className="text-red-400 text-[13px] bg-red-400/[0.06] border border-red-400/15 rounded-lg px-4 py-2.5">
                  {CONFIG_ERROR_MESSAGE}
                </div>
              )}

              {error && (
                <div className="text-red-400 text-[13px] bg-red-400/[0.06] border border-red-400/15 rounded-lg px-4 py-2.5">
                  {error}
                </div>
              )}

              {success && (
                <div className="text-emerald-400 text-[13px] bg-emerald-400/[0.06] border border-emerald-400/15 rounded-lg px-4 py-2.5">
                  {success}
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

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  setSuccess(null);
                }}
                className="text-[13px] text-muted hover:text-accent transition-colors duration-200"
              >
                {isSignUp ? t("login-have-account") : t("login-no-account")}
              </button>
            </div>

            <div className="mt-4 text-center text-[10px] text-muted/40 tracking-wide">
              {t("login-encryption")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
