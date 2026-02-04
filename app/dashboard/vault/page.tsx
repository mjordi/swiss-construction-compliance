"use client";

import { Folder, FileText, MoreVertical, Plus, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

const projects = [
  { id: 1, name: "Residentia Zürich West", status: "Active", docs: 12, compliance: 98, updated: "2h ago" },
  { id: 2, name: "Hotel de Genève", status: "Review", docs: 8, compliance: 85, updated: "1d ago" },
  { id: 3, name: "Lugano Lakefront", status: "Archived", docs: 45, compliance: 100, updated: "2w ago" },
];

export default function TechVault() {
  const [activeTab, setActiveTab] = useState("projects");

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold mb-2">Technical Vault</h1>
          <p className="text-slate-400">Secure, compliant storage for 2026 mandated documentation.</p>
        </div>
        <button className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition text-sm font-bold border border-white/5">
          <Plus className="w-4 h-4" /> New Project
        </button>
      </header>

      <div className="flex-1 glass-card rounded-3xl overflow-hidden flex flex-col border border-white/10">
        {/* Toolbar */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-1 bg-black/20 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab("projects")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === "projects" ? "bg-accent text-white shadow-lg" : "text-slate-400 hover:text-white"}`}
            >
              Projects
            </button>
            <button 
              onClick={() => setActiveTab("archived")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === "archived" ? "bg-accent text-white shadow-lg" : "text-slate-400 hover:text-white"}`}
            >
              Archived
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search documentation..." 
              className="bg-black/20 border border-white/5 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-accent/50 w-64 transition"
            />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project, i) => (
              <motion.div 
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white/5 hover:bg-white/10 border border-white/5 hover:border-accent/30 p-6 rounded-2xl cursor-pointer transition group relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-accent to-transparent opacity-0 group-hover:opacity-100 transition duration-500" />
                
                <div className="flex justify-between items-start mb-6">
                  <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400 group-hover:bg-accent/10 group-hover:text-accent transition-colors">
                    <Folder className="w-6 h-6" />
                  </div>
                  <button className="text-slate-500 hover:text-white transition">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>

                <h3 className="text-lg font-bold mb-1 group-hover:text-accent transition-colors">{project.name}</h3>
                <p className="text-xs text-slate-500 mb-6">Last updated {project.updated}</p>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-slate-300">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span>{project.docs} Docs</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-md">
                    <ShieldCheck className="w-3 h-3" />
                    <span className="font-bold">{project.compliance}%</span>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Add New Placeholder */}
            <div className="border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center p-6 text-slate-500 hover:text-white hover:border-white/20 hover:bg-white/5 cursor-pointer transition min-h-[200px]">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Plus className="w-6 h-6" />
              </div>
              <span className="font-medium text-sm">Create New Project</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
