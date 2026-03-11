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
          <h1 className="text-3xl font-[family-name:var(--font-display)] italic text-cream mb-2">Technical Vault</h1>
          <p className="text-muted text-sm">Secure, compliant storage for 2026 mandated documentation.</p>
        </div>
        <button className="bg-white/[0.04] hover:bg-white/[0.06] text-cream px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all duration-300 text-[13px] font-semibold border border-white/[0.06]">
          <Plus className="w-4 h-4" /> New Project
        </button>
      </header>

      <div className="flex-1 rounded-2xl bg-white/[0.02] border border-white/[0.05] overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-white/[0.04] flex items-center justify-between bg-white/[0.01]">
          <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] p-0.5 rounded-lg">
            <button
              onClick={() => setActiveTab("projects")}
              className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all duration-300 ${activeTab === "projects" ? "bg-accent/15 text-accent" : "text-muted hover:text-cream"}`}
            >
              Projects
            </button>
            <button
              onClick={() => setActiveTab("archived")}
              className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all duration-300 ${activeTab === "archived" ? "bg-accent/15 text-accent" : "text-muted hover:text-cream"}`}
            >
              Archived
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted/50" />
            <input
              type="text"
              placeholder="Search documentation..."
              className="bg-white/[0.03] border border-white/[0.06] rounded-lg pl-10 pr-4 py-2 text-[13px] text-cream placeholder-muted/40 focus:outline-none focus:border-accent/30 w-64 transition-colors duration-300"
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
                className="bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] hover:border-accent/20 p-6 rounded-xl cursor-pointer transition-all duration-300 group relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-[2px] h-full bg-gradient-to-b from-accent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="flex justify-between items-start mb-6">
                  <div className="p-2.5 bg-blue-500/[0.06] border border-blue-500/15 rounded-lg text-blue-400 group-hover:bg-accent/[0.06] group-hover:border-accent/15 group-hover:text-accent transition-colors duration-300">
                    <Folder className="w-5 h-5" />
                  </div>
                  <button className="text-muted/40 hover:text-cream transition-colors duration-300">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>

                <h3 className="text-[15px] font-semibold text-cream mb-1 group-hover:text-accent transition-colors duration-300">{project.name}</h3>
                <p className="text-[11px] text-muted/60 mb-6">Last updated {project.updated}</p>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted">
                    <FileText className="w-4 h-4 text-muted/40" />
                    <span className="text-[13px]">{project.docs} Docs</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-400/[0.06] border border-emerald-400/15 px-2 py-1 rounded-md">
                    <ShieldCheck className="w-3 h-3" />
                    <span className="font-semibold text-[12px]">{project.compliance}%</span>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Add New Placeholder */}
            <div className="border border-dashed border-white/[0.08] rounded-xl flex flex-col items-center justify-center p-6 text-muted hover:text-cream hover:border-white/15 hover:bg-white/[0.02] cursor-pointer transition-all duration-300 min-h-[200px]">
              <div className="w-11 h-11 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                <Plus className="w-5 h-5" />
              </div>
              <span className="font-medium text-[13px]">Create New Project</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
