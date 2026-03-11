"use client";

import Link from "next/link";
import { ArrowLeft, Scale, Clock } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import RuegefristCalculator from "@/components/ruegefrist-calculator";

export default function RuegefristRechnerPage() {
  const { t, lang, setLanguage } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col noise-overlay">
      {/* Top accent line */}
      <div className="h-[2px] bg-gradient-to-r from-accent via-accent/40 to-transparent" />

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0a0f1c]/80 border-b border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-accent/10 border border-accent/20 flex items-center justify-center">
              <div className="w-3 h-3 rounded-sm bg-accent" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Bau<span className="text-accent">Compliance</span>
            </span>
          </Link>

          <div className="flex gap-6 items-center">
            <div className="flex bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5">
              {(["de", "fr", "it", "en"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLanguage(l)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide transition-all duration-300 ${
                    lang === l
                      ? "bg-accent/15 text-accent"
                      : "text-muted hover:text-cream"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>

            <Link
              href="/login"
              className="hidden sm:flex items-center gap-1.5 px-5 py-2 text-[13px] font-semibold text-background bg-cream rounded-lg hover:bg-white transition-colors duration-300"
            >
              {t("btn-login")}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 md:px-10 py-16 max-w-4xl mx-auto w-full">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-cream transition-colors duration-300 mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("calc-back")}
        </Link>

        {/* Page header */}
        <div className="mb-14">
          <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-accent/[0.06] border border-accent/15 mb-8">
            <Scale className="w-3.5 h-3.5 text-accent" />
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-accent/90">
              {t("calc-badge")}
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] italic text-cream leading-tight mb-4">
            {t("calc-title")}
          </h1>
          <p className="text-lg text-muted max-w-xl leading-relaxed">
            {t("calc-subtitle")}
          </p>
        </div>

        {/* Calculator */}
        <RuegefristCalculator />

        {/* Legal Info Section */}
        <div className="mt-16 p-8 md:p-10 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
          <div className="flex items-center gap-2.5 mb-5">
            <Clock className="w-5 h-5 text-accent/80" />
            <h2 className="text-lg font-semibold text-cream tracking-tight">{t("calc-info-title")}</h2>
          </div>
          <div className="space-y-4 text-sm text-muted leading-relaxed">
            <p>{t("calc-info-p1")}</p>
            <p>{t("calc-info-p2")}</p>
            <p>{t("calc-info-p3")}</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/[0.04] px-6 md:px-10">
        <div className="max-w-7xl mx-auto py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[13px] text-muted/60">
            &copy; 2026 BauCompliance.ch &mdash; Zürich &bull; Genève &bull; Lugano
          </p>
          <div className="flex items-center gap-6 text-[13px] text-muted/60">
            <a href="/impressum" className="hover:text-cream transition-colors duration-300">{t("footer-impressum")}</a>
            <a href="/datenschutz" className="hover:text-cream transition-colors duration-300">{t("footer-datenschutz")}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
