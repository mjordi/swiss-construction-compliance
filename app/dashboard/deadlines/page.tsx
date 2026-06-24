"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Download, RotateCcw, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import {
  addDays,
  addYears,
  DEADLINE_REMINDER_OFFSET_OPTIONS,
  DEFAULT_DEADLINE_REMINDER_OFFSETS,
  getDaysRemaining,
  generateDeadlineCalendarICS,
  parseDateInputAsUTC,
  sanitizeDateQueryParam,
  sanitizeDeadlineReminderQueryParam,
  serializeDeadlineReminderQueryParam,
} from "@/lib/legal-utils";
import PageHeader from "@/components/dashboard/PageHeader";
import type { TranslationKey } from "@/locales";

/** Wider thresholds than legal-utils (7/21) since this page handles multi-year deadlines */
function getStatus(days: number): "ok" | "warning" | "urgent" | "expired" {
  if (days < 0) return "expired";
  if (days <= 14) return "urgent";
  if (days <= 30) return "warning";
  return "ok";
}

interface Deadline {
  key: string;
  titleKey: TranslationKey;
  descKey: TranslationKey;
  date: Date;
  daysRemaining: number;
  status: "ok" | "warning" | "urgent" | "expired";
}

function buildDeadlines(base: Date): Deadline[] {
  const d60 = addDays(base, 60);
  const d5y = addYears(base, 5);
  const d2y = addYears(base, 2);

  return [
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
}

function getTodayLocalDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalizedDate(date: Date, lang: string) {
  const locale = lang === "fr" ? "fr-CH" : lang === "it" ? "it-CH" : lang === "en" ? "en-CH" : "de-CH";
  return date.toLocaleDateString(locale, {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function DeadlinesPage() {
  const { lang, t } = useLanguage();
  const [acceptanceDate, setAcceptanceDate] = useState<string>("");
  const [deadlines, setDeadlines] = useState<Deadline[] | null>(null);
  const [calculatedAcceptanceDate, setCalculatedAcceptanceDate] = useState<string | null>(null);
  const [reminderOffsets, setReminderOffsets] = useState<number[]>([...DEFAULT_DEADLINE_REMINDER_OFFSETS]);
  const [shareLinkFeedback, setShareLinkFeedback] = useState<TranslationKey | null>(null);
  const shareLinkResetTimerRef = useRef<number | null>(null);
  const shareLinkRequestIdRef = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const acceptance = params.get("acceptance");
    const reminders = params.get("reminders");
    const sanitizedAcceptance = sanitizeDateQueryParam(acceptance);
    const sanitizedReminderOffsets = sanitizeDeadlineReminderQueryParam(reminders);
    const serializedReminderOffsets = serializeDeadlineReminderQueryParam(sanitizedReminderOffsets);

    if (reminders && reminders !== serializedReminderOffsets) {
      params.set("reminders", serializedReminderOffsets);
      const query = params.toString();
      window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    }

    if (acceptance && !sanitizedAcceptance) {
      params.delete("acceptance");
      const query = params.toString();
      window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    }

    const parsedAcceptanceDate = sanitizedAcceptance
      ? parseDateInputAsUTC(sanitizedAcceptance)
      : null;

    if (!sanitizedAcceptance && !reminders) return;

    const frame = window.requestAnimationFrame(() => {
      setReminderOffsets(sanitizedReminderOffsets);

      if (!sanitizedAcceptance || !parsedAcceptanceDate) {
        return;
      }

      setAcceptanceDate(sanitizedAcceptance);
      setCalculatedAcceptanceDate(sanitizedAcceptance);
      setDeadlines(buildDeadlines(parsedAcceptanceDate));
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    return () => {
      shareLinkRequestIdRef.current += 1;
      if (shareLinkResetTimerRef.current !== null) {
        window.clearTimeout(shareLinkResetTimerRef.current);
      }
    };
  }, []);

  function clearShareLinkFeedback() {
    shareLinkRequestIdRef.current += 1;
    if (shareLinkResetTimerRef.current !== null) {
      window.clearTimeout(shareLinkResetTimerRef.current);
      shareLinkResetTimerRef.current = null;
    }
    setShareLinkFeedback(null);
  }

  function calculate() {
    clearShareLinkFeedback();
    const parsedAcceptanceDate = parseDateInputAsUTC(acceptanceDate);
    if (!parsedAcceptanceDate) {
      setAcceptanceDate("");
      setCalculatedAcceptanceDate(null);
      setDeadlines(null);
      const params = new URLSearchParams(window.location.search);
      params.delete("acceptance");
      const query = params.toString();
      window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
      return;
    }

    const computed = buildDeadlines(parsedAcceptanceDate);
    setDeadlines(computed);
    setCalculatedAcceptanceDate(acceptanceDate);

    const params = new URLSearchParams(window.location.search);
    params.set("acceptance", acceptanceDate);
    params.set("reminders", serializeDeadlineReminderQueryParam(reminderOffsets));
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  function reset() {
    setAcceptanceDate("");
    setCalculatedAcceptanceDate(null);
    setReminderOffsets([...DEFAULT_DEADLINE_REMINDER_OFFSETS]);
    clearShareLinkFeedback();
    setDeadlines(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("acceptance");
    params.delete("reminders");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }

  async function copyShareLink() {
    if (!calculatedAcceptanceDate || !deadlines) return;
    const url = new URL(window.location.href);
    url.searchParams.set("acceptance", calculatedAcceptanceDate);
    url.searchParams.set("reminders", serializeDeadlineReminderQueryParam(reminderOffsets));

    if (shareLinkResetTimerRef.current !== null) {
      window.clearTimeout(shareLinkResetTimerRef.current);
      shareLinkResetTimerRef.current = null;
    }

    const requestId = shareLinkRequestIdRef.current + 1;
    shareLinkRequestIdRef.current = requestId;

    try {
      await navigator.clipboard.writeText(url.toString());
      if (requestId !== shareLinkRequestIdRef.current) return;
      setShareLinkFeedback("deadlines-share-link-copied");
    } catch {
      if (requestId !== shareLinkRequestIdRef.current) return;
      setShareLinkFeedback("deadlines-share-link-error");
    }

    shareLinkResetTimerRef.current = window.setTimeout(() => {
      if (requestId !== shareLinkRequestIdRef.current) return;
      setShareLinkFeedback(null);
      shareLinkResetTimerRef.current = null;
    }, 2000);
  }

  function downloadICS() {
    if (!deadlines || !calculatedAcceptanceDate) return;
    const parsedAcceptanceDate = parseDateInputAsUTC(calculatedAcceptanceDate);
    if (!parsedAcceptanceDate) return;
    const acceptanceDateLabel = formatLocalizedDate(parsedAcceptanceDate, lang);
    const content = generateDeadlineCalendarICS(
      deadlines.map((d) => ({ key: d.key, date: d.date })),
      acceptanceDateLabel,
      reminderOffsets
    );
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `baucompliance-fristen-${calculatedAcceptanceDate}.ics`;
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
  const reminderOptions = DEADLINE_REMINDER_OFFSET_OPTIONS;

  useEffect(() => {
    if (!calculatedAcceptanceDate) return;

    const params = new URLSearchParams(window.location.search);
    params.set("acceptance", calculatedAcceptanceDate);
    params.set("reminders", serializeDeadlineReminderQueryParam(reminderOffsets));
    const query = params.toString();
    const nextUrl = query ? `?${query}` : window.location.pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [calculatedAcceptanceDate, reminderOffsets]);

  function toggleReminder(offset: number) {
    clearShareLinkFeedback();
    setReminderOffsets((current) =>
      current.includes(offset)
        ? current.filter((value) => value !== offset)
        : [...current, offset]
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <PageHeader
          marker={t("deadlines-marker")}
          title={t("deadlines-title")}
          subtitle={t("deadlines-subtitle")}
        />
      </div>

      {/* Input form */}
      <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] mb-8">
        <label htmlFor="acceptance-date" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-2">
          {t("deadlines-input-label")}
        </label>
        <div className="flex gap-4 flex-col sm:flex-row">
          <input
            id="acceptance-date"
            type="date"
            value={acceptanceDate}
            onChange={(e) => {
              setAcceptanceDate(e.target.value);
              const params = new URLSearchParams(window.location.search);
              if (deadlines || calculatedAcceptanceDate || params.has("acceptance")) {
                setDeadlines(null);
                setCalculatedAcceptanceDate(null);
                params.delete("acceptance");
                const query = params.toString();
                window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
              }
              clearShareLinkFeedback();
            }}
            max={getTodayLocalDateInputValue()}
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
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-2">
            {t("deadlines-reminder-label")}
          </p>
          <div className="flex flex-wrap gap-2">
            {reminderOptions.map((offset) => (
              <button
                key={offset}
                type="button"
                aria-pressed={reminderOffsets.includes(offset)}
                onClick={() => toggleReminder(offset)}
                className={`px-3 py-1.5 rounded-md text-xs border transition-colors duration-200 ${
                  reminderOffsets.includes(offset)
                    ? "bg-accent/20 border-accent/40 text-accent"
                    : "bg-white/[0.03] border-white/[0.08] text-muted hover:text-cream"
                }`}
              >
                {offset} {t("deadlines-reminder-days")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {deadlines && (
        <div className="space-y-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-cream">{t("deadlines-result-title")}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={copyShareLink}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/[0.06] hover:border-accent/30 text-muted hover:text-accent text-[13px] font-medium rounded-lg transition-all duration-300"
              >
                {shareLinkFeedback ? t(shareLinkFeedback) : t("deadlines-share-link")}
              </button>
              <button
                onClick={downloadICS}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/[0.06] hover:border-accent/30 text-muted hover:text-accent text-[13px] font-medium rounded-lg transition-all duration-300"
              >
                <Download className="w-4 h-4" />
                {t("deadlines-download-ics")}
              </button>
            </div>
          </div>

          {/* Timeline visualization */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] mb-6 relative overflow-hidden">
            <div className="text-[11px] text-muted uppercase tracking-[0.12em] font-semibold mb-4">{t("deadlines-timeline")}</div>
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
                    <div className="w-32 text-[12px] text-muted text-right">{formatLocalizedDate(d.date, lang)}</div>
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
                        : `${d.daysRemaining} ${t("deadlines-reminder-days")}`}
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
                      <span className="font-semibold text-cream">{t(d.titleKey)}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${cfg.text} bg-current/[0.06]`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-sm text-muted mb-3">
                      {t(d.descKey)}
                    </p>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted/60">{t("deadlines-deadline-date")}:</span>
                      <span className="font-semibold text-cream">{formatLocalizedDate(d.date, lang)}</span>
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
