"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { getSupabase } from "@/lib/supabase";
import type { Case } from "@/lib/database.types";
import {
  applyComplianceCaseView,
  buildCaseDeadlineReminderICS,
  buildComplianceCaseTimeline,
  deriveChecklistProgress,
  isDeadlineReminderIcsExportEligible,
  type ComplianceCaseInput,
  type ComplianceCaseViewModel,
  type FollowUpChecklistKey,
  type FollowUpChecklistState,
  type CaseRegimeFilter,
  type CaseSortMode,
  type CaseStatusFilter,
} from "@/lib/case-timeline";
import { validateRuegefristInput } from "@/lib/legal-utils";

const SWISS_CANTONS = [
  "AG","AI","AR","BE","BL","BS","FR","GE","GL","GR",
  "JU","LU","NE","NW","OW","SG","SH","SO","SZ","TG",
  "TI","UR","VD","VS","ZG","ZH",
];

const statusClass: Record<ComplianceCaseViewModel["status"], string> = {
  ok: "text-green-400 bg-green-500/[0.08] border-green-500/30",
  warning: "text-yellow-400 bg-yellow-500/[0.08] border-yellow-500/30",
  urgent: "text-orange-300 bg-orange-500/[0.08] border-orange-500/30",
  expired: "text-red-400 bg-red-500/[0.08] border-red-500/30",
  "immediate-notice": "text-blue-300 bg-blue-500/[0.08] border-blue-500/30",
};

const countdownClass: Record<ComplianceCaseViewModel["deadlineCountdownTone"], string> = {
  neutral: "text-emerald-300",
  warning: "text-yellow-300",
  urgent: "text-orange-300 font-semibold",
  expired: "text-red-300 font-semibold",
};

function parseRegimeFilter(value: string | null): CaseRegimeFilter {
  if (value === "old" || value === "new") return value;
  return "all";
}

function parseStatusFilter(value: string | null): CaseStatusFilter {
  if (value === "ok" || value === "warning" || value === "urgent" || value === "expired") {
    return value;
  }
  return "all";
}

function parseSortMode(value: string | null): CaseSortMode {
  if (value === "most-urgent") return value;
  return "nearest-deadline";
}

export default function CasesPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const supabase = getSupabase();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [dbCases, setDbCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ projectName: "", canton: "ZH", contractDate: "", discoveryDate: "" });

  const [regimeFilter, setRegimeFilter] = useState<CaseRegimeFilter>(() => parseRegimeFilter(searchParams.get("regime")));
  const [statusFilter, setStatusFilter] = useState<CaseStatusFilter>(() => parseStatusFilter(searchParams.get("status")));
  const [sortMode, setSortMode] = useState<CaseSortMode>(() => parseSortMode(searchParams.get("sort")));
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("q") ?? "");
  const searchInputId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [checklistsByCase, setChecklistsByCase] = useState<Record<string, FollowUpChecklistState>>({});
  const [protocolCounts, setProtocolCounts] = useState<Record<string, number>>({});

  const fetchCases = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("cases")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setDbCases(data as Case[]);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const [casesResult, protocolsResult] = await Promise.all([
        supabase
          .from("cases")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("protocols")
          .select("case_id")
          .eq("user_id", user.id)
          .not("case_id", "is", null),
      ]);
      if (!cancelled) {
        if (casesResult.data) setDbCases(casesResult.data as Case[]);
        if (protocolsResult.data) {
          const counts: Record<string, number> = {};
          for (const p of protocolsResult.data) {
            if (p.case_id) counts[p.case_id] = (counts[p.case_id] || 0) + 1;
          }
          setProtocolCounts(counts);
        }
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, supabase]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());

    if (regimeFilter === "all") params.delete("regime");
    else params.set("regime", regimeFilter);

    if (statusFilter === "all") params.delete("status");
    else params.set("status", statusFilter);

    if (sortMode === "nearest-deadline") params.delete("sort");
    else params.set("sort", sortMode);

    if (!searchTerm.trim()) params.delete("q");
    else params.set("q", searchTerm.trim());

    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [regimeFilter, statusFilter, sortMode, searchTerm, pathname, router, searchParams]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (isTypingTarget) return;

      event.preventDefault();
      searchInputRef.current?.focus();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      const inSearch = target === searchInputRef.current;
      if (!inSearch && searchTerm.trim().length === 0) return;

      if (inSearch) {
        event.preventDefault();
      }
      setSearchTerm("");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchTerm]);

  const caseInputs: ComplianceCaseInput[] = useMemo(
    () =>
      dbCases.map((c) => ({
        id: c.id,
        projectName: c.project_name,
        canton: c.canton,
        contractDate: new Date(c.contract_date),
        discoveryDate: new Date(c.discovery_date),
      })),
    [dbCases]
  );

  const cases = useMemo(() => buildComplianceCaseTimeline(caseInputs), [caseInputs]);

  // Derive effective checklists: user overrides take precedence over DB defaults
  const effectiveChecklists = useMemo(() => {
    const result: Record<string, FollowUpChecklistState> = {};
    for (const c of dbCases) {
      result[c.id] = checklistsByCase[c.id] ?? (c.checklist as FollowUpChecklistState);
    }
    return result;
  }, [dbCases, checklistsByCase]);

  const visibleCases = useMemo(() => {
    const filtered = applyComplianceCaseView(cases, regimeFilter, statusFilter, sortMode);
    const query = searchTerm.trim().toLowerCase();
    if (!query) return filtered;

    return filtered.filter((item) =>
      `${item.projectName} ${item.canton}`.toLowerCase().includes(query)
    );
  }, [cases, regimeFilter, statusFilter, sortMode, searchTerm]);

  const visibleUrgentCount = useMemo(
    () => visibleCases.filter((item) => item.status === "urgent" || item.status === "expired").length,
    [visibleCases]
  );

  const visibleExpiredCount = useMemo(
    () => visibleCases.filter((item) => item.status === "expired").length,
    [visibleCases]
  );

  const hasActiveFilters = useMemo(
    () => regimeFilter !== "all" || statusFilter !== "all" || searchTerm.trim().length > 0,
    [regimeFilter, statusFilter, searchTerm]
  );

  const caseDateValidationError = useMemo(() => {
    if (!formData.contractDate || !formData.discoveryDate) return null;
    return validateRuegefristInput(
      new Date(formData.contractDate),
      new Date(formData.discoveryDate)
    );
  }, [formData.contractDate, formData.discoveryDate]);

  const checklistLabels: Record<FollowUpChecklistKey, string> = {
    defectDocumented: t("cases-checklist-defect-documented"),
    evidenceAttached: t("cases-checklist-evidence-attached"),
    noticeDrafted: t("cases-checklist-notice-drafted"),
    calendarReminderExported: t("cases-checklist-calendar-exported"),
  };

  async function toggleChecklistItem(caseId: string, key: FollowUpChecklistKey) {
    const updated = { ...effectiveChecklists[caseId], [key]: !effectiveChecklists[caseId]?.[key] };
    setChecklistsByCase((prev) => ({ ...prev, [caseId]: updated }));
    await supabase.from("cases").update({ checklist: updated, updated_at: new Date().toISOString() }).eq("id", caseId);
  }

  function downloadCaseReminder(item: ComplianceCaseViewModel) {
    const content = buildCaseDeadlineReminderICS(item);
    if (!content) return;
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateKey = item.noticeDeadline?.toISOString().split("T")[0] ?? "deadline";
    a.href = url;
    a.download = `baucompliance-case-${item.id}-notice-deadline-${dateKey}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    toggleChecklistItem(item.id, "calendarReminderExported");
  }

  async function handleAddCase(e: React.FormEvent) {
    e.preventDefault();
    if (
      !user ||
      !formData.projectName ||
      !formData.contractDate ||
      !formData.discoveryDate ||
      caseDateValidationError
    ) {
      return;
    }
    setSaving(true);
    await supabase.from("cases").insert({
      user_id: user.id,
      project_name: formData.projectName,
      canton: formData.canton,
      contract_date: formData.contractDate,
      discovery_date: formData.discoveryDate,
    });
    setFormData({ projectName: "", canton: "ZH", contractDate: "", discoveryDate: "" });
    setShowForm(false);
    setSaving(false);
    fetchCases();
  }

  async function handleDeleteCase(caseId: string, projectName: string) {
    const confirmText = t("cases-delete-confirm").replace("{projectName}", projectName);
    const confirmed = window.confirm(confirmText);
    if (!confirmed) return;

    await supabase.from("cases").delete().eq("id", caseId);
    setChecklistsByCase((prev) => {
      const next = { ...prev };
      delete next[caseId];
      return next;
    });
    fetchCases();
  }

  function clearFilters() {
    setRegimeFilter("all");
    setStatusFilter("all");
    setSortMode("nearest-deadline");
    setSearchTerm("");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-end justify-between">
        <PageHeader marker={t("cases-marker")} title={t("cases-title")} subtitle={t("cases-subtitle")} />
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-accent hover:bg-accent/90 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors duration-300 text-[13px] font-semibold shrink-0"
        >
          <Plus className="w-4 h-4" /> {t("cases-add-case")}
        </button>
      </div>

      {/* Add case form */}
      {showForm && (
        <form onSubmit={handleAddCase} className="mb-8 p-6 rounded-2xl bg-white/[0.02] border border-accent/20">
          <h3 className="text-[15px] font-semibold text-cream mb-4">{t("cases-add-title")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("cases-project-name")}</label>
              <input type="text" value={formData.projectName} onChange={(e) => setFormData({ ...formData, projectName: e.target.value })} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none transition-colors duration-200" required />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("cases-canton-label")}</label>
              <select value={formData.canton} onChange={(e) => setFormData({ ...formData, canton: e.target.value })} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none">
                {SWISS_CANTONS.map((c) => <option key={c} value={c} className="bg-black text-cream">{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("cases-contract-date-input")}</label>
              <input type="date" value={formData.contractDate} onChange={(e) => setFormData({ ...formData, contractDate: e.target.value })} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none [color-scheme:dark]" required />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("cases-discovery-date-input")}</label>
              <input type="date" value={formData.discoveryDate} onChange={(e) => setFormData({ ...formData, discoveryDate: e.target.value })} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none [color-scheme:dark]" required />
              {caseDateValidationError === "discovery-before-contract" && (
                <p className="mt-2 text-xs text-red-400">{t("calc-discovery-before-contract")}</p>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving || !!caseDateValidationError} className="px-5 py-2.5 bg-accent hover:bg-accent/90 text-white font-semibold rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} {t("cases-save")}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 bg-white/[0.03] border border-white/[0.06] text-muted hover:text-cream font-medium rounded-lg text-sm">
              {t("cases-cancel")}
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <section className="mb-6 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted/70">{t("cases-all")}</div>
            <div className="text-lg font-semibold text-cream">{visibleCases.length}</div>
          </div>
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/[0.08] px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.08em] text-orange-200/70">{t("cases-status-urgent")}</div>
            <div className="text-lg font-semibold text-orange-200">{visibleUrgentCount}</div>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === "expired" ? "all" : "expired"))}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              statusFilter === "expired"
                ? "border-red-400/60 bg-red-500/[0.16]"
                : "border-red-500/30 bg-red-500/[0.08] hover:bg-red-500/[0.12]"
            }`}
            aria-pressed={statusFilter === "expired"}
          >
            <div className="text-[11px] uppercase tracking-[0.08em] text-red-200/70">{t("cases-status-expired")}</div>
            <div className="text-lg font-semibold text-red-200">{visibleExpiredCount}</div>
          </button>
          <div className="text-sm text-muted">
            <label htmlFor={searchInputId} className="block text-[11px] uppercase tracking-[0.08em] text-muted/60 mb-1">
              {t("cases-search-label")}
            </label>
            <div className="relative">
              <input
                id={searchInputId}
                ref={searchInputRef}
                type="search"
                placeholder={t("cases-search-placeholder")}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                aria-label={t("cases-search-label")}
                className="w-full rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 pr-9 text-cream placeholder:text-muted/50"
              />
              {searchTerm.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    searchInputRef.current?.focus();
                  }}
                  aria-label={t("cases-clear-filters")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-base leading-none text-muted/80 hover:text-cream hover:bg-white/[0.08]"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <FilterSelect label={t("cases-filter-regime")} value={regimeFilter} onChange={(v) => setRegimeFilter(v as CaseRegimeFilter)} options={[{ value: "all", label: t("cases-all") }, { value: "old", label: t("cases-old-law") }, { value: "new", label: t("cases-new-law") }]} />
          <FilterSelect label={t("cases-filter-status")} value={statusFilter} onChange={(v) => setStatusFilter(v as CaseStatusFilter)} options={[{ value: "all", label: t("cases-all") }, { value: "ok", label: t("cases-status-on-track") }, { value: "warning", label: t("cases-status-attention") }, { value: "urgent", label: t("cases-status-urgent") }, { value: "expired", label: t("cases-status-expired") }]} />
          <FilterSelect label={t("cases-filter-sort")} value={sortMode} onChange={(v) => setSortMode(v as CaseSortMode)} options={[{ value: "nearest-deadline", label: t("cases-sort-nearest") }, { value: "most-urgent", label: t("cases-sort-urgent") }]} />
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-1.5 rounded-lg border border-white/[0.12] text-xs font-medium text-cream hover:bg-white/[0.06]"
            >
              {t("cases-clear-filters")}
            </button>
          </div>
        )}
      </section>

      {/* Cases list */}
      {visibleCases.length === 0 ? (
        hasActiveFilters ? (
          <div className="text-center py-16 text-muted space-y-4">
            <p>{t("cases-no-results")}</p>
            <button
              type="button"
              onClick={clearFilters}
              className="px-4 py-2 rounded-lg border border-white/[0.12] text-cream hover:bg-white/[0.06]"
            >
              {t("cases-clear-filters")}
            </button>
          </div>
        ) : (
          <div className="text-center py-16 text-muted">{t("cases-no-cases")}</div>
        )
      ) : (
        <div className="space-y-4">
          {visibleCases.map((item) => {
            const checklist = effectiveChecklists[item.id] ?? item.checklistDefaults;
            const progress = deriveChecklistProgress(checklist);

            return (
              <article key={item.id} className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-cream">{item.projectName}</h2>
                    <p className="text-sm text-muted mt-1">{t("cases-canton")} {item.canton}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-md border border-white/[0.12] text-muted">{item.regimeLabel}</span>
                    <span className={`px-2.5 py-1 rounded-md border font-medium ${statusClass[item.status]}`}>{item.statusLabel}</span>
                    <span className="px-2.5 py-1 rounded-md border border-emerald-500/30 text-emerald-300 bg-emerald-500/[0.08]">{progress.label}</span>
                    {(protocolCounts[item.id] ?? 0) > 0 && (
                      <span className="px-2.5 py-1 rounded-md border border-blue-500/30 text-blue-300 bg-blue-500/[0.08]">
                        {protocolCounts[item.id]} {t("cases-protocols")}
                      </span>
                    )}
                    <button onClick={() => handleDeleteCase(item.id, item.projectName)} className="ml-2 p-1.5 rounded-md text-muted/40 hover:text-red-400 hover:bg-red-400/[0.06] transition-colors" title={t("cases-delete")}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm mb-5">
                  <InfoCell label={t("cases-contract-date")} value={item.contractDateLabel} />
                  <InfoCell label={t("cases-defect-discovered")} value={item.discoveryDateLabel} />
                  <InfoCell label={t("cases-60day-notice")} value={item.noticeApplies ? t("cases-applies") : t("cases-not-fixed")} />
                  <InfoCell label={t("cases-notice-deadline")} value={item.noticeDeadlineLabel} />
                </div>

                <details className="rounded-xl border border-white/[0.07] p-4 bg-white/[0.01]">
                  <summary className="cursor-pointer text-sm font-semibold text-cream">{t("cases-detail-summary")}</summary>
                  <div className="mt-4 grid md:grid-cols-3 gap-3 text-sm mb-4">
                    <InfoCell label={t("cases-next-legal-action")} value={item.nextAction} />
                    <InfoCell label={t("cases-deadline-countdown")} value={item.deadlineCountdownLabel} valueClassName={countdownClass[item.deadlineCountdownTone]} />
                    <InfoCell
                      label={t("cases-reminder-readiness")}
                      value={[
                        item.reminderReadiness.calendarExportReady ? t("cases-calendar-ready") : t("cases-calendar-pending"),
                        item.reminderReadiness.emailReminderPlanned ? t("cases-email-planned") : t("cases-email-not-planned"),
                        item.reminderReadiness.evidenceComplete ? t("cases-evidence-complete") : t("cases-evidence-incomplete"),
                      ].join(" · ")}
                    />
                  </div>

                  <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3 space-y-2">
                    <div className="text-xs uppercase tracking-[0.08em] text-muted/70">{t("cases-followup-checklist")}</div>
                    {Object.entries(checklistLabels).map(([key, label]) => {
                      const checklistKey = key as FollowUpChecklistKey;
                      return (
                        <label key={key} className="flex items-center gap-2 text-sm text-cream">
                          <input type="checkbox" checked={checklist[checklistKey]} onChange={() => toggleChecklistItem(item.id, checklistKey)} />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>

                  {isDeadlineReminderIcsExportEligible(item) && (
                    <div className="mt-4 flex justify-end">
                      <button type="button" onClick={() => downloadCaseReminder(item)} className="rounded-lg border border-white/[0.14] px-3 py-2 text-sm text-cream hover:bg-white/[0.06]">
                        {t("cases-export-ics")}
                      </button>
                    </div>
                  )}
                </details>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InfoCell({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.01] p-3">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted/60 mb-1">{label}</div>
      <div className={valueClassName ?? "text-cream"}>{value}</div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="text-sm text-muted">
      <span className="block text-[11px] uppercase tracking-[0.08em] text-muted/60 mb-1">{label}</span>
      <select className="w-full rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-cream" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-black text-cream">{option.label}</option>
        ))}
      </select>
    </label>
  );
}
