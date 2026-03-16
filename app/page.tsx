"use client";

import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  FileText,
  Lock,
  Check,
  Zap,
  Building2,
  Users,
  AlertTriangle,
  Calculator,
  ArrowUpRight,
  ClipboardCheck,
  Timer,
  Camera,
  ChevronDown,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import Script from "next/script";
import { motion } from "framer-motion";
import SiteHeader from "@/components/SiteHeader";

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
    { "@type": "Offer", name: "Starter", price: "0", priceCurrency: "CHF" },
    { "@type": "Offer", name: "Team", price: "29", priceCurrency: "CHF" },
    { "@type": "Offer", name: "Professional", price: "89", priceCurrency: "CHF" },
  ],
  publisher: {
    "@type": "Organization",
    name: "BauCompliance.ch",
    url: "https://baucompliance.ch",
    address: { "@type": "PostalAddress", addressLocality: "Zürich", addressCountry: "CH" },
  },
  keywords:
    "Mängelrüge Frist 2026, OR Revision Baurecht, Abnahmeprotokoll digital Schweiz, BauCompliance, OR Art. 370a",
};

const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const fadeChild = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.7, ease: easeOut },
  }),
};

const RING_RADIUS = 120;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const TICK_MARKS = Array.from({ length: 60 }, (_, i) => {
  const angle = (i / 60) * 360 - 90;
  const rad = (angle * Math.PI) / 180;
  const r1 = 132;
  const r2 = i % 5 === 0 ? 126 : 129;
  return {
    key: i,
    x1: 140 + r1 * Math.cos(rad),
    y1: 140 + r1 * Math.sin(rad),
    x2: 140 + r2 * Math.cos(rad),
    y2: 140 + r2 * Math.sin(rad),
    stroke: i % 5 === 0 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
    strokeWidth: i % 5 === 0 ? 1.5 : 1,
  };
});

const floatA = { animate: { y: [0, -6, 0] }, transition: { duration: 5, repeat: Infinity, ease: "easeInOut" as const } };
const floatB = { animate: { y: [0, 6, 0] }, transition: { duration: 6, repeat: Infinity, ease: "easeInOut" as const, delay: 1 } };
const scrollBounce = { animate: { y: [0, 6, 0] }, transition: { duration: 2, repeat: Infinity } };

export default function Home() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col noise-overlay">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 z-[60] px-4 py-2 rounded-md bg-accent text-white text-sm font-semibold"
      >
        Zum Hauptinhalt springen
      </a>

      <Script
        id="json-ld-software"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Top accent line */}
      <div className="h-[2px] bg-gradient-to-r from-accent via-accent/40 to-transparent" />

      <SiteHeader showNav showLogin />

      <main id="main-content">
      {/* ──────────────────── Hero ──────────────────── */}
      <section
        id="hero"
        aria-labelledby="hero-title"
        className="relative px-6 md:px-10 pt-16 md:pt-24 pb-20 md:pb-32 max-w-7xl mx-auto w-full min-h-[85vh] flex items-center"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-8 items-center w-full">
          {/* Left: Text */}
          <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="relative z-10">
            <motion.div variants={fadeChild} className="mb-10">
              <div className="inline-flex items-center gap-3 px-4 py-2 rounded-lg bg-accent/[0.06] border border-accent/15">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-accent/90">
                  {t("hero-badge")}
                </span>
              </div>
            </motion.div>

            <motion.h1
              id="hero-title"
              variants={fadeChild}
              className="text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-[family-name:var(--font-display)] italic text-cream leading-[0.92] mb-8"
            >
              {t("hero-title")}
            </motion.h1>

            <motion.p variants={fadeChild} className="text-lg md:text-xl text-muted max-w-xl leading-relaxed mb-12">
              {t("hero-subtitle")}
            </motion.p>

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

          {/* Right: Countdown Ring Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.3, ease: easeOut }}
            className="relative flex items-center justify-center lg:justify-end"
          >
            {/* Glow behind ring */}
            <div className="absolute w-80 h-80 md:w-[420px] md:h-[420px] rounded-full bg-accent/[0.06] blur-[80px]" />

            <div className="relative">
              {/* SVG Countdown Ring */}
              <svg
                viewBox="0 0 280 280"
                className="w-64 h-64 md:w-80 md:h-80 countdown-ring"
                aria-hidden="true"
              >
                {/* Tick marks (pre-computed at module scope) */}
                {TICK_MARKS.map((tick) => (
                  <line
                    key={tick.key}
                    x1={tick.x1}
                    y1={tick.y1}
                    x2={tick.x2}
                    y2={tick.y2}
                    stroke={tick.stroke}
                    strokeWidth={tick.strokeWidth}
                  />
                ))}

                {/* Background ring */}
                <circle
                  cx="140"
                  cy="140"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth="3"
                />

                {/* Animated progress ring */}
                <motion.circle
                  cx="140"
                  cy="140"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="url(#ringGradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  initial={{ strokeDashoffset: CIRCUMFERENCE }}
                  animate={{ strokeDashoffset: CIRCUMFERENCE * 0.35 }}
                  transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1], delay: 0.6 }}
                  transform="rotate(-90 140 140)"
                  style={{ filter: "drop-shadow(0 0 8px rgba(217,119,6,0.4))" }}
                />

                {/* Gradient definition */}
                <defs>
                  <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#d97706" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>

                {/* Center number */}
                <text
                  x="140"
                  y="128"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="var(--cream)"
                  fontFamily="var(--font-display)"
                  fontStyle="italic"
                  fontSize="72"
                  className="select-none"
                >
                  60
                </text>
                <text
                  x="140"
                  y="168"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="var(--accent)"
                  fontFamily="var(--font-display)"
                  fontStyle="italic"
                  fontSize="18"
                  className="select-none"
                >
                  {t("stakes-stat1-unit")}
                </text>
              </svg>

              {/* Floating card — deadline example */}
              <motion.div
                className="absolute -right-6 md:-right-12 top-6 md:top-8 glass-card rounded-xl px-4 py-3 min-w-[140px]"
                animate={floatA.animate}
                transition={floatA.transition}
              >
                <div className="text-[9px] text-muted uppercase tracking-[0.15em] font-semibold mb-1">
                  {t("deadlines-60day-title")}
                </div>
                <div className="text-sm font-semibold text-cream">14.05.2026</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-[10px] text-green-400/80">23 {t("deadlines-days-remaining")}</span>
                </div>
              </motion.div>

              {/* Floating card — SIA badge */}
              <motion.div
                className="absolute -left-4 md:-left-10 bottom-8 md:bottom-12 glass-card rounded-xl px-4 py-3"
                animate={floatB.animate}
                transition={floatB.transition}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-accent" />
                  <span className="text-xs font-semibold text-cream">SIA 118</span>
                </div>
                <div className="text-[10px] text-muted mt-0.5">{t("trust-sia")}</div>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        >
          <span className="text-[10px] text-muted/50 uppercase tracking-[0.2em]">{t("hero-scroll")}</span>
          <motion.div animate={scrollBounce.animate} transition={scrollBounce.transition}>
            <ChevronDown className="w-4 h-4 text-muted/30" />
          </motion.div>
        </motion.div>

        {/* Bottom line */}
        <div className="absolute bottom-0 left-6 md:left-10 right-6 md:right-10 h-px bg-gradient-to-r from-white/[0.08] via-white/[0.04] to-transparent" />
      </section>

      {/* ──────────────────── Trust Metrics Bar ──────────────────── */}
      <section className="px-6 md:px-10 py-10 max-w-7xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-0 sm:divide-x sm:divide-white/[0.06]"
        >
          {([
            { value: "26", label: "trust-cantons" },
            { value: "SIA 118", label: "trust-sia" },
            { value: "60", label: "trust-deadline" },
          ] as const).map((item) => (
            <div key={item.label} className="flex items-center gap-3 sm:px-12">
              <span className="text-2xl font-[family-name:var(--font-display)] italic text-cream">
                {item.value}
              </span>
              <span className="text-[12px] text-muted font-medium uppercase tracking-wider">
                {t(item.label)}
              </span>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ──────────────────── Features ──────────────────── */}
      <section
        id="features"
        aria-labelledby="features-title"
        className="px-6 md:px-10 py-24 md:py-32 max-w-7xl mx-auto w-full"
      >
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.div id="features-title" variants={fadeChild} className="section-marker mb-12">
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
                {/* Accent top border */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent/60 via-accent/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                {/* Number watermark */}
                <span className="absolute top-6 right-8 text-[72px] font-[family-name:var(--font-display)] italic text-white/[0.03] leading-none select-none">
                  {feat.num}
                </span>

                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-accent/[0.06] border border-accent/10 flex items-center justify-center mb-6 group-hover:bg-accent/10 group-hover:border-accent/20 transition-all duration-500">
                    <feat.icon className="w-5 h-5 text-accent/80 group-hover:text-accent transition-colors duration-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-cream mb-3 tracking-tight">{t(feat.titleKey)}</h3>
                  <p className="text-sm text-muted leading-relaxed">{t(feat.descKey)}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ──────────────────── How it Works ──────────────────── */}
      <section id="how-it-works" className="px-6 md:px-10 py-24 md:py-32 max-w-7xl mx-auto w-full">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.div variants={fadeChild} className="section-marker mb-6">
            {t("how-title")}
          </motion.div>
          <motion.h2
            variants={fadeChild}
            className="text-4xl md:text-5xl font-[family-name:var(--font-display)] italic text-cream leading-tight mb-20"
          >
            {t("how-heading")}
          </motion.h2>

          <div className="relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-10 left-[calc(16.666%-0px)] right-[calc(16.666%-0px)] h-px bg-gradient-to-r from-accent/30 via-accent/10 to-accent/30" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
              {[
                { icon: ClipboardCheck, num: "01", titleKey: "how-step1-title" as const, descKey: "how-step1-desc" as const },
                { icon: Timer, num: "02", titleKey: "how-step2-title" as const, descKey: "how-step2-desc" as const },
                { icon: Camera, num: "03", titleKey: "how-step3-title" as const, descKey: "how-step3-desc" as const },
              ].map((step) => (
                <motion.div key={step.num} variants={fadeChild} className="relative text-center md:text-left">
                  {/* Step circle */}
                  <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full border border-accent/20 bg-accent/[0.04] mb-8">
                    <step.icon className="w-7 h-7 text-accent" />
                    <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center">
                      {step.num}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-cream mb-3 tracking-tight">{t(step.titleKey)}</h3>
                  <p className="text-sm text-muted leading-relaxed max-w-sm mx-auto md:mx-0">{t(step.descKey)}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* ──────────────────── What's at Stake ──────────────────── */}
      <section
        id="legal-risk"
        aria-labelledby="legal-risk-title"
        className="px-6 md:px-10 py-24 md:py-32 max-w-7xl mx-auto w-full"
      >
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.div variants={fadeChild} className="max-w-2xl mb-16">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-red-500/[0.06] border border-red-500/15 mb-8">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span id="legal-risk-title" className="text-[11px] font-semibold tracking-[0.12em] uppercase text-red-400">
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
                className="relative p-8 md:p-10 rounded-2xl bg-white/[0.02] border border-white/[0.05] overflow-hidden group"
              >
                {/* Left accent bar */}
                <div className="absolute left-0 top-6 bottom-6 w-[2px] bg-gradient-to-b from-red-400/40 via-red-400/10 to-transparent" />

                <div className="pl-4">
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-5xl md:text-6xl font-[family-name:var(--font-display)] italic text-cream">
                      {t(stat.value)}
                    </span>
                    {t(stat.unit) && (
                      <span className="text-lg font-[family-name:var(--font-display)] italic text-accent">
                        {t(stat.unit)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted">{t(stat.label)}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ──────────────────── Calculator Promo ──────────────────── */}
      <section
        id="calculator"
        aria-labelledby="calculator-title"
        className="px-6 md:px-10 py-12 max-w-7xl mx-auto w-full"
      >
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
                <h3 id="calculator-title" className="text-xl font-semibold text-cream mb-2 tracking-tight">{t("calc-promo-title")}</h3>
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

      {/* ──────────────────── Social Proof ──────────────────── */}
      <section
        id="social-proof"
        aria-label="Vertrauenssignale"
        className="px-6 md:px-10 py-16 max-w-7xl mx-auto w-full"
      >
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

      {/* ──────────────────── Pricing ──────────────────── */}
      <section
        id="pricing"
        aria-labelledby="pricing-title"
        className="px-6 md:px-10 py-24 md:py-32 max-w-7xl mx-auto w-full"
      >
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
            <h2 id="pricing-title" className="text-4xl md:text-5xl font-[family-name:var(--font-display)] italic text-cream leading-tight mb-4">
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
              <Link
                href="/login"
                className="w-full py-3 text-center text-[13px] border border-white/[0.08] text-cream/80 font-semibold rounded-lg hover:bg-white/[0.03] hover:border-white/[0.12] transition-all duration-300"
              >
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
              <Link
                href="/login"
                className="w-full py-3 text-center text-[13px] border border-white/[0.08] text-cream/80 font-semibold rounded-lg hover:bg-white/[0.03] hover:border-white/[0.12] transition-all duration-300"
              >
                {t("plan-team-cta")}
              </Link>
            </motion.div>

            {/* Professional — Popular */}
            <motion.div variants={fadeChild} className="pricing-card pricing-popular relative p-8 rounded-2xl bg-white/[0.02] border border-accent/25 flex flex-col gap-6 shadow-[0_0_50px_rgba(217,119,6,0.08)]">
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
              <Link
                href="/login"
                className="w-full py-3 text-center text-[13px] bg-accent hover:bg-accent/90 text-white font-semibold rounded-lg shadow-[0_4px_16px_rgba(217,119,6,0.2)] transition-all duration-300"
              >
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
              <a
                href="mailto:hello@baucompliance.ch"
                className="w-full py-3 text-center text-[13px] border border-white/[0.08] text-cream/80 font-semibold rounded-lg hover:bg-white/[0.03] hover:border-white/[0.12] transition-all duration-300"
              >
                {t("plan-enterprise-cta")}
              </a>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ──────────────────── Final CTA ──────────────────── */}
      <section className="px-6 md:px-10 py-24 md:py-32 max-w-7xl mx-auto w-full">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={staggerContainer}
          className="relative rounded-3xl overflow-hidden"
        >
          {/* Background glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.06] via-accent/[0.02] to-transparent" />
          <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-accent/[0.04] to-transparent" />
          <div className="absolute inset-0 border border-accent/10 rounded-3xl" />

          <div className="relative z-10 py-20 md:py-28 px-8 md:px-16 text-center">
            <motion.h2
              variants={fadeChild}
              className="text-4xl md:text-5xl lg:text-6xl font-[family-name:var(--font-display)] italic text-cream leading-tight mb-6"
            >
              {t("cta-title")}
            </motion.h2>
            <motion.p variants={fadeChild} className="text-lg text-muted max-w-xl mx-auto mb-10">
              {t("cta-desc")}
            </motion.p>
            <motion.div variants={fadeChild}>
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 px-10 py-4 bg-accent text-white rounded-lg font-semibold text-[15px] hover:bg-accent/90 transition-all duration-300 shadow-[0_8px_32px_rgba(217,119,6,0.3)] hover:shadow-[0_12px_40px_rgba(217,119,6,0.4)]"
              >
                {t("cta-btn")}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ──────────────────── FAQ ──────────────────── */}
      <section
        id="faq"
        aria-labelledby="faq-title"
        className="px-6 md:px-10 py-20 max-w-7xl mx-auto w-full"
      >
        <div className="max-w-3xl">
          <div className="section-marker mb-6">FAQ</div>
          <h2 id="faq-title" className="text-3xl md:text-4xl font-[family-name:var(--font-display)] italic text-cream mb-4">
            Häufige Fragen zur OR-Revision 2026
          </h2>
          <p className="text-muted mb-10">
            Die wichtigsten Antworten für Bauunternehmen, die Abnahme und Mängelrüge digital absichern wollen.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[
            {
              q: "Was ändert sich mit der OR-Revision 2026 konkret?",
              a: "Die Fristen und Anforderungen rund um Mängelrüge und Dokumentation werden für Bauunternehmen kritischer. BauCompliance hilft, Fristen strukturiert zu erfassen und Nachweise zentral zu dokumentieren.",
            },
            {
              q: "Funktioniert BauCompliance für alle Kantone?",
              a: "Ja, die Plattform berücksichtigt kantonale Unterschiede über die integrierte Risiko-Matrix und unterstützt eine saubere, nachvollziehbare Projektabwicklung.",
            },
            {
              q: "Brauchen wir ein grosses IT-Projekt für den Start?",
              a: "Nein. Das MVP ist als schneller Web-Workflow aufgebaut: Team einloggen, Abnahmeprozess starten, Protokoll digital dokumentieren.",
            },
            {
              q: "Für wen lohnt sich der Professional-Plan?",
              a: "Für Teams mit regelmässigen Abnahmen und höherem Nachweisbedarf. Er bietet mehr Umfang für strukturierte Prozesse und revisionssichere Dokumentation.",
            },
          ].map((item) => (
            <article
              key={item.q}
              className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05]"
            >
              <h3 className="text-base font-semibold text-cream mb-3">{item.q}</h3>
              <p className="text-sm text-muted leading-relaxed">{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      </main>

      {/* ──────────────────── Footer ──────────────────── */}
      <footer className="mt-auto border-t border-white/[0.04] px-6 md:px-10">
        <div className="max-w-7xl mx-auto py-12 md:py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-7 h-7 rounded bg-accent/10 border border-accent/20 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-sm bg-accent" />
                </div>
                <span className="text-base font-semibold tracking-tight">
                  Bau<span className="text-accent">Compliance</span>
                </span>
              </div>
              <p className="text-[13px] text-muted/60 leading-relaxed max-w-xs">
                {t("social-proof")}
              </p>
            </div>

            {/* Product links */}
            <div>
              <h4 className="text-[11px] font-semibold text-muted uppercase tracking-[0.15em] mb-4">
                {t("nav-home")}
              </h4>
              <nav className="flex flex-col gap-2.5">
                <Link href="/tools/ruegefrist-rechner" className="text-[13px] text-muted/70 hover:text-cream transition-colors duration-300">
                  {t("nav-tools")}
                </Link>
                <a href="#features" className="text-[13px] text-muted/70 hover:text-cream transition-colors duration-300">
                  {t("nav-home")}
                </a>
                <a href="#pricing" className="text-[13px] text-muted/70 hover:text-cream transition-colors duration-300">
                  {t("nav-pricing")}
                </a>
              </nav>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-[11px] font-semibold text-muted uppercase tracking-[0.15em] mb-4">{t("footer-legal")}</h4>
              <nav className="flex flex-col gap-2.5">
                <a href="/impressum" className="text-[13px] text-muted/70 hover:text-cream transition-colors duration-300">
                  {t("footer-impressum")}
                </a>
                <a href="/datenschutz" className="text-[13px] text-muted/70 hover:text-cream transition-colors duration-300">
                  {t("footer-datenschutz")}
                </a>
              </nav>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-white/[0.04] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[12px] text-muted/40">
              &copy; 2026 BauCompliance.ch &mdash; Zürich &bull; Genève &bull; Lugano
            </p>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400/60" />
              <span className="text-[11px] text-muted/40">{t("footer-status")}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
