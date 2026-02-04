"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, FileText, Lock } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export default function Home() {
  const { t, lang, setLanguage } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="glass sticky top-0 z-50 px-8 py-5 flex justify-between items-center">
        <div className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 font-[family-name:var(--font-outfit)]">
          Bau<span className="text-accent">Compliance</span>
        </div>
        <div className="flex gap-6 items-center">
          <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-400">
            <a href="#features" className="hover:text-white transition">{t("nav-home")}</a>
            <a href="#pricing" className="hover:text-white transition">{t("nav-pricing")}</a>
          </nav>
          
          <div className="flex bg-white/5 border border-white/10 rounded-full p-1">
            {(['de', 'fr', 'it', 'rm', 'en'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                  lang === l ? "bg-accent text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          <Link href="/login" className="px-6 py-2 bg-white text-primary rounded-full font-bold text-sm hover:scale-105 transition shadow-[0_0_20px_rgba(255,255,255,0.2)]">
            {t("btn-login")}
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 pt-20 pb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold mb-8 uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
          {t("hero-badge")}
        </div>
        
        <h1 className="text-6xl md:text-8xl font-extrabold tracking-tight mb-6 font-[family-name:var(--font-outfit)] bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-500">
          {t("hero-title")}
        </h1>
        
        <p className="text-xl text-slate-400 max-w-2xl mb-12 font-light">
          {t("hero-subtitle")}
        </p>

        <div className="flex gap-4 flex-col sm:flex-row">
          <Link href="/login" className="px-8 py-4 bg-accent text-white rounded-full font-bold text-lg hover:bg-accent/90 transition shadow-[0_10px_30px_rgba(249,115,22,0.4)] flex items-center justify-center gap-2">
            {t("btn-secure")} <ArrowRight className="w-5 h-5" />
          </Link>
          <button className="px-8 py-4 glass text-white rounded-full font-bold text-lg hover:bg-white/5 transition">
            {t("btn-law")}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32 max-w-5xl w-full text-left">
          <div className="glass p-8 rounded-2xl hover:border-accent/50 transition group">
            <FileText className="w-10 h-10 text-accent mb-4 group-hover:scale-110 transition" />
            <h3 className="text-xl font-bold mb-2">{t("feat-handover-title")}</h3>
            <p className="text-slate-400 text-sm">{t("feat-handover-desc")}</p>
          </div>
          <div className="glass p-8 rounded-2xl hover:border-accent/50 transition group">
            <ShieldCheck className="w-10 h-10 text-accent mb-4 group-hover:scale-110 transition" />
            <h3 className="text-xl font-bold mb-2">{t("feat-warranty-title")}</h3>
            <p className="text-slate-400 text-sm">{t("feat-warranty-desc")}</p>
          </div>
          <div className="glass p-8 rounded-2xl hover:border-accent/50 transition group">
            <Lock className="w-10 h-10 text-accent mb-4 group-hover:scale-110 transition" />
            <h3 className="text-xl font-bold mb-2">{t("feat-evidence-title")}</h3>
            <p className="text-slate-400 text-sm">{t("feat-evidence-desc")}</p>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/5 py-10 text-center text-slate-500 text-sm">
        <p>&copy; 2026 BauCompliance.ch | Zürich • Genève • Lugano</p>
      </footer>
    </div>
  );
}
