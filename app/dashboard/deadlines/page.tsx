"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, Download, RotateCcw, AlertTriangle, CheckCircle, XCircle, Info } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import {
  addYears,
  calculateRuegefrist,
  DEADLINE_REMINDER_OFFSET_OPTIONS,
  DEFAULT_DEADLINE_REMINDER_OFFSETS,
  generateDeadlineCalendarICS,
  getDaysRemaining,
  getMillisecondsUntilNextSwissCalendarDay,
  getSwissCalendarDateInputValue,
  normalizeDeadlineReminderOffsets,
  parseDateInputAsUTC,
  sanitizeDateQueryParam,
  sanitizeDeadlineReminderQueryParam,
  serializeDeadlineReminderQueryParam,
  validateRuegefristInput,
  type LegalRegime,
} from "@/lib/legal-utils";
import PageHeader from "@/components/dashboard/PageHeader";
import type { TranslationKey } from "@/locales";
import { useAuth } from "@/context/AuthContext";
import { getSupabase } from "@/lib/supabase";
import {
  buildCaseDeadlinePortfolio,
  CASE_DEADLINE_PORTFOLIO_PAGE_SIZE,
  generateCaseDeadlinePortfolioICS,
  type CaseDeadlinePortfolioCalendarCopy,
  type CaseDeadlinePortfolioRow,
  type CaseDeadlinePortfolioSource,
} from "@/lib/case-deadline-portfolio";

type PortfolioState = {
  ownerId: string | null;
  status: "loading" | "error" | "ready";
  sources: CaseDeadlinePortfolioSource[];
  rows: CaseDeadlinePortfolioRow[];
};

function getLongDeadlineStatus(days: number): "ok" | "warning" | "urgent" | "expired" {
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

interface CalculatedInputs {
  contractDate: string;
  acceptanceDate: string;
  discoveryDate: string;
  regime: LegalRegime;
}

function buildDeadlines(contractDate: Date, acceptanceDate: Date, discoveryDate: Date): {
  deadlines: Deadline[];
  regime: LegalRegime;
} {
  const notice = calculateRuegefrist(contractDate, discoveryDate);
  const warranty2y = addYears(acceptanceDate, 2);
  const limitation5y = addYears(acceptanceDate, 5);
  const deadlines: Deadline[] = [];

  if (notice.ruegefrist60) {
    deadlines.push({
      key: "60-Tage-Rügefrist (OR Art. 370)",
      titleKey: "deadlines-60day-title",
      descKey: "deadlines-60day-desc",
      date: notice.ruegefrist60.date,
      daysRemaining: notice.ruegefrist60.daysRemaining,
      status: notice.ruegefrist60.status,
    });
  }

  deadlines.push(
    {
      key: "2-Jahres-SIA-Frist (SIA 118)",
      titleKey: "deadlines-2year-title",
      descKey: "deadlines-2year-desc",
      date: warranty2y,
      daysRemaining: getDaysRemaining(warranty2y),
      status: getLongDeadlineStatus(getDaysRemaining(warranty2y)),
    },
    {
      key: "5-Jahres-Verjährungsfrist (OR Art. 371)",
      titleKey: "deadlines-5year-title",
      descKey: "deadlines-5year-desc",
      date: limitation5y,
      daysRemaining: getDaysRemaining(limitation5y),
      status: getLongDeadlineStatus(getDaysRemaining(limitation5y)),
    }
  );

  return { deadlines, regime: notice.regime };
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

function formatReminderSummary(
  reminderOffsets: number[],
  t: (key: "deadlines-reminder-days" | "deadlines-reminder-none") => string
) {
  const selectedOffsets = DEADLINE_REMINDER_OFFSET_OPTIONS.filter((offset) =>
    reminderOffsets.includes(offset)
  );
  if (selectedOffsets.length === 0) return t("deadlines-reminder-none");
  return selectedOffsets.map((offset) => `${offset} ${t("deadlines-reminder-days")}`).join(", ");
}

export default function DeadlinesPage() {
  const { lang, t } = useLanguage();
  const { user } = useAuth();
  const supabase = useMemo(() => getSupabase(), []);
  const [contractDate, setContractDate] = useState("");
  const [acceptanceDate, setAcceptanceDate] = useState("");
  const [discoveryDate, setDiscoveryDate] = useState("");
  const [deadlines, setDeadlines] = useState<Deadline[] | null>(null);
  const [calculatedInputs, setCalculatedInputs] = useState<CalculatedInputs | null>(null);
  const [reminderOffsets, setReminderOffsets] = useState<number[]>([...DEFAULT_DEADLINE_REMINDER_OFFSETS]);
  const [shareLinkFeedback, setShareLinkFeedback] = useState<TranslationKey | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState<TranslationKey | null>(null);
  const shareLinkResetTimerRef = useRef<number | null>(null);
  const shareLinkRequestIdRef = useRef(0);
  const downloadFeedbackResetTimerRef = useRef<number | null>(null);
  const downloadFeedbackRequestIdRef = useRef(0);
  const [portfolioState, setPortfolioState] = useState<PortfolioState>({
    ownerId: user?.id ?? null,
    status: user ? "loading" : "ready",
    sources: [],
    rows: [],
  });
  const [portfolioFeedback, setPortfolioFeedback] = useState<TranslationKey | null>(null);
  const portfolioFetchIdRef = useRef(0);
  const portfolioExportIdRef = useRef(0);
  const portfolioExportInFlightRef = useRef(false);
  const portfolioFeedbackTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const currentUserIdRef = useRef<string | null>(user?.id ?? null);

  currentUserIdRef.current = user?.id ?? null;

  const fetchPortfolioSources = useCallback(async (
    ownerId: string,
    requestIsCurrent: () => boolean
  ): Promise<CaseDeadlinePortfolioSource[] | null> => {
    const sources: CaseDeadlinePortfolioSource[] = [];
    for (let from = 0; ; from += CASE_DEADLINE_PORTFOLIO_PAGE_SIZE) {
      if (!requestIsCurrent()) return null;
      const result = await supabase
        .from("cases")
        .select("id, project_name, contract_date, discovery_date, status")
        .eq("user_id", ownerId)
        .order("id", { ascending: true })
        .range(from, from + CASE_DEADLINE_PORTFOLIO_PAGE_SIZE - 1);
      if (!requestIsCurrent()) return null;
      if (result.error) throw result.error;

      const page = (result.data ?? []) as CaseDeadlinePortfolioSource[];
      sources.push(...page);
      if (page.length < CASE_DEADLINE_PORTFOLIO_PAGE_SIZE) return sources;
    }
  }, [supabase]);

  const loadPortfolio = useCallback(async () => {
    const ownerId = user?.id ?? null;
    const fetchId = ++portfolioFetchIdRef.current;
    portfolioExportIdRef.current += 1;
    portfolioExportInFlightRef.current = false;
    if (portfolioFeedbackTimerRef.current !== null) {
      window.clearTimeout(portfolioFeedbackTimerRef.current);
      portfolioFeedbackTimerRef.current = null;
    }
    setPortfolioFeedback(null);
    setPortfolioState({ ownerId, status: ownerId ? "loading" : "ready", sources: [], rows: [] });
    if (!ownerId) return;

    const requestIsCurrent = () =>
      mountedRef.current &&
      fetchId === portfolioFetchIdRef.current &&
      currentUserIdRef.current === ownerId;

    try {
      const sources = await fetchPortfolioSources(ownerId, requestIsCurrent);
      if (!sources || !requestIsCurrent()) return;
      setPortfolioState({
        ownerId,
        status: "ready",
        sources,
        rows: buildCaseDeadlinePortfolio(sources),
      });
    } catch {
      if (!requestIsCurrent()) return;
      setPortfolioState({ ownerId, status: "error", sources: [], rows: [] });
    }
  }, [fetchPortfolioSources, user?.id]);

  const parsedContractDate = parseDateInputAsUTC(contractDate);
  const parsedAcceptanceDate = parseDateInputAsUTC(acceptanceDate);
  const parsedDiscoveryDate = parseDateInputAsUTC(discoveryDate);
  const discoveryValidation =
    parsedContractDate && parsedDiscoveryDate
      ? validateRuegefristInput(parsedContractDate, parsedDiscoveryDate)
      : null;
  const acceptanceBeforeContract = Boolean(
    parsedContractDate && parsedAcceptanceDate && parsedAcceptanceDate < parsedContractDate
  );
  const discoveryBeforeAcceptance = Boolean(
    parsedAcceptanceDate && parsedDiscoveryDate && parsedDiscoveryDate < parsedAcceptanceDate
  );
  const discoveryInFuture = Boolean(
    discoveryDate && discoveryDate > getSwissCalendarDateInputValue()
  );
  const inputIsValid = Boolean(
    parsedContractDate &&
      parsedAcceptanceDate &&
      parsedDiscoveryDate &&
      !discoveryValidation &&
      !acceptanceBeforeContract &&
      !discoveryBeforeAcceptance &&
      !discoveryInFuture
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ownedDateParams = ["contract", "acceptance", "discovery"] as const;
    const sanitizedDates = {
      contract: sanitizeDateQueryParam(params.get("contract")),
      acceptance: sanitizeDateQueryParam(params.get("acceptance")),
      discovery: sanitizeDateQueryParam(params.get("discovery")),
    };
    const rawReminders = params.get("reminders");
    const sanitizedReminders = sanitizeDeadlineReminderQueryParam(rawReminders);
    const serializedReminders = serializeDeadlineReminderQueryParam(sanitizedReminders);

    for (const key of ownedDateParams) {
      if (params.has(key) && !sanitizedDates[key]) params.delete(key);
    }
    if (rawReminders !== null && rawReminders !== serializedReminders) {
      params.set("reminders", serializedReminders);
    }

    const query = params.toString();
    const nextUrl = query ? `?${query}` : window.location.pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) window.history.replaceState(null, "", nextUrl);

    const contract = sanitizedDates.contract ? parseDateInputAsUTC(sanitizedDates.contract) : null;
    const acceptance = sanitizedDates.acceptance ? parseDateInputAsUTC(sanitizedDates.acceptance) : null;
    const discovery = sanitizedDates.discovery ? parseDateInputAsUTC(sanitizedDates.discovery) : null;
    const datesAreValid = Boolean(
      contract &&
        acceptance &&
        discovery &&
        !validateRuegefristInput(contract, discovery) &&
        acceptance >= contract &&
        discovery >= acceptance &&
        sanitizedDates.discovery <= getSwissCalendarDateInputValue()
    );

    const frame = window.requestAnimationFrame(() => {
      setContractDate(sanitizedDates.contract);
      setAcceptanceDate(sanitizedDates.acceptance);
      setDiscoveryDate(sanitizedDates.discovery);
      setReminderOffsets(sanitizedReminders);

      if (!contract || !acceptance || !discovery || !datesAreValid) return;
      const calculated = buildDeadlines(contract, acceptance, discovery);
      setDeadlines(calculated.deadlines);
      setCalculatedInputs({
        contractDate: sanitizedDates.contract,
        acceptanceDate: sanitizedDates.acceptance,
        discoveryDate: sanitizedDates.discovery,
        regime: calculated.regime,
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Keep this lifecycle guard before effects that start async work so React
  // Strict Mode restores it before replaying the portfolio loader.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      portfolioFetchIdRef.current += 1;
      portfolioExportIdRef.current += 1;
      portfolioExportInFlightRef.current = false;
      shareLinkRequestIdRef.current += 1;
      downloadFeedbackRequestIdRef.current += 1;
      if (shareLinkResetTimerRef.current !== null) window.clearTimeout(shareLinkResetTimerRef.current);
      if (downloadFeedbackResetTimerRef.current !== null) window.clearTimeout(downloadFeedbackResetTimerRef.current);
      if (portfolioFeedbackTimerRef.current !== null) window.clearTimeout(portfolioFeedbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  useEffect(() => {
    const ownerId = user?.id ?? null;
    if (!ownerId) return;
    let timer: number | null = null;

    const scheduleNextCalendarDay = () => {
      timer = window.setTimeout(() => {
        if (mountedRef.current && currentUserIdRef.current === ownerId) {
          setPortfolioState((current) => current.ownerId === ownerId
            ? { ...current, rows: buildCaseDeadlinePortfolio(current.sources) }
            : current
          );
          scheduleNextCalendarDay();
        }
      }, getMillisecondsUntilNextSwissCalendarDay());
    };

    scheduleNextCalendarDay();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [user?.id]);

  function clearDownloadFeedback() {
    downloadFeedbackRequestIdRef.current += 1;
    if (downloadFeedbackResetTimerRef.current !== null) {
      window.clearTimeout(downloadFeedbackResetTimerRef.current);
      downloadFeedbackResetTimerRef.current = null;
    }
    setDownloadFeedback(null);
  }

  function clearShareLinkFeedback() {
    shareLinkRequestIdRef.current += 1;
    if (shareLinkResetTimerRef.current !== null) {
      window.clearTimeout(shareLinkResetTimerRef.current);
      shareLinkResetTimerRef.current = null;
    }
    setShareLinkFeedback(null);
  }

  function clearCalculatedResult(changedParam?: "contract" | "acceptance" | "discovery") {
    setDeadlines(null);
    setCalculatedInputs(null);
    clearShareLinkFeedback();
    clearDownloadFeedback();
    if (changedParam) {
      const params = new URLSearchParams(window.location.search);
      params.delete(changedParam);
      const query = params.toString();
      window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    }
  }

  function calculate() {
    clearShareLinkFeedback();
    clearDownloadFeedback();
    if (!parsedContractDate || !parsedAcceptanceDate || !parsedDiscoveryDate || !inputIsValid) return;
    const calculated = buildDeadlines(parsedContractDate, parsedAcceptanceDate, parsedDiscoveryDate);
    setDeadlines(calculated.deadlines);
    setCalculatedInputs({ contractDate, acceptanceDate, discoveryDate, regime: calculated.regime });
    const params = new URLSearchParams(window.location.search);
    params.set("contract", contractDate);
    params.set("acceptance", acceptanceDate);
    params.set("discovery", discoveryDate);
    params.set("reminders", serializeDeadlineReminderQueryParam(reminderOffsets));
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  function reset() {
    setContractDate("");
    setAcceptanceDate("");
    setDiscoveryDate("");
    setDeadlines(null);
    setCalculatedInputs(null);
    setReminderOffsets([...DEFAULT_DEADLINE_REMINDER_OFFSETS]);
    clearShareLinkFeedback();
    clearDownloadFeedback();
    const params = new URLSearchParams(window.location.search);
    params.delete("contract");
    params.delete("acceptance");
    params.delete("discovery");
    params.delete("reminders");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }

  async function copyShareLink() {
    if (!calculatedInputs || !deadlines) return;
    const url = new URL(window.location.href);
    url.searchParams.set("contract", calculatedInputs.contractDate);
    url.searchParams.set("acceptance", calculatedInputs.acceptanceDate);
    url.searchParams.set("discovery", calculatedInputs.discoveryDate);
    url.searchParams.set("reminders", serializeDeadlineReminderQueryParam(reminderOffsets));
    if (shareLinkResetTimerRef.current !== null) window.clearTimeout(shareLinkResetTimerRef.current);
    const requestId = ++shareLinkRequestIdRef.current;
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
    if (!deadlines || !calculatedInputs) return;
    const acceptance = parseDateInputAsUTC(calculatedInputs.acceptanceDate);
    const contract = parseDateInputAsUTC(calculatedInputs.contractDate);
    const discovery = parseDateInputAsUTC(calculatedInputs.discoveryDate);
    if (!acceptance || !contract || !discovery) return;
    try {
      const content = generateDeadlineCalendarICS(
        deadlines.map((deadline) => ({ key: deadline.key, date: deadline.date })),
        formatLocalizedDate(acceptance, lang),
        reminderOffsets,
        {
          contractDateLabel: formatLocalizedDate(contract, lang),
          discoveryDateLabel: formatLocalizedDate(discovery, lang),
        }
      );
      const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `baucompliance-fristen-${calculatedInputs.acceptanceDate}.ics`;
      anchor.click();
      URL.revokeObjectURL(url);
      setDownloadFeedback(
        reminderOffsets.length > 0
          ? "deadlines-download-ready"
          : "deadlines-download-event-only-ready"
      );
    } catch {
      setDownloadFeedback("deadlines-download-error");
    }
    const requestId = ++downloadFeedbackRequestIdRef.current;
    if (downloadFeedbackResetTimerRef.current !== null) window.clearTimeout(downloadFeedbackResetTimerRef.current);
    downloadFeedbackResetTimerRef.current = window.setTimeout(() => {
      if (requestId !== downloadFeedbackRequestIdRef.current) return;
      setDownloadFeedback(null);
      downloadFeedbackResetTimerRef.current = null;
    }, 2000);
  }

  async function downloadPortfolioICS() {
    const ownerId = user?.id ?? null;
    const visibleSources = portfolioState.ownerId === ownerId ? portfolioState.sources : [];
    if (!ownerId || visibleSources.length === 0 || portfolioExportInFlightRef.current) return;

    portfolioExportInFlightRef.current = true;
    const requestId = ++portfolioExportIdRef.current;
    if (portfolioFeedbackTimerRef.current !== null) {
      window.clearTimeout(portfolioFeedbackTimerRef.current);
      portfolioFeedbackTimerRef.current = null;
    }
    setPortfolioFeedback(null);

    try {
      await Promise.resolve();
      if (!mountedRef.current || requestId !== portfolioExportIdRef.current || currentUserIdRef.current !== ownerId) return;

      // Reload owner-scoped Cases and revalidate the current Swiss day at the
      // consequential point-in-time export boundary.
      const freshSources = await fetchPortfolioSources(
        ownerId,
        () => mountedRef.current && requestId === portfolioExportIdRef.current && currentUserIdRef.current === ownerId
      );
      if (!freshSources) return;
      const currentRows = buildCaseDeadlinePortfolio(freshSources, new Date());
      setPortfolioState((current) => current.ownerId === ownerId
        ? { ...current, sources: freshSources, rows: currentRows }
        : current
      );
      if (currentRows.length === 0) return;

      const calendarCopy: CaseDeadlinePortfolioCalendarCopy = {
        summaryTemplate: t("deadlines-portfolio-ics-summary-template"),
        deadline: t("deadlines-portfolio-ics-deadline"),
        sourceLabel: t("deadlines-portfolio-ics-source-label"),
        source: t("deadlines-portfolio-ics-source"),
        projectLabel: t("deadlines-portfolio-ics-project-label"),
        caseLabel: t("deadlines-portfolio-ics-case-label"),
        contractDateLabel: t("deadlines-portfolio-ics-contract-label"),
        discoveryDateLabel: t("deadlines-portfolio-ics-discovery-label"),
        pointInTimeNotice: t("deadlines-portfolio-ics-point-in-time"),
        alarmDescriptionSingular: t("deadlines-portfolio-ics-alarm-singular"),
        alarmDescriptionPlural: t("deadlines-portfolio-ics-alarm-plural"),
      };
      const content = generateCaseDeadlinePortfolioICS(
        currentRows,
        normalizeDeadlineReminderOffsets(reminderOffsets),
        calendarCopy
      );
      const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
      let objectUrl: string | null = null;
      try {
        objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = `baucompliance-case-deadlines-${getSwissCalendarDateInputValue()}.ics`;
        anchor.click();
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }

      if (!mountedRef.current || requestId !== portfolioExportIdRef.current || currentUserIdRef.current !== ownerId) return;
      setPortfolioFeedback(
        reminderOffsets.length > 0
          ? "deadlines-portfolio-ready"
          : "deadlines-portfolio-event-only-ready"
      );
    } catch {
      if (!mountedRef.current || requestId !== portfolioExportIdRef.current || currentUserIdRef.current !== ownerId) return;
      setPortfolioFeedback("deadlines-portfolio-download-error");
    } finally {
      if (requestId === portfolioExportIdRef.current) portfolioExportInFlightRef.current = false;
    }

    if (!mountedRef.current || requestId !== portfolioExportIdRef.current || currentUserIdRef.current !== ownerId) return;
    portfolioFeedbackTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current || requestId !== portfolioExportIdRef.current || currentUserIdRef.current !== ownerId) return;
      setPortfolioFeedback(null);
      portfolioFeedbackTimerRef.current = null;
    }, 2000);
  }

  function toggleReminder(offset: number) {
    clearShareLinkFeedback();
    clearDownloadFeedback();
    portfolioExportIdRef.current += 1;
    portfolioExportInFlightRef.current = false;
    if (portfolioFeedbackTimerRef.current !== null) {
      window.clearTimeout(portfolioFeedbackTimerRef.current);
      portfolioFeedbackTimerRef.current = null;
    }
    setPortfolioFeedback(null);
    const next = reminderOffsets.includes(offset)
      ? reminderOffsets.filter((value) => value !== offset)
      : [...reminderOffsets, offset];
    setReminderOffsets(next);
    if (calculatedInputs) {
      const params = new URLSearchParams(window.location.search);
      params.set("contract", calculatedInputs.contractDate);
      params.set("acceptance", calculatedInputs.acceptanceDate);
      params.set("discovery", calculatedInputs.discoveryDate);
      params.set("reminders", serializeDeadlineReminderQueryParam(next));
      window.history.replaceState(null, "", `?${params.toString()}`);
    }
  }

  const statusConfig = {
    ok: { bg: "bg-green-500/[0.06] border-green-500/20", text: "text-green-400", bar: "bg-green-500", icon: CheckCircle, label: t("deadlines-status-ok") },
    warning: { bg: "bg-yellow-500/[0.06] border-yellow-500/20", text: "text-yellow-400", bar: "bg-yellow-500", icon: AlertTriangle, label: t("deadlines-status-warning") },
    urgent: { bg: "bg-red-500/[0.06] border-red-500/20", text: "text-red-400", bar: "bg-red-500", icon: AlertTriangle, label: t("deadlines-status-urgent") },
    expired: { bg: "bg-white/[0.02] border-white/[0.06]", text: "text-muted", bar: "bg-muted", icon: XCircle, label: t("deadlines-expired") },
  };
  const reminderSummary = formatReminderSummary(reminderOffsets, t);
  const reminderGuidanceKey = reminderOffsets.length > 0
    ? "reminders-activation-guidance"
    : "reminders-event-only-guidance";
  const portfolioGuidanceKey = reminderOffsets.length > 0
    ? "deadlines-portfolio-guidance"
    : "deadlines-portfolio-event-only-guidance";
  const visiblePortfolioState: PortfolioState = portfolioState.ownerId === (user?.id ?? null)
    ? portfolioState
    : { ownerId: user?.id ?? null, status: user ? "loading" : "ready", sources: [], rows: [] };
  const maxDays = 1825;
  const inputClass = "w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-cream focus:outline-none focus:border-accent/40 transition-colors duration-300 [color-scheme:dark]";

  return (
    <div>
      <div className="mb-8">
        <PageHeader marker={t("deadlines-marker")} title={t("deadlines-title")} subtitle={t("deadlines-subtitle")} />
      </div>

      <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] mb-8">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            {t("deadlines-contract-date")}
            <input id="contract-date" type="date" value={contractDate} onChange={(event) => { setContractDate(event.target.value); clearCalculatedResult("contract"); }} className={`${inputClass} mt-2`} />
          </label>
          <label htmlFor="acceptance-date" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            {t("deadlines-input-label")}
            <input id="acceptance-date" type="date" value={acceptanceDate} onChange={(event) => { setAcceptanceDate(event.target.value); clearCalculatedResult("acceptance"); }} max={getSwissCalendarDateInputValue()} className={`${inputClass} mt-2`} />
          </label>
          <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            {t("deadlines-discovery-date")}
            <input id="discovery-date" type="date" value={discoveryDate} onChange={(event) => { setDiscoveryDate(event.target.value); clearCalculatedResult("discovery"); }} max={getSwissCalendarDateInputValue()} className={`${inputClass} mt-2`} />
          </label>
        </div>
        {(discoveryValidation || acceptanceBeforeContract) && (
          <p className="mt-3 text-sm text-red-400">{t("deadlines-date-order-error")}</p>
        )}
        {discoveryBeforeAcceptance && (
          <p className="mt-3 text-sm text-red-400">{t("deadlines-discovery-order-error")}</p>
        )}
        {discoveryInFuture && (
          <p className="mt-3 text-sm text-red-400">{t("deadlines-future-discovery-error")}</p>
        )}
        <div className="mt-4 flex gap-3">
          <button onClick={calculate} disabled={!inputIsValid} className="px-6 py-3 bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-300 flex items-center gap-2">
            <Clock className="w-4 h-4" /> {t("deadlines-calculate")}
          </button>
          {(deadlines || contractDate || acceptanceDate || discoveryDate) && (
            <button onClick={reset} className="px-4 py-3 bg-white/[0.03] border border-white/[0.06] text-muted hover:text-cream font-medium rounded-lg transition-all duration-300 flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> {t("deadlines-reset")}
            </button>
          )}
        </div>
        <div
          role="region"
          aria-labelledby="deadlines-reminder-presets-label"
          className="mt-4 pt-4 border-t border-white/[0.06]"
        >
          <p id="deadlines-reminder-presets-label" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-2">{t("deadlines-reminder-label")}</p>
          <div role="group" aria-labelledby="deadlines-reminder-presets-label" className="flex flex-wrap gap-2">
            {DEADLINE_REMINDER_OFFSET_OPTIONS.map((offset) => (
              <button key={offset} type="button" aria-pressed={reminderOffsets.includes(offset)} onClick={() => toggleReminder(offset)} className={`px-3 py-1.5 rounded-md text-xs border transition-colors duration-200 ${reminderOffsets.includes(offset) ? "bg-accent/20 border-accent/40 text-accent" : "bg-white/[0.03] border-white/[0.08] text-muted hover:text-cream"}`}>
                {offset} {t("deadlines-reminder-days")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {user && (
        <section
          role="region"
          aria-label={t("deadlines-portfolio-title")}
          className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] mb-8"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-cream">{t("deadlines-portfolio-title")}</h2>
              <p className="mt-1 text-sm text-muted">{t("deadlines-portfolio-description")}</p>
            </div>
            {visiblePortfolioState.status === "ready" && visiblePortfolioState.rows.length > 0 && (
              <button
                type="button"
                onClick={() => void downloadPortfolioICS()}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-[13px] font-medium text-accent transition-colors hover:bg-accent/20"
              >
                <Download className="w-4 h-4" />
                {portfolioFeedback ? t(portfolioFeedback) : t("deadlines-portfolio-download")}
              </button>
            )}
          </div>

          {visiblePortfolioState.status === "loading" && (
            <p className="mt-4 text-sm text-muted">{t("deadlines-portfolio-loading")}</p>
          )}
          {visiblePortfolioState.status === "error" && (
            <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-red-400">
              <span>{t("deadlines-portfolio-error")}</span>
              <button type="button" onClick={() => void loadPortfolio()} className="rounded-md border border-red-400/30 px-3 py-1.5">
                {t("deadlines-portfolio-retry")}
              </button>
            </div>
          )}
          {visiblePortfolioState.status === "ready" && visiblePortfolioState.rows.length === 0 && (
            <p className="mt-4 text-sm text-muted">{t("deadlines-portfolio-empty")}</p>
          )}
          {visiblePortfolioState.status === "ready" && visiblePortfolioState.rows.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-cream">
                <span>{t("deadlines-portfolio-count")}</span> {visiblePortfolioState.rows.length}
              </p>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                {visiblePortfolioState.rows.map((row) => (
                  <li key={`${row.caseId}-${row.deadlineDay}`} className="flex flex-wrap justify-between gap-2">
                    <span className="text-cream">{row.projectName}</span>
                    <time dateTime={row.deadlineDay}>{formatLocalizedDate(row.deadline, lang)}</time>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-muted">{t(portfolioGuidanceKey)}</p>
            </div>
          )}
        </section>
      )}

      {deadlines && calculatedInputs && (
        <div className="space-y-5">
          <section
            aria-label={t("deadlines-download-ics")}
            className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-2"
          >
            <div>
              <h2 className="text-lg font-semibold text-cream">{t("deadlines-result-title")}</h2>
              <p className="text-[12px] text-muted">{t("deadlines-reminder-label")}: {reminderSummary}</p>
            </div>
            <div className="flex max-w-2xl flex-col items-end gap-2">
              <p className="text-right text-xs leading-relaxed text-muted">{t(reminderGuidanceKey)}</p>
              <div className="flex items-center gap-2">
                <button onClick={copyShareLink} className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/[0.06] hover:border-accent/30 text-muted hover:text-accent text-[13px] font-medium rounded-lg transition-all duration-300">
                  {shareLinkFeedback ? t(shareLinkFeedback) : t("deadlines-share-link")}
                </button>
                <button onClick={downloadICS} className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/[0.06] hover:border-accent/30 text-muted hover:text-accent text-[13px] font-medium rounded-lg transition-all duration-300">
                  <Download className="w-4 h-4" /> {downloadFeedback ? t(downloadFeedback) : t("deadlines-download-ics")}
                </button>
              </div>
            </div>
          </section>

          {calculatedInputs.regime === "old" && (
            <div className="border border-blue-500/20 bg-blue-500/[0.04] p-5 rounded-2xl flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-400 mt-0.5" />
              <div><h3 className="font-semibold text-blue-400">{t("deadlines-old-law-title")}</h3><p className="text-sm text-muted mt-1">{t("deadlines-old-law-desc")}</p></div>
            </div>
          )}

          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] mb-6 relative overflow-hidden">
            <div className="text-[11px] text-muted uppercase tracking-[0.12em] font-semibold mb-4">{t("deadlines-timeline")}</div>
            {deadlines.map((deadline) => {
              const pct = Math.min(100, Math.max(0, ((maxDays - Math.max(0, deadline.daysRemaining)) / maxDays) * 100));
              const config = statusConfig[deadline.status];
              return (
                <div key={deadline.key} className="flex items-center gap-3 mt-4">
                  <div className="w-32 text-[12px] text-muted text-right">{formatLocalizedDate(deadline.date, lang)}</div>
                  <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden"><div className={`h-full rounded-full ${config.bar}`} style={{ width: `${100 - pct}%` }} /></div>
                  <div className={`w-20 text-[12px] font-semibold ${config.text} text-right`}>{deadline.daysRemaining < 0 ? t("deadlines-expired") : `${deadline.daysRemaining} ${t("deadlines-reminder-days")}`}</div>
                </div>
              );
            })}
          </div>

          {deadlines.map((deadline) => {
            const config = statusConfig[deadline.status];
            const Icon = config.icon;
            return (
              <div key={deadline.key} className={`border p-6 rounded-2xl bg-white/[0.02] ${config.bg}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1"><Icon className={`w-5 h-5 ${config.text}`} /><span className="font-semibold text-cream">{t(deadline.titleKey)}</span><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${config.text} bg-current/[0.06]`}>{config.label}</span></div>
                    <p className="text-sm text-muted mb-3">{t(deadline.descKey)}</p>
                    <div className="flex items-center gap-2 text-sm"><span className="text-muted/60">{t("deadlines-deadline-date")}:</span><time dateTime={deadline.date.toISOString().slice(0, 10)} className="font-semibold text-cream">{formatLocalizedDate(deadline.date, lang)}</time></div>
                  </div>
                  <div className={`text-right ${config.text}`}><div className="text-3xl font-[family-name:var(--font-display)] italic">{deadline.daysRemaining < 0 ? "—" : deadline.daysRemaining}</div><div className="text-[11px] text-muted">{deadline.daysRemaining < 0 ? t("deadlines-expired") : t("deadlines-days-remaining")}</div></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
