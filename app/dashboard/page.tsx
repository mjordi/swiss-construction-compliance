"use client";

import { useState, useRef } from "react";
import { CheckCircle, AlertTriangle, FileText, Loader2, Download, PenTool, Camera, User, Calendar } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { pdf } from '@react-pdf/renderer';
import { AuditReportPDF } from "@/components/dashboard/AuditReportPDF";
import SignaturePad from 'signature_pad';

export default function Dashboard() {
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const sigCanvas = useRef<HTMLCanvasElement>(null);
  
  // Initialize signature pad on mount/step change
  // In a real app we'd use useEffect, but for simplicity in this demo:
  const setupSigPad = () => {
    if (sigCanvas.current) {
        const pad = new SignaturePad(sigCanvas.current);
    }
  }

  const handleGenerateProtocol = async () => {
    setIsGenerating(true);
    // Simulate generation
    setTimeout(() => {
        setIsGenerating(false);
        setStep(3); // Success state
    }, 2500);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-12 flex justify-between items-end">
        <div>
            <h1 className="text-4xl font-bold mb-4">Digital Handover Protocol</h1>
            <p className="text-slate-400">Generate legally compliant acceptance reports (SIA 118).</p>
        </div>
        <div className="text-right">
            <div className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-1">Step</div>
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
                    <FileText className="w-5 h-5 text-accent" /> Project Details
                </h3>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Project Name</label>
                            <input type="text" placeholder="e.g. Residentia West" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:border-accent outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Date</label>
                            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-3 text-slate-400">
                                <Calendar className="w-4 h-4" />
                                <span>{new Date().toLocaleDateString('de-CH')}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Contractor (Unternehmer)</label>
                        <input type="text" placeholder="Company Name AG" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:border-accent outline-none" />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Client (Bauherr)</label>
                        <input type="text" placeholder="Client Name" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:border-accent outline-none" />
                    </div>

                    <div className="pt-4">
                        <button 
                            onClick={() => setStep(2)}
                            className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-slate-200 transition"
                        >
                            Next: Defects & Signatures
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
                    <AlertTriangle className="w-5 h-5 text-yellow-500" /> Defect Record (Mängelrüge)
                </h3>
                
                <div className="mb-8 p-4 border border-white/10 rounded-2xl bg-black/20">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-sm font-bold text-slate-400">Detected Defects</span>
                        <button className="text-xs bg-accent/20 text-accent px-2 py-1 rounded font-bold hover:bg-accent/30 transition flex items-center gap-1">
                            <Camera className="w-3 h-3" /> Add Photo Evidence
                        </button>
                    </div>
                    <textarea 
                        className="w-full bg-transparent text-sm resize-none outline-none h-24 placeholder-slate-600"
                        placeholder="Describe defects here (e.g., 'Scratch on parquet floor in living room')..."
                    ></textarea>
                </div>

                <div className="mb-8">
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Digital Signature (Client)</label>
                    <div className="border border-white/10 rounded-xl bg-white h-32 relative overflow-hidden group cursor-crosshair">
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-slate-300 text-sm group-hover:opacity-50 transition">Sign Here</span>
                        </div>
                        {/* In a real implementation, <canvas ref={sigCanvas} /> would go here */}
                    </div>
                </div>

                <div className="flex gap-4">
                    <button 
                        onClick={() => setStep(1)}
                        className="px-6 py-4 bg-white/5 text-slate-400 font-bold rounded-xl hover:bg-white/10 transition"
                    >
                        Back
                    </button>
                    <button 
                        onClick={handleGenerateProtocol}
                        disabled={isGenerating}
                        className="flex-1 py-4 bg-accent text-white font-bold rounded-xl hover:bg-accent/90 transition flex items-center justify-center gap-2"
                    >
                        {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                        {isGenerating ? "Generating Legal PDF..." : "Finalize Protocol"}
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
                <h2 className="text-3xl font-bold mb-2">Protocol Generated!</h2>
                <p className="text-slate-400 mb-8 max-w-md mx-auto">
                    The handover protocol has been cryptographically signed and stored in the Tech Vault.
                </p>
                
                <div className="flex gap-4 justify-center">
                    <button className="px-8 py-4 bg-white text-black font-bold rounded-xl hover:bg-slate-200 transition flex items-center gap-2 shadow-lg shadow-white/10">
                        <Download className="w-5 h-5" /> Download PDF
                    </button>
                    <button 
                        onClick={() => setStep(1)}
                        className="px-8 py-4 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 transition"
                    >
                        New Handover
                    </button>
                </div>
            </motion.div>
          )}

        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="glass-card p-6 rounded-2xl">
            <h4 className="text-sm font-bold text-slate-500 uppercase mb-4 tracking-wider">Legal Context (2026)</h4>
            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl mb-4">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                        <div className="text-sm font-bold text-blue-200 mb-1">Immediate Notification</div>
                        <p className="text-xs text-blue-300/80 leading-relaxed">
                            Under the new Art. 370 OR, visible defects must be recorded in this protocol to maintain warranty rights.
                        </p>
                    </div>
                </div>
            </div>
            <div className="space-y-3 text-sm text-slate-400">
                <div className="flex justify-between">
                    <span>Warranty Period</span>
                    <span className="text-white font-bold">5 Years</span>
                </div>
                <div className="flex justify-between">
                    <span>Standard</span>
                    <span className="text-white font-bold">SIA 118 (2026)</span>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
