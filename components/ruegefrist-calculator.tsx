"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Scale,
  Calendar,
  Info,
  Share2,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import {
  calculateRuegefrist,
  formatDateCH,
  generateDeadlineICS,
  parseDateInput,
  validateRuegefristInput,
  type RuegefristResult,
} from "@/lib/legal-utils";

const statusConfig = {
  ok: {
    bg: "bg-green-500/[0.06] border-green-500/20",
    text: "text-green-400",
    icon: CheckCircle,
  },
  warning: {
    bg: "bg-yellow-500/[0.06] border-yellow-500/20",
    text: "text-yellow-400",
    icon: AlertTriangle,
  },
  urgent: {
    bg: "bg-red-500/[0.06] border-red-500/20",
    text: "text-red-400",
    icon: AlertTriangle,
  },
  expired: {
    bg: "bg-white/[0.02] border-white/[0.06]",
    text: "text-muted",
    icon: XCircle,
  },
};

export default function RuegefristCalculator() {
  const { t } = useLanguage();
  const STORAGE_KEY = "baucompliance:ruegefrist-draft";
  const [contractDate, setContractDate] = useState("");
  const [discoveryDate, setDiscoveryDate] = useState("");
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [result, setResult] = useState<RuegefristResult | null>(null);
  const [calculatedDates, setCalculatedDates] = useState<{
    contractDate: string;
    discoveryDate: string;
  } | null>(null);
  const [shareLinkFeedback, setShareLinkFeedback] = useState<
    "calc-share-link-copied" | "calc-share-link-error" | null
  >(null);
  const shareLinkResetTimerRef = useRef<number | null>(null);
  const shareLinkRequestIdRef = useRef(0);

  function clearShareLinkFeedback() {
    shareLinkRequestIdRef.current += 1;
    if (shareLinkResetTimerRef.current !== null) {
      window.clearTimeout(shareLinkResetTimerRef.current);
      shareLinkResetTimerRef.current = null;
    }
    setShareLinkFeedback(null);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawContractDate = params.get("contract");
    const rawDiscoveryDate = params.get("discovery");
    const hasSharedDates = rawContractDate !== null || rawDiscoveryDate !== null;

    if (hasSharedDates) {
      const sharedContractDate = rawContractDate && parseDateInput(rawContractDate) ? rawContractDate : "";
      const sharedDiscoveryDate = rawDiscoveryDate && parseDateInput(rawDiscoveryDate) ? rawDiscoveryDate : "";

      if (rawContractDate && !sharedContractDate) params.delete("contract");
      if (rawDiscoveryDate && !sharedDiscoveryDate) params.delete("discovery");

      const nextQuery = params.toString();
      const nextUrl = nextQuery ? `?${nextQuery}` : window.location.pathname;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (nextUrl !== currentUrl) {
        window.history.replaceState(null, "", nextUrl);
      }

      setContractDate(sharedContractDate);
      setDiscoveryDate(sharedDiscoveryDate);

      const parsedContractDate = sharedContractDate ? parseDateInput(sharedContractDate) : null;
      const parsedDiscoveryDate = sharedDiscoveryDate ? parseDateInput(sharedDiscoveryDate) : null;
      if (
        parsedContractDate &&
        parsedDiscoveryDate &&
        !validateRuegefristInput(parsedContractDate, parsedDiscoveryDate)
      ) {
        setResult(calculateRuegefrist(parsedContractDate, parsedDiscoveryDate));
        setCalculatedDates({
          contractDate: sharedContractDate,
          discoveryDate: sharedDiscoveryDate,
        });
      }
      setIsDraftLoaded(true);
      return;
    }

    try {
      const rawDraft = window.localStorage.getItem(STORAGE_KEY);
      if (!rawDraft) return;
      const parsedDraft = JSON.parse(rawDraft) as {
        contractDate?: string;
        discoveryDate?: string;
      };
      setContractDate(parsedDraft.contractDate ?? "");
      setDiscoveryDate(parsedDraft.discoveryDate ?? "");
    } catch {
      setContractDate("");
      setDiscoveryDate("");
    } finally {
      setIsDraftLoaded(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      shareLinkRequestIdRef.current += 1;
      if (shareLinkResetTimerRef.current !== null) {
        window.clearTimeout(shareLinkResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isDraftLoaded) return;

    if (!contractDate && !discoveryDate) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ contractDate, discoveryDate })
    );
  }, [contractDate, discoveryDate, isDraftLoaded]);

  const validationError =
    contractDate && discoveryDate
      ? (() => {
          const parsedContractDate = parseDateInput(contractDate);
          const parsedDiscoveryDate = parseDateInput(discoveryDate);
          if (!parsedContractDate || !parsedDiscoveryDate) return null;
          return validateRuegefristInput(parsedContractDate, parsedDiscoveryDate);
        })()
      : null;

  function updateContractDate(value: string) {
    clearShareLinkFeedback();
    setContractDate(value);
    setResult(null);
  }

  function updateDiscoveryDate(value: string) {
    clearShareLinkFeedback();
    setDiscoveryDate(value);
    setResult(null);
  }

  function calculate() {
    clearShareLinkFeedback();
    if (!contractDate || !discoveryDate || validationError) return;
    const parsedContractDate = parseDateInput(contractDate);
    const parsedDiscoveryDate = parseDateInput(discoveryDate);
    if (!parsedContractDate || !parsedDiscoveryDate) return;
    const r = calculateRuegefrist(parsedContractDate, parsedDiscoveryDate);
    setResult(r);
    setCalculatedDates({ contractDate, discoveryDate });

    const params = new URLSearchParams(window.location.search);
    params.set("contract", contractDate);
    params.set("discovery", discoveryDate);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  function reset() {
    clearShareLinkFeedback();
    setContractDate("");
    setDiscoveryDate("");
    setResult(null);
    setCalculatedDates(null);
    window.localStorage.removeItem(STORAGE_KEY);
    const params = new URLSearchParams(window.location.search);
    params.delete("contract");
    params.delete("discovery");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }

  async function copyShareLink() {
    if (!calculatedDates) return;
    const url = new URL(window.location.href);
    url.searchParams.set("contract", calculatedDates.contractDate);
    url.searchParams.set("discovery", calculatedDates.discoveryDate);

    if (shareLinkResetTimerRef.current !== null) {
      window.clearTimeout(shareLinkResetTimerRef.current);
      shareLinkResetTimerRef.current = null;
    }

    const requestId = shareLinkRequestIdRef.current + 1;
    shareLinkRequestIdRef.current = requestId;

    try {
      await navigator.clipboard.writeText(url.toString());
      if (requestId !== shareLinkRequestIdRef.current) return;
      setShareLinkFeedback("calc-share-link-copied");
    } catch {
      if (requestId !== shareLinkRequestIdRef.current) return;
      setShareLinkFeedback("calc-share-link-error");
    }

    shareLinkResetTimerRef.current = window.setTimeout(() => {
      if (requestId !== shareLinkRequestIdRef.current) return;
      setShareLinkFeedback(null);
      shareLinkResetTimerRef.current = null;
    }, 2000);
  }

  function downloadICS() {
    if (!result?.ruegefrist60) return;
    const content = generateDeadlineICS(
      result.ruegefrist60.date,
      "BauCompliance: 60-Tage-Rügefrist (Art. 370 OR 2026)",
      `Rügefrist Ablauf\nVertragsdatum: ${formatDateCH(result.contractDate)}\nMängel entdeckt: ${formatDateCH(result.discoveryDate)}`
    );
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ruegefrist-${discoveryDate}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Input Form */}
      <div className="p-6 md:p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05] mb-8">
        <div className="space-y-5">
          <div>
            <label className="block text-[13px] font-medium text-cream/70 mb-2">
              <Calendar className="w-4 h-4 inline mr-2 text-muted" />
              {t("calc-contract-date")}
            </label>
            <input
              type="date"
              aria-label={t("calc-contract-date")}
              value={contractDate}
              onChange={(e) => updateContractDate(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-cream focus:outline-none focus:border-accent/40 transition-colors duration-300 [color-scheme:dark]"
            />
            <p className="text-[11px] text-muted/60 mt-1.5">{t("calc-contract-hint")}</p>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-cream/70 mb-2">
              <AlertTriangle className="w-4 h-4 inline mr-2 text-muted" />
              {t("calc-discovery-date")}
            </label>
            <input
              type="date"
              aria-label={t("calc-discovery-date")}
              value={discoveryDate}
              onChange={(e) => updateDiscoveryDate(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-cream focus:outline-none focus:border-accent/40 transition-colors duration-300 [color-scheme:dark]"
            />
            <p className="text-[11px] text-muted/60 mt-1.5">{t("calc-discovery-hint")}</p>
            {validationError === "discovery-before-contract" && (
              <p className="text-[11px] text-red-400 mt-1.5">
                {t("calc-discovery-before-contract")}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={calculate}
              disabled={!contractDate || !discoveryDate || !!validationError}
              className="flex-1 px-6 py-3 bg-accent hover:bg-accent/90 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 shadow-[0_4px_16px_rgba(217,119,6,0.2)] flex items-center justify-center gap-2 text-[14px]"
            >
              <Scale className="w-4 h-4" />
              {t("calc-calculate")}
            </button>
            {(result || contractDate || discoveryDate) && (
              <button
                onClick={reset}
                aria-label={t("calc-reset")}
                title={t("calc-reset")}
                className="px-4 py-3 border border-white/[0.08] text-muted hover:text-cream hover:border-white/[0.12] rounded-lg transition-all duration-300"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {calculatedDates && (
        <button
          onClick={copyShareLink}
          aria-label={shareLinkFeedback ? t(shareLinkFeedback) : t("calc-share-link")}
          className="w-full mb-8 flex items-center justify-center gap-2 px-4 py-3 border border-white/[0.08] hover:border-accent/30 text-muted hover:text-accent font-medium rounded-lg transition-all duration-300 text-[13px]"
        >
          <Share2 className="w-4 h-4" />
          {shareLinkFeedback ? t(shareLinkFeedback) : t("calc-share-link")}
        </button>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-5">
          {/* Regime Info */}
          <div
            className={`border p-5 md:p-6 rounded-2xl ${
              result.regime === "new"
                ? "border-accent/20 bg-accent/[0.04]"
                : "border-blue-500/20 bg-blue-500/[0.04]"
            }`}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <Scale
                className={`w-5 h-5 ${
                  result.regime === "new" ? "text-accent" : "text-blue-400"
                }`}
              />
              <span className="font-semibold text-cream">
                {t(
                  result.regime === "new"
                    ? "calc-regime-new"
                    : "calc-regime-old"
                )}
              </span>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              {t(
                result.regime === "new"
                  ? "calc-regime-new-desc"
                  : "calc-regime-old-desc"
              )}
            </p>
          </div>

          {/* 60-Day Deadline (New Law) */}
          {result.ruegefrist60 && (
            <>
              <div
                className={`border p-6 md:p-7 rounded-2xl ${
                  statusConfig[result.ruegefrist60.status].bg
                } transition-all duration-500`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2.5 mb-1">
                      {(() => {
                        const Icon =
                          statusConfig[result.ruegefrist60.status].icon;
                        return (
                          <Icon
                            className={`w-5 h-5 ${
                              statusConfig[result.ruegefrist60.status].text
                            }`}
                          />
                        );
                      })()}
                      <span className="font-semibold text-lg text-cream">
                        {t("calc-60day-title")}
                      </span>
                    </div>
                    <p className="text-sm text-muted mb-4">
                      {t("calc-60day-desc")}
                    </p>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted/60">
                          {t("calc-discovery-label")}:
                        </span>
                        <span className="text-cream">
                          {formatDateCH(result.discoveryDate)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted/60">
                          {t("calc-deadline-label")}:
                        </span>
                        <span className="font-semibold text-cream">
                          {formatDateCH(result.ruegefrist60.date)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div
                    className={`text-right ${
                      statusConfig[result.ruegefrist60.status].text
                    }`}
                  >
                    <div className="text-4xl font-[family-name:var(--font-display)] italic">
                      {result.ruegefrist60.daysRemaining < 0
                        ? "—"
                        : result.ruegefrist60.daysRemaining}
                    </div>
                    <div className="text-[11px] text-muted mt-1">
                      {result.ruegefrist60.daysRemaining < 0
                        ? t("calc-expired")
                        : t("calc-days-remaining")}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-5">
                  <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        statusConfig[result.ruegefrist60.status].text.replace(
                          "text-",
                          "bg-"
                        )
                      }`}
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(
                            100,
                            (result.ruegefrist60.daysRemaining / 60) * 100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-muted/60 mt-1.5">
                    <span>{t("calc-discovery-label")}</span>
                    <span>60 {t("calc-days-label")}</span>
                  </div>
                </div>
              </div>

              {/* Download ICS */}
              <button
                onClick={downloadICS}
                aria-label={t("calc-download-ics")}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-white/[0.08] hover:border-accent/30 text-muted hover:text-accent font-medium rounded-lg transition-all duration-300 text-[13px]"
              >
                <Download className="w-4 h-4" />
                {t("calc-download-ics")}
              </button>
            </>
          )}

          {/* Old Law — No 60 day period */}
          {result.regime === "old" && (
            <div className="border border-blue-500/15 bg-blue-500/[0.04] p-5 md:p-6 rounded-2xl">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-400 mb-1">
                    {t("calc-old-law-title")}
                  </p>
                  <p className="text-sm text-muted leading-relaxed">
                    {t("calc-old-law-detail")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-[11px] text-muted/40 text-center px-4">
            {t("calc-disclaimer")}
          </p>
        </div>
      )}
    </div>
  );
}
