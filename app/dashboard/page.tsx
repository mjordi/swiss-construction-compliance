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
        // Resize logic to handle varying DPRs
        const resizeCanvas = () => {
            const canvas = sigCanvas.current;
            if (canvas) {
                const ratio =  Math.max(window.devicePixelRatio || 1, 1);
                canvas.width = canvas.offsetWidth * ratio;
                canvas.height = canvas.offsetHeight * ratio;
                canvas.getContext("2d")?.scale(ratio, ratio);
                pad.clear(); // otherwise isEmpty() might return incorrect value
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
    // Simulate generation
    setTimeout(() => {
        setIsGenerating(false);
        setStep(3); // Success state
    }, 2500);
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const blob = await pdf(
        <AuditReportPDF 
          fileName={projectData.name || "Project"} 
          date={new Date().toLocaleDateString('de-CH')}
          // Pass signature data if we were actually rendering it in PDF
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
      <header className="mb-12 flex justify-between items-end">
        <div>
            <h1 className="text-4xl font-bold mb-4">{t("wizard-title")}</h1>
            <p className="text-slate-400">{t("wizard-subtitle")}</p>
        </div>
        <div className="text-right">
            <div className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-1">{t("step")}</div>
            <div className="text-3xl font-bold text-accent">{step} <span className="text-slate-600 text-xl">/ 3</span></div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          
          {/* Step 1: Project Details Form */}
          {step === 1 && (
            <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="glass-card p-8 rounded-3xl"
            >
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-accent" /> {t("step-1")}
                </h3>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-2">{t("label-project")}</label>
                            <input 
                                type="text" 
                                placeholder="e.g. Residentia West" 
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:border-accent outline-none" 
                                value={projectData.name}
                                onChange={(e) => setProjectData({...projectData, name: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-2">{t("label-date")}</label>
                            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-3 text-slate-400">
                                <Calendar className="w-4 h-4" />
                                <span>{new Date().toLocaleDateString('de-CH')}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-2">{t("label-contractor")}</label>
                        <input 
                            type="text" 
                            placeholder="Company Name AG" 
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:border-accent outline-none" 
                            value={projectData.contractor}
                            onChange={(e) => setProjectData({...projectData, contractor: e.target.value})}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-2">{t("label-client")}</label>
                        <input 
                            type="text" 
                            placeholder="Client Name" 
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:border-accent outline-none" 
                            value={projectData.client}
                            onChange={(e) => setProjectData({...projectData, client: e.target.value})}
                        />
                    </div>

                    <div className="pt-4">
                        <button 
                            onClick={() => setStep(2)}
                            className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-slate-200 transition"
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
                className="glass-card p-8 rounded-3xl"
            >
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-500" /> {t("defect-title")}
                </h3>
                
                <div className="mb-8 p-4 border border-white/10 rounded-2xl bg-black/20">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-sm font-bold text-slate-400">{t("defect-detected")}</span>
                        <button className="text-xs bg-accent/20 text-accent px-2 py-1 rounded font-bold hover:bg-accent/30 transition flex items-center gap-1">
                            <Camera className="w-3 h-3" /> {t("btn-photo")}
                        </button>
                    </div>
                    <textarea 
                        className="w-full bg-transparent text-sm resize-none outline-none h-24 placeholder-slate-600"
                        placeholder={t("defect-placeholder")}
                    ></textarea>
                </div>

                <div className="mb-8">
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">{t("label-signature")}</label>
                    <div className="border border-white/10 rounded-xl bg-white h-32 relative overflow-hidden group cursor-crosshair touch-none">
                        <canvas 
                            ref={sigCanvas} 
                            className="absolute inset-0 w-full h-full"
                        />
                        <div className="absolute bottom-2 right-2 text-xs text-slate-300 pointer-events-none">{t("sign-here")}</div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button 
                        onClick={() => setStep(1)}
                        className="px-6 py-4 bg-white/5 text-slate-400 font-bold rounded-xl hover:bg-white/10 transition"
                    >
                        {t("btn-back")}
                    </button>
                    <button 
                        onClick={handleGenerateProtocol}
                        disabled={isGenerating}
                        className="flex-1 py-4 bg-accent text-white font-bold rounded-xl hover:bg-accent/90 transition flex items-center justify-center gap-2"
                    >
                        {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
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
                className="glass-card p-8 rounded-3xl border-l-4 border-emerald-500 text-center py-16"
            >
                <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-500">
                    <FileText className="w-10 h-10" />
                </div>
                <h2 className="text-3xl font-bold mb-2">{t("success-title")}</h2>
                <p className="text-slate-400 mb-8 max-w-md mx-auto">
                    {t("success-desc")}
                </p>
                
                <div className="flex gap-4 justify-center">
                    <button 
                        onClick={handleDownload}
                        className="px-8 py-4 bg-white text-black font-bold rounded-xl hover:bg-slate-200 transition flex items-center gap-2 shadow-lg shadow-white/10"
                    >
                        <Download className="w-5 h-5" /> {t("btn-download")}
                    </button>
                    <button 
                        onClick={() => setStep(1)}
                        className="px-8 py-4 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 transition"
                    >
                        {t("btn-new")}
                    </button>
                </div>
            </motion.div>
          )}

        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="glass-card p-6 rounded-2xl">
            <h4 className="text-sm font-bold text-slate-500 uppercase mb-4 tracking-wider">{t("context-title")}</h4>
            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl mb-4">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                        <div className="text-sm font-bold text-blue-200 mb-1">{t("context-alert-title")}</div>
                        <p className="text-xs text-blue-300/80 leading-relaxed">
                            {t("context-alert-desc")}
                        </p>
                    </div>
                </div>
            </div>
            <div className="space-y-3 text-sm text-slate-400">
                <div className="flex justify-between">
                    <span>{t("context-warranty")}</span>
                    <span className="text-white font-bold">5 Years</span>
                </div>
                <div className="flex justify-between">
                    <span>{t("context-standard")}</span>
                    <span className="text-white font-bold">SIA 118 (2026)</span>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
