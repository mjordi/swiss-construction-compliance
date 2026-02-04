"use client";

import { useState } from "react";
import { UploadCloud, CheckCircle, AlertTriangle, FileText, Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Dashboard() {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<"success" | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      setAnalyzing(true);
      // Simulate analysis delay
      setTimeout(() => {
        setAnalyzing(false);
        setResult("success");
      }, 3000);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
        setFileName(file.name);
        setAnalyzing(true);
        setTimeout(() => {
            setAnalyzing(false);
            setResult("success");
        }, 3000);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-12">
        <h1 className="text-4xl font-bold mb-4">Audit Engine v4.2</h1>
        <p className="text-slate-400">Deploy neural networks to analyze SIA 118 compliance.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {!result ? (
              <motion.div
                key="upload"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="relative"
              >
                <div 
                  className={`glass-card border-2 border-dashed border-white/10 rounded-3xl h-96 flex flex-col items-center justify-center relative overflow-hidden transition-all duration-300 ${analyzing ? 'border-accent/50 bg-accent/5' : 'hover:border-accent/50 hover:bg-accent/5'}`}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <input 
                    type="file" 
                    onChange={handleFileChange} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" 
                    disabled={analyzing}
                  />
                  
                  {analyzing ? (
                    <div className="text-center z-10">
                      <Loader2 className="w-16 h-16 text-accent animate-spin mx-auto mb-6" />
                      <h3 className="text-xl font-bold">Analyzing {fileName}...</h3>
                      <p className="text-slate-500 mt-2">Checking against 2026 Code of Obligations</p>
                    </div>
                  ) : (
                    <div className="text-center z-10 group-hover:scale-105 transition duration-300 pointer-events-none">
                      <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 text-white group-hover:bg-accent transition-colors">
                        <UploadCloud className="w-10 h-10" />
                      </div>
                      <h3 className="text-xl font-bold mb-2">Drop Contract Here</h3>
                      <p className="text-slate-500 text-sm">Support for .pdf, .docx, .sia</p>
                    </div>
                  )}
                  
                  {analyzing && (
                    <motion.div 
                      initial={{ height: "0%" }}
                      animate={{ height: "100%" }}
                      transition={{ duration: 3, ease: "easeInOut" }}
                      className="absolute bottom-0 left-0 w-full bg-accent/10 z-0"
                    />
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-8 rounded-3xl border-l-4 border-emerald-500"
              >
                <div className="flex items-start justify-between mb-8">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-500">
                        <CheckCircle className="w-6 h-6" />
                      </div>
                      <h3 className="text-2xl font-bold text-white">Compliance Certified</h3>
                    </div>
                    <p className="text-slate-400 text-sm">File: {fileName}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-bold text-emerald-500">98%</div>
                    <div className="text-xs text-slate-500 uppercase tracking-widest mt-1">Score</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-white/5 p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                      <span className="text-sm font-medium">Liability Clauses (Art. 371 OR)</span>
                    </div>
                    <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded">Compliant</span>
                  </div>
                  <div className="bg-white/5 p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                      <span className="text-sm font-medium">Defect Notification Period</span>
                    </div>
                    <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded">Compliant</span>
                  </div>
                  <div className="bg-white/5 p-4 rounded-xl flex items-center justify-between border border-yellow-500/30">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-yellow-500" />
                      <span className="text-sm font-medium">Digital Handover Protocol</span>
                    </div>
                    <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded">Recommendation</span>
                  </div>
                </div>

                <div className="mt-8 pt-8 border-t border-white/5 flex gap-4">
                  <button className="px-6 py-3 bg-white text-black font-bold rounded-lg hover:bg-slate-200 transition flex-1">
                    Download Report
                  </button>
                  <button 
                    onClick={() => { setResult(null); setFileName(null); }}
                    className="px-6 py-3 bg-white/5 text-white font-bold rounded-lg hover:bg-white/10 transition"
                  >
                    New Scan
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-6">
          <div className="glass-card p-6 rounded-2xl">
            <h4 className="text-sm font-bold text-slate-500 uppercase mb-4 tracking-wider">Recent Activity</h4>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-3 hover:bg-white/5 rounded-xl transition cursor-pointer">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">Project Alpha {i}</div>
                    <div className="text-xs text-slate-500">2h ago • Manual Review</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl bg-gradient-to-br from-accent/20 to-purple-600/10 border-accent/20">
            <h4 className="text-lg font-bold mb-2">Upgrade to Pro</h4>
            <p className="text-sm text-slate-400 mb-6">Get access to the full Canton Risk Map and automated legal adjustments.</p>
            <button className="w-full py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent/90 transition shadow-lg shadow-accent/20">
              Unlock for CHF 89
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
