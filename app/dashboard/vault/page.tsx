"use client";

import { useCallback, useEffect, useState } from "react";
import { Folder, FileText, Plus, Search, ShieldCheck, Loader2, Archive, RotateCcw, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import PageHeader from "@/components/dashboard/PageHeader";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { getSupabase } from "@/lib/supabase";
import type { VaultProject } from "@/lib/database.types";

export default function TechVault() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const supabase = getSupabase();

  const [projects, setProjects] = useState<(VaultProject & { protocol_count: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchProjects = useCallback(async () => {
    if (!user) return;

    // Fetch vault projects
    const { data: vaultData } = await supabase
      .from("vault_projects")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (!vaultData) {
      setLoading(false);
      return;
    }

    // Fetch protocol counts per vault project
    const { data: protocolCounts } = await supabase
      .from("protocols")
      .select("vault_project_id")
      .eq("user_id", user.id)
      .not("vault_project_id", "is", null);

    const countMap: Record<string, number> = {};
    for (const row of protocolCounts ?? []) {
      if (row.vault_project_id) {
        countMap[row.vault_project_id] = (countMap[row.vault_project_id] ?? 0) + 1;
      }
    }

    setProjects(
      (vaultData as VaultProject[]).map((p) => ({
        ...p,
        protocol_count: countMap[p.id] ?? 0,
      }))
    );
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filtered = projects.filter((p) => {
    const tabMatch = activeTab === "archived" ? p.status === "archived" : p.status !== "archived";
    const searchMatch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return tabMatch && searchMatch;
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !newName.trim()) return;
    setSaving(true);
    await supabase.from("vault_projects").insert({
      user_id: user.id,
      name: newName.trim(),
      status: "active",
    });
    setNewName("");
    setShowForm(false);
    setSaving(false);
    fetchProjects();
  }

  async function handleToggleArchive(project: VaultProject & { protocol_count: number }) {
    const newStatus = project.status === "archived" ? "active" : "archived";
    await supabase
      .from("vault_projects")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", project.id);
    fetchProjects();
  }

  async function handleDelete(projectId: string) {
    await supabase.from("vault_projects").delete().eq("id", projectId);
    fetchProjects();
  }

  function formatRelativeTime(dateStr: string): string {
    const now = Date.now();
    const diff = now - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-125px)] flex flex-col">
      <header className="mb-6 flex justify-between items-end">
        <div>
          <PageHeader marker={t("vault-marker")} title={t("vault-title")} subtitle={t("vault-subtitle")} />
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-accent hover:bg-accent/90 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors duration-300 text-[13px] font-semibold border border-accent/30 shrink-0"
        >
          <Plus className="w-4 h-4" /> {t("vault-new-project")}
        </button>
      </header>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 p-6 rounded-2xl bg-white/[0.02] border border-accent/20">
          <h3 className="text-[15px] font-semibold text-cream mb-4">{t("vault-create-project")}</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("vault-project-name")}
              className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none transition-colors duration-200"
              required
            />
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-accent hover:bg-accent/90 text-white font-semibold rounded-lg text-sm flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} {t("vault-save")}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 bg-white/[0.03] border border-white/[0.06] text-muted hover:text-cream font-medium rounded-lg text-sm">
              {t("vault-cancel")}
            </button>
          </div>
        </form>
      )}

      <div className="flex-1 rounded-2xl bg-white/[0.02] border border-white/[0.05] overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-white/[0.04] flex items-center justify-between bg-white/[0.01]">
          <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] p-0.5 rounded-lg">
            <button
              onClick={() => setActiveTab("active")}
              className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all duration-300 ${activeTab === "active" ? "bg-accent/15 text-accent" : "text-muted hover:text-cream"}`}
            >
              {t("vault-projects")}
            </button>
            <button
              onClick={() => setActiveTab("archived")}
              className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all duration-300 ${activeTab === "archived" ? "bg-accent/15 text-accent" : "text-muted hover:text-cream"}`}
            >
              {t("vault-archived")}
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("vault-search")}
              className="bg-white/[0.03] border border-white/[0.06] rounded-lg pl-10 pr-4 py-2 text-[13px] text-cream placeholder-muted/40 focus:outline-none focus:border-accent/30 w-64 transition-colors duration-300"
            />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted">{t("vault-no-projects")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((project, i) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] hover:border-accent/20 p-6 rounded-xl transition-all duration-300 group relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-[2px] h-full bg-gradient-to-b from-accent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <div className="flex justify-between items-start mb-6">
                    <div className="p-2.5 bg-blue-500/[0.06] border border-blue-500/15 rounded-lg text-blue-400 group-hover:bg-accent/[0.06] group-hover:border-accent/15 group-hover:text-accent transition-colors duration-300">
                      <Folder className="w-5 h-5" />
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleToggleArchive(project)}
                        className="p-1.5 rounded-md text-muted/40 hover:text-accent hover:bg-accent/[0.06] transition-colors"
                        title={project.status === "archived" ? t("vault-activate") : t("vault-archive")}
                      >
                        {project.status === "archived" ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDelete(project.id)}
                        className="p-1.5 rounded-md text-muted/40 hover:text-red-400 hover:bg-red-400/[0.06] transition-colors"
                        title={t("vault-delete")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-[15px] font-semibold text-cream mb-1 group-hover:text-accent transition-colors duration-300">
                    {project.name}
                  </h3>
                  <p className="text-[11px] text-muted/60 mb-6">
                    {t("vault-updated")} {formatRelativeTime(project.updated_at)}
                  </p>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted">
                      <FileText className="w-4 h-4 text-muted/40" />
                      <span className="text-[13px]">{project.protocol_count} {t("vault-protocols")}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-semibold ${
                      project.status === "active"
                        ? "text-emerald-400 bg-emerald-400/[0.06] border border-emerald-400/15"
                        : project.status === "review"
                        ? "text-yellow-400 bg-yellow-400/[0.06] border border-yellow-400/15"
                        : "text-muted bg-white/[0.03] border border-white/[0.06]"
                    }`}>
                      <ShieldCheck className="w-3 h-3" />
                      <span className="capitalize">{project.status}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
