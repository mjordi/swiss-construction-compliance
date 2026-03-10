"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, FileText, Lock, Check, Zap, Building2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import Script from "next/script";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "BauCompliance.ch",
  url: "https://baucompliance.ch",
  description:
    "Automatische Mängelrüge-Fristen nach OR Art. 370a. Digitale Abnahmeprotokolle und Risiko-Matrix für das Schweizer Baurecht 2026.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: [
    {
      "@type": "Offer",
      name: "Starter",
      price: "0",
      priceCurrency: "CHF",
    },
    {
      "@type": "Offer",
      name: "Professional",
      price: "89",
      priceCurrency: "CHF",
    },
  ],
  publisher: {
    "@type": "Organization",
    name: "BauCompliance.ch",
    url: "https://baucompliance.ch",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Zürich",
      addressCountry: "CH",
    },
  },
  keywords:
    "Mängelrüge Frist 2026, OR Revision Baurecht, Abnahmeprotokoll digital Schweiz, BauCompliance, OR Art. 370a",
};

export default function Home() {
  const { t, lang, setLanguage } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col">
      <Script
        id="json-ld-software"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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

      {/* Pricing Section */}
      <section id="pricing" className="w-full max-w-5xl mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 font-[family-name:var(--font-outfit)]">
            {t("pricing-title")}
          </h2>
          <p className="text-slate-400 text-lg">{t("pricing-subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Starter */}
          <div className="glass p-8 rounded-2xl flex flex-col gap-6 hover:border-white/20 transition">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-slate-400" />
                <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">{t("plan-starter")}</span>
              </div>
              <div className="flex items-end gap-1 mb-3">
                <span className="text-4xl font-extrabold">{t("plan-starter-price")}</span>
                <span className="text-slate-400 mb-1">{t("plan-starter-period")}</span>
              </div>
              <p className="text-sm text-slate-400">{t("plan-starter-desc")}</p>
            </div>
            <ul className="space-y-3 flex-1">
              {(["plan-starter-f1", "plan-starter-f2", "plan-starter-f3"] as const).map((k) => (
                <li key={k} className="flex items-center gap-2 text-sm text-slate-300">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                  {t(k)}
                </li>
              ))}
            </ul>
            <Link href="/login" className="w-full py-3 text-center glass border border-white/10 text-white font-bold rounded-xl hover:bg-white/5 transition text-sm">
              {t("plan-starter-cta")}
            </Link>
          </div>

          {/* Professional */}
          <div className="relative glass p-8 rounded-2xl flex flex-col gap-6 border border-accent/40 shadow-[0_0_40px_rgba(249,115,22,0.15)]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-accent text-white text-xs font-bold rounded-full uppercase tracking-wider">
              Popular
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-5 h-5 text-accent" />
                <span className="text-sm font-bold text-accent uppercase tracking-wider">{t("plan-pro")}</span>
              </div>
              <div className="flex items-end gap-1 mb-3">
                <span className="text-4xl font-extrabold">{t("plan-pro-price")}</span>
                <span className="text-slate-400 mb-1">{t("plan-pro-period")}</span>
              </div>
              <p className="text-sm text-slate-400">{t("plan-pro-desc")}</p>
            </div>
            <ul className="space-y-3 flex-1">
              {(["plan-pro-f1", "plan-pro-f2", "plan-pro-f3", "plan-pro-f4"] as const).map((k) => (
                <li key={k} className="flex items-center gap-2 text-sm text-slate-300">
                  <Check className="w-4 h-4 text-accent flex-shrink-0" />
                  {t(k)}
                </li>
              ))}
            </ul>
            <Link href="/login" className="w-full py-3 text-center bg-accent hover:bg-accent/90 text-white font-bold rounded-xl shadow-lg shadow-accent/20 transition text-sm">
              {t("plan-pro-cta")}
            </Link>
          </div>

          {/* Enterprise */}
          <div className="glass p-8 rounded-2xl flex flex-col gap-6 hover:border-white/20 transition">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-5 h-5 text-slate-400" />
                <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">{t("plan-enterprise")}</span>
              </div>
              <div className="flex items-end gap-1 mb-3">
                <span className="text-3xl font-extrabold">{t("plan-enterprise-price")}</span>
              </div>
              <p className="text-sm text-slate-400">{t("plan-enterprise-desc")}</p>
            </div>
            <ul className="space-y-3 flex-1">
              {(["plan-enterprise-f1", "plan-enterprise-f2", "plan-enterprise-f3", "plan-enterprise-f4"] as const).map((k) => (
                <li key={k} className="flex items-center gap-2 text-sm text-slate-300">
                  <Check className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  {t(k)}
                </li>
              ))}
            </ul>
            <a href="mailto:hello@baucompliance.ch" className="w-full py-3 text-center glass border border-white/10 text-white font-bold rounded-xl hover:bg-white/5 transition text-sm">
              {t("plan-enterprise-cta")}
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-10 text-center text-slate-500 text-sm">
        <p>&copy; 2026 BauCompliance.ch | Zürich • Genève • Lugano</p>
      </footer>
    </div>
  );
}
