"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { CheckCircle, AlertTriangle, FileText, Loader2, Download, Camera, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { pdf } from '@react-pdf/renderer';
import { AuditReportPDF } from "@/components/dashboard/AuditReportPDF";
import SignaturePad from 'signature_pad';
import { useLanguage } from "@/context/LanguageContext";
import type { TranslationKey } from "@/locales";
import { buildComplianceRecord } from "@/lib/compliance-record";
import { useAuth } from "@/context/AuthContext";
import { getSupabase } from "@/lib/supabase";
import type { Case } from "@/lib/database.types";

const PROJECT_DRAFT_STORAGE_KEY = "baucompliance:wizard-project-draft";

type WizardDraft = {
  name?: string;
  contractor?: string;
  client?: string;
  defectDescription?: string;
  selectedCaseId?: string | null;
  updatedAt?: string;
};

const steps = [1, 2, 3];
const INPUT_CLASS = "w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream placeholder-muted/40 focus:border-accent/40 outline-none transition-colors duration-200";

export default function Dashboard() {
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [defectDescription, setDefectDescription] = useState("");
  const [noDefectsConfirmed, setNoDefectsConfirmed] = useState(false);
  const sigCanvas = useRef<HTMLCanvasElement>(null);
  const { t } = useLanguage();
  const { user } = useAuth();
  const supabase = getSupabase();
  const [sigPad, setSigPad] = useState<SignaturePad | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const [userCases, setUserCases] = useState<Case[]>([]);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [projectData, setProjectData] = useState({
    name: "",
    contractor: "",
    client: ""
  });
  const canProceedStep1 =
    projectData.name.trim().length > 0 &&
    projectData.contractor.trim().length > 0 &&
    projectData.client.trim().length > 0;

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
      setSelectedCaseId(parsedDraft.selectedCaseId ?? null);
      setDraftUpdatedAt(parsedDraft.updatedAt ?? null);
    } catch (error) {
      console.warn("Unable to restore project draft", error);
    } finally {
      setDraftHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!draftHydrated) return;
    const updatedAt = new Date().toISOString();
    setDraftUpdatedAt(updatedAt);
    window.localStorage.setItem(
      PROJECT_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...projectData,
        defectDescription,
        selectedCaseId,
        updatedAt,
      } satisfies WizardDraft)
    );
  }, [draftHydrated, projectData, defectDescription, selectedCaseId]);

  const hasDraftContent =
    projectData.name.trim().length > 0 ||
    projectData.contractor.trim().length > 0 ||
    projectData.client.trim().length > 0 ||
    defectDescription.trim().length > 0 ||
    Boolean(selectedCaseId);

  const clearDraft = () => {
    setProjectData({ name: "", contractor: "", client: "" });
    setDefectDescription("");
    setNoDefectsConfirmed(false);
    setSelectedCaseId(null);
    setDraftUpdatedAt(null);
    window.localStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY);
  };

  // Fetch user's cases for the case selector
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("cases")
        .select("*")
        .eq("user_id", user.id)
        .order("project_name", { ascending: true });
      if (!cancelled && data) setUserCases(data as Case[]);
    })();
    return () => { cancelled = true; };
  }, [user, supabase]);

  const complianceRecord = useMemo(
    () =>
      buildComplianceRecord(
        {
          projectName: projectData.name,
          contractor: projectData.contractor,
          client: projectData.client,
          inspectionDate: new Date(),
          caseId: selectedCaseId,
        },
        step,
        Boolean(sigPad && !sigPad.isEmpty())
      ),
    [projectData, step, sigPad, selectedCaseId]
  );

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
      };
    }
  }, [step]);

  const handleGenerateProtocol = async () => {
    if (defectDescription.trim().length === 0 && !noDefectsConfirmed) {
      setSubmissionError(t("dashboard-defect-required"));
      return;
    }

    if (sigPad && sigPad.isEmpty()) {
        alert(t("dashboard-signature-required"));
        return;
    }

    setSubmissionError(null);
    setIsGenerating(true);

    try {
      // Save protocol to Supabase
      if (user) {
        const signatureData = sigPad ? sigPad.toDataURL() : null;
        const { error: protocolError } = await supabase.from("protocols").insert({
          user_id: user.id,
          case_id: selectedCaseId,
          project_name: projectData.name,
          contractor: projectData.contractor,
          client: projectData.client,
          defect_description: defectDescription || null,
          signature_data: signatureData,
          status: "finalized",
        });

        if (protocolError) throw protocolError;

        // Auto-mark "defect documented" on the linked case.
        // This is a best-effort follow-up; do not fail finalization after the
        // protocol row has already been written.
        if (selectedCaseId) {
          try {
            const { data: caseData, error: caseLoadError } = await supabase
              .from("cases")
              .select("checklist")
              .eq("id", selectedCaseId)
              .single();

            if (caseLoadError) throw caseLoadError;

            if (caseData?.checklist) {
              const checklist = caseData.checklist as Record<string, boolean>;
              if (!checklist.defectDocumented) {
                const { error: caseUpdateError } = await supabase
                  .from("cases")
                  .update({
                    checklist: { ...checklist, defectDocumented: true },
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", selectedCaseId);

                if (caseUpdateError) throw caseUpdateError;
              }
            }
          } catch (caseSyncError) {
            console.warn("Protocol finalized but linked case checklist sync failed", caseSyncError);
          }
        }
      }

      setStep(3);
    } catch (error) {
      console.error("Protocol finalization failed", error);
      setSubmissionError(t("dashboard-finalize-error"));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
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

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Handover-Protocol-${projectData.name}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("PDF Gen failed", error);
    } finally {
      setIsGenerating(false);
    }
  }

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

                {userCases.length > 0 && (
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("wizard-case-selector")}</label>
                    <select
                      value={selectedCaseId ?? ""}
                      onChange={(e) => {
                        const caseId = e.target.value || null;
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
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("label-project")}</label>
                    <input
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
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("label-contractor")}</label>
                  <input
                    type="text"
                    placeholder={t("dashboard-contractor-placeholder")}
                    className={INPUT_CLASS}
                    value={projectData.contractor}
                    onChange={(e) => setProjectData({...projectData, contractor: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("label-client")}</label>
                  <input
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
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{t("defect-detected")}</span>
                  <button className="text-[11px] bg-accent/[0.08] text-accent px-2.5 py-1 rounded-md font-semibold hover:bg-accent/15 transition-colors duration-200 flex items-center gap-1.5 border border-accent/15">
                    <Camera className="w-3 h-3" /> {t("btn-photo")}
                  </button>
                </div>
                <textarea
                  className="w-full bg-transparent text-sm text-cream resize-none outline-none h-20 placeholder-muted/40"
                  placeholder={t("defect-placeholder")}
                  value={defectDescription}
                  onChange={(e) => {
                    setDefectDescription(e.target.value);
                    if (submissionError) {
                      setSubmissionError(null);
                    }
                  }}
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
                    className="h-4 w-4 rounded border-white/20 bg-transparent"
                  />
                  <span>{t("dashboard-no-defects-confirmed")}</span>
                </label>
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{t("label-signature")}</label>
                  <button
                    onClick={() => {
                      sigPad?.clear();
                      setHasSignature(false);
                    }}
                    type="button"
                    className="text-[11px] text-muted hover:text-cream transition-colors duration-200"
                  >
                    {t("btn-clear")}
                  </button>
                </div>
                <div className="border border-white/[0.08] rounded-lg bg-white h-28 relative overflow-hidden cursor-crosshair touch-none">
                  <canvas
                    ref={sigCanvas}
                    className="absolute inset-0 w-full h-full"
                  />
                  <div className="absolute bottom-2 right-3 text-[10px] text-slate-400 pointer-events-none">{t("sign-here")}</div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-5 py-3 bg-white/[0.03] border border-white/[0.06] text-muted font-semibold rounded-lg hover:text-cream hover:bg-white/[0.05] transition-all duration-200 text-sm"
                >
                  {t("btn-back")}
                </button>
                <button
                  onClick={handleGenerateProtocol}
                  disabled={isGenerating || !hasSignature}
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
                  className="px-6 py-3 bg-cream text-background font-semibold rounded-lg hover:bg-white transition-colors duration-200 flex items-center gap-2 text-sm"
                >
                  <Download className="w-4 h-4" /> {t("btn-download")}
                </button>
                <button
                  onClick={() => {
                    clearDraft();
                    setStep(1);
                  }}
                  className="px-8 py-3.5 bg-white/[0.03] border border-white/[0.06] text-cream font-semibold rounded-lg hover:bg-white/[0.05] transition-all duration-300"
                >
                  {t("btn-new")}
                </button>
              </div>
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
