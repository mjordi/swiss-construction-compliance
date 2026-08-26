"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BriefcaseBusiness, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getSupabase } from "@/lib/supabase";
import {
  buildComplianceWorkQueueResult,
  type ComplianceWorkQueuePriority,
  type ComplianceWorkQueueReadinessReason,
  type ComplianceWorkQueueRow,
} from "@/lib/compliance-work-queue";
import type { CaseDeadlineStatus } from "@/lib/case-timeline";
import type { TranslationKey } from "@/locales";

const priorityLabelKey: Record<ComplianceWorkQueuePriority, TranslationKey> = {
  expired: "work-priority-expired",
  "immediate-notice": "work-priority-immediate-notice",
  urgent: "work-priority-urgent",
  warning: "work-priority-warning",
  "lifecycle-review": "work-priority-lifecycle-review",
  "incomplete-readiness": "work-priority-incomplete-readiness",
};

const reasonLabelKey: Record<ComplianceWorkQueueReadinessReason, TranslationKey> = {
  "defect-not-documented": "work-reason-defect-not-documented",
  "evidence-not-attached": "work-reason-evidence-not-attached",
  "notice-not-drafted": "work-reason-notice-not-drafted",
  "calendar-not-exported": "work-reason-calendar-not-exported",
  "protocol-missing": "work-reason-protocol-missing",
};

const statusLabelKey: Record<CaseDeadlineStatus, TranslationKey> = {
  ok: "cases-status-on-track",
  warning: "cases-status-attention",
  urgent: "cases-status-urgent",
  expired: "cases-status-expired",
  "immediate-notice": "cases-status-immediate-notice",
};

const nextActionKey: Record<CaseDeadlineStatus, TranslationKey> = {
  ok: "cases-next-action-ok",
  warning: "cases-next-action-warning",
  urgent: "cases-next-action-urgent",
  expired: "cases-next-action-expired",
  "immediate-notice": "cases-next-action-immediate-notice",
};

type LoadError = "work-error" | "work-malformed";

function localizedCountdown(row: ComplianceWorkQueueRow, t: (key: TranslationKey) => string): string {
  const days = row.timeline.daysToDeadline;
  if (days === null) return t("cases-countdown-notify-immediately");
  if (days < 0) {
    return days === -1
      ? t("cases-countdown-one-day-overdue")
      : `${Math.abs(days)} ${t("cases-countdown-days-overdue-suffix")}`;
  }
  if (days === 0) return t("cases-countdown-due-today");
  if (days === 1) return t("cases-countdown-one-day-left");
  return `${days} ${t("cases-countdown-days-left-suffix")}`;
}

export default function ComplianceWorkQueuePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const supabase = useMemo(() => getSupabase(), []);
  const [rows, setRows] = useState<ComplianceWorkQueueRow[]>([]);
  const [loadedOwnerId, setLoadedOwnerId] = useState<string | null>(null);
  const [loadingOwnerId, setLoadingOwnerId] = useState<string | null>(user?.id ?? null);
  const [error, setError] = useState<LoadError | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);
  const currentOwnerIdRef = useRef<string | null>(user?.id ?? null);
  currentOwnerIdRef.current = user?.id ?? null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const load = useCallback(async () => {
    const ownerId = user?.id ?? null;
    const requestId = ++requestIdRef.current;
    setLoadedOwnerId(null);
    setRows([]);
    setError(null);

    if (!ownerId) {
      setLoadingOwnerId(null);
      return;
    }

    setLoadingOwnerId(ownerId);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_vault_audit_snapshot");
      if (rpcError) throw rpcError;
      if (!mountedRef.current || requestId !== requestIdRef.current || currentOwnerIdRef.current !== ownerId) return;

      const snapshot = data as {
        cases?: unknown[];
        protocols?: unknown[];
      } | null;
      if (!snapshot || !Array.isArray(snapshot.cases) || !Array.isArray(snapshot.protocols)) {
        setError("work-malformed");
        setLoadingOwnerId(null);
        return;
      }

      const result = buildComplianceWorkQueueResult(snapshot.cases, snapshot.protocols);
      setRows(result.rows);
      if (result.rejectedCaseCount > 0 || result.rejectedProtocolCount > 0) {
        setError("work-malformed");
      }
      setLoadedOwnerId(ownerId);
      setLoadingOwnerId(null);
    } catch {
      if (!mountedRef.current || requestId !== requestIdRef.current || currentOwnerIdRef.current !== ownerId) return;
      setRows([]);
      setLoadedOwnerId(null);
      setLoadingOwnerId(null);
      setError("work-error");
    }
  }, [supabase, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const ownerId = user?.id ?? null;
  const visibleRows = loadedOwnerId === ownerId ? rows : [];
  const isLoading = ownerId !== null && loadingOwnerId === ownerId && loadedOwnerId !== ownerId;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header>
        <div className="flex items-center gap-2 text-accent">
          <BriefcaseBusiness className="h-5 w-5" />
          <h1 className="text-2xl font-semibold text-cream">{t("work-title")}</h1>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-muted">{t("work-description")}</p>
        <p className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-xs leading-5 text-muted">
          {t("work-boundary")}
        </p>
      </header>

      {isLoading && (
        <div role="status" aria-live="polite" className="mt-8 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("work-loading")}
        </div>
      )}

      {!isLoading && error && (
        <div role="alert" className="mt-8 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm text-red-200">
          <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{t(error)}</div>
          <button type="button" onClick={() => void load()} className="mt-3 rounded-lg border border-red-300/20 px-3 py-2 font-medium">
            {t("work-retry")}
          </button>
        </div>
      )}

      {!isLoading && !error && visibleRows.length === 0 && (
        <section className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
          <h2 className="text-lg font-medium text-cream">{t("work-empty-title")}</h2>
          <p className="mt-2 text-sm text-muted">{t("work-empty-body")}</p>
        </section>
      )}

      {!isLoading && error !== "work-error" && visibleRows.length > 0 && (
        <ol className="mt-8 space-y-4">
          {visibleRows.map((row) => (
            <li key={row.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-accent">{t(priorityLabelKey[row.priority])}</div>
                  <h2 className="mt-1 text-lg font-semibold text-cream">{row.projectName}</h2>
                  <p className="mt-1 text-xs text-muted">{row.canton} · {row.id} · {t(statusLabelKey[row.timeline.status])}</p>
                </div>
                <Link href={row.casesHref} className="rounded-lg border border-accent/20 bg-accent/[0.08] px-3 py-2 text-sm font-medium text-accent">
                  {t("work-open-case")}
                </Link>
              </div>

              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div><dt className="text-xs text-muted">{t("work-next-action")}</dt><dd className="mt-1 text-sm text-cream">{t(nextActionKey[row.timeline.status])}</dd></div>
                <div><dt className="text-xs text-muted">{t("work-countdown")}</dt><dd className="mt-1 text-sm text-cream">{localizedCountdown(row, t)}</dd></div>
                <div><dt className="text-xs text-muted">{t("work-progress")}</dt><dd className="mt-1 text-sm text-cream">{row.checklistProgress.completed}/{row.checklistProgress.total}</dd></div>
                <div><dt className="text-xs text-muted">{t("work-linked-protocols")}</dt><dd className="mt-1 text-sm text-cream">{row.linkedProtocolCount}</dd></div>
              </dl>

              {row.readinessReasons.length > 0 && (
                <div className="mt-5">
                  <div className="text-xs text-muted">{t("work-readiness")}</div>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {row.readinessReasons.map((reason) => <li key={reason} className="rounded-full bg-white/[0.05] px-3 py-1 text-xs text-cream">{t(reasonLabelKey[reason])}</li>)}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
