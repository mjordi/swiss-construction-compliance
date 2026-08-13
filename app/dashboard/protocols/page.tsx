"use client";

import { pdf } from "@react-pdf/renderer";
import { Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuditReportPDF } from "@/components/dashboard/AuditReportPDF";
import PageHeader from "@/components/dashboard/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import type { Protocol } from "@/lib/database.types";
import { buildFinalizedProtocolReportFromRecord } from "@/lib/protocol-report";
import { protocolPdfFilename, selectFinalizedProtocolRecords } from "@/lib/protocol-register";
import { getSupabase } from "@/lib/supabase";
import type { TranslationKey } from "@/locales";

type Feedback = { key: TranslationKey; tone: "success" | "error" };

const PROTOCOL_COLUMNS =
  "id, user_id, case_id, project_name, contractor, client, defect_description, signature_data, status, created_at";
const PROTOCOL_PAGE_SIZE = 1000;

export default function ProtocolRegisterPage() {
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const supabase = useMemo(() => getSupabase(), []);
  const [records, setRecords] = useState<Protocol[]>([]);
  const [recordsOwnerId, setRecordsOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadGeneration, setLoadGeneration] = useState(0);
  const [generatingById, setGeneratingById] = useState<Record<string, boolean>>({});
  const [feedbackById, setFeedbackById] = useState<Record<string, Feedback>>({});
  const mountedRef = useRef(false);
  const latestUserIdRef = useRef(user?.id ?? null);
  const recordsRef = useRef<Protocol[]>([]);
  const loadRequestRef = useRef(0);
  const downloadRequestIdsRef = useRef<Record<string, number>>({});
  const inFlightIdsRef = useRef(new Set<string>());
  const feedbackTimersRef = useRef<Record<string, number>>({});

  latestUserIdRef.current = user?.id ?? null;
  const visibleRecords = user?.id && recordsOwnerId === user.id ? records : [];
  recordsRef.current = visibleRecords;

  useEffect(() => {
    mountedRef.current = true;
    const inFlightIds = inFlightIdsRef.current;
    return () => {
      mountedRef.current = false;
      loadRequestRef.current += 1;
      for (const timer of Object.values(feedbackTimersRef.current)) window.clearTimeout(timer);
      feedbackTimersRef.current = {};
      inFlightIds.clear();
    };
  }, []);

  useEffect(() => {
    const ownerId = user?.id;
    const requestId = ++loadRequestRef.current;
    setRecords([]);
    setRecordsOwnerId(null);
    recordsRef.current = [];
    setLoadError(false);
    setFeedbackById({});
    setGeneratingById({});
    inFlightIdsRef.current.clear();
    for (const timer of Object.values(feedbackTimersRef.current)) window.clearTimeout(timer);
    feedbackTimersRef.current = {};

    if (!ownerId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    void (async () => {
      const loaded: Protocol[] = [];
      for (let page = 0; ; page += 1) {
        const from = page * PROTOCOL_PAGE_SIZE;
        const { data, error } = await supabase
          .from("protocols")
          .select(PROTOCOL_COLUMNS)
          .eq("user_id", ownerId)
          .eq("status", "finalized")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, from + PROTOCOL_PAGE_SIZE - 1) as {
            data: Protocol[] | null;
            error: { message: string } | null;
          };

        if (error) throw error;
        const pageRecords = data ?? [];
        loaded.push(...pageRecords);
        if (pageRecords.length < PROTOCOL_PAGE_SIZE) break;
      }
      return loaded;
    })()
      .then((data) => {
        if (!mountedRef.current || requestId !== loadRequestRef.current || latestUserIdRef.current !== ownerId) return;
        const selected = selectFinalizedProtocolRecords(data);
        recordsRef.current = selected;
        setRecords(selected);
        setRecordsOwnerId(ownerId);
      })
      .catch(() => {
        if (mountedRef.current && requestId === loadRequestRef.current && latestUserIdRef.current === ownerId) {
          setLoadError(true);
        }
      })
      .finally(() => {
        if (mountedRef.current && requestId === loadRequestRef.current && latestUserIdRef.current === ownerId) {
          setLoading(false);
        }
      });
  }, [loadGeneration, supabase, user?.id]);

  const retryLoad = useCallback(() => setLoadGeneration((value) => value + 1), []);

  const download = useCallback(async (record: Protocol) => {
    const ownerId = latestUserIdRef.current;
    if (!ownerId || record.user_id !== ownerId || record.status !== "finalized" || inFlightIdsRef.current.has(record.id)) return;

    inFlightIdsRef.current.add(record.id);
    const requestId = (downloadRequestIdsRef.current[record.id] ?? 0) + 1;
    downloadRequestIdsRef.current[record.id] = requestId;
    const oldTimer = feedbackTimersRef.current[record.id];
    if (oldTimer !== undefined) window.clearTimeout(oldTimer);
    delete feedbackTimersRef.current[record.id];
    setFeedbackById((current) => {
      const next = { ...current };
      delete next[record.id];
      return next;
    });
    setGeneratingById((current) => ({ ...current, [record.id]: true }));

    const isCurrent = () =>
      mountedRef.current
      && latestUserIdRef.current === ownerId
      && downloadRequestIdsRef.current[record.id] === requestId
      && recordsRef.current.some((current) => current.id === record.id && current.user_id === ownerId && current === record);

    const showFeedback = (key: TranslationKey, tone: Feedback["tone"]) => {
      if (!isCurrent()) return;
      setFeedbackById((current) => ({ ...current, [record.id]: { key, tone } }));
      feedbackTimersRef.current[record.id] = window.setTimeout(() => {
        if (!isCurrent()) return;
        setFeedbackById((current) => {
          const next = { ...current };
          delete next[record.id];
          return next;
        });
        delete feedbackTimersRef.current[record.id];
      }, 2000);
    };

    try {
      const { data, error } = await supabase
        .from("protocols")
        .select(PROTOCOL_COLUMNS)
        .eq("id", record.id)
        .eq("user_id", ownerId)
        .eq("status", "finalized")
        .single();
      if (error || !data) throw error ?? new Error("Finalized protocol not found");

      const finalizedProtocol = data as Protocol & { status: "finalized" };
      if (!isCurrent()) return;
      const report = buildFinalizedProtocolReportFromRecord(finalizedProtocol);
      const blob = await pdf(
        <AuditReportPDF
          fileName={finalizedProtocol.project_name}
          caseId={finalizedProtocol.id}
          contractor={finalizedProtocol.contractor}
          client={finalizedProtocol.client}
          report={report}
        />,
      ).toBlob();
      if (!isCurrent()) return;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = protocolPdfFilename(finalizedProtocol.id);
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(url);
      }
      showFeedback("protocols-download-success", "success");
    } catch {
      showFeedback("protocols-download-error", "error");
    } finally {
      inFlightIdsRef.current.delete(record.id);
      if (isCurrent()) {
        setGeneratingById((current) => {
          const next = { ...current };
          delete next[record.id];
          return next;
        });
      }
    }
  }, [supabase]);

  const locale = lang === "de" ? "de-CH" : lang === "fr" ? "fr-CH" : lang === "it" ? "it-CH" : "en-CH";
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Zurich",
  }).format(new Date(value));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <PageHeader marker={t("menu-protocols")} title={t("protocols-title")} subtitle={t("protocols-subtitle")} />

      <div className="mt-8" aria-live="polite">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" />{t("protocols-loading")}</div>
        )}
        {!loading && loadError && (
          <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-5">
            <p className="text-sm text-red-300">{t("protocols-error")}</p>
            <button type="button" onClick={retryLoad} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-cream">
              <RefreshCw className="h-4 w-4" />{t("protocols-retry")}
            </button>
          </div>
        )}
        {!loading && !loadError && visibleRecords.length === 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted/50" />
            <h2 className="mt-3 text-base font-medium text-cream">{t("protocols-empty-title")}</h2>
            <p className="mt-1 text-sm text-muted">{t("protocols-empty-body")}</p>
          </div>
        )}
        {!loading && !loadError && visibleRecords.length > 0 && (
          <div className="space-y-4">
            {visibleRecords.map((record) => {
              const feedback = feedbackById[record.id];
              const generating = Boolean(generatingById[record.id]);
              return (
                <article key={record.id} data-testid="protocol-record" data-protocol-id={record.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <dl className="grid flex-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                      <div><dt className="text-muted">{t("protocols-project")}</dt><dd className="mt-1 font-medium text-cream">{record.project_name}</dd></div>
                      <div><dt className="text-muted">{t("protocols-record-id")}</dt><dd className="mt-1 break-all font-mono text-xs text-cream">{record.id}</dd></div>
                      <div><dt className="text-muted">{t("protocols-contractor")}</dt><dd className="mt-1 text-cream">{record.contractor}</dd></div>
                      <div><dt className="text-muted">{t("protocols-client")}</dt><dd className="mt-1 text-cream">{record.client}</dd></div>
                      <div><dt className="text-muted">{t("protocols-record-date")}</dt><dd className="mt-1 text-cream">{formatDate(record.created_at)}</dd></div>
                      <div><dt className="text-muted">{t("protocols-signature")}</dt><dd className="mt-1 text-cream">{record.signature_data ? t("protocols-signature-captured") : t("protocols-signature-missing")}</dd></div>
                      <div className="sm:col-span-2"><dt className="text-muted">{t("protocols-context")}</dt><dd className="mt-1 text-cream">{record.case_id ? `${t("protocols-context-linked")}: ${record.case_id}` : t("protocols-context-standalone")}</dd></div>
                    </dl>
                    <div className="sm:w-44">
                      <button type="button" onClick={() => void download(record)} disabled={generating} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-[#111827] disabled:opacity-60">
                        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {generating ? t("protocols-downloading") : t("protocols-download")}
                      </button>
                      {feedback && <p className={`mt-2 text-xs ${feedback.tone === "success" ? "text-emerald-300" : "text-red-300"}`}>{t(feedback.key)}</p>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
