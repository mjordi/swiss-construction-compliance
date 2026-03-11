"use client";

import { useState, useRef, useEffect } from "react";
import { CheckCircle, AlertTriangle, FileText, Loader2, Download, PenTool, Camera, User, Calendar } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { pdf } from '@react-pdf/renderer';
import { AuditReportPDF } from "@/components/dashboard/AuditReportPDF";
import SignaturePad from 'signature_pad';
import { useLanguage } from "@/context/LanguageContext";

export default function Dashboard() {
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const sigCanvas = useRef<HTMLCanvasElement>(null);
  const { t } = useLanguage();
  const [sigPad, setSigPad] = useState<SignaturePad | null>(null);
  const [projectData, setProjectData] = useState({
    name: "",
    contractor: "",
    client: ""
  });

  useEffect(() => {
    if (step === 2 && sigCanvas.current) {
        const pad = new SignaturePad(sigCanvas.current);
        setSigPad(pad);
        const resizeCanvas = () => {
            const canvas = sigCanvas.current;
            if (canvas) {
                const ratio =  Math.max(window.devicePixelRatio || 1, 1);
                canvas.width = canvas.offsetWidth * ratio;
                canvas.height = canvas.offsetHeight * ratio;
                canvas.getContext("2d")?.scale(ratio, ratio);
                pad.clear();
            }
        };
        window.addEventListener("resize", resizeCanvas);
        resizeCanvas();
        return () => window.removeEventListener("resize", resizeCanvas);
    }
  }, [step]);

  const handleGenerateProtocol = async () => {
    if (sigPad && sigPad.isEmpty()) {
        alert("Please provide a signature first.");
        return;
    }

    setIsGenerating(true);
    setTimeout(() => {
        setIsGenerating(false);
        setStep(3);
    }, 2500);
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const blob = await pdf(
        <AuditReportPDF
          fileName={projectData.name || "Project"}
          date={new Date().toLocaleDateString('de-CH')}
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
    <div className="max-w-5xl mx-auto">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-[family-name:var(--font-display)] italic text-cream mb-1.5">
            {t("wizard-title")}
          </h1>
          <p className="text-muted text-sm">{t("wizard-subtitle")}</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-muted uppercase tracking-[0.12em] font-semibold mb-1">{t("step")}</div>
          <div className="text-2xl font-[family-name:var(--font-display)] italic text-accent">
            {step} <span className="text-muted/40 text-base">/ 3</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">

          {/* Step 1: Project Details Form */}
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05]"
            >
              <h3 className="text-lg font-semibold text-cream mb-6 flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-accent" /> {t("step-1")}
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-2">{t("label-project")}</label>
                    <input
                      type="text"
                      placeholder="e.g. Residentia West"
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-cream placeholder-muted/40 focus:border-accent/40 outline-none transition-colors duration-300"
                      value={projectData.name}
                      onChange={(e) => setProjectData({...projectData, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-2">{t("label-date")}</label>
                    <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-muted">
                      <Calendar className="w-4 h-4" />
                      <span className="text-sm">{new Date().toLocaleDateString('de-CH')}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-2">{t("label-contractor")}</label>
                  <input
                    type="text"
                    placeholder="Company Name AG"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-cream placeholder-muted/40 focus:border-accent/40 outline-none transition-colors duration-300"
                    value={projectData.contractor}
                    onChange={(e) => setProjectData({...projectData, contractor: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-2">{t("label-client")}</label>
                  <input
                    type="text"
                    placeholder="Client Name"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-cream placeholder-muted/40 focus:border-accent/40 outline-none transition-colors duration-300"
                    value={projectData.client}
                    onChange={(e) => setProjectData({...projectData, client: e.target.value})}
                  />
                </div>

                <div className="pt-4">
                  <button
                    onClick={() => setStep(2)}
                    className="w-full py-3.5 bg-cream text-background font-semibold rounded-lg hover:bg-white transition-colors duration-300"
                  >
                    {t("btn-next")}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 2: Defects & Signatures */}
          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05]"
            >
              <h3 className="text-lg font-semibold text-cream mb-6 flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-yellow-500" /> {t("defect-title")}
              </h3>

              <div className="mb-8 p-5 border border-white/[0.06] rounded-xl bg-white/[0.02]">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{t("defect-detected")}</span>
                  <button className="text-[11px] bg-accent/[0.08] text-accent px-2.5 py-1 rounded-lg font-semibold hover:bg-accent/15 transition-colors duration-300 flex items-center gap-1.5 border border-accent/15">
                    <Camera className="w-3 h-3" /> {t("btn-photo")}
                  </button>
                </div>
                <textarea
                  className="w-full bg-transparent text-sm text-cream resize-none outline-none h-24 placeholder-muted/40"
                  placeholder={t("defect-placeholder")}
                ></textarea>
              </div>

              <div className="mb-8">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-2">{t("label-signature")}</label>
                <div className="border border-white/[0.08] rounded-lg bg-white h-32 relative overflow-hidden cursor-crosshair touch-none">
                  <canvas
                    ref={sigCanvas}
                    className="absolute inset-0 w-full h-full"
                  />
                  <div className="absolute bottom-2 right-3 text-[11px] text-slate-400 pointer-events-none">{t("sign-here")}</div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-3.5 bg-white/[0.03] border border-white/[0.06] text-muted font-semibold rounded-lg hover:text-cream hover:bg-white/[0.05] transition-all duration-300"
                >
                  {t("btn-back")}
                </button>
                <button
                  onClick={handleGenerateProtocol}
                  disabled={isGenerating}
                  className="flex-1 py-3.5 bg-accent text-white font-semibold rounded-lg hover:bg-accent/90 transition-colors duration-300 flex items-center justify-center gap-2 shadow-lg shadow-accent/10"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {isGenerating ? t("btn-generating") : t("btn-finalize")}
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Success / Download */}
          {step === 3 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05] border-l-2 border-l-emerald-500 text-center py-16"
            >
              <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-emerald-500">
                <FileText className="w-9 h-9" />
              </div>
              <h2 className="text-3xl font-[family-name:var(--font-display)] italic text-cream mb-2">{t("success-title")}</h2>
              <p className="text-muted text-sm mb-8 max-w-md mx-auto">
                {t("success-desc")}
              </p>

              <div className="flex gap-4 justify-center">
                <button
                  onClick={handleDownload}
                  className="px-8 py-3.5 bg-cream text-background font-semibold rounded-lg hover:bg-white transition-colors duration-300 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> {t("btn-download")}
                </button>
                <button
                  onClick={() => setStep(1)}
                  className="px-8 py-3.5 bg-white/[0.03] border border-white/[0.06] text-cream font-semibold rounded-lg hover:bg-white/[0.05] transition-all duration-300"
                >
                  {t("btn-new")}
                </button>
              </div>
            </motion.div>
          )}

        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
            <h4 className="text-[11px] font-semibold text-muted uppercase tracking-[0.12em] mb-4">{t("context-title")}</h4>
            <div className="bg-blue-500/[0.06] border border-blue-500/15 p-4 rounded-xl mb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-blue-300 mb-1">{t("context-alert-title")}</div>
                  <p className="text-[12px] text-blue-300/70 leading-relaxed">
                    {t("context-alert-desc")}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-3 text-sm text-muted">
              <div className="flex justify-between">
                <span>{t("context-warranty")}</span>
                <span className="text-cream font-semibold">5 Years</span>
              </div>
              <div className="flex justify-between">
                <span>{t("context-standard")}</span>
                <span className="text-cream font-semibold">SIA 118 (2026)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
