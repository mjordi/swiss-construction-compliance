"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { getSupabase } from "@/lib/supabase";
import { normalizeFollowUpChecklistState } from "@/lib/cases-checklist";
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
import { buildDashboardProtocolHref } from "@/lib/dashboard-linked-case";
import { buildCaseVaultHref } from "@/lib/vault";
import { sanitizeDateQueryParam, validateRuegefristInput } from "@/lib/legal-utils";
import type { TranslationKey } from "@/locales";

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
  if (value === "ok" || value === "warning" || value === "urgent" || value === "expired" || value === "triage") {
    return value;
  }
  return "all";
}

function parseSortMode(value: string | null): CaseSortMode {
  if (value === "most-urgent") return value;
  return "nearest-deadline";
}

type CaseFormState = {
  projectName: string;
  canton: string;
  contractDate: string;
  discoveryDate: string;
};

const EMPTY_CASE_FORM: CaseFormState = {
  projectName: "",
  canton: "ZH",
  contractDate: "",
  discoveryDate: "",
};

function buildCaseFormState(item: Pick<Case, "project_name" | "canton" | "contract_date" | "discovery_date">): CaseFormState {
  return {
    projectName: item.project_name,
    canton: item.canton,
    contractDate: item.contract_date.slice(0, 10),
    discoveryDate: item.discovery_date.slice(0, 10),
  };
}

function formatCaseReminderReadiness(item: ComplianceCaseViewModel, t: (key: TranslationKey) => string) {
  const calendarReadiness = item.noticeApplies
    ? item.reminderReadiness.calendarExportReady
      ? t("cases-calendar-ready")
      : t("cases-calendar-pending")
    : t("cases-calendar-not-applicable");

  return [
    calendarReadiness,
    item.reminderReadiness.evidenceComplete ? t("cases-evidence-complete") : t("cases-evidence-incomplete"),
  ].join(" · ");
}

export default function CasesPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const supabase = useMemo(() => getSupabase(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [dbCases, setDbCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const createInFlightRef = useRef(false);
  const [formData, setFormData] = useState<CaseFormState>(EMPTY_CASE_FORM);
  const [createError, setCreateError] = useState<TranslationKey | null>(null);
  const [deleteError, setDeleteError] = useState<TranslationKey | null>(null);
  const [deletingCaseIds, setDeletingCaseIds] = useState<Record<string, boolean>>({});
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<CaseFormState>(EMPTY_CASE_FORM);
  const [updatingCaseId, setUpdatingCaseId] = useState<string | null>(null);
  const [caseUpdateFeedback, setCaseUpdateFeedback] = useState<{ caseId: string; key: TranslationKey; tone: "success" | "error" } | null>(null);

  const [regimeFilter, setRegimeFilter] = useState<CaseRegimeFilter>(() => parseRegimeFilter(searchParams.get("regime")));
  const [statusFilter, setStatusFilter] = useState<CaseStatusFilter>(() => parseStatusFilter(searchParams.get("status")));
  const [sortMode, setSortMode] = useState<CaseSortMode>(() => parseSortMode(searchParams.get("sort")));
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("q") ?? "");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [shareLinkFeedback, setShareLinkFeedback] = useState<TranslationKey | null>(null);
  const [initialLoadError, setInitialLoadError] = useState<TranslationKey | null>(null);
  const shareLinkResetTimerRef = useRef<number | null>(null);
  const shareLinkRequestIdRef = useRef(0);
  const [reminderExportFeedbackByCase, setReminderExportFeedbackByCase] = useState<
    Record<string, { key: TranslationKey; tone: "success" | "error" }>
  >({});
  const reminderExportResetTimersRef = useRef<Record<string, number>>({});
  const reminderExportRequestIdsRef = useRef<Record<string, number>>({});
  const [checklistSaveErrorByCase, setChecklistSaveErrorByCase] = useState<Record<string, TranslationKey>>({});
  const [checklistSavingByCase, setChecklistSavingByCase] = useState<Record<string, boolean>>({});
  const [protocolCounts, setProtocolCounts] = useState<Record<string, number>>({});
  const latestFetchIdRef = useRef(0);
  const hasLoadedInitialCasesRef = useRef(false);
  const lastSuccessfulCasesRef = useRef<Case[]>([]);
  const lastSuccessfulProtocolCountsRef = useRef<Record<string, number>>({});
  const filterStateRef = useRef({
    regimeFilter,
    statusFilter,
    sortMode,
    searchTerm,
  });
  const skipNextUrlWriteRef = useRef(false);

  const runCasesRefresh = useCallback(async (fetchId: number) => {
    if (!user) {
      hasLoadedInitialCasesRef.current = false;
      lastSuccessfulCasesRef.current = [];
      lastSuccessfulProtocolCountsRef.current = {};
      setDbCases([]);
      setProtocolCounts({});
      setInitialLoadError(null);
      setLoading(false);
      return;
    }

    try {
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

      if (fetchId !== latestFetchIdRef.current) return;

      if (casesResult.error || protocolsResult.error) {
        if (!hasLoadedInitialCasesRef.current) {
          setDbCases([]);
          setProtocolCounts({});
          setInitialLoadError("cases-load-error");
        } else {
          setDbCases(lastSuccessfulCasesRef.current);
          setProtocolCounts(lastSuccessfulProtocolCountsRef.current);
        }
        setLoading(false);
        return;
      }

      hasLoadedInitialCasesRef.current = true;
      setInitialLoadError(null);
      setDbCases((casesResult.data as Case[]) ?? []);
      if (protocolsResult.data) {
        const counts: Record<string, number> = {};
        for (const p of protocolsResult.data) {
          if (p.case_id) counts[p.case_id] = (counts[p.case_id] || 0) + 1;
        }
        lastSuccessfulProtocolCountsRef.current = counts;
        setProtocolCounts(counts);
      } else {
        lastSuccessfulProtocolCountsRef.current = {};
        setProtocolCounts({});
      }
      lastSuccessfulCasesRef.current = (casesResult.data as Case[]) ?? [];
      setLoading(false);
    } catch {
      if (fetchId !== latestFetchIdRef.current) return;
      if (!hasLoadedInitialCasesRef.current) {
        setDbCases([]);
        setProtocolCounts({});
        setInitialLoadError("cases-load-error");
      } else {
        setDbCases(lastSuccessfulCasesRef.current);
        setProtocolCounts(lastSuccessfulProtocolCountsRef.current);
      }
      setLoading(false);
    }
  }, [user, supabase]);

  const triggerCasesRefresh = useCallback(() => {
    const fetchId = ++latestFetchIdRef.current;
    setLoading(true);
    setInitialLoadError(null);
    void runCasesRefresh(fetchId);
  }, [runCasesRefresh]);

  useEffect(() => {
    queueMicrotask(() => {
      triggerCasesRefresh();
    });
  }, [triggerCasesRefresh]);

  useEffect(() => {
    filterStateRef.current = {
      regimeFilter,
      statusFilter,
      sortMode,
      searchTerm,
    };
  }, [regimeFilter, statusFilter, sortMode, searchTerm]);

  const searchParamString = searchParams.toString();

  useEffect(() => {
    const params = new URLSearchParams(searchParamString);
    const nextRegime = parseRegimeFilter(params.get("regime"));
    const nextStatus = parseStatusFilter(params.get("status"));
    const nextSort = parseSortMode(params.get("sort"));
    const nextSearch = params.get("q") ?? "";
    const rawHandoffContractDate = params.get("contract");
    const rawHandoffDiscoveryDate = params.get("discovery");
    const handoffContractDate = sanitizeDateQueryParam(rawHandoffContractDate);
    const handoffDiscoveryDate = sanitizeDateQueryParam(rawHandoffDiscoveryDate);
    const hasCaseHandoffParams = rawHandoffContractDate !== null || rawHandoffDiscoveryDate !== null;
    const sanitizedParams = new URLSearchParams(params);

    if (params.has("regime") && nextRegime === "all") sanitizedParams.delete("regime");
    if (params.has("status") && nextStatus === "all") sanitizedParams.delete("status");
    if (params.has("sort") && nextSort === "nearest-deadline") sanitizedParams.delete("sort");
    if (hasCaseHandoffParams) {
      sanitizedParams.delete("contract");
      sanitizedParams.delete("discovery");
    }

    if (handoffContractDate || handoffDiscoveryDate) {
      setCreateError(null);
      setShowForm(true);
      setFormData((current) => ({
        ...current,
        contractDate: handoffContractDate ?? current.contractDate,
        discoveryDate: handoffDiscoveryDate ?? current.discoveryDate,
      }));
    }

    const sanitizedSearch = sanitizedParams.toString();
    if (sanitizedSearch !== searchParamString) {
      router.replace(sanitizedSearch ? `${pathname}?${sanitizedSearch}` : pathname, { scroll: false });
    }

    const currentFilters = filterStateRef.current;

    const needsSync =
      currentFilters.regimeFilter !== nextRegime ||
      currentFilters.statusFilter !== nextStatus ||
      currentFilters.sortMode !== nextSort ||
      currentFilters.searchTerm !== nextSearch;

    if (!needsSync) return;

    skipNextUrlWriteRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      setRegimeFilter(nextRegime);
      setStatusFilter(nextStatus);
      setSortMode(nextSort);
      setSearchTerm(nextSearch);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [searchParamString, pathname, router]);

  useEffect(() => {
    if (skipNextUrlWriteRef.current) {
      skipNextUrlWriteRef.current = false;
      return;
    }

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
    return () => {
      shareLinkRequestIdRef.current += 1;
      if (shareLinkResetTimerRef.current !== null) {
        window.clearTimeout(shareLinkResetTimerRef.current);
      }
      for (const timer of Object.values(reminderExportResetTimersRef.current)) {
        window.clearTimeout(timer);
      }
      reminderExportResetTimersRef.current = {};
      reminderExportRequestIdsRef.current = {};
    };
  }, []);

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

  // Derive effective checklists by layering persisted checklist state over timeline defaults.
  const effectiveChecklists = useMemo(() => {
    const persistedByCaseId = new Map(
      dbCases.map((c) => [c.id, c.checklist as Partial<FollowUpChecklistState> | null | undefined])
    );
    const result: Record<string, FollowUpChecklistState> = {};

    for (const item of cases) {
      result[item.id] = normalizeFollowUpChecklistState({
        ...item.checklistDefaults,
        ...persistedByCaseId.get(item.id),
      });
    }

    return result;
  }, [cases, dbCases]);

  const searchScopedCases = useMemo(() => {
    const filtered = applyComplianceCaseView(cases, regimeFilter, "all", sortMode);
    const query = searchTerm.trim().toLowerCase();
    if (!query) return filtered;

    return filtered.filter((item) =>
      `${item.projectName} ${item.canton}`.toLowerCase().includes(query)
    );
  }, [cases, regimeFilter, sortMode, searchTerm]);

  const visibleCases = useMemo(() => {
    if (statusFilter === "all") return searchScopedCases;
    if (statusFilter === "triage") {
      return searchScopedCases.filter(
        (item) => item.status === "urgent" || item.status === "expired" || item.status === "immediate-notice"
      );
    }
    if (statusFilter === "urgent") {
      return searchScopedCases.filter(
        (item) => item.status === "urgent" || item.status === "immediate-notice"
      );
    }
    return searchScopedCases.filter((item) => item.status === statusFilter);
  }, [searchScopedCases, statusFilter]);

  const statusCounters = useMemo(
    () => ({
      ok: searchScopedCases.filter((item) => item.status === "ok").length,
      warning: searchScopedCases.filter((item) => item.status === "warning").length,
      urgent: searchScopedCases.filter((item) => item.status === "urgent" || item.status === "immediate-notice").length,
      expired: searchScopedCases.filter((item) => item.status === "expired").length,
      triage: searchScopedCases.filter(
        (item) => item.status === "urgent" || item.status === "expired" || item.status === "immediate-notice"
      ).length,
    }),
    [searchScopedCases]
  );

  const shareViewQuery = useMemo(() => {
    const params = new URLSearchParams();

    if (regimeFilter !== "all") params.set("regime", regimeFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (sortMode !== "nearest-deadline") params.set("sort", sortMode);
    if (searchTerm.trim()) params.set("q", searchTerm.trim());

    return params.toString();
  }, [regimeFilter, statusFilter, sortMode, searchTerm]);

  const hasActiveFilters = shareViewQuery.length > 0;

  function updateFormData(next: CaseFormState) {
    setCreateError(null);
    setFormData(next);
  }

  function resetCaseForm() {
    setFormData(EMPTY_CASE_FORM);
  }

  function updateEditForm(next: CaseFormState) {
    setCaseUpdateFeedback(null);
    setEditFormData(next);
  }

  function resetEditForm() {
    setEditFormData(EMPTY_CASE_FORM);
  }

  function openEditForm(item: Case) {
    if (updatingCaseId || hasDeletingCases) return;
    setCaseUpdateFeedback(null);
    setEditingCaseId(item.id);
    setEditFormData(buildCaseFormState(item));
  }

  function closeEditForm() {
    if (updatingCaseId) return;
    setEditingCaseId(null);
    resetEditForm();
  }

  function closeCreateForm() {
    setCreateError(null);
    resetCaseForm();
    setShowForm(false);
  }

  function clearShareLinkFeedback() {
    shareLinkRequestIdRef.current += 1;
    if (shareLinkResetTimerRef.current !== null) {
      window.clearTimeout(shareLinkResetTimerRef.current);
      shareLinkResetTimerRef.current = null;
    }
    setShareLinkFeedback(null);
  }

  function clearReminderExportFeedback(caseId: string) {
    reminderExportRequestIdsRef.current[caseId] = (reminderExportRequestIdsRef.current[caseId] ?? 0) + 1;
    const timer = reminderExportResetTimersRef.current[caseId];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      const nextTimers = { ...reminderExportResetTimersRef.current };
      delete nextTimers[caseId];
      reminderExportResetTimersRef.current = nextTimers;
    }
    setReminderExportFeedbackByCase((current) => {
      if (!(caseId in current)) return current;
      const next = { ...current };
      delete next[caseId];
      return next;
    });
  }

  function showTemporaryReminderExportFeedback(
    caseId: string,
    key: TranslationKey,
    tone: "success" | "error",
    requestId: number
  ) {
    const existingTimer = reminderExportResetTimersRef.current[caseId];
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
    }

    setReminderExportFeedbackByCase((current) => ({
      ...current,
      [caseId]: { key, tone },
    }));

    reminderExportResetTimersRef.current = {
      ...reminderExportResetTimersRef.current,
      [caseId]: window.setTimeout(() => {
        if (reminderExportRequestIdsRef.current[caseId] !== requestId) return;
        setReminderExportFeedbackByCase((current) => {
          if (!(caseId in current)) return current;
          const next = { ...current };
          delete next[caseId];
          return next;
        });
        const nextTimers = { ...reminderExportResetTimersRef.current };
        delete nextTimers[caseId];
        reminderExportResetTimersRef.current = nextTimers;
      }, 2000),
    };
  }

  useEffect(() => {
    clearShareLinkFeedback();
  }, [shareViewQuery]);

  const caseDateValidationError = useMemo(() => {
    if (!formData.contractDate || !formData.discoveryDate) return null;
    return validateRuegefristInput(
      new Date(formData.contractDate),
      new Date(formData.discoveryDate)
    );
  }, [formData.contractDate, formData.discoveryDate]);

  const editCaseDateValidationError = useMemo(() => {
    if (!editFormData.contractDate || !editFormData.discoveryDate) return null;
    return validateRuegefristInput(
      new Date(editFormData.contractDate),
      new Date(editFormData.discoveryDate)
    );
  }, [editFormData.contractDate, editFormData.discoveryDate]);

  const hasDeletingCases = Object.keys(deletingCaseIds).length > 0;

  const checklistLabels: Record<FollowUpChecklistKey, string> = {
    defectDocumented: t("cases-checklist-defect-documented"),
    evidenceAttached: t("cases-checklist-evidence-attached"),
    noticeDrafted: t("cases-checklist-notice-drafted"),
    calendarReminderExported: t("cases-checklist-calendar-exported"),
  };

  async function setChecklistItem(caseId: string, key: FollowUpChecklistKey, value: boolean) {
    if (checklistSavingByCase[caseId]) {
      return;
    }

    const previous = normalizeFollowUpChecklistState(effectiveChecklists[caseId]);
    const updated = normalizeFollowUpChecklistState({
      ...previous,
      [key]: value,
    });

    setChecklistSaveErrorByCase((current) => {
      if (!(caseId in current)) return current;
      const next = { ...current };
      delete next[caseId];
      return next;
    });
    setChecklistSavingByCase((current) => ({ ...current, [caseId]: true }));
    const applyChecklistState = (cases: Case[], checklist: FollowUpChecklistState) =>
      cases.map((item) =>
        item.id === caseId
          ? {
              ...item,
              checklist,
            }
          : item
      );

    setDbCases((current) => applyChecklistState(current, updated));

    try {
      const { error } = await supabase
        .from("cases")
        .update({ checklist: updated, updated_at: new Date().toISOString() })
        .eq("id", caseId);

      if (error) {
        throw error;
      }

      lastSuccessfulCasesRef.current = applyChecklistState(lastSuccessfulCasesRef.current, updated);
      setDbCases((current) => applyChecklistState(current, updated));
    } catch {
      setDbCases((current) => applyChecklistState(current, previous));
      setChecklistSaveErrorByCase((prev) => ({
        ...prev,
        [caseId]: "cases-checklist-save-error",
      }));
    } finally {
      setChecklistSavingByCase((current) => {
        const next = { ...current };
        delete next[caseId];
        return next;
      });
    }
  }

  function toggleChecklistItem(caseId: string, key: FollowUpChecklistKey) {
    const previous = normalizeFollowUpChecklistState(effectiveChecklists[caseId]);
    void setChecklistItem(caseId, key, !previous[key]);
  }

  function downloadCaseReminder(item: ComplianceCaseViewModel) {
    clearReminderExportFeedback(item.id);
    const requestId = reminderExportRequestIdsRef.current[item.id] ?? 0;

    try {
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
      showTemporaryReminderExportFeedback(item.id, "cases-export-ics-ready", "success", requestId);
      void setChecklistItem(item.id, "calendarReminderExported", true);
    } catch {
      showTemporaryReminderExportFeedback(item.id, "cases-export-ics-error", "error", requestId);
    }
  }

  async function handleAddCase(e: React.FormEvent) {
    e.preventDefault();
    if (
      createInFlightRef.current ||
      !user ||
      !formData.projectName ||
      !formData.contractDate ||
      !formData.discoveryDate ||
      caseDateValidationError
    ) {
      return;
    }
    createInFlightRef.current = true;
    setSaving(true);

    try {
      const { error } = await supabase.from("cases").insert({
        user_id: user.id,
        project_name: formData.projectName,
        canton: formData.canton,
        contract_date: formData.contractDate,
        discovery_date: formData.discoveryDate,
      });

      if (error) {
        throw error;
      }

      setCreateError(null);
      resetCaseForm();
      setShowForm(false);
      triggerCasesRefresh();
    } catch {
      setCreateError("cases-create-error");
    } finally {
      createInFlightRef.current = false;
      setSaving(false);
    }
  }

  async function handleDeleteCase(caseId: string, projectName: string) {
    if (updatingCaseId) return;
    const confirmText = t("cases-delete-confirm").replace("{projectName}", projectName);
    const confirmed = window.confirm(confirmText);
    if (!confirmed) return;

    setDeletingCaseIds((current) => ({ ...current, [caseId]: true }));

    try {
      const { error } = await supabase.from("cases").delete().eq("id", caseId);
      if (error) {
        throw error;
      }

      setDeleteError(null);
      setDbCases((current) => {
        const next = current.filter((item) => item.id !== caseId);
        lastSuccessfulCasesRef.current = next;
        return next;
      });
      setProtocolCounts((current) => {
        if (!(caseId in current)) {
          lastSuccessfulProtocolCountsRef.current = current;
          return current;
        }
        const next = { ...current };
        delete next[caseId];
        lastSuccessfulProtocolCountsRef.current = next;
        return next;
      });
      if (editingCaseId === caseId) {
        closeEditForm();
      }
      setCaseUpdateFeedback((current) => {
        if (!current || current.caseId !== caseId) return current;
        return null;
      });
      setChecklistSaveErrorByCase((prev) => {
        if (!(caseId in prev)) return prev;
        const next = { ...prev };
        delete next[caseId];
        return next;
      });
      setChecklistSavingByCase((prev) => {
        if (!(caseId in prev)) return prev;
        const next = { ...prev };
        delete next[caseId];
        return next;
      });
      triggerCasesRefresh();
    } catch {
      setDeleteError("cases-delete-error");
    } finally {
      setDeletingCaseIds((current) => {
        if (!(caseId in current)) return current;
        const next = { ...current };
        delete next[caseId];
        return next;
      });
    }
  }

  async function handleUpdateCase(caseId: string) {
    if (
      !editFormData.projectName ||
      !editFormData.contractDate ||
      !editFormData.discoveryDate ||
      editCaseDateValidationError ||
      updatingCaseId ||
      hasDeletingCases
    ) {
      return;
    }

    setUpdatingCaseId(caseId);

    try {
      const payload = {
        project_name: editFormData.projectName,
        canton: editFormData.canton,
        contract_date: editFormData.contractDate,
        discovery_date: editFormData.discoveryDate,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("cases").update(payload).eq("id", caseId);

      if (error) {
        throw error;
      }

      const applyUpdatedCase = (cases: Case[]) =>
        cases.map((item) =>
          item.id === caseId
            ? {
                ...item,
                ...payload,
              }
            : item
        );

      lastSuccessfulCasesRef.current = applyUpdatedCase(lastSuccessfulCasesRef.current);
      setDbCases((current) => applyUpdatedCase(current));
      closeEditForm();
      setCaseUpdateFeedback({ caseId, key: "cases-update-success", tone: "success" });
      triggerCasesRefresh();
    } catch {
      setCaseUpdateFeedback({ caseId, key: "cases-update-error", tone: "error" });
    } finally {
      setUpdatingCaseId(null);
    }
  }

  async function copyShareLink() {
    const url = new URL(window.location.href);
    url.search = shareViewQuery;

    if (shareLinkResetTimerRef.current !== null) {
      window.clearTimeout(shareLinkResetTimerRef.current);
      shareLinkResetTimerRef.current = null;
    }

    const requestId = shareLinkRequestIdRef.current + 1;
    shareLinkRequestIdRef.current = requestId;

    try {
      await navigator.clipboard.writeText(url.toString());
      if (requestId !== shareLinkRequestIdRef.current) return;
      setShareLinkFeedback("cases-share-link-copied");
    } catch {
      if (requestId !== shareLinkRequestIdRef.current) return;
      setShareLinkFeedback("cases-share-link-error");
    }

    shareLinkResetTimerRef.current = window.setTimeout(() => {
      if (requestId !== shareLinkRequestIdRef.current) return;
      setShareLinkFeedback(null);
      shareLinkResetTimerRef.current = null;
    }, 2000);
  }

  function clearFilters() {
    setRegimeFilter("all");
    setStatusFilter("all");
    setSortMode("nearest-deadline");
    setSearchTerm("");
  }

  if (loading && !hasLoadedInitialCasesRef.current) {
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
          disabled={saving}
          onClick={() => {
            if (saving) return;
            setCreateError(null);
            setShowForm((current) => {
              if (current) {
                resetCaseForm();
              }
              return !current;
            });
          }}
          className="bg-accent hover:bg-accent/90 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors duration-300 text-[13px] font-semibold shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> {t("cases-add-case")}
        </button>
      </div>

      {/* Add case form */}
      {showForm && (
        <form onSubmit={handleAddCase} className="mb-8 p-6 rounded-2xl bg-white/[0.02] border border-accent/20">
          <h3 className="text-[15px] font-semibold text-cream mb-4">{t("cases-add-title")}</h3>
          {createError && (
            <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/[0.08] px-4 py-3 text-sm text-red-100">
              {t(createError)}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="cases-project-name" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("cases-project-name")}</label>
              <input id="cases-project-name" type="text" value={formData.projectName} onChange={(e) => updateFormData({ ...formData, projectName: e.target.value })} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60" disabled={saving} required />
            </div>
            <div>
              <label htmlFor="cases-canton" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("cases-canton-label")}</label>
              <select id="cases-canton" value={formData.canton} onChange={(e) => updateFormData({ ...formData, canton: e.target.value })} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none disabled:cursor-not-allowed disabled:opacity-60" disabled={saving}>
                {SWISS_CANTONS.map((c) => <option key={c} value={c} className="bg-black text-cream">{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="cases-contract-date" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("cases-contract-date-input")}</label>
              <input id="cases-contract-date" type="date" value={formData.contractDate} onChange={(e) => updateFormData({ ...formData, contractDate: e.target.value })} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-60" disabled={saving} required />
            </div>
            <div>
              <label htmlFor="cases-discovery-date" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("cases-discovery-date-input")}</label>
              <input id="cases-discovery-date" type="date" value={formData.discoveryDate} onChange={(e) => updateFormData({ ...formData, discoveryDate: e.target.value })} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-60" disabled={saving} required />
              {caseDateValidationError === "discovery-before-contract" && (
                <p className="mt-2 text-xs text-red-400">{t("calc-discovery-before-contract")}</p>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving || !!caseDateValidationError} className="px-5 py-2.5 bg-accent hover:bg-accent/90 text-white font-semibold rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} {t("cases-save")}
            </button>
            <button type="button" onClick={closeCreateForm} disabled={saving} className="px-5 py-2.5 bg-white/[0.03] border border-white/[0.06] text-muted hover:text-cream font-medium rounded-lg text-sm disabled:cursor-not-allowed disabled:opacity-50">
              {t("cases-cancel")}
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <section className="mb-6 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted/70">{t("cases-all")}</div>
            <div className="text-lg font-semibold text-cream">{visibleCases.length}</div>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === "triage" ? "all" : "triage"))}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              statusFilter === "triage"
                ? "border-orange-400/60 bg-orange-500/[0.16]"
                : "border-orange-500/30 bg-orange-500/[0.08] hover:bg-orange-500/[0.12]"
            }`}
            aria-pressed={statusFilter === "triage"}
          >
            <div className="text-[11px] uppercase tracking-[0.08em] text-orange-200/70">{t("cases-status-triage")}</div>
            <div className="text-lg font-semibold text-orange-200">{statusCounters.triage}</div>
          </button>
          <label className="text-sm text-muted">
            <span className="block text-[11px] uppercase tracking-[0.08em] text-muted/60 mb-1">{t("cases-search-label")}</span>
            <div className="relative">
              <input
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
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <StatusCountCard
            label={t("cases-status-on-track")}
            count={statusCounters.ok}
            active={statusFilter === "ok"}
            tone="ok"
            onClick={() => setStatusFilter((prev) => (prev === "ok" ? "all" : "ok"))}
          />
          <StatusCountCard
            label={t("cases-status-attention")}
            count={statusCounters.warning}
            active={statusFilter === "warning"}
            tone="warning"
            onClick={() => setStatusFilter((prev) => (prev === "warning" ? "all" : "warning"))}
          />
          <StatusCountCard
            label={t("cases-status-urgent")}
            count={statusCounters.urgent}
            active={statusFilter === "urgent"}
            tone="urgent"
            onClick={() => setStatusFilter((prev) => (prev === "urgent" ? "all" : "urgent"))}
          />
          <StatusCountCard
            label={t("cases-status-expired")}
            count={statusCounters.expired}
            active={statusFilter === "expired"}
            tone="expired"
            onClick={() => setStatusFilter((prev) => (prev === "expired" ? "all" : "expired"))}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <FilterSelect label={t("cases-filter-regime")} value={regimeFilter} onChange={(v) => setRegimeFilter(v as CaseRegimeFilter)} options={[{ value: "all", label: t("cases-all") }, { value: "old", label: t("cases-old-law") }, { value: "new", label: t("cases-new-law") }]} />
          <FilterSelect label={t("cases-filter-status")} value={statusFilter} onChange={(v) => setStatusFilter(v as CaseStatusFilter)} options={[{ value: "all", label: t("cases-all") }, { value: "triage", label: t("cases-status-triage") }, { value: "ok", label: t("cases-status-on-track") }, { value: "warning", label: t("cases-status-attention") }, { value: "urgent", label: t("cases-status-urgent") }, { value: "expired", label: t("cases-status-expired") }]} />
          <FilterSelect label={t("cases-filter-sort")} value={sortMode} onChange={(v) => setSortMode(v as CaseSortMode)} options={[{ value: "nearest-deadline", label: t("cases-sort-nearest") }, { value: "most-urgent", label: t("cases-sort-urgent") }]} />
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={copyShareLink}
              className="px-3 py-1.5 rounded-lg border border-white/[0.12] text-xs font-medium text-cream hover:bg-white/[0.06]"
            >
              {shareLinkFeedback ? t(shareLinkFeedback) : t("cases-share-link")}
            </button>
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
      {deleteError && (
        <div role="alert" className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/[0.08] px-5 py-4 text-sm text-red-100">
          <p>{t(deleteError)}</p>
        </div>
      )}
      {initialLoadError ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/30 bg-red-500/[0.08] px-5 py-4 text-sm text-red-100"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>{t(initialLoadError)}</p>
            <button
              type="button"
              onClick={triggerCasesRefresh}
              className="rounded-lg border border-red-200/30 px-4 py-2 font-medium text-red-50 hover:bg-red-500/[0.12]"
            >
              {t("cases-load-retry")}
            </button>
          </div>
        </div>
      ) : visibleCases.length === 0 ? (
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
            const isChecklistSaving = Boolean(checklistSavingByCase[item.id]);

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
                    <span className="px-2.5 py-1 rounded-md border border-amber-500/30 text-amber-200 bg-amber-500/[0.08]">
                      {formatCaseReminderReadiness(item, t)}
                    </span>
                    {(protocolCounts[item.id] ?? 0) > 0 && (
                      <span className="px-2.5 py-1 rounded-md border border-blue-500/30 text-blue-300 bg-blue-500/[0.08]">
                        {protocolCounts[item.id]} {t("cases-protocols")}
                      </span>
                    )}
                    {isChecklistSaving ? (
                      <span
                        aria-disabled="true"
                        className="px-2.5 py-1 rounded-md border border-cyan-500/20 text-cyan-200/60 bg-cyan-500/[0.04] cursor-not-allowed"
                      >
                        {t("cases-open-in-vault")}
                      </span>
                    ) : (
                      <Link
                        href={buildCaseVaultHref(item.projectName)}
                        className="px-2.5 py-1 rounded-md border border-cyan-500/30 text-cyan-200 bg-cyan-500/[0.08] hover:bg-cyan-500/[0.14] transition-colors"
                      >
                        {t("cases-open-in-vault")}
                      </Link>
                    )}
                    {isChecklistSaving ? (
                      <span
                        aria-disabled="true"
                        className="px-2.5 py-1 rounded-md border border-blue-500/20 text-blue-200/60 bg-blue-500/[0.04] cursor-not-allowed"
                      >
                        {t("cases-create-protocol")}
                      </span>
                    ) : (
                      <Link
                        href={buildDashboardProtocolHref(item.id)}
                        className="px-2.5 py-1 rounded-md border border-blue-500/30 text-blue-200 bg-blue-500/[0.08] hover:bg-blue-500/[0.14] transition-colors"
                      >
                        {t("cases-create-protocol")}
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const dbCase = dbCases.find((dbItem) => dbItem.id === item.id);
                        if (!dbCase) return;
                        openEditForm(dbCase);
                      }}
                      disabled={Boolean(updatingCaseId) || hasDeletingCases || isChecklistSaving}
                      className="px-2.5 py-1 rounded-md border border-white/[0.14] text-cream hover:bg-white/[0.06] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("cases-edit")}
                    </button>
                    <button
                      onClick={() => handleDeleteCase(item.id, item.projectName)}
                      aria-label={t("cases-delete")}
                      className="ml-2 p-1.5 rounded-md text-muted/40 hover:text-red-400 hover:bg-red-400/[0.06] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      title={t("cases-delete")}
                      disabled={!!deletingCaseIds[item.id] || Boolean(updatingCaseId) || isChecklistSaving}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div
                  data-testid={`cases-action-snapshot-${item.id}`}
                  className="mb-5 grid gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-sm md:grid-cols-3"
                >
                  <InfoCell label={t("cases-next-legal-action")} value={item.nextAction} />
                  <InfoCell
                    label={t("cases-deadline-countdown")}
                    value={item.deadlineCountdownLabel}
                    valueClassName={countdownClass[item.deadlineCountdownTone]}
                  />
                  <InfoCell
                    label={t("cases-reminder-readiness")}
                    value={formatCaseReminderReadiness(item, t)}
                  />
                </div>

                {caseUpdateFeedback?.caseId === item.id && (
                  <div
                    role="alert"
                    className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                      caseUpdateFeedback.tone === "success"
                        ? "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-100"
                        : "border-red-500/30 bg-red-500/[0.08] text-red-100"
                    }`}
                  >
                    {t(caseUpdateFeedback.key)}
                  </div>
                )}

                {editingCaseId === item.id ? (
                  <form
                    className="mb-5 rounded-xl border border-accent/20 bg-white/[0.02] p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleUpdateCase(item.id);
                    }}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label htmlFor={`cases-edit-project-name-${item.id}`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                          {t("cases-project-name")}
                        </label>
                        <input
                          id={`cases-edit-project-name-${item.id}`}
                          type="text"
                          value={editFormData.projectName}
                          onChange={(event) => updateEditForm({ ...editFormData, projectName: event.target.value })}
                          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-cream outline-none transition-colors duration-200 focus:border-accent/40"
                          disabled={updatingCaseId === item.id || hasDeletingCases}
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor={`cases-edit-canton-${item.id}`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                          {t("cases-canton-label")}
                        </label>
                        <select
                          id={`cases-edit-canton-${item.id}`}
                          value={editFormData.canton}
                          onChange={(event) => updateEditForm({ ...editFormData, canton: event.target.value })}
                          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-cream outline-none focus:border-accent/40"
                          disabled={updatingCaseId === item.id || hasDeletingCases}
                        >
                          {SWISS_CANTONS.map((canton) => (
                            <option key={canton} value={canton} className="bg-black text-cream">
                              {canton}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`cases-edit-contract-date-${item.id}`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                          {t("cases-contract-date-input")}
                        </label>
                        <input
                          id={`cases-edit-contract-date-${item.id}`}
                          type="date"
                          value={editFormData.contractDate}
                          onChange={(event) => updateEditForm({ ...editFormData, contractDate: event.target.value })}
                          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-cream outline-none [color-scheme:dark] focus:border-accent/40"
                          disabled={updatingCaseId === item.id || hasDeletingCases}
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor={`cases-edit-discovery-date-${item.id}`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                          {t("cases-discovery-date-input")}
                        </label>
                        <input
                          id={`cases-edit-discovery-date-${item.id}`}
                          type="date"
                          value={editFormData.discoveryDate}
                          onChange={(event) => updateEditForm({ ...editFormData, discoveryDate: event.target.value })}
                          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-cream outline-none [color-scheme:dark] focus:border-accent/40"
                          disabled={updatingCaseId === item.id || hasDeletingCases}
                          required
                        />
                        {editCaseDateValidationError === "discovery-before-contract" && (
                          <p className="mt-2 text-xs text-red-400">{t("calc-discovery-before-contract")}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 flex gap-3">
                      <button
                        type="submit"
                        disabled={updatingCaseId === item.id || hasDeletingCases || !!editCaseDateValidationError}
                        className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {updatingCaseId === item.id && <Loader2 className="h-4 w-4 animate-spin" />} {t("cases-save")}
                      </button>
                      <button
                        type="button"
                        onClick={closeEditForm}
                        disabled={updatingCaseId === item.id || hasDeletingCases}
                        className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-muted hover:text-cream disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("cases-cancel")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm mb-5">
                    <InfoCell label={t("cases-contract-date")} value={item.contractDateLabel} />
                    <InfoCell label={t("cases-defect-discovered")} value={item.discoveryDateLabel} />
                    <InfoCell label={t("cases-60day-notice")} value={item.noticeApplies ? t("cases-applies") : t("cases-not-fixed")} />
                    <InfoCell label={t("cases-notice-deadline")} value={item.noticeDeadlineLabel} />
                  </div>
                )}

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
                        <label key={key} className={`flex items-center gap-2 text-sm text-cream ${isChecklistSaving ? "opacity-70" : ""}`}>
                          <input
                            type="checkbox"
                            checked={checklist[checklistKey]}
                            disabled={isChecklistSaving}
                            onChange={() => toggleChecklistItem(item.id, checklistKey)}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                    {checklistSaveErrorByCase[item.id] && (
                      <p className="text-xs text-rose-300">{t(checklistSaveErrorByCase[item.id])}</p>
                    )}
                  </div>

                  {isDeadlineReminderIcsExportEligible(item) && (
                    <div className="mt-4 flex flex-col items-end gap-2">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => downloadCaseReminder(item)}
                          disabled={isChecklistSaving}
                          className="rounded-lg border border-white/[0.14] px-3 py-2 text-sm text-cream hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {t("cases-export-ics")}
                        </button>
                      </div>
                      {reminderExportFeedbackByCase[item.id] && (
                        <p
                          role="status"
                          className={`text-xs ${
                            reminderExportFeedbackByCase[item.id].tone === "success"
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }`}
                        >
                          {t(reminderExportFeedbackByCase[item.id].key)}
                        </p>
                      )}
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

function StatusCountCard({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone: "ok" | "warning" | "urgent" | "expired";
  onClick: () => void;
}) {
  const baseTone = {
    ok: "border-green-500/25 bg-green-500/[0.06] text-green-200",
    warning: "border-yellow-500/30 bg-yellow-500/[0.08] text-yellow-200",
    urgent: "border-orange-500/30 bg-orange-500/[0.08] text-orange-200",
    expired: "border-red-500/30 bg-red-500/[0.08] text-red-200",
  }[tone];

  const activeTone = {
    ok: "border-green-400/60 bg-green-500/[0.16]",
    warning: "border-yellow-400/60 bg-yellow-500/[0.16]",
    urgent: "border-orange-400/60 bg-orange-500/[0.16]",
    expired: "border-red-400/60 bg-red-500/[0.16]",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border px-3 py-2 text-left transition-colors ${baseTone} ${active ? activeTone : "hover:bg-white/[0.08]"}`}
    >
      <div className="text-[11px] uppercase tracking-[0.08em] opacity-80">{label}</div>
      <div className="text-lg font-semibold">{count}</div>
    </button>
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
