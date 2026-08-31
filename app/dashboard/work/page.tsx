"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  buildSharedOwnerLabel,
  parseOwnedComplianceQueueGrants,
  parseSharedComplianceQueueOwners,
  selectComplianceQueueTarget,
} from "@/lib/compliance-queue-sharing";
import type {
  ComplianceQueueOwnedGrant,
  ComplianceQueueSharedOwner,
} from "@/lib/database.types";
import type { CaseDeadlineStatus } from "@/lib/case-timeline";
import { getMillisecondsUntilNextSwissCalendarDay } from "@/lib/legal-utils";
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
type SharingFeedback = "work-sharing-grant-success" | "work-sharing-revoke-success" | "work-sharing-grant-error";
type RpcResponse = { data: unknown; error: unknown };

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
  const ownerId = user?.id ?? null;

  const [rows, setRows] = useState<ComplianceWorkQueueRow[]>([]);
  const [loadedTarget, setLoadedTarget] = useState<{ accountId: string; ownerId: string } | null>(null);
  const [error, setError] = useState<{ accountId: string; ownerId: string; key: LoadError } | null>(null);
  const [ownedGrants, setOwnedGrants] = useState<ComplianceQueueOwnedGrant[]>([]);
  const [sharedOwners, setSharedOwners] = useState<ComplianceQueueSharedOwner[]>([]);
  const [accessOwnerId, setAccessOwnerId] = useState<string | null>(null);
  const [accessErrorOwnerId, setAccessErrorOwnerId] = useState<string | null>(null);
  const [requestedOwner, setRequestedOwner] = useState<{ accountId: string; ownerId: string } | null>(null);
  const [emailForm, setEmailForm] = useState<{ accountId: string; value: string } | null>(null);
  const [feedback, setFeedback] = useState<{ accountId: string; key: SharingFeedback } | null>(null);
  const [pendingMutation, setPendingMutation] = useState<{ accountId: string; kind: "grant" | "revoke"; id?: string } | null>(null);

  const snapshotRequestRef = useRef(0);
  const accessRequestRef = useRef(0);
  const ownedGrantsRevisionRef = useRef(0);
  const mutationRequestRef = useRef(0);
  const mutationPendingRef = useRef(false);
  const mountedRef = useRef(false);
  const currentAccountIdRef = useRef<string | null>(ownerId);

  if (currentAccountIdRef.current !== ownerId) {
    currentAccountIdRef.current = ownerId;
    snapshotRequestRef.current += 1;
    accessRequestRef.current += 1;
    mutationRequestRef.current += 1;
    mutationPendingRef.current = false;
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      snapshotRequestRef.current += 1;
      accessRequestRef.current += 1;
      mutationRequestRef.current += 1;
      mutationPendingRef.current = false;
    };
  }, []);

  const visibleOwnedGrants = accessOwnerId === ownerId ? ownedGrants : [];
  const visibleSharedOwners = accessOwnerId === ownerId ? sharedOwners : [];
  const requestedOwnerId = requestedOwner?.accountId === ownerId ? requestedOwner.ownerId : null;
  const targetOwnerId = ownerId
    ? selectComplianceQueueTarget(ownerId, requestedOwnerId, visibleSharedOwners)
    : null;
  const isSharedView = ownerId !== null && targetOwnerId !== null && targetOwnerId !== ownerId;
  const visibleEmail = emailForm?.accountId === ownerId ? emailForm.value : "";
  const visibleFeedback = feedback?.accountId === ownerId ? feedback.key : null;
  const visiblePending = pendingMutation?.accountId === ownerId ? pendingMutation : null;

  const loadAccess = useCallback(async () => {
    const accountId = currentAccountIdRef.current;
    const requestId = ++accessRequestRef.current;
    const ownedGrantsRevision = ownedGrantsRevisionRef.current;
    setAccessErrorOwnerId(null);
    if (!accountId) {
      setAccessOwnerId(null);
      setOwnedGrants([]);
      setSharedOwners([]);
      return;
    }

    const applyIfCurrent = (apply: () => void) => {
      if (mountedRef.current && requestId === accessRequestRef.current && currentAccountIdRef.current === accountId) apply();
    };

    const ownedPromise = (async () => {
      const { data, error: rpcError }: RpcResponse = await supabase.rpc("list_owned_compliance_queue_grants");
      if (rpcError) throw rpcError;
      const parsed = parseOwnedComplianceQueueGrants(data);
      if (!Array.isArray(data) || parsed.length !== data.length) {
        throw new Error("malformed owned grants response");
      }
      if (ownedGrantsRevision === ownedGrantsRevisionRef.current) {
        applyIfCurrent(() => {
          setOwnedGrants(parsed);
          setAccessOwnerId(accountId);
        });
      }
    })()
      .catch(() => {
        if (ownedGrantsRevision === ownedGrantsRevisionRef.current) {
          applyIfCurrent(() => setAccessErrorOwnerId(accountId));
        }
      });

    const sharedPromise = (async () => {
      const { data, error: rpcError }: RpcResponse = await supabase.rpc("list_shared_compliance_queue_owners");
      if (rpcError) throw rpcError;
      const parsed = parseSharedComplianceQueueOwners(data);
      if (!Array.isArray(data) || parsed.length !== data.length) {
        throw new Error("malformed shared owners response");
      }
      applyIfCurrent(() => {
        setSharedOwners(parsed);
        setAccessOwnerId(accountId);
      });
    })()
      .catch(() => applyIfCurrent(() => setAccessErrorOwnerId(accountId)));

    await Promise.all([ownedPromise, sharedPromise]);
  }, [supabase]);

  useEffect(() => {
    setOwnedGrants([]);
    setSharedOwners([]);
    setAccessOwnerId(null);
    setRequestedOwner(null);
    setEmailForm(null);
    setFeedback(null);
    setPendingMutation(null);
    setAccessErrorOwnerId(null);
    void loadAccess();
  }, [loadAccess, ownerId]);

  const load = useCallback(async () => {
    const accountId = currentAccountIdRef.current;
    const selectedOwnerId = targetOwnerId;
    const requestId = ++snapshotRequestRef.current;
    setLoadedTarget(null);
    setRows([]);
    setError(null);

    if (!accountId || !selectedOwnerId) {
      return;
    }

    try {
      const { data, error: rpcError } = await supabase.rpc("get_compliance_work_queue_snapshot", {
        target_owner_id: selectedOwnerId,
      });
      if (rpcError) throw rpcError;
      if (
        !mountedRef.current
        || requestId !== snapshotRequestRef.current
        || currentAccountIdRef.current !== accountId
      ) return;

      const snapshot = data as { cases?: unknown[]; protocols?: unknown[] } | null;
      if (!snapshot || !Array.isArray(snapshot.cases) || !Array.isArray(snapshot.protocols)) {
        setError({ accountId, ownerId: selectedOwnerId, key: "work-malformed" });
        return;
      }

      const result = buildComplianceWorkQueueResult(snapshot.cases, snapshot.protocols);
      setRows(result.rows);
      if (result.rejectedCaseCount > 0 || result.rejectedProtocolCount > 0) {
        setError({ accountId, ownerId: selectedOwnerId, key: "work-malformed" });
      }
      setLoadedTarget({ accountId, ownerId: selectedOwnerId });
    } catch {
      if (
        !mountedRef.current
        || requestId !== snapshotRequestRef.current
        || currentAccountIdRef.current !== accountId
      ) return;
      setRows([]);
      setLoadedTarget(null);
      setError({ accountId, ownerId: selectedOwnerId, key: "work-error" });
    }
  }, [supabase, targetOwnerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let refreshTimer: number | undefined;
    const scheduleNextCalendarDay = () => {
      refreshTimer = window.setTimeout(() => {
        void load();
        scheduleNextCalendarDay();
      }, getMillisecondsUntilNextSwissCalendarDay());
    };
    scheduleNextCalendarDay();
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [load]);

  const isCurrentMutation = (accountId: string, requestId: number) =>
    mountedRef.current
    && currentAccountIdRef.current === accountId
    && mutationRequestRef.current === requestId;

  const grantAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const accountId = currentAccountIdRef.current;
    const email = visibleEmail.trim();
    if (!accountId || !email || mutationPendingRef.current) return;

    mutationPendingRef.current = true;
    const requestId = ++mutationRequestRef.current;
    setPendingMutation({ accountId, kind: "grant" });
    setFeedback(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("grant_compliance_queue_access", {
        target_collaborator_email: email,
      });
      if (rpcError) throw rpcError;
      if (!isCurrentMutation(accountId, requestId)) return;
      const confirmed = parseOwnedComplianceQueueGrants(data);
      if (confirmed.length !== 1) throw new Error("malformed grant response");
      ownedGrantsRevisionRef.current += 1;
      setOwnedGrants((current) => [...current.filter((item) => item.collaboratorId !== confirmed[0].collaboratorId), confirmed[0]]);
      setAccessOwnerId(accountId);
      setEmailForm({ accountId, value: "" });
      setFeedback({ accountId, key: "work-sharing-grant-success" });
    } catch {
      if (isCurrentMutation(accountId, requestId)) setFeedback({ accountId, key: "work-sharing-grant-error" });
    } finally {
      if (isCurrentMutation(accountId, requestId)) {
        mutationPendingRef.current = false;
        setPendingMutation(null);
      }
    }
  };

  const revokeAccess = async (grant: ComplianceQueueOwnedGrant) => {
    const accountId = currentAccountIdRef.current;
    if (!accountId || mutationPendingRef.current) return;

    mutationPendingRef.current = true;
    const requestId = ++mutationRequestRef.current;
    setPendingMutation({ accountId, kind: "revoke", id: grant.collaboratorId });
    setFeedback(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("revoke_compliance_queue_access", {
        target_collaborator_id: grant.collaboratorId,
      });
      if (rpcError || data !== true) throw rpcError ?? new Error("unconfirmed revoke");
      if (!isCurrentMutation(accountId, requestId)) return;
      ownedGrantsRevisionRef.current += 1;
      setOwnedGrants((current) => current.filter((item) => item.membershipId !== grant.membershipId));
      setFeedback({ accountId, key: "work-sharing-revoke-success" });
    } catch {
      if (isCurrentMutation(accountId, requestId)) setFeedback({ accountId, key: "work-sharing-grant-error" });
    } finally {
      if (isCurrentMutation(accountId, requestId)) {
        mutationPendingRef.current = false;
        setPendingMutation(null);
      }
    }
  };

  const hasLoadedCurrentTarget = loadedTarget?.accountId === ownerId && loadedTarget.ownerId === targetOwnerId;
  const visibleRows = hasLoadedCurrentTarget ? rows : [];
  const visibleError = error?.accountId === ownerId && error.ownerId === targetOwnerId ? error.key : null;
  const isLoading = ownerId !== null && !hasLoadedCurrentTarget && visibleError === null;
  const controlsDisabled = visiblePending !== null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
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

      {ownerId && (
        <section aria-labelledby="work-sharing-title" className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h2 id="work-sharing-title" className="text-lg font-medium text-cream">{t("work-sharing-title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("work-sharing-description")}</p>

          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="work-owner-select" className="block text-sm font-medium text-cream">{t("work-owner-selector")}</label>
              <select
                id="work-owner-select"
                value={targetOwnerId ?? ownerId}
                disabled={controlsDisabled}
                onChange={(event) => setRequestedOwner({ accountId: ownerId, ownerId: event.target.value })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-midnight px-3 py-2 text-sm text-cream disabled:opacity-50"
              >
                <option value={ownerId}>{t("work-sharing-own-queue")}</option>
                {visibleSharedOwners.map((sharedOwner) => (
                  <option key={sharedOwner.ownerId} value={sharedOwner.ownerId}>
                    {buildSharedOwnerLabel(sharedOwner, t("work-sharing-owner-fallback"))}
                  </option>
                ))}
              </select>
              {isSharedView && <p role="status" className="mt-2 text-sm text-accent">{t("work-shared-read-only")}</p>}
            </div>

            <form onSubmit={grantAccess} aria-label={t("work-sharing-form")}>
              <label htmlFor="work-collaborator-email" className="block text-sm font-medium text-cream">{t("work-sharing-email")}</label>
              <div className="mt-2 flex gap-2">
                <input
                  id="work-collaborator-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={visibleEmail}
                  disabled={controlsDisabled}
                  onChange={(event) => setEmailForm({ accountId: ownerId, value: event.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-midnight px-3 py-2 text-sm text-cream disabled:opacity-50"
                />
                <button type="submit" disabled={controlsDisabled || visibleEmail.trim() === ""} className="rounded-lg border border-accent/20 px-3 py-2 text-sm font-medium text-accent disabled:opacity-50">
                  {visiblePending?.kind === "grant" ? t("work-sharing-grant-pending") : t("work-sharing-grant")}
                </button>
              </div>
            </form>
          </div>

          {accessErrorOwnerId === ownerId && (
            <div role="alert" className="mt-4 text-sm text-red-200">
              {t("work-sharing-list-error")}{" "}
              <button type="button" disabled={controlsDisabled} onClick={() => void loadAccess()} className="underline disabled:opacity-50">{t("work-sharing-retry")}</button>
            </div>
          )}
          {visibleFeedback && <p role={visibleFeedback === "work-sharing-grant-error" ? "alert" : "status"} aria-label={t("work-sharing-feedback")} className="mt-4 text-sm text-muted">{t(visibleFeedback)}</p>}

          {visibleOwnedGrants.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-medium text-cream">{t("work-sharing-active-grants")}</h3>
              <ul className="mt-2 space-y-2">
                {visibleOwnedGrants.map((grant) => (
                  <li key={grant.membershipId} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-sm text-muted">
                    <span>{grant.collaboratorEmail}</span>
                    <button
                      type="button"
                      disabled={controlsDisabled}
                      aria-label={`${t("work-sharing-revoke")} ${grant.collaboratorEmail}`}
                      onClick={() => void revokeAccess(grant)}
                      className="rounded-md border border-red-300/20 px-3 py-1.5 text-red-200 disabled:opacity-50"
                    >
                      {visiblePending?.kind === "revoke" && visiblePending.id === grant.collaboratorId
                        ? t("work-sharing-revoke-pending")
                        : t("work-sharing-revoke")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {isLoading && (
        <div role="status" aria-live="polite" className="mt-8 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("work-loading")}
        </div>
      )}

      {!isLoading && visibleError && (
        <div role="alert" className="mt-8 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm text-red-200">
          <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{t(visibleError)}</div>
          <button type="button" onClick={() => void load()} className="mt-3 rounded-lg border border-red-300/20 px-3 py-2 font-medium">
            {t("work-retry")}
          </button>
        </div>
      )}

      {!isLoading && !visibleError && (ownerId === null || hasLoadedCurrentTarget) && visibleRows.length === 0 && (
        <section className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
          <h2 className="text-lg font-medium text-cream">{t("work-empty-title")}</h2>
          <p className="mt-2 text-sm text-muted">{t("work-empty-body")}</p>
        </section>
      )}

      {!isLoading && visibleError !== "work-error" && visibleRows.length > 0 && (
        <ol className="mt-8 space-y-4">
          {visibleRows.map((row) => (
            <li key={row.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-accent">{t(priorityLabelKey[row.priority])}</div>
                  <h2 className="mt-1 text-lg font-semibold text-cream">{row.projectName}</h2>
                  <p className="mt-1 text-xs text-muted">{row.canton} · {row.id} · {t(statusLabelKey[row.timeline.status])}</p>
                </div>
                {!isSharedView && (
                  <Link href={row.casesHref} className="rounded-lg border border-accent/20 bg-accent/[0.08] px-3 py-2 text-sm font-medium text-accent">
                    {t("work-open-case")}
                  </Link>
                )}
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
    </div>
  );
}
