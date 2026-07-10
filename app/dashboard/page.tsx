"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, AlertTriangle, FileText, Loader2, Download, Camera, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { pdf } from '@react-pdf/renderer';
import { AuditReportPDF } from "@/components/dashboard/AuditReportPDF";
import SignaturePad from 'signature_pad';
import { useLanguage } from "@/context/LanguageContext";
import type { TranslationKey } from "@/locales";
import { buildComplianceRecord } from "@/lib/compliance-record";
import { getEffectiveSelectedCaseId, hasStaleLinkedCase as isStaleLinkedCase } from "@/lib/dashboard-linked-case";
import { buildProtocolDefectDescription, buildWizardDraft, getProtocolFinalizeReadiness, type WizardDraft } from "@/lib/dashboard-protocol";
import { buildCaseVaultHref } from "@/lib/vault";
import { useAuth } from "@/context/AuthContext";
import { getSupabase } from "@/lib/supabase";
import type { Case } from "@/lib/database.types";
import { toComplianceCaseViewModel, type CaseDeadlineStatus, type ComplianceCaseViewModel, type FollowUpChecklistState } from "@/lib/case-timeline";

const PROJECT_DRAFT_STORAGE_KEY = "baucompliance:wizard-project-draft";

const clearPersistedWizardDraft = () => {
  window.localStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY);
};

const steps = [1, 2, 3];
const INPUT_CLASS = "w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream placeholder-muted/40 focus:border-accent/40 outline-none transition-colors duration-200";

const linkedCaseStatusLabelKey: Record<CaseDeadlineStatus, TranslationKey> = {
  ok: "cases-status-on-track",
  warning: "cases-status-attention",
  urgent: "cases-status-urgent",
  expired: "cases-status-expired",
  "immediate-notice": "cases-status-immediate-notice",
};

const linkedCaseNextActionKey: Record<CaseDeadlineStatus, TranslationKey> = {
  ok: "cases-next-action-ok",
  warning: "cases-next-action-warning",
  urgent: "cases-next-action-urgent",
  expired: "cases-next-action-expired",
  "immediate-notice": "cases-next-action-immediate-notice",
};

function getLinkedCaseCountdownLabel(
  context: Pick<ComplianceCaseViewModel, "regime" | "daysToDeadline">,
  t: (key: TranslationKey) => string
): string {
  if (context.regime === "old" || context.daysToDeadline === null) {
    return t("cases-countdown-notify-immediately");
  }

  const days = context.daysToDeadline;
  if (days < 0) {
    return days === -1
      ? t("cases-countdown-one-day-overdue")
      : `${Math.abs(days)} ${t("cases-countdown-days-overdue-suffix")}`;
  }
  if (days === 0) return t("cases-countdown-due-today");
  if (days === 1) return t("cases-countdown-one-day-left");
  return `${days} ${t("cases-countdown-days-left-suffix")}`;
}

export default function Dashboard() {
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState<TranslationKey | null>(null);
  const [defectDescription, setDefectDescription] = useState("");
  const [noDefectsConfirmed, setNoDefectsConfirmed] = useState(false);
  const sigCanvas = useRef<HTMLCanvasElement>(null);
  const finalizeInFlightRef = useRef(false);
  const latestDownloadRequestIdRef = useRef(0);
  const downloadFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextDraftPersistRef = useRef(false);
  const { t } = useLanguage();
  const { user } = useAuth();
  const supabase = useMemo(() => getSupabase(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sigPad, setSigPad] = useState<SignaturePad | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const [userCases, setUserCases] = useState<Case[]>([]);
  const [userCasesLoadedSuccessfully, setUserCasesLoadedSuccessfully] = useState(false);
  const [linkedCaseLoading, setLinkedCaseLoading] = useState(false);
  const [linkedCaseLoadError, setLinkedCaseLoadError] = useState<TranslationKey | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const latestUserCasesRequestIdRef = useRef(0);
  const hasResolvedUserCasesRequestRef = useRef(false);
  const lastSuccessfulUserCasesUserIdRef = useRef<string | null>(null);
  const [projectData, setProjectData] = useState({
    name: "",
    contractor: "",
    client: ""
  });
  const requestedCaseId = searchParams.get("case")?.trim() || null;
  const [pendingRequestedCaseId, setPendingRequestedCaseId] = useState<string | null>(requestedCaseId);
  const [missingRequestedCaseId, setMissingRequestedCaseId] = useState<string | null>(null);
  const selectedCase = useMemo(
    () => userCases.find((candidate) => candidate.id === selectedCaseId) ?? null,
    [userCases, selectedCaseId]
  );
  const hasStaleLinkedCase = isStaleLinkedCase(
    selectedCaseId,
    userCases,
    userCasesLoadedSuccessfully
  );
  const shouldPreserveCachedSelectedCaseDuringRefresh =
    linkedCaseLoading &&
    user?.id != null &&
    lastSuccessfulUserCasesUserIdRef.current === user.id;
  const effectiveSelectedCaseId =
    !hasResolvedUserCasesRequestRef.current && !linkedCaseLoadError
      ? getEffectiveSelectedCaseId(
          selectedCaseId,
          userCases,
          userCasesLoadedSuccessfully
        )
      : linkedCaseLoadError
        ? null
        : userCasesLoadedSuccessfully
          ? getEffectiveSelectedCaseId(selectedCaseId, userCases, true)
          : shouldPreserveCachedSelectedCaseDuringRefresh
            ? getEffectiveSelectedCaseId(selectedCaseId, userCases, true)
            : null;
  const effectiveSelectedCase = useMemo(
    () => userCases.find((candidate) => candidate.id === effectiveSelectedCaseId) ?? null,
    [effectiveSelectedCaseId, userCases]
  );
  const canProceedStep1 =
    projectData.name.trim().length > 0 &&
    projectData.contractor.trim().length > 0 &&
    projectData.client.trim().length > 0;
  const finalizeReadiness = getProtocolFinalizeReadiness(
    defectDescription,
    noDefectsConfirmed,
    hasSignature
  );

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem(PROJECT_DRAFT_STORAGE_KEY);
      if (!rawDraft) {
        setDraftHydrated(true);
        return;
      }

      const parsedDraft = JSON.parse(rawDraft) as WizardDraft;
      setProjectData((current) => ({
        ...current,
        name: parsedDraft.name ?? "",
        contractor: parsedDraft.contractor ?? "",
        client: parsedDraft.client ?? "",
      }));
      setDefectDescription(parsedDraft.defectDescription ?? "");
      setNoDefectsConfirmed(Boolean(parsedDraft.noDefectsConfirmed));
      setSelectedCaseId(parsedDraft.selectedCaseId ?? null);
      setDraftUpdatedAt(parsedDraft.updatedAt ?? null);
    } catch (error) {
      console.warn("Unable to restore project draft", error);
    } finally {
      setDraftHydrated(true);
    }
  }, []);

  useEffect(() => {
    setPendingRequestedCaseId(requestedCaseId);
    if (requestedCaseId) {
      setMissingRequestedCaseId(null);
      setSelectedCaseId(null);
    }
  }, [requestedCaseId]);

  useEffect(() => {
    if (!pendingRequestedCaseId || !userCasesLoadedSuccessfully) {
      return;
    }

    const requestedCase = userCases.find((candidate) => candidate.id === pendingRequestedCaseId);
    if (requestedCase) {
      setMissingRequestedCaseId(null);
      setSelectedCaseId(requestedCase.id);
      setProjectData((current) => ({
        ...current,
        name: requestedCase.project_name,
      }));
    } else {
      setMissingRequestedCaseId(pendingRequestedCaseId);
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("case");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });

    setPendingRequestedCaseId(null);
  }, [pathname, pendingRequestedCaseId, router, searchParams, userCases, userCasesLoadedSuccessfully]);

  useEffect(() => {
    if (!draftHydrated) return;

    if (skipNextDraftPersistRef.current) {
      skipNextDraftPersistRef.current = false;
      clearPersistedWizardDraft();
      return;
    }

    const updatedAt = new Date().toISOString();
    setDraftUpdatedAt(updatedAt);
    window.localStorage.setItem(
      PROJECT_DRAFT_STORAGE_KEY,
      JSON.stringify(
        buildWizardDraft({
          ...projectData,
          defectDescription,
          noDefectsConfirmed,
          selectedCaseId,
          updatedAt,
        })
      )
    );
  }, [draftHydrated, projectData, defectDescription, noDefectsConfirmed, selectedCaseId]);

  const hasDraftContent =
    projectData.name.trim().length > 0 ||
    projectData.contractor.trim().length > 0 ||
    projectData.client.trim().length > 0 ||
    defectDescription.trim().length > 0 ||
    noDefectsConfirmed ||
    Boolean(selectedCaseId);

  const clearDraft = () => {
    skipNextDraftPersistRef.current = true;
    setProjectData({ name: "", contractor: "", client: "" });
    setDefectDescription("");
    setNoDefectsConfirmed(false);
    setSelectedCaseId(null);
    setDraftUpdatedAt(null);
    clearPersistedWizardDraft();
  };

  const refreshUserCases = useCallback(() => {
    const requestId = ++latestUserCasesRequestIdRef.current;

    if (!user) {
      lastSuccessfulUserCasesUserIdRef.current = null;
      setUserCases([]);
      setUserCasesLoadedSuccessfully(false);
      setLinkedCaseLoading(false);
      setLinkedCaseLoadError(null);
      return () => undefined;
    }

    let cancelled = false;
    setUserCasesLoadedSuccessfully(false);
    setLinkedCaseLoading(true);
    setLinkedCaseLoadError(null);

    (async () => {
      try {
        const { data, error } = await supabase
          .from("cases")
          .select("*")
          .eq("user_id", user.id)
          .order("project_name", { ascending: true });

        if (cancelled || requestId !== latestUserCasesRequestIdRef.current) return;
        if (error) {
          console.warn("Unable to load linked cases for dashboard wizard", error);
          hasResolvedUserCasesRequestRef.current = true;
          setUserCases([]);
          setLinkedCaseLoading(false);
          setLinkedCaseLoadError("dashboard-linked-case-load-error");
          return;
        }

        hasResolvedUserCasesRequestRef.current = true;
        lastSuccessfulUserCasesUserIdRef.current = user.id;
        setUserCases((data ?? []) as Case[]);
        setUserCasesLoadedSuccessfully(true);
        setLinkedCaseLoading(false);
      } catch (error) {
        if (cancelled || requestId !== latestUserCasesRequestIdRef.current) return;
        console.warn("Unable to load linked cases for dashboard wizard", error);
        hasResolvedUserCasesRequestRef.current = true;
        setUserCases([]);
        setLinkedCaseLoading(false);
        setLinkedCaseLoadError("dashboard-linked-case-load-error");
      }
    })();

    return () => { cancelled = true; };
  }, [user, supabase]);

  // Fetch user's cases for the case selector
  useEffect(() => refreshUserCases(), [refreshUserCases]);

  const complianceRecord = useMemo(
    () =>
      buildComplianceRecord(
        {
          projectName: projectData.name,
          contractor: projectData.contractor,
          client: projectData.client,
          inspectionDate: new Date(),
          caseId: effectiveSelectedCaseId,
        },
        step,
        Boolean(sigPad && !sigPad.isEmpty())
      ),
    [projectData, step, sigPad, effectiveSelectedCaseId]
  );

  const selectedCaseContext = useMemo(() => {
    const caseForContext = selectedCase ?? effectiveSelectedCase;
    if (!caseForContext) return null;

    try {
      return toComplianceCaseViewModel({
        id: caseForContext.id,
        projectName: caseForContext.project_name,
        canton: caseForContext.canton,
        contractDate: new Date(caseForContext.contract_date),
        discoveryDate: new Date(caseForContext.discovery_date),
      });
    } catch {
      return null;
    }
  }, [effectiveSelectedCase, selectedCase]);
  const hasPendingLinkedCaseContext = Boolean(effectiveSelectedCaseId && !selectedCaseContext && linkedCaseLoading && !linkedCaseLoadError);
  const finalReviewCaseSummary = selectedCaseContext
    ? selectedCaseContext.regime === "old"
      ? `${selectedCaseContext.projectName} · ${t(linkedCaseStatusLabelKey[selectedCaseContext.status])} · ${t("dashboard-linked-case-immediate-notice")}`
      : `${selectedCaseContext.projectName} · ${t(linkedCaseStatusLabelKey[selectedCaseContext.status])} · ${t("dashboard-linked-case-deadline-date")}: ${selectedCaseContext.noticeDeadlineLabel}`
    : hasPendingLinkedCaseContext
      ? t("dashboard-final-review-linked-case-pending")
      : t("dashboard-final-review-standalone");
  const finalReviewDefectSummary = defectDescription.trim()
    ? t("dashboard-final-review-defects-recorded")
    : noDefectsConfirmed
      ? t("dashboard-final-review-no-defects")
      : t("dashboard-final-review-defects-missing");
  const finalReviewSignatureSummary = hasSignature
    ? t("dashboard-final-review-signature-ready")
    : t("dashboard-final-review-signature-missing");

  useEffect(() => {
    if (step === 2 && sigCanvas.current) {
      const pad = new SignaturePad(sigCanvas.current);
      const handleStrokeEnd = () => setHasSignature(!pad.isEmpty());
      pad.addEventListener("endStroke", handleStrokeEnd);
      setSigPad(pad);

      const resizeCanvas = () => {
        const canvas = sigCanvas.current;
        if (canvas) {
          const ratio = Math.max(window.devicePixelRatio || 1, 1);
          canvas.width = canvas.offsetWidth * ratio;
          canvas.height = canvas.offsetHeight * ratio;
          canvas.getContext("2d")?.scale(ratio, ratio);
          pad.clear();
          setHasSignature(false);
        }
      };

      window.addEventListener("resize", resizeCanvas);
      resizeCanvas();

      return () => {
        window.removeEventListener("resize", resizeCanvas);
        pad.removeEventListener("endStroke", handleStrokeEnd);
        pad.off();
        setSigPad(null);
      };
    }
  }, [step]);

  useEffect(() => {
    if (!sigPad || step !== 2) return;

    if (isGenerating) {
      sigPad.off();
      return;
    }

    sigPad.on();
  }, [isGenerating, sigPad, step]);

  useEffect(() => {
    return () => {
      if (downloadFeedbackTimeoutRef.current) {
        clearTimeout(downloadFeedbackTimeoutRef.current);
      }
    };
  }, []);

  const clearDownloadFeedbackTimer = () => {
    if (downloadFeedbackTimeoutRef.current) {
      clearTimeout(downloadFeedbackTimeoutRef.current);
      downloadFeedbackTimeoutRef.current = null;
    }
  };

  const showTemporaryDownloadFeedback = (feedback: TranslationKey, requestId: number) => {
    clearDownloadFeedbackTimer();
    setDownloadFeedback(feedback);
    downloadFeedbackTimeoutRef.current = setTimeout(() => {
      if (latestDownloadRequestIdRef.current === requestId) {
        setDownloadFeedback(null);
      }
      downloadFeedbackTimeoutRef.current = null;
    }, 2000);
  };

  const handleGenerateProtocol = async () => {
    if (finalizeInFlightRef.current) {
      return;
    }

    if (!finalizeReadiness.hasDefectInput) {
      setSubmissionError(t("dashboard-defect-required"));
      return;
    }

    if (!finalizeReadiness.hasSignature) {
      alert(t("dashboard-signature-required"));
      return;
    }

    finalizeInFlightRef.current = true;
    setSubmissionError(null);
    setIsGenerating(true);

    try {
      // Save protocol to Supabase
      if (user) {
        const signatureData = sigPad ? sigPad.toDataURL() : null;
        const protocolDefectDescription = buildProtocolDefectDescription(
          defectDescription,
          noDefectsConfirmed
        );
        const { error: protocolError } = await supabase.from("protocols").insert({
          user_id: user.id,
          case_id: effectiveSelectedCaseId,
          project_name: projectData.name,
          contractor: projectData.contractor,
          client: projectData.client,
          defect_description: protocolDefectDescription,
          signature_data: signatureData,
          status: "finalized",
        });

        if (protocolError) throw protocolError;

        // Auto-mark "defect documented" on the linked case.
        // This is a best-effort follow-up; do not fail finalization after the
        // protocol row has already been written.
        if (effectiveSelectedCaseId) {
          try {
            const { data: caseData, error: caseLoadError } = await supabase
              .from("cases")
              .select("checklist")
              .eq("id", effectiveSelectedCaseId)
              .single();

            if (caseLoadError) throw caseLoadError;

            const checklist = (caseData?.checklist ?? null) as Partial<FollowUpChecklistState> | null;
            if (!checklist?.defectDocumented) {
              const { error: caseUpdateError } = await supabase
                .from("cases")
                .update({
                  checklist: { ...(checklist ?? {}), defectDocumented: true },
                  updated_at: new Date().toISOString(),
                })
                .eq("id", effectiveSelectedCaseId);

              if (caseUpdateError) throw caseUpdateError;
            }
          } catch (caseSyncError) {
            console.warn("Protocol finalized but linked case checklist sync failed", caseSyncError);
          }
        }
      }

      clearPersistedWizardDraft();
      setDraftUpdatedAt(null);
      setStep(3);
    } catch (error) {
      console.error("Protocol finalization failed", error);
      setSubmissionError(t("dashboard-finalize-error"));
    } finally {
      finalizeInFlightRef.current = false;
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    const requestId = latestDownloadRequestIdRef.current + 1;
    latestDownloadRequestIdRef.current = requestId;
    clearDownloadFeedbackTimer();
    setDownloadFeedback(null);
    setIsGenerating(true);
    try {
      const blob = await pdf(
        <AuditReportPDF
          fileName={projectData.name || "Project"}
          date={new Date().toLocaleDateString('de-CH')}
          caseId={complianceRecord.caseId}
          contractor={projectData.contractor}
          client={projectData.client}
        />
      ).toBlob();

      if (latestDownloadRequestIdRef.current !== requestId) {
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Handover-Protocol-${projectData.name}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showTemporaryDownloadFeedback("dashboard-download-success", requestId);
    } catch (error) {
      if (latestDownloadRequestIdRef.current !== requestId) {
        return;
      }
      console.error("PDF Gen failed", error);
      showTemporaryDownloadFeedback("dashboard-download-failed", requestId);
    } finally {
      if (latestDownloadRequestIdRef.current === requestId) {
        setIsGenerating(false);
      }
    }
  }

  const startNewProtocol = () => {
    latestDownloadRequestIdRef.current += 1;
    clearDownloadFeedbackTimer();
    setDownloadFeedback(null);
    setIsGenerating(false);
    clearDraft();
    setStep(1);
  };

  return (
    <div>
      {/* Header with section marker + step progress */}
      <header className="mb-8">
        <div className="section-marker mb-4">{t("step")} {step}/3</div>
        <h1 className="text-2xl font-[family-name:var(--font-display)] italic text-cream mb-3">
          {t("wizard-title")}
        </h1>
        <p className="text-muted text-sm mb-5">{t("wizard-subtitle")}</p>

        {/* Step progress track */}
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold transition-all duration-300 ${
                  s < step
                    ? "bg-accent/20 text-accent border border-accent/30"
                    : s === step
                    ? "bg-accent text-white shadow-lg shadow-accent/20"
                    : "bg-white/[0.03] text-muted/40 border border-white/[0.06]"
                }`}
              >
                {s < step ? <CheckCircle className="w-3.5 h-3.5" /> : s}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-12 h-[2px] rounded-full transition-all duration-500 ${
                  s < step ? "bg-accent/40" : "bg-white/[0.04]"
                }`} />
              )}
            </div>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">

          {/* Step 1: Project Details Form */}
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="p-7 rounded-2xl bg-white/[0.02] border border-white/[0.05]"
            >
              <h3 className="text-[15px] font-semibold text-cream mb-5 flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent" /> {t("step-1")}
              </h3>
              <div className="space-y-4">
                {hasDraftContent && (
                  <div className="rounded-lg border border-accent/20 bg-accent/[0.06] px-3 py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.08em] text-accent font-semibold">{t("dashboard-draft-active")}</div>
                      <div className="text-[11px] text-muted">
                        {t("dashboard-draft-last-saved")} {draftUpdatedAt ? new Date(draftUpdatedAt).toLocaleString() : t("dashboard-draft-just-now")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearDraft}
                      className="text-[11px] text-muted hover:text-cream transition-colors duration-200"
                    >
                      {t("dashboard-draft-discard")}
                    </button>
                  </div>
                )}

                {linkedCaseLoadError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-400/30 bg-red-500/[0.08] px-3 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="text-[11px] text-red-100/90">{t(linkedCaseLoadError)}</div>
                    <button
                      type="button"
                      onClick={refreshUserCases}
                      disabled={linkedCaseLoading}
                      className="text-[11px] text-red-100 hover:text-cream transition-colors duration-200"
                    >
                      {t("dashboard-linked-case-retry")}
                    </button>
                  </div>
                )}

                {userCases.length > 0 && (
                  <div>
                    <label htmlFor="linked-case-selector" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("wizard-case-selector")}</label>
                    <select
                      id="linked-case-selector"
                      value={selectedCaseId ?? ""}
                      onChange={(e) => {
                        const caseId = e.target.value || null;
                        setMissingRequestedCaseId(null);
                        setSelectedCaseId(caseId);
                        if (caseId) {
                          const c = userCases.find((uc) => uc.id === caseId);
                          if (c) setProjectData((prev) => ({ ...prev, name: c.project_name }));
                        }
                      }}
                      className={INPUT_CLASS}
                    >
                      <option value="">{t("wizard-no-case")}</option>
                      {userCases.map((c) => (
                        <option key={c.id} value={c.id} className="bg-black text-cream">
                          {c.project_name} ({c.canton})
                        </option>
                      ))}
                    </select>

                    {selectedCaseContext && (
                      <div className="mt-2 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-300">
                            {t("dashboard-linked-case-context")}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border ${
                              selectedCaseContext.status === "expired"
                                ? "text-rose-300 border-rose-300/30 bg-rose-500/10"
                                : selectedCaseContext.status === "urgent" || selectedCaseContext.status === "immediate-notice"
                                ? "text-amber-200 border-amber-200/30 bg-amber-500/10"
                                : selectedCaseContext.status === "warning"
                                ? "text-yellow-200 border-yellow-200/30 bg-yellow-500/10"
                                : "text-emerald-200 border-emerald-200/30 bg-emerald-500/10"
                            }`}
                          >
                            {t(linkedCaseStatusLabelKey[selectedCaseContext.status])}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-blue-200/80">
                          {selectedCaseContext.regime === "old"
                            ? t("dashboard-linked-case-immediate-notice")
                            : `${t("dashboard-linked-case-deadline-date")}: ${selectedCaseContext.noticeDeadlineLabel}`}
                        </div>
                        <div className="mt-2 rounded-md border border-blue-300/10 bg-black/10 px-2.5 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-200/70">
                            {t("cases-next-legal-action")}
                          </div>
                          <div className="mt-1 text-[12px] text-blue-100 leading-relaxed">
                            {t(linkedCaseNextActionKey[selectedCaseContext.status])}
                          </div>
                          <div className="mt-1 text-[11px] text-blue-200/70">
                            {getLinkedCaseCountdownLabel(selectedCaseContext, t)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {(hasStaleLinkedCase || missingRequestedCaseId) && (
                  <div className="rounded-lg border border-amber-400/30 bg-amber-500/[0.08] px-3 py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.08em] text-amber-200 font-semibold">{t("dashboard-linked-case-missing-title")}</div>
                      <div className="text-[11px] text-amber-100/80">{t("dashboard-linked-case-missing-desc")}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMissingRequestedCaseId(null);
                        setSelectedCaseId(null);
                      }}
                      className="text-[11px] text-amber-100 hover:text-cream transition-colors duration-200"
                    >
                      {t("dashboard-linked-case-unlink")}
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="dashboard-project-name" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("label-project")}</label>
                    <input
                      id="dashboard-project-name"
                      type="text"
                      placeholder={t("dashboard-project-placeholder")}
                      className={INPUT_CLASS}
                      value={projectData.name}
                      onChange={(e) => setProjectData({...projectData, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("label-date")}</label>
                    <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-muted">
                      <Calendar className="w-4 h-4" />
                      <span className="text-sm">{new Date().toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="dashboard-project-contractor" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("label-contractor")}</label>
                  <input
                    id="dashboard-project-contractor"
                    type="text"
                    placeholder={t("dashboard-contractor-placeholder")}
                    className={INPUT_CLASS}
                    value={projectData.contractor}
                    onChange={(e) => setProjectData({...projectData, contractor: e.target.value})}
                  />
                </div>

                <div>
                  <label htmlFor="dashboard-project-client" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("label-client")}</label>
                  <input
                    id="dashboard-project-client"
                    type="text"
                    placeholder={t("dashboard-client-placeholder")}
                    className={INPUT_CLASS}
                    value={projectData.client}
                    onChange={(e) => setProjectData({...projectData, client: e.target.value})}
                  />
                </div>

                <div className="pt-3">
                  <button
                    onClick={() => setStep(2)}
                    disabled={!canProceedStep1}
                    className="w-full py-3.5 bg-cream text-background font-semibold rounded-lg hover:bg-white transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-cream"
                  >
                    {t("btn-next")}
                  </button>
                  {!canProceedStep1 && (
                    <p className="mt-2 text-xs text-muted">{t("dashboard-step1-required")}</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 2: Defects & Signatures */}
          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="p-7 rounded-2xl bg-white/[0.02] border border-white/[0.05]"
            >
              <h3 className="text-[15px] font-semibold text-cream mb-5 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500" /> {t("defect-title")}
              </h3>

              <div className="mb-6 p-4 border border-white/[0.06] rounded-xl bg-white/[0.02]">
                <div className="flex justify-between items-center mb-3">
                  <label htmlFor="dashboard-defect-description" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{t("defect-detected")}</label>
                  <Link
                    href={buildCaseVaultHref(projectData.name)}
                    className="text-[11px] bg-accent/[0.08] text-accent px-2.5 py-1 rounded-md font-semibold hover:bg-accent/15 transition-colors duration-200 flex items-center gap-1.5 border border-accent/15"
                  >
                    <Camera className="w-3 h-3" /> {t("btn-photo")}
                  </Link>
                </div>
                <textarea
                  id="dashboard-defect-description"
                  className="w-full bg-transparent text-sm text-cream resize-none outline-none h-20 placeholder-muted/40 disabled:opacity-70"
                  placeholder={t("defect-placeholder")}
                  value={defectDescription}
                  onChange={(e) => {
                    setDefectDescription(e.target.value);
                    if (submissionError) {
                      setSubmissionError(null);
                    }
                  }}
                  disabled={isGenerating}
                />
                <label className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={noDefectsConfirmed}
                    onChange={(e) => {
                      setNoDefectsConfirmed(e.target.checked);
                      if (submissionError) {
                        setSubmissionError(null);
                      }
                    }}
                    disabled={isGenerating}
                    className="h-4 w-4 rounded border-white/20 bg-transparent disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span>{t("dashboard-no-defects-confirmed")}</span>
                </label>
                {!finalizeReadiness.hasDefectInput && (
                  <p className="mt-3 text-xs text-amber-200/80">{t("dashboard-defect-required")}</p>
                )}
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-1.5">
                  <div id="dashboard-signature-label" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{t("label-signature")}</div>
                  <button
                    onClick={() => {
                      sigPad?.clear();
                      setHasSignature(false);
                    }}
                    type="button"
                    disabled={isGenerating}
                    className="text-[11px] text-muted hover:text-cream transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-muted"
                  >
                    {t("btn-clear")}
                  </button>
                </div>
                <div
                  aria-disabled={isGenerating}
                  aria-labelledby="dashboard-signature-label"
                  role="group"
                  className={`border border-white/[0.08] rounded-lg bg-white h-28 relative overflow-hidden touch-none ${
                    isGenerating ? "cursor-not-allowed opacity-70" : "cursor-crosshair"
                  }`}
                >
                  <canvas
                    ref={sigCanvas}
                    className="absolute inset-0 w-full h-full"
                  />
                  <div className="absolute bottom-2 right-3 text-[10px] text-slate-400 pointer-events-none">{t("sign-here")}</div>
                </div>
                {!hasSignature && (
                  <p className="mt-2 text-[11px] text-muted">{t("dashboard-signature-required")}</p>
                )}
              </div>

              <div className="mb-6 rounded-xl border border-accent/20 bg-accent/[0.06] p-4" aria-labelledby="dashboard-final-review-title">
                <div id="dashboard-final-review-title" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">
                  {t("dashboard-final-review-title")}
                </div>
                <p className="mt-1 text-[12px] text-muted leading-relaxed">
                  {t("dashboard-final-review-desc")}
                </p>
                <dl className="mt-3 grid gap-2 text-xs text-cream">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-muted">{t("label-project")}</dt>
                    <dd className="text-right">{projectData.name || t("dashboard-final-review-missing-project")}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-muted">{t("dashboard-final-review-case")}</dt>
                    <dd className="text-right">{finalReviewCaseSummary}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-muted">{t("dashboard-final-review-defects")}</dt>
                    <dd className="text-right">{finalReviewDefectSummary}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-muted">{t("dashboard-final-review-signature")}</dt>
                    <dd className="text-right">{finalReviewSignatureSummary}</dd>
                  </div>
                </dl>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  disabled={isGenerating}
                  className="px-5 py-3 bg-white/[0.03] border border-white/[0.06] text-muted font-semibold rounded-lg hover:text-cream hover:bg-white/[0.05] transition-all duration-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:bg-white/[0.03]"
                >
                  {t("btn-back")}
                </button>
                <button
                  onClick={handleGenerateProtocol}
                  disabled={isGenerating || !finalizeReadiness.canFinalize}
                  className="flex-1 py-3 bg-accent text-white font-semibold rounded-lg hover:bg-accent/90 transition-colors duration-200 flex items-center justify-center gap-2 shadow-lg shadow-accent/10 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {isGenerating ? t("btn-generating") : t("btn-finalize")}
                </button>
              </div>
              {submissionError && (
                <p className="mt-3 text-xs text-rose-300">{submissionError}</p>
              )}
            </motion.div>
          )}

          {/* Step 3: Success / Download */}
          {step === 3 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05] relative overflow-hidden text-center py-14"
            >
              <div className="absolute top-0 left-0 w-[2px] h-full bg-gradient-to-b from-emerald-500 via-emerald-500/30 to-transparent" />
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mx-auto mb-5 text-emerald-500">
                <FileText className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-[family-name:var(--font-display)] italic text-cream mb-2">{t("success-title")}</h2>
              <p className="text-muted text-sm mb-8 max-w-sm mx-auto">
                {t("success-desc")}
              </p>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleDownload}
                  disabled={isGenerating}
                  className="px-6 py-3 bg-cream text-background font-semibold rounded-lg hover:bg-white transition-colors duration-200 flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-cream"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {isGenerating ? t("btn-generating") : t("btn-download")}
                </button>
                <button
                  onClick={startNewProtocol}
                  className="px-8 py-3.5 bg-white/[0.03] border border-white/[0.06] text-cream font-semibold rounded-lg hover:bg-white/[0.05] transition-all duration-300"
                >
                  {t("btn-new")}
                </button>
              </div>
              {downloadFeedback && (
                <p
                  role="status"
                  className={`mt-4 text-xs ${downloadFeedback === "dashboard-download-success" ? "text-emerald-300" : "text-rose-300"}`}
                >
                  {t(downloadFeedback)}
                </p>
              )}
            </motion.div>
          )}

        </div>

        {/* Sidebar Info */}
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
            <h4 className="text-[10px] font-semibold text-muted uppercase tracking-[0.12em] mb-4">{t("context-title")}</h4>
            <div className="bg-blue-500/[0.06] border border-blue-500/15 p-3.5 rounded-xl mb-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[13px] font-semibold text-blue-300 mb-1">{t("context-alert-title")}</div>
                  <p className="text-[11px] text-blue-300/60 leading-relaxed">
                    {t("context-alert-desc")}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2.5 text-[13px] text-muted">
              <div className="flex justify-between">
                <span>{t("context-warranty")}</span>
                <span className="text-cream font-semibold">{t("dashboard-warranty-value")}</span>
              </div>
              <div className="flex justify-between">
                <span>{t("context-standard")}</span>
                <span className="text-cream font-semibold">{t("dashboard-standard-value")}</span>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
            <h4 className="text-[11px] font-semibold text-muted uppercase tracking-[0.12em] mb-3">{t("dashboard-compliance-preview")}</h4>
            <div className="text-xs text-muted mb-4">{t("dashboard-case-id")}</div>
            <div className="font-mono text-xs text-accent break-all mb-5">{complianceRecord.caseId}</div>

            <div className="space-y-2.5 text-sm">
              <ChecklistRow label={t("dashboard-check-project-data")} done={complianceRecord.checklist.projectData} t={t} />
              <ChecklistRow label={t("dashboard-check-defect-log")} done={complianceRecord.checklist.defectLog} t={t} />
              <ChecklistRow label={t("dashboard-check-signature")} done={complianceRecord.checklist.signature} t={t} />
              <ChecklistRow label={t("dashboard-check-export-ready")} done={complianceRecord.checklist.exportReady} t={t} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChecklistRow({ label, done, t }: { label: string; done: boolean; t: (key: TranslationKey) => string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={done ? "text-emerald-400" : "text-muted/50"}>{done ? t("dashboard-status-done") : t("dashboard-status-open")}</span>
    </div>
  );
}
