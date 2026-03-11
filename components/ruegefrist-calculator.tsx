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
    bg: "bg-green-500/10 border-green-500/30",
    text: "text-green-400",
    icon: CheckCircle,
  },
  warning: {
    bg: "bg-yellow-500/10 border-yellow-500/30",
    text: "text-yellow-400",
    icon: AlertTriangle,
  },
  urgent: {
    bg: "bg-red-500/10 border-red-500/30",
    text: "text-red-400",
    icon: AlertTriangle,
  },
  expired: {
    bg: "bg-slate-500/10 border-slate-500/30",
    text: "text-slate-400",
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
      <div className="glass p-6 rounded-2xl mb-8">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <Calendar className="w-4 h-4 inline mr-2" />
              {t("calc-contract-date")}
            </label>
            <input
              type="date"
              value={contractDate}
              onChange={(e) => setContractDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent/50 transition [color-scheme:dark]"
            />
            <p className="text-xs text-slate-500 mt-1">{t("calc-contract-hint")}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <AlertTriangle className="w-4 h-4 inline mr-2" />
              {t("calc-discovery-date")}
            </label>
            <input
              type="date"
              value={discoveryDate}
              onChange={(e) => setDiscoveryDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent/50 transition [color-scheme:dark]"
            />
            <p className="text-xs text-slate-500 mt-1">{t("calc-discovery-hint")}</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={calculate}
              disabled={!contractDate || !discoveryDate}
              className="flex-1 px-6 py-3 bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
            >
              <Scale className="w-4 h-4" />
              {t("calc-calculate")}
            </button>
            {result && (
              <button
                onClick={reset}
                className="px-4 py-3 glass border border-white/10 text-slate-400 hover:text-white font-medium rounded-xl transition"
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
            className={`glass border p-5 rounded-2xl ${
              result.regime === "new"
                ? "border-accent/30 bg-accent/5"
                : "border-blue-500/30 bg-blue-500/5"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Scale
                className={`w-5 h-5 ${
                  result.regime === "new" ? "text-accent" : "text-blue-400"
                }`}
              />
              <span className="font-bold">
                {t(
                  result.regime === "new"
                    ? "calc-regime-new"
                    : "calc-regime-old"
                )}
              </span>
            </div>
            <p className="text-sm text-slate-400">
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
                className={`glass border p-6 rounded-2xl ${
                  statusConfig[result.ruegefrist60.status].bg
                } transition`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
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
                      <span className="font-bold text-lg">
                        {t("calc-60day-title")}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 mb-3">
                      {t("calc-60day-desc")}
                    </p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500">
                          {t("calc-discovery-label")}:
                        </span>
                        <span className="text-white">
                          {formatDateCH(result.discoveryDate)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500">
                          {t("calc-deadline-label")}:
                        </span>
                        <span className="font-semibold text-white">
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
                    <div className="text-4xl font-extrabold">
                      {result.ruegefrist60.daysRemaining < 0
                        ? "—"
                        : result.ruegefrist60.daysRemaining}
                    </div>
                    <div className="text-xs text-slate-400">
                      {result.ruegefrist60.daysRemaining < 0
                        ? t("calc-expired")
                        : t("calc-days-remaining")}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
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
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>{t("calc-discovery-label")}</span>
                    <span>60 {t("calc-days-label")}</span>
                  </div>
                </div>
              </div>

              {/* Download ICS */}
              <button
                onClick={downloadICS}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 glass border border-white/10 hover:border-accent/40 text-slate-300 hover:text-accent font-medium rounded-xl transition"
              >
                <Download className="w-4 h-4" />
                {t("calc-download-ics")}
              </button>
            </>
          )}

          {/* Old Law — No 60 day period */}
          {result.regime === "old" && (
            <div className="glass border border-blue-500/20 p-5 rounded-2xl">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-400 mb-1">
                    {t("calc-old-law-title")}
                  </p>
                  <p className="text-sm text-slate-400">
                    {t("calc-old-law-detail")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-slate-600 text-center px-4">
            {t("calc-disclaimer")}
          </p>
        </div>
      )}
    </div>
  );
}
