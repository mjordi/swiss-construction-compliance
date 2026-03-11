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
      bg: "bg-green-500/[0.06] border-green-500/20",
      text: "text-green-400",
      bar: "bg-green-500",
      icon: CheckCircle,
      label: t("deadlines-status-ok"),
    },
    warning: {
      bg: "bg-yellow-500/[0.06] border-yellow-500/20",
      text: "text-yellow-400",
      bar: "bg-yellow-500",
      icon: AlertTriangle,
      label: t("deadlines-status-warning"),
    },
    urgent: {
      bg: "bg-red-500/[0.06] border-red-500/20",
      text: "text-red-400",
      bar: "bg-red-500",
      icon: AlertTriangle,
      label: t("deadlines-status-urgent"),
    },
    expired: {
      bg: "bg-white/[0.02] border-white/[0.06]",
      text: "text-muted",
      bar: "bg-muted",
      icon: XCircle,
      label: t("deadlines-expired"),
    },
  };

  const maxDays = 1825;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <Clock className="w-7 h-7 text-accent" />
          <h1 className="text-3xl font-[family-name:var(--font-display)] italic text-cream">
            {t("deadlines-title")}
          </h1>
        </div>
        <p className="text-muted text-sm">{t("deadlines-subtitle")}</p>
      </div>

      {/* Input form */}
      <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] mb-8">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-2">
          {t("deadlines-input-label")}
        </label>
        <div className="flex gap-4 flex-col sm:flex-row">
          <input
            type="date"
            value={acceptanceDate}
            onChange={(e) => setAcceptanceDate(e.target.value)}
            className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-cream focus:outline-none focus:border-accent/40 transition-colors duration-300 [color-scheme:dark]"
          />
          <button
            onClick={calculate}
            disabled={!acceptanceDate}
            className="px-6 py-3 bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-300 flex items-center gap-2"
          >
            <Clock className="w-4 h-4" />
            {t("deadlines-calculate")}
          </button>
          {deadlines && (
            <button
              onClick={reset}
              className="px-4 py-3 bg-white/[0.03] border border-white/[0.06] text-muted hover:text-cream font-medium rounded-lg transition-all duration-300 flex items-center gap-2"
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
            <h2 className="text-lg font-semibold text-cream">{t("deadlines-result-title")}</h2>
            <button
              onClick={downloadICS}
              className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/[0.06] hover:border-accent/30 text-muted hover:text-accent text-[13px] font-medium rounded-lg transition-all duration-300"
            >
              <Download className="w-4 h-4" />
              {t("deadlines-download-ics")}
            </button>
          </div>

          {/* Timeline visualization */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] mb-6 relative overflow-hidden">
            <div className="text-[11px] text-muted uppercase tracking-[0.12em] font-semibold mb-4">Zeitleiste</div>
            <div className="relative">
              <div className="w-full h-1.5 bg-white/[0.04] rounded-full mb-1" />
              {deadlines.map((d, i) => {
                const pct = Math.min(
                  100,
                  Math.max(0, ((maxDays - Math.max(0, d.daysRemaining)) / maxDays) * 100)
                );
                const cfg = statusConfig[d.status];
                return (
                  <div key={i} className="flex items-center gap-3 mt-4">
                    <div className="w-32 text-[12px] text-muted text-right">{formatDate(d.date)}</div>
                    <div className="flex-1 relative">
                      <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${cfg.bar} transition-all duration-700`}
                          style={{ width: `${100 - pct}%` }}
                        />
                      </div>
                    </div>
                    <div className={`w-20 text-[12px] font-semibold ${cfg.text} text-right`}>
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
              <div key={i} className={`border p-6 rounded-2xl bg-white/[0.02] ${cfg.bg} transition-all duration-300`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-5 h-5 ${cfg.text}`} />
                      <span className="font-semibold text-cream">{t(d.titleKey as Parameters<typeof t>[0])}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${cfg.text} bg-current/[0.06]`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-sm text-muted mb-3">
                      {t(d.descKey as Parameters<typeof t>[0])}
                    </p>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted/60">{t("deadlines-deadline-date")}:</span>
                      <span className="font-semibold text-cream">{formatDate(d.date)}</span>
                    </div>
                  </div>
                  <div className={`text-right ${cfg.text}`}>
                    <div className="text-3xl font-[family-name:var(--font-display)] italic">
                      {d.daysRemaining < 0 ? "—" : d.daysRemaining}
                    </div>
                    <div className="text-[11px] text-muted">
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
