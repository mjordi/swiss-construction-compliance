"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, FileText, Lock, Check, Zap, Building2, Users, AlertTriangle, Calculator, ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import Script from "next/script";
import { motion } from "framer-motion";

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
      name: "Team",
      price: "29",
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

const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.7, ease: easeOut },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const fadeChild = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } },
};

export default function Home() {
  const { t, lang, setLanguage } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col noise-overlay">
      <Script
        id="json-ld-software"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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
            <nav className="hidden md:flex gap-8 text-[13px] font-medium text-muted">
              <a href="#features" className="hover:text-cream transition-colors duration-300">{t("nav-home")}</a>
              <Link href="/tools/ruegefrist-rechner" className="hover:text-cream transition-colors duration-300">{t("nav-tools")}</Link>
              <a href="#pricing" className="hover:text-cream transition-colors duration-300">{t("nav-pricing")}</a>
            </nav>

            <div className="flex bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5">
              {(['de', 'fr', 'it', 'rm', 'en'] as const).map((l) => (
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

      {/* Hero */}
      <section className="relative px-6 md:px-10 pt-20 md:pt-32 pb-24 md:pb-40 max-w-7xl mx-auto w-full">
        {/* Decorative "60" */}
        <div
          className="absolute -right-10 md:right-0 top-8 md:top-16 text-[280px] md:text-[420px] font-[family-name:var(--font-display)] italic text-white/[0.02] leading-none select-none pointer-events-none"
          aria-hidden="true"
        >
          60
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="relative z-10 max-w-3xl"
        >
          {/* Badge */}
          <motion.div variants={fadeChild} className="mb-10">
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-lg bg-accent/[0.06] border border-accent/15">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-accent/90">
                {t("hero-badge")}
              </span>
            </div>
          </motion.div>

          {/* Title */}
          <motion.h1
            variants={fadeChild}
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-[family-name:var(--font-display)] italic text-cream leading-[0.95] mb-8"
          >
            {t("hero-title")}
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={fadeChild}
            className="text-lg md:text-xl text-muted max-w-2xl leading-relaxed mb-12"
          >
            {t("hero-subtitle")}
          </motion.p>

          {/* CTAs */}
          <motion.div variants={fadeChild} className="flex gap-4 flex-col sm:flex-row">
            <Link
              href="/login"
              className="group px-8 py-4 bg-accent text-white rounded-lg font-semibold text-[15px] hover:bg-accent/90 transition-all duration-300 shadow-[0_8px_32px_rgba(217,119,6,0.3)] hover:shadow-[0_12px_40px_rgba(217,119,6,0.4)] flex items-center justify-center gap-2"
            >
              {t("btn-secure")}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
            </Link>
            <Link
              href="/tools/ruegefrist-rechner"
              className="px-8 py-4 border border-white/10 text-cream rounded-lg font-semibold text-[15px] hover:bg-white/[0.03] hover:border-white/15 transition-all duration-300 text-center"
            >
              {t("btn-law")}
            </Link>
          </motion.div>
        </motion.div>

        {/* Decorative line */}
        <div className="absolute bottom-0 left-6 md:left-10 right-6 md:right-10 h-px bg-gradient-to-r from-white/[0.08] via-white/[0.04] to-transparent" />
      </section>

      {/* Features */}
      <section id="features" className="px-6 md:px-10 py-24 md:py-32 max-w-7xl mx-auto w-full">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.div variants={fadeChild} className="section-marker mb-12">
            {t("nav-home")}
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: FileText, titleKey: "feat-handover-title" as const, descKey: "feat-handover-desc" as const, num: "01" },
              { icon: ShieldCheck, titleKey: "feat-warranty-title" as const, descKey: "feat-warranty-desc" as const, num: "02" },
              { icon: Lock, titleKey: "feat-evidence-title" as const, descKey: "feat-evidence-desc" as const, num: "03" },
            ].map((feat) => (
              <motion.div
                key={feat.num}
                variants={fadeChild}
                className="feature-card group relative p-8 md:p-10 rounded-2xl bg-white/[0.02] border border-white/[0.05] overflow-hidden"
              >
                {/* Number watermark */}
                <span className="absolute top-6 right-8 text-[72px] font-[family-name:var(--font-display)] italic text-white/[0.03] leading-none select-none">
                  {feat.num}
                </span>

                <div className="relative z-10">
                  <feat.icon className="w-8 h-8 text-accent/80 mb-6 group-hover:text-accent transition-colors duration-500" />
                  <h3 className="text-lg font-semibold text-cream mb-3 tracking-tight">{t(feat.titleKey)}</h3>
                  <p className="text-sm text-muted leading-relaxed">{t(feat.descKey)}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* What's at stake */}
      <section className="px-6 md:px-10 py-24 md:py-32 max-w-7xl mx-auto w-full">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.div variants={fadeChild} className="max-w-2xl mb-16">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-red-500/[0.06] border border-red-500/15 mb-8">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-red-400">
                {t("stakes-title")}
              </span>
            </div>
            <p className="text-lg text-muted leading-relaxed">{t("stakes-desc")}</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {([
              { value: "stakes-stat1-value", unit: "stakes-stat1-unit", label: "stakes-stat1-label" },
              { value: "stakes-stat2-value", unit: "stakes-stat2-unit", label: "stakes-stat2-label" },
              { value: "stakes-stat3-value", unit: "stakes-stat3-unit", label: "stakes-stat3-label" },
            ] as const).map((stat, i) => (
              <motion.div
                key={stat.label}
                custom={i}
                variants={fadeUp}
                className="relative p-8 md:p-10 rounded-2xl bg-white/[0.02] border border-white/[0.05]"
              >
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-5xl md:text-6xl font-[family-name:var(--font-display)] italic text-cream">
                    {t(stat.value)}
                  </span>
                  {t(stat.unit) && (
                    <span className="text-lg font-[family-name:var(--font-display)] italic text-accent">{t(stat.unit)}</span>
                  )}
                </div>
                <p className="text-sm text-muted">{t(stat.label)}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Calculator promo */}
      <section className="px-6 md:px-10 py-12 max-w-7xl mx-auto w-full">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={fadeChild}
        >
          <div className="relative rounded-2xl border border-accent/15 overflow-hidden">
            {/* Background pattern */}
            <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.04] via-transparent to-transparent" />
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, var(--accent) 1px, transparent 0)`,
                backgroundSize: "24px 24px",
              }}
            />

            <div className="relative z-10 p-8 md:p-14 flex flex-col md:flex-row items-start md:items-center gap-8">
              <div className="w-14 h-14 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                <Calculator className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-cream mb-2 tracking-tight">{t("calc-promo-title")}</h3>
                <p className="text-muted text-[15px] leading-relaxed">{t("calc-promo-desc")}</p>
              </div>
              <Link
                href="/tools/ruegefrist-rechner"
                className="group flex items-center gap-2 px-7 py-3.5 bg-accent text-white rounded-lg font-semibold text-[14px] hover:bg-accent/90 transition-all duration-300 shadow-[0_6px_24px_rgba(217,119,6,0.25)] whitespace-nowrap"
              >
                {t("calc-promo-cta")}
                <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Social proof */}
      <section className="px-6 md:px-10 py-16 max-w-7xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="flex items-center gap-6"
        >
          <div className="h-px flex-1 bg-white/[0.05]" />
          <p className="text-[13px] text-muted/60 text-center max-w-md">{t("social-proof")}</p>
          <div className="h-px flex-1 bg-white/[0.05]" />
        </motion.div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 md:px-10 py-24 md:py-32 max-w-7xl mx-auto w-full">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.div variants={fadeChild} className="section-marker mb-6">
            {t("nav-pricing")}
          </motion.div>

          <motion.div variants={fadeChild} className="mb-16 max-w-lg">
            <h2 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] italic text-cream leading-tight mb-4">
              {t("pricing-title")}
            </h2>
            <p className="text-muted text-lg">{t("pricing-subtitle")}</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Starter */}
            <motion.div variants={fadeChild} className="pricing-card p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex flex-col gap-6">
              <div>
                <div className="flex items-center gap-2.5 mb-4">
                  <Zap className="w-4 h-4 text-muted" />
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-[0.12em]">{t("plan-starter")}</span>
                </div>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-3xl font-[family-name:var(--font-display)] italic text-cream">{t("plan-starter-price")}</span>
                  <span className="text-sm text-muted">{t("plan-starter-period")}</span>
                </div>
                <p className="text-sm text-muted">{t("plan-starter-desc")}</p>
              </div>
              <ul className="space-y-3 flex-1">
                {(["plan-starter-f1", "plan-starter-f2", "plan-starter-f3"] as const).map((k) => (
                  <li key={k} className="flex items-center gap-2.5 text-[13px] text-cream/70">
                    <Check className="w-3.5 h-3.5 text-green-400/70 flex-shrink-0" />
                    {t(k)}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="w-full py-3 text-center text-[13px] border border-white/[0.08] text-cream/80 font-semibold rounded-lg hover:bg-white/[0.03] hover:border-white/[0.12] transition-all duration-300">
                {t("plan-starter-cta")}
              </Link>
            </motion.div>

            {/* Team */}
            <motion.div variants={fadeChild} className="pricing-card p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex flex-col gap-6">
              <div>
                <div className="flex items-center gap-2.5 mb-4">
                  <Users className="w-4 h-4 text-muted" />
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-[0.12em]">{t("plan-team")}</span>
                </div>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-3xl font-[family-name:var(--font-display)] italic text-cream">{t("plan-team-price")}</span>
                  <span className="text-sm text-muted">{t("plan-team-period")}</span>
                </div>
                <p className="text-sm text-muted">{t("plan-team-desc")}</p>
              </div>
              <ul className="space-y-3 flex-1">
                {(["plan-team-f1", "plan-team-f2", "plan-team-f3", "plan-team-f4"] as const).map((k) => (
                  <li key={k} className="flex items-center gap-2.5 text-[13px] text-cream/70">
                    <Check className="w-3.5 h-3.5 text-green-400/70 flex-shrink-0" />
                    {t(k)}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="w-full py-3 text-center text-[13px] border border-white/[0.08] text-cream/80 font-semibold rounded-lg hover:bg-white/[0.03] hover:border-white/[0.12] transition-all duration-300">
                {t("plan-team-cta")}
              </Link>
            </motion.div>

            {/* Professional */}
            <motion.div variants={fadeChild} className="pricing-card relative p-8 rounded-2xl bg-white/[0.02] border border-accent/25 flex flex-col gap-6 shadow-[0_0_50px_rgba(217,119,6,0.08)]">
              <div className="absolute -top-3 left-8 px-3 py-1 bg-accent text-white text-[10px] font-bold rounded tracking-[0.08em] uppercase">
                {t("pricing-popular")}
              </div>
              <div>
                <div className="flex items-center gap-2.5 mb-4">
                  <ShieldCheck className="w-4 h-4 text-accent" />
                  <span className="text-[11px] font-semibold text-accent uppercase tracking-[0.12em]">{t("plan-pro")}</span>
                </div>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-3xl font-[family-name:var(--font-display)] italic text-cream">{t("plan-pro-price")}</span>
                  <span className="text-sm text-muted">{t("plan-pro-period")}</span>
                </div>
                <p className="text-sm text-muted">{t("plan-pro-desc")}</p>
              </div>
              <ul className="space-y-3 flex-1">
                {(["plan-pro-f1", "plan-pro-f2", "plan-pro-f3", "plan-pro-f4"] as const).map((k) => (
                  <li key={k} className="flex items-center gap-2.5 text-[13px] text-cream/70">
                    <Check className="w-3.5 h-3.5 text-accent/80 flex-shrink-0" />
                    {t(k)}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="w-full py-3 text-center text-[13px] bg-accent hover:bg-accent/90 text-white font-semibold rounded-lg shadow-[0_4px_16px_rgba(217,119,6,0.2)] transition-all duration-300">
                {t("plan-pro-cta")}
              </Link>
            </motion.div>

            {/* Enterprise */}
            <motion.div variants={fadeChild} className="pricing-card p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex flex-col gap-6">
              <div>
                <div className="flex items-center gap-2.5 mb-4">
                  <Building2 className="w-4 h-4 text-muted" />
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-[0.12em]">{t("plan-enterprise")}</span>
                </div>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-2xl font-[family-name:var(--font-display)] italic text-cream">{t("plan-enterprise-price")}</span>
                </div>
                <p className="text-sm text-muted">{t("plan-enterprise-desc")}</p>
              </div>
              <ul className="space-y-3 flex-1">
                {(["plan-enterprise-f1", "plan-enterprise-f2", "plan-enterprise-f3", "plan-enterprise-f4"] as const).map((k) => (
                  <li key={k} className="flex items-center gap-2.5 text-[13px] text-cream/70">
                    <Check className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                    {t(k)}
                  </li>
                ))}
              </ul>
              <a href="mailto:hello@baucompliance.ch" className="w-full py-3 text-center text-[13px] border border-white/[0.08] text-cream/80 font-semibold rounded-lg hover:bg-white/[0.03] hover:border-white/[0.12] transition-all duration-300">
                {t("plan-enterprise-cta")}
              </a>
            </motion.div>
          </div>
        </motion.div>
      </section>

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
