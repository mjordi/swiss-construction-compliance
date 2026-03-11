"use client";

import { useState } from "react";
import {
  Download,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Scale,
  Calendar,
  Info,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import {
  calculateRuegefrist,
  formatDateCH,
  generateDeadlineICS,
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
  const [contractDate, setContractDate] = useState("");
  const [discoveryDate, setDiscoveryDate] = useState("");
  const [result, setResult] = useState<RuegefristResult | null>(null);

  function calculate() {
    if (!contractDate || !discoveryDate) return;
    const r = calculateRuegefrist(
      new Date(contractDate),
      new Date(discoveryDate)
    );
    setResult(r);
  }

  function reset() {
    setContractDate("");
    setDiscoveryDate("");
    setResult(null);
  }

  function downloadICS() {
    if (!result?.ruegefrist60) return;
    const content = generateDeadlineICS(
      result.ruegefrist60.date,
      "BauCompliance: 60-Tage-Rügefrist (Art. 370 nOR)",
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
              value={contractDate}
              onChange={(e) => setContractDate(e.target.value)}
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
              value={discoveryDate}
              onChange={(e) => setDiscoveryDate(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-cream focus:outline-none focus:border-accent/40 transition-colors duration-300 [color-scheme:dark]"
            />
            <p className="text-[11px] text-muted/60 mt-1.5">{t("calc-discovery-hint")}</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={calculate}
              disabled={!contractDate || !discoveryDate}
              className="flex-1 px-6 py-3 bg-accent hover:bg-accent/90 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 shadow-[0_4px_16px_rgba(217,119,6,0.2)] flex items-center justify-center gap-2 text-[14px]"
            >
              <Scale className="w-4 h-4" />
              {t("calc-calculate")}
            </button>
            {result && (
              <button
                onClick={reset}
                className="px-4 py-3 border border-white/[0.08] text-muted hover:text-cream hover:border-white/[0.12] rounded-lg transition-all duration-300"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

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
