"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock, Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("demo@baucompliance.ch");
  const { login } = useAuth();
  const { t } = useLanguage();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      login(email);
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col noise-overlay">
      <div className="h-[2px] bg-gradient-to-r from-accent via-accent/40 to-transparent" />

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-cream transition-colors duration-300 mb-10"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("calc-back")}
          </Link>

          <div className="p-8 md:p-10 rounded-2xl bg-white/[0.02] border border-white/[0.05] relative">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent via-accent/30 to-transparent" />

            <div className="mb-10 text-center">
              <div className="w-14 h-14 rounded-xl bg-accent/[0.08] border border-accent/15 flex items-center justify-center mx-auto mb-6">
                <Lock className="w-6 h-6 text-accent" />
              </div>
              <h1 className="text-3xl font-[family-name:var(--font-display)] italic text-cream mb-2">
                {t("btn-login")}
              </h1>
              <p className="text-sm text-muted">Access your compliance dashboard</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-2">
                  Work Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-cream placeholder-muted/50 focus:outline-none focus:border-accent/40 transition-colors duration-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-2">
                  Password
                </label>
                <input
                  type="password"
                  defaultValue="password"
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-cream placeholder-muted/50 focus:outline-none focus:border-accent/40 transition-colors duration-300"
                />
              </div>

              <button
                disabled={isLoading}
                className="w-full bg-accent hover:bg-accent/90 text-white font-semibold py-3.5 rounded-lg shadow-lg shadow-accent/10 transition-all duration-300 flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Authenticating...
                  </>
                ) : (
                  t("btn-login")
                )}
              </button>
            </form>

            <div className="mt-8 text-center text-[11px] text-muted/50 tracking-wide">
              Protected by 256-bit Swiss Banking Grade Encryption
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
