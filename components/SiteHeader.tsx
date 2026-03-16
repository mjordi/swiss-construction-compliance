"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { SUPPORTED_LANGUAGES } from "@/locales";

interface SiteHeaderProps {
  showNav?: boolean;
  showLogin?: boolean;
}

export default function SiteHeader({ showNav = false, showLogin = false }: SiteHeaderProps) {
  const { t, lang, setLanguage } = useLanguage();

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0a0f1c]/80 border-b border-white/[0.04]">
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded bg-accent/10 border border-accent/20 flex items-center justify-center group-hover:bg-accent/15 transition-colors duration-300">
            <div className="w-3 h-3 rounded-sm bg-accent" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Bau<span className="text-accent">Compliance</span>
          </span>
        </Link>

        <div className="flex gap-6 items-center">
          {showNav && (
            <nav className="hidden md:flex gap-8 text-[13px] font-medium text-muted">
              <a href="#features" className="hover:text-cream transition-colors duration-300">
                {t("nav-home")}
              </a>
              <a href="#how-it-works" className="hover:text-cream transition-colors duration-300">
                {t("how-title")}
              </a>
              <Link href="/tools/ruegefrist-rechner" className="hover:text-cream transition-colors duration-300">
                {t("nav-tools")}
              </Link>
              <a href="#pricing" className="hover:text-cream transition-colors duration-300">
                {t("nav-pricing")}
              </a>
            </nav>
          )}

          <div className="flex bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5">
            {SUPPORTED_LANGUAGES.map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide transition-all duration-300 ${
                  lang === l ? "bg-accent/15 text-accent" : "text-muted hover:text-cream"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          {showLogin && (
            <Link
              href="/login"
              className="hidden sm:flex items-center gap-1.5 px-5 py-2 text-[13px] font-semibold text-background bg-cream rounded-lg hover:bg-white transition-colors duration-300"
            >
              {t("btn-login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
