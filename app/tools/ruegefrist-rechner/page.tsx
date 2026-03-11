"use client";

import Link from "next/link";
import { ArrowLeft, Scale, Clock } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import RuegefristCalculator from "@/components/ruegefrist-calculator";

export default function RuegefristRechnerPage() {
  const { t, lang, setLanguage } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="glass sticky top-0 z-50 px-8 py-5 flex justify-between items-center">
        <Link
          href="/"
          className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 font-[family-name:var(--font-outfit)]"
        >
          Bau<span className="text-accent">Compliance</span>
        </Link>
        <div className="flex gap-6 items-center">
          <div className="flex bg-white/5 border border-white/10 rounded-full p-1">
            {(["de", "fr", "it", "rm", "en"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                  lang === l
                    ? "bg-accent text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <Link
            href="/login"
            className="px-6 py-2 bg-white text-primary rounded-full font-bold text-sm hover:scale-105 transition shadow-[0_0_20px_rgba(255,255,255,0.2)]"
          >
            {t("btn-login")}
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-16 max-w-4xl mx-auto w-full">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("calc-back")}
        </Link>

        {/* Page header */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold mb-6 uppercase tracking-wider">
            <Scale className="w-3 h-3" />
            {t("calc-badge")}
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 font-[family-name:var(--font-outfit)] bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-500">
            {t("calc-title")}
          </h1>
          <p className="text-lg text-slate-400 max-w-xl mx-auto">
            {t("calc-subtitle")}
          </p>
        </div>

        {/* Calculator */}
        <RuegefristCalculator />

        {/* Legal Info Section */}
        <div className="mt-16 glass p-8 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-bold">{t("calc-info-title")}</h2>
          </div>
          <div className="space-y-3 text-sm text-slate-400">
            <p>{t("calc-info-p1")}</p>
            <p>{t("calc-info-p2")}</p>
            <p>{t("calc-info-p3")}</p>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/5 py-10 text-center text-slate-500 text-sm">
        <p>&copy; 2026 BauCompliance.ch | Zürich • Genève • Lugano</p>
      </footer>
    </div>
  );
}
