"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Folder, FileText, Plus, Search, ShieldCheck, Loader2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { normalizeFollowUpChecklistState } from "@/lib/cases-checklist";
import { getSupabase } from "@/lib/supabase";
import type { Case, Protocol } from "@/lib/database.types";
import { buildComplianceCaseTimeline, deriveChecklistProgress } from "@/lib/case-timeline";
import {
  buildVaultCreateProjectHref,
  buildVaultProjectCasesHref,
  getVaultEmptyState,
  parseVaultTab,
  type VaultEmptyStateAction,
  type VaultTab,
} from "@/lib/vault";
import type { TranslationKey } from "@/locales";

interface VaultProjectCard {
  id: string;
  name: string;
  status: "active" | "review" | "archived";
  restoredStatus: "active" | "review";
  restoredPrefillTriage: boolean;
  docs: number;
  compliance: number;
  updatedAt: number;
  archived: boolean;
  prefillTriage: boolean;
}

const statusLabelKey: Record<VaultProjectCard["status"], TranslationKey> = {
  active: "vault-status-active",
  review: "vault-status-review",
  archived: "vault-status-archived",
};

const statusClass: Record<VaultProjectCard["status"], string> = {
  active: "text-emerald-300 bg-emerald-400/10",
  review: "text-yellow-300 bg-yellow-400/10",
  archived: "text-slate-300 bg-white/10",
};

function interpolateTranslation(template: string, params?: Record<string, string>) {
  if (!params) return template;

  return Object.entries(params).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template
  );
}

function formatRelativeUpdate(timestamp: number, lang: string): string {
  const now = Date.now();
  const diffMs = Math.max(0, now - timestamp);

  const minuteMs = 1000 * 60;
  const hourMs = minuteMs * 60;
  const dayMs = hourMs * 24;
  const weekMs = dayMs * 7;
  const relativeTime = new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "short" });

  if (diffMs < hourMs) {
    return relativeTime.format(-Math.max(1, Math.floor(diffMs / minuteMs)), "minute");
  }

  if (diffMs < dayMs) {
    return relativeTime.format(-Math.max(1, Math.floor(diffMs / hourMs)), "hour");
  }

  if (diffMs < weekMs) {
    return relativeTime.format(-Math.max(1, Math.floor(diffMs / dayMs)), "day");
  }

  return relativeTime.format(-Math.max(1, Math.floor(diffMs / weekMs)), "week");
}

export default function TechVault() {
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const supabase = useMemo(() => getSupabase(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<VaultTab>(() => parseVaultTab(searchParams.get("tab")));
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [statusMutationError, setStatusMutationError] = useState<{ projectId: string; key: TranslationKey } | null>(null);
  const [statusMutationProjectId, setStatusMutationProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<VaultProjectCard[]>([]);
  const latestFetchIdRef = useRef(0);
  const hasLoadedProjectsRef = useRef(false);
  const lastSuccessfulUserIdRef = useRef<string | null>(null);
  const activeTabRef = useRef(activeTab);
  const queryRef = useRef(query);
  const skipNextUrlWriteRef = useRef(false);

  const runRefresh = useCallback(async (fetchId: number) => {
    if (!user) {
      hasLoadedProjectsRef.current = false;
      lastSuccessfulUserIdRef.current = null;
      setError(null);
      setProjects([]);
      setLoading(false);
      return;
    }

    setError(null);
    try {
      const [casesResult, protocolsResult] = await Promise.all([
        supabase
          .from("cases")
          .select("*")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false }),
        supabase
          .from("protocols")
          .select("id, case_id, project_name")
          .eq("user_id", user.id),
      ]);

      if (fetchId !== latestFetchIdRef.current) return;

      if (casesResult.error || protocolsResult.error) {
        if (!hasLoadedProjectsRef.current || lastSuccessfulUserIdRef.current !== user.id) {
          setError("vault-error-load");
          setProjects([]);
        }
        setLoading(false);
        return;
      }

      const dbCases = (casesResult.data ?? []) as Case[];
      const protocols = (protocolsResult.data ?? []) as Pick<Protocol, "id" | "case_id" | "project_name">[];

      const timeline = buildComplianceCaseTimeline(
        dbCases.map((c) => ({
          id: c.id,
          projectName: c.project_name,
          canton: c.canton,
          contractDate: new Date(c.contract_date),
          discoveryDate: new Date(c.discovery_date),
        }))
      );

      const timelineStateByCase = new Map<string, { status: "active" | "review"; prefillTriage: boolean }>(
        timeline.map((t) => [
          t.id,
          {
            status:
              t.status === "warning" || t.status === "urgent" || t.status === "expired" || t.status === "immediate-notice"
                ? "review"
                : "active",
            prefillTriage: t.status === "urgent" || t.status === "expired" || t.status === "immediate-notice",
          },
        ])
      );

      const docsByCase = protocols.reduce<Record<string, number>>((acc, p) => {
        if (!p.case_id) return acc;
        acc[p.case_id] = (acc[p.case_id] ?? 0) + 1;
        return acc;
      }, {});

      const timelineByCaseId = new Map(timeline.map((item) => [item.id, item]));

      const nextProjects: VaultProjectCard[] = dbCases.map((c) => {
        const archived = c.status === "archived";
        const timelineState = timelineStateByCase.get(c.id);
        const restoredStatus = timelineState?.status ?? "active";
        const restoredPrefillTriage = Boolean(timelineState?.prefillTriage);
        const timelineItem = timelineByCaseId.get(c.id);
        const progress = deriveChecklistProgress(
          normalizeFollowUpChecklistState({
            ...timelineItem?.checklistDefaults,
            ...(c.checklist ?? {}),
          })
        );
        return {
          id: c.id,
          name: c.project_name,
          status: archived ? "archived" : restoredStatus,
          restoredStatus,
          restoredPrefillTriage,
          docs: docsByCase[c.id] ?? 0,
          compliance: Math.round((progress.completed / progress.total) * 100),
          updatedAt: new Date(c.updated_at).getTime(),
          archived,
          prefillTriage: !archived && restoredPrefillTriage,
        };
      });

      hasLoadedProjectsRef.current = true;
      lastSuccessfulUserIdRef.current = user.id;
      setProjects(nextProjects);
      setLoading(false);
    } catch {
      if (fetchId !== latestFetchIdRef.current) return;
      if (!hasLoadedProjectsRef.current || lastSuccessfulUserIdRef.current !== user.id) {
        setError("vault-error-load");
        setProjects([]);
      }
      setLoading(false);
    }
  }, [user, supabase]);

  const triggerRefresh = useCallback(() => {
    const fetchId = ++latestFetchIdRef.current;
    setLoading(true);
    setError(null);
    void runRefresh(fetchId);
  }, [runRefresh]);

  useEffect(() => {
    queueMicrotask(() => {
      triggerRefresh();
    });
  }, [triggerRefresh]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const searchParamString = searchParams.toString();

  useEffect(() => {
    const params = new URLSearchParams(searchParamString);
    const nextActiveTab = parseVaultTab(params.get("tab"));
    const nextQuery = params.get("q") ?? "";

    if (nextActiveTab === activeTabRef.current && nextQuery === queryRef.current) {
      return;
    }

    skipNextUrlWriteRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      setActiveTab(nextActiveTab);
      setQuery(nextQuery);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [searchParamString]);

  useEffect(() => {
    if (skipNextUrlWriteRef.current) {
      skipNextUrlWriteRef.current = false;
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    const normalizedQuery = query.trim();

    if (activeTab === "projects") params.delete("tab");
    else params.set("tab", activeTab);

    if (normalizedQuery) params.set("q", normalizedQuery);
    else params.delete("q");

    const next = params.toString();
    const current = searchParams.toString();

    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [activeTab, pathname, query, router, searchParams]);

  const filteredProjects = useMemo(
    () =>
      projects
        .filter((project) => (activeTab === "projects" ? !project.archived : project.archived))
        .filter((project) => {
          const q = query.trim().toLowerCase();
          if (!q) return true;
          return project.name.toLowerCase().includes(q) || t(statusLabelKey[project.status]).toLowerCase().includes(q);
        })
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [projects, activeTab, query, t]
  );

  const emptyState = useMemo(
    () =>
      getVaultEmptyState({
        activeTab,
        query,
        hasActiveProjects: projects.some((project) => !project.archived),
        hasArchivedProjects: projects.some((project) => project.archived),
      }),
    [activeTab, projects, query]
  );

  const emptyStateTitle = useMemo(
    () => interpolateTranslation(t(emptyState.titleKey), emptyState.titleParams),
    [emptyState.titleKey, emptyState.titleParams, t]
  );

  const emptyStateBody = useMemo(
    () => t(emptyState.bodyKey),
    [emptyState.bodyKey, t]
  );

  const emptyStateActionLabel = useMemo(
    () => (emptyState.actionLabelKey ? t(emptyState.actionLabelKey) : null),
    [emptyState.actionLabelKey, t]
  );

  const createProjectHref = buildVaultCreateProjectHref();

  const handleEmptyStateAction = useCallback((action: VaultEmptyStateAction) => {
    if (action === "clear-search") {
      setQuery("");
      return;
    }
    if (action === "show-projects") {
      setActiveTab("projects");
      return;
    }
    if (action === "show-archived") {
      setActiveTab("archived");
    }
  }, []);

  const navigateToProjectCases = useCallback((href: string) => {
    router.push(href);
  }, [router]);

  const handleProjectArchiveToggle = useCallback(async (projectId: string, archived: boolean) => {
    if (!user || statusMutationProjectId) return;

    const currentProject = projects.find((project) => project.id === projectId);
    if (!currentProject) return;

    const nextStatus = archived ? currentProject.restoredStatus : "archived";
    const previousProject = currentProject;

    setStatusMutationProjectId(projectId);
    setStatusMutationError((current) => (current?.projectId === projectId ? null : current));
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              archived: !archived,
              status: nextStatus,
              prefillTriage: archived ? project.restoredPrefillTriage : false,
              updatedAt: Date.now(),
            }
          : project
      )
    );

    try {
      const { error: updateError } = await supabase
        .from("cases")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId)
        .eq("user_id", user.id);

      if (updateError) {
        throw updateError;
      }

      setStatusMutationError((current) => (current?.projectId === projectId ? null : current));
    } catch {
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? previousProject
            : project
        )
      );
      setStatusMutationError({ projectId, key: "vault-update-status-error" });
    } finally {
      setStatusMutationProjectId((current) => (current === projectId ? null : current));
    }
  }, [projects, statusMutationProjectId, supabase, user]);

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold mb-2">{t("vault-title")}</h1>
          <p className="text-slate-400">{t("vault-subtitle")}</p>
        </div>
        <Link
          href={createProjectHref}
          className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition text-sm font-bold border border-white/5"
        >
          <Plus className="w-4 h-4" /> {t("vault-new-project")}
        </Link>
      </header>

      <div className="flex-1 glass-card rounded-3xl overflow-hidden flex flex-col border border-white/10">
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div role="tablist" aria-label={t("vault-title")} className="flex items-center gap-1 bg-black/20 p-1 rounded-lg">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "projects"}
              onClick={() => setActiveTab("projects")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === "projects" ? "bg-accent text-white shadow-lg" : "text-slate-400 hover:text-white"}`}
            >
              {t("vault-tab-projects")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "archived"}
              onClick={() => setActiveTab("archived")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === "archived" ? "bg-accent text-white shadow-lg" : "text-slate-400 hover:text-white"}`}
            >
              {t("vault-tab-archived")}
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              aria-label={t("vault-search-placeholder")}
              placeholder={t("vault-search-placeholder")}
              className="bg-black/20 border border-white/5 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-accent/50 w-64 transition"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t("vault-loading")}
            </div>
          ) : error ? (
            <div
              role="alert"
              className="h-full rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-5 py-4 text-red-100"
            >
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="flex items-center justify-center gap-2 text-red-300">
                  <AlertCircle className="w-5 h-5" />
                  <span>{t(error)}</span>
                </div>
                <button
                  type="button"
                  onClick={triggerRefresh}
                  className="rounded-lg border border-red-200/30 px-4 py-2 text-sm font-medium text-red-50 transition hover:bg-red-500/[0.12]"
                >
                  {t("vault-load-retry")}
                </button>
              </div>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="max-w-md w-full border border-white/10 rounded-2xl p-8 text-center text-slate-300 bg-white/[0.02]">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 text-slate-400">
                  <Folder className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-semibold text-white mb-2">{emptyStateTitle}</h2>
                <p className="text-sm text-slate-400 mb-5">{emptyStateBody}</p>
                {emptyStateActionLabel && emptyState.action && (
                  <button
                    type="button"
                    onClick={() => handleEmptyStateAction(emptyState.action)}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                  >
                    {emptyStateActionLabel}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project, i) => {
                const projectCasesHref = buildVaultProjectCasesHref({
                  projectName: project.name,
                  prefillTriage: project.prefillTriage,
                });

                return (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="bg-white/5 hover:bg-white/10 border border-white/5 hover:border-accent/30 rounded-2xl transition group relative overflow-hidden"
                  >
                    <Link
                      href={projectCasesHref}
                      data-testid={`vault-project-card-${project.id}`}
                      aria-label={`${project.name} ${t("vault-open-in-cases")}`}
                      onClick={(event) => {
                        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                          return;
                        }

                        event.preventDefault();
                        navigateToProjectCases(projectCasesHref);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") {
                          return;
                        }

                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                          return;
                        }

                        event.preventDefault();
                        navigateToProjectCases(projectCasesHref);
                      }}
                      className="absolute inset-0 rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent/60 focus:ring-inset"
                    >
                      <span className="sr-only">{project.name} {t("vault-open-in-cases")}</span>
                    </Link>

                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-accent to-transparent opacity-0 group-hover:opacity-100 transition duration-500" />

                    <article className="relative z-10 p-6 pointer-events-none">
                      <div className="flex justify-between items-start mb-6">
                        <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400 group-hover:bg-accent/10 group-hover:text-accent transition-colors">
                          <Folder className="w-6 h-6" />
                        </div>
                      </div>

                      <h3 className="text-lg font-bold mb-1 group-hover:text-accent transition-colors">{project.name}</h3>
                      <p className="text-xs text-slate-500 mb-6">
                        {interpolateTranslation(t("vault-last-updated"), { relative: formatRelativeUpdate(project.updatedAt, lang) })}
                      </p>

                      <div className="flex items-center justify-between text-sm mb-3">
                        <div className="flex items-center gap-2 text-slate-300">
                          <FileText className="w-4 h-4 text-slate-500" />
                          <span>{project.docs} {t("vault-docs-label")}</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-md ${statusClass[project.status]}`}>
                          {t(statusLabelKey[project.status])}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-md w-fit">
                        <ShieldCheck className="w-3 h-3" />
                        <span className="font-bold">{project.compliance}%</span>
                      </div>

                      <div className="mt-6 pointer-events-auto space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition group-hover:border-accent/40 group-hover:bg-accent/10 group-hover:text-accent">
                            {t("vault-open-in-cases")}
                          </span>
                          <button
                            type="button"
                            disabled={statusMutationProjectId === project.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleProjectArchiveToggle(project.id, project.archived);
                            }}
                            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {t(project.archived ? "vault-restore-project" : "vault-archive-project")}
                          </button>
                        </div>
                        {statusMutationError?.projectId === project.id ? (
                          <p role="alert" className="text-sm text-red-300">
                            {t(statusMutationError.key)}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  </motion.div>
                );
              })}

              <Link
                href={createProjectHref}
                className="border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center p-6 text-slate-500 hover:text-white hover:border-white/20 hover:bg-white/5 cursor-pointer transition min-h-[200px]"
              >
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <Plus className="w-6 h-6" />
                </div>
                <span className="font-medium text-sm">{t("vault-create-project")}</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
