"use client";

import { useState } from "react";
import { Clock, Download, RotateCcw, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

interface Deadline {
  key: string;
  titleKey: string;
  descKey: string;
  date: Date;
  daysRemaining: number;
  status: "ok" | "warning" | "urgent" | "expired";
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

function getDaysRemaining(deadline: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(deadline);
  target.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getStatus(days: number): "ok" | "warning" | "urgent" | "expired" {
  if (days < 0) return "expired";
  if (days <= 14) return "urgent";
  if (days <= 30) return "warning";
  return "ok";
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("de-CH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function generateICS(deadlines: Deadline[], acceptanceDate: Date): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const events = deadlines
    .map((d, i) => {
      const dateStr = d.date.toISOString().split("T")[0].replace(/-/g, "");
      const reminderDate = addDays(d.date, -7);
      const reminderStr = reminderDate.toISOString().split("T")[0].replace(/-/g, "");
      return `BEGIN:VEVENT
UID:baucompliance-deadline-${i}-${stamp}@baucompliance.ch
DTSTAMP:${stamp}
DTSTART;VALUE=DATE:${dateStr}
DTEND;VALUE=DATE:${dateStr}
SUMMARY:BauCompliance: ${d.key} (Abnahme ${acceptanceDate.toLocaleDateString("de-CH")})
DESCRIPTION:Fristablauf gemäss BauCompliance.ch\\nAbnahmedatum: ${acceptanceDate.toLocaleDateString("de-CH")}
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Frist läuft ab in 7 Tagen
TRIGGER;VALUE=DATE:${reminderStr}
END:VALARM
END:VEVENT`;
    })
    .join("\n");

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//BauCompliance.ch//Deadline Calculator//DE
CALSCALE:GREGORIAN
METHOD:PUBLISH
${events}
END:VCALENDAR`;
}

export default function DeadlinesPage() {
  const { t } = useLanguage();
  const [acceptanceDate, setAcceptanceDate] = useState<string>("");
  const [deadlines, setDeadlines] = useState<Deadline[] | null>(null);

  function calculate() {
    if (!acceptanceDate) return;
    const base = new Date(acceptanceDate);

    const d60 = addDays(base, 60);
    const d5y = addYears(base, 5);
    const d2y = addYears(base, 2);

    const computed: Deadline[] = [
      {
        key: "60-Tage-Rügefrist (OR Art. 370a)",
        titleKey: "deadlines-60day-title",
        descKey: "deadlines-60day-desc",
        date: d60,
        daysRemaining: getDaysRemaining(d60),
        status: getStatus(getDaysRemaining(d60)),
      },
      {
        key: "2-Jahres-SIA-Frist (SIA 118)",
        titleKey: "deadlines-2year-title",
        descKey: "deadlines-2year-desc",
        date: d2y,
        daysRemaining: getDaysRemaining(d2y),
        status: getStatus(getDaysRemaining(d2y)),
      },
      {
        key: "5-Jahres-Verjährungsfrist (OR Art. 371)",
        titleKey: "deadlines-5year-title",
        descKey: "deadlines-5year-desc",
        date: d5y,
        daysRemaining: getDaysRemaining(d5y),
        status: getStatus(getDaysRemaining(d5y)),
      },
    ];

    setDeadlines(computed);
  }

  function reset() {
    setAcceptanceDate("");
    setDeadlines(null);
  }

  function downloadICS() {
    if (!deadlines || !acceptanceDate) return;
    const base = new Date(acceptanceDate);
    const content = generateICS(deadlines, base);
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `baucompliance-fristen-${acceptanceDate}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const statusConfig = {
    ok: {
      bg: "bg-green-500/10 border-green-500/30",
      text: "text-green-400",
      bar: "bg-green-500",
      icon: CheckCircle,
      label: t("deadlines-status-ok"),
    },
    warning: {
      bg: "bg-yellow-500/10 border-yellow-500/30",
      text: "text-yellow-400",
      bar: "bg-yellow-500",
      icon: AlertTriangle,
      label: t("deadlines-status-warning"),
    },
    urgent: {
      bg: "bg-red-500/10 border-red-500/30",
      text: "text-red-400",
      bar: "bg-red-500",
      icon: AlertTriangle,
      label: t("deadlines-status-urgent"),
    },
    expired: {
      bg: "bg-slate-500/10 border-slate-500/30",
      text: "text-slate-400",
      bar: "bg-slate-500",
      icon: XCircle,
      label: t("deadlines-expired"),
    },
  };

  // Timeline bar: max 5 years = 1825 days
  const maxDays = 1825;

  return (
    <div className="max-w-3xl mx-auto p-8">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <Clock className="w-8 h-8 text-accent" />
          <h1 className="text-3xl font-extrabold font-[family-name:var(--font-display)]">
            {t("deadlines-title")}
          </h1>
        </div>
        <p className="text-slate-400 text-sm">{t("deadlines-subtitle")}</p>
      </div>

      {/* Input form */}
      <div className="glass p-6 rounded-2xl mb-8">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          {t("deadlines-input-label")}
        </label>
        <div className="flex gap-4 flex-col sm:flex-row">
          <input
            type="date"
            value={acceptanceDate}
            onChange={(e) => setAcceptanceDate(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent/50 transition [color-scheme:dark]"
          />
          <button
            onClick={calculate}
            disabled={!acceptanceDate}
            className="px-6 py-3 bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition flex items-center gap-2"
          >
            <Clock className="w-4 h-4" />
            {t("deadlines-calculate")}
          </button>
          {deadlines && (
            <button
              onClick={reset}
              className="px-4 py-3 glass border border-white/10 text-slate-400 hover:text-white font-medium rounded-xl transition flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              {t("deadlines-reset")}
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {deadlines && (
        <div className="space-y-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold">{t("deadlines-result-title")}</h2>
            <button
              onClick={downloadICS}
              className="flex items-center gap-2 px-4 py-2 glass border border-white/10 hover:border-accent/40 text-slate-300 hover:text-accent text-sm font-medium rounded-xl transition"
            >
              <Download className="w-4 h-4" />
              {t("deadlines-download-ics")}
            </button>
          </div>

          {/* Timeline visualization */}
          <div className="glass p-5 rounded-2xl mb-6 relative overflow-hidden">
            <div className="text-xs text-slate-500 mb-4 font-medium uppercase tracking-wider">Zeitleiste</div>
            <div className="relative">
              {/* Base track */}
              <div className="w-full h-2 bg-white/10 rounded-full mb-1" />
              {/* Colored segments */}
              {deadlines.map((d, i) => {
                const pct = Math.min(
                  100,
                  Math.max(0, ((maxDays - Math.max(0, d.daysRemaining)) / maxDays) * 100)
                );
                const cfg = statusConfig[d.status];
                return (
                  <div key={i} className="flex items-center gap-3 mt-4">
                    <div className="w-32 text-xs text-slate-400 text-right">{formatDate(d.date)}</div>
                    <div className="flex-1 relative">
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${cfg.bar} transition-all duration-700`}
                          style={{ width: `${100 - pct}%` }}
                        />
                      </div>
                    </div>
                    <div className={`w-20 text-xs font-bold ${cfg.text} text-right`}>
                      {d.daysRemaining < 0
                        ? t("deadlines-expired")
                        : `${d.daysRemaining}d`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Deadline cards */}
          {deadlines.map((d, i) => {
            const cfg = statusConfig[d.status];
            const Icon = cfg.icon;
            return (
              <div key={i} className={`glass border p-6 rounded-2xl ${cfg.bg} transition`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-5 h-5 ${cfg.text}`} />
                      <span className="font-bold text-base">{t(d.titleKey as Parameters<typeof t>[0])}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-current/10 ${cfg.text}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 mb-3">
                      {t(d.descKey as Parameters<typeof t>[0])}
                    </p>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-500">{t("deadlines-deadline-date")}:</span>
                      <span className="font-semibold text-white">{formatDate(d.date)}</span>
                    </div>
                  </div>
                  <div className={`text-right ${cfg.text}`}>
                    <div className="text-3xl font-extrabold">
                      {d.daysRemaining < 0 ? "—" : d.daysRemaining}
                    </div>
                    <div className="text-xs text-slate-400">
                      {d.daysRemaining < 0 ? t("deadlines-expired") : t("deadlines-days-remaining")}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
