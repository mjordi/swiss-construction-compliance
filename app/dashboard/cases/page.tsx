"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import PageHeader from "@/components/dashboard/PageHeader";
import { AuditReportPDF } from "@/components/dashboard/AuditReportPDF";
import { CaseAuditDossierPDF } from "@/components/dashboard/CaseAuditDossierPDF";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { getSupabase } from "@/lib/supabase";
import {
  removeCaseEvidenceObjects,
  scheduleCaseEvidenceCleanupRetry,
} from "@/lib/case-evidence-cleanup";
import { normalizeFollowUpChecklistState } from "@/lib/cases-checklist";
import { buildCaseAuditDossier } from "@/lib/case-audit-dossier";
import { buildFinalizedProtocolReportFromRecord } from "@/lib/protocol-report";
import type { Case, CaseActivityEvent, CaseNoticeDraft, Protocol } from "@/lib/database.types";
import { buildCaseNoticeDraftPayload } from "@/lib/case-notice-draft";
import {
  applyComplianceCaseView,
  buildCaseAuditRegisterCsv,
  buildCaseDeadlineReminderICS,
  buildCaseLegalChronologyCsv,
  buildComplianceCaseTimeline,
  deriveCaseLegalMilestones,
  deriveChecklistProgress,
  isDeadlineReminderIcsExportEligible,
  type ComplianceCaseInput,
  type ComplianceCaseViewModel,
  type FollowUpChecklistKey,
  type FollowUpChecklistState,
  type CaseLegalMilestoneKind,
  type LinkedCaseEvidenceEvent,
  type LinkedCaseProtocolEvent,
  type CaseRegimeFilter,
  type CaseSortMode,
  type CaseStatusFilter,
} from "@/lib/case-timeline";
import { buildDashboardProtocolHref } from "@/lib/dashboard-linked-case";
import { buildCaseVaultHref } from "@/lib/vault";
import {
  formatDateCH,
  formatTimestampDateCH,
  getMillisecondsUntilNextSwissCalendarDay,
  sanitizeDateQueryParam,
  validateRuegefristInput,
} from "@/lib/legal-utils";
import type { TranslationKey } from "@/locales";

type LinkedProtocolRow = Pick<
  Protocol,
  | "id"
  | "case_id"
  | "status"
  | "created_at"
>;

type FinalizedProtocolPdfRow = Pick<
  Protocol,
  | "id"
  | "case_id"
  | "status"
  | "created_at"
  | "project_name"
  | "contractor"
  | "client"
  | "defect_description"
  | "signature_data"
> & { status: "finalized" };

type FinalizedLinkedProtocolRow = LinkedProtocolRow & { status: "finalized" };

function isFinalizedLinkedProtocol(
  protocol: LinkedProtocolRow
): protocol is FinalizedLinkedProtocolRow {
  return protocol.status === "finalized";
}

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

const milestoneDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Zurich",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatMilestoneDateTime(date: Date): string {
  const parts = Object.fromEntries(
    milestoneDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatNoticeDraftDate(value: string): string {
  return formatDateCH(new Date(`${value}T00:00:00.000Z`));
}

const noticeDraftTimestampLocales = {
  de: "de-CH",
  fr: "fr-CH",
  it: "it-CH",
  en: "en-CH",
} as const;

function formatNoticeDraftCreatedAt(value: string, lang: keyof typeof noticeDraftTimestampLocales): string {
  return new Intl.DateTimeFormat(noticeDraftTimestampLocales[lang], {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

const legalMilestoneLabelKey: Record<CaseLegalMilestoneKind, TranslationKey> = {
  contract: "cases-legal-milestone-contract",
  discovery: "cases-legal-milestone-discovery",
  "evidence-uploaded": "cases-legal-milestone-evidence-uploaded",
  "protocol-finalized": "cases-legal-milestone-protocol-finalized",
  "notice-deadline": "cases-legal-milestone-notice-deadline",
};

const caseNextActionLabelKey: Record<ComplianceCaseViewModel["status"], TranslationKey> = {
  ok: "cases-next-action-ok",
  warning: "cases-next-action-warning",
  urgent: "cases-next-action-urgent",
  expired: "cases-next-action-expired",
  "immediate-notice": "cases-next-action-immediate-notice",
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

function filterCasesByStatus(
  cases: ComplianceCaseViewModel[],
  statusFilter: CaseStatusFilter
): ComplianceCaseViewModel[] {
  if (statusFilter === "all") return cases;
  if (statusFilter === "triage") {
    return cases.filter(
      (item) => item.status === "urgent" || item.status === "expired" || item.status === "immediate-notice"
    );
  }
  if (statusFilter === "urgent") {
    return cases.filter(
      (item) => item.status === "urgent" || item.status === "immediate-notice"
    );
  }
  return cases.filter((item) => item.status === statusFilter);
}

type CaseFormState = {
  projectName: string;
  canton: string;
  contractDate: string;
  discoveryDate: string;
  noticeRecipientName: string;
  noticeRecipientAddress: string;
  defectStatement: string;
};

const EMPTY_CASE_FORM: CaseFormState = {
  projectName: "",
  canton: "ZH",
  contractDate: "",
  discoveryDate: "",
  noticeRecipientName: "",
  noticeRecipientAddress: "",
  defectStatement: "",
};

function buildCaseFormState(item: Pick<Case, "project_name" | "canton" | "contract_date" | "discovery_date" | "notice_recipient_name" | "notice_recipient_address" | "defect_statement">): CaseFormState {
  return {
    projectName: item.project_name,
    canton: item.canton,
    contractDate: item.contract_date.slice(0, 10),
    discoveryDate: item.discovery_date.slice(0, 10),
    noticeRecipientName: item.notice_recipient_name ?? "",
    noticeRecipientAddress: item.notice_recipient_address ?? "",
    defectStatement: item.defect_statement ?? "",
  };
}

function normalizeOptionalSourceFact(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

type CompleteNoticeSource = {
  recipientName: string;
  recipientAddress: string;
  defectStatement: string;
};

function getCompleteNoticeSource(item: Case | undefined): CompleteNoticeSource | null {
  if (
    !item?.notice_recipient_name?.trim()
    || !item.notice_recipient_address?.trim()
    || !item.defect_statement?.trim()
  ) {
    return null;
  }

  return {
    recipientName: item.notice_recipient_name,
    recipientAddress: item.notice_recipient_address,
    defectStatement: item.defect_statement,
  };
}

function formatCaseReminderReadiness(
  item: ComplianceCaseViewModel,
  checklist: FollowUpChecklistState,
  t: (key: TranslationKey) => string,
  options: { includeEmailReadiness?: boolean } = {}
) {
  const calendarReadiness = item.noticeApplies
    ? checklist.calendarReminderExported
      ? t("cases-calendar-ready")
      : t("cases-calendar-pending")
    : t("cases-calendar-not-applicable");

  const readinessParts = [
    calendarReadiness,
    ...(options.includeEmailReadiness
      ? [item.reminderReadiness.emailReminderPlanned ? t("cases-email-planned") : t("cases-email-not-planned")]
      : []),
    checklist.evidenceAttached ? t("cases-evidence-complete") : t("cases-evidence-incomplete"),
  ];

  return readinessParts.join(" · ");
}

function formatCaseAuditReadinessSummary(
  item: ComplianceCaseViewModel,
  checklist: FollowUpChecklistState,
  protocolCount: number,
  t: (key: TranslationKey) => string
) {
  const readinessItems = [
    {
      ready: checklist.defectDocumented,
      missingLabel: t("cases-checklist-defect-documented"),
    },
    {
      ready: checklist.evidenceAttached,
      missingLabel: t("cases-checklist-evidence-attached"),
    },
    {
      ready: checklist.noticeDrafted,
      missingLabel: t("cases-checklist-notice-drafted"),
    },
    {
      ready: !item.noticeApplies || checklist.calendarReminderExported,
      missingLabel: t("cases-checklist-calendar-exported"),
    },
    {
      ready: protocolCount > 0,
      missingLabel: t("cases-linked-protocols"),
    },
  ];
  const completed = readinessItems.filter((entry) => entry.ready).length;
  const missing = readinessItems.filter((entry) => !entry.ready).map((entry) => entry.missingLabel);
  const summary = `${completed}/${readinessItems.length} ${t("cases-audit-ready")}`;

  if (missing.length === 0) {
    return `${summary} · ${t("cases-audit-complete")}`;
  }

  return `${summary} · ${t("cases-audit-missing")}: ${missing.join(", ")}`;
}

export default function CasesPage() {
  const { lang = "de", t } = useLanguage();
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
  const cleanupWarningCaseIdRef = useRef<string | null>(null);
  const [deletingCaseIds, setDeletingCaseIds] = useState<Record<string, boolean>>({});
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<CaseFormState>(EMPTY_CASE_FORM);
  const [updatingCaseId, setUpdatingCaseId] = useState<string | null>(null);
  const [caseUpdateFeedback, setCaseUpdateFeedback] = useState<{ caseId: string; key: TranslationKey; tone: "success" | "error" } | null>(null);
  const [noticePreviewOpenByCase, setNoticePreviewOpenByCase] = useState<Record<string, boolean>>({});
  const noticePreviewOpenByCaseRef = useRef<Record<string, boolean>>({});
  const previousNoticePreviewUserIdRef = useRef<string | null>(user?.id ?? null);
  const previousNoticeDraftUserIdRef = useRef<string | null>(user?.id ?? null);

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
  const [dossierFeedbackByCase, setDossierFeedbackByCase] = useState<
    Record<string, { key: TranslationKey; tone: "success" | "error" }>
  >({});
  const [dossierGeneratingByCase, setDossierGeneratingByCase] = useState<Record<string, boolean>>({});
  const dossierFeedbackTimersRef = useRef<Record<string, number>>({});
  const dossierRequestIdsRef = useRef<Record<string, number>>({});
  const dossierInFlightIdsRef = useRef<Set<string>>(new Set());
  const dossierMountedRef = useRef(true);
  const [protocolPdfFeedbackByCase, setProtocolPdfFeedbackByCase] = useState<
    Record<string, { key: TranslationKey; tone: "success" | "error" }>
  >({});
  const [protocolPdfGeneratingByCase, setProtocolPdfGeneratingByCase] = useState<Record<string, boolean>>({});
  const protocolPdfFeedbackTimersRef = useRef<Record<string, number>>({});
  const protocolPdfRequestIdsRef = useRef<Record<string, number>>({});
  const protocolPdfInFlightCaseIdsRef = useRef<Set<string>>(new Set());
  const [checklistSaveErrorByCase, setChecklistSaveErrorByCase] = useState<Record<string, TranslationKey>>({});
  const [checklistSavingByCase, setChecklistSavingByCase] = useState<Record<string, boolean>>({});
  const [protocolCounts, setProtocolCounts] = useState<Record<string, number>>({});
  const [linkedProtocols, setLinkedProtocols] = useState<LinkedProtocolRow[]>([]);
  const [caseActivityEvents, setCaseActivityEvents] = useState<CaseActivityEvent[]>([]);
  const [noticeDrafts, setNoticeDrafts] = useState<CaseNoticeDraft[]>([]);
  const [noticeDraftCreatingByCase, setNoticeDraftCreatingByCase] = useState<Record<string, boolean>>({});
  const [noticeDraftFeedbackByCase, setNoticeDraftFeedbackByCase] = useState<Record<string, TranslationKey>>({});
  const noticeDraftInFlightIdsRef = useRef<Set<string>>(new Set());
  const noticeDraftRequestIdsRef = useRef<Record<string, number>>({});
  const latestNoticeDraftLoadIdRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(user?.id ?? null);
  currentUserIdRef.current = user?.id ?? null;
  const latestFetchIdRef = useRef(0);
  const hasLoadedInitialCasesRef = useRef(false);
  const lastSuccessfulCasesRef = useRef<Case[]>([]);
  const lastSuccessfulProtocolCountsRef = useRef<Record<string, number>>({});
  const lastSuccessfulLinkedProtocolsRef = useRef<LinkedProtocolRow[]>([]);
  const lastSuccessfulCaseActivityEventsRef = useRef<CaseActivityEvent[]>([]);
  const lastSuccessfulCaseActivityUserIdRef = useRef<string | null>(null);
  const lastSuccessfulNoticeDraftsRef = useRef<CaseNoticeDraft[]>([]);
  const lastSuccessfulNoticeDraftsUserIdRef = useRef<string | null>(null);
  const filterStateRef = useRef({
    regimeFilter,
    statusFilter,
    sortMode,
    searchTerm,
  });
  const skipNextUrlWriteRef = useRef(false);

  const updateNoticePreviewOpenByCase = useCallback(
    (updater: (current: Record<string, boolean>) => Record<string, boolean>) => {
      const current = noticePreviewOpenByCaseRef.current;
      const next = updater(current);
      if (next === current) return;

      noticePreviewOpenByCaseRef.current = next;
      setNoticePreviewOpenByCase(next);
    },
    []
  );

  const clearNoticePreview = useCallback((caseId: string) => {
    updateNoticePreviewOpenByCase((current) => {
      if (!current[caseId]) return current;
      const next = { ...current };
      delete next[caseId];
      return next;
    });
  }, [updateNoticePreviewOpenByCase]);

  const runCasesRefresh = useCallback(async (fetchId: number) => {
    if (!user) {
      hasLoadedInitialCasesRef.current = false;
      lastSuccessfulCasesRef.current = [];
      lastSuccessfulProtocolCountsRef.current = {};
      lastSuccessfulLinkedProtocolsRef.current = [];
      lastSuccessfulCaseActivityEventsRef.current = [];
      lastSuccessfulCaseActivityUserIdRef.current = null;
      lastSuccessfulNoticeDraftsRef.current = [];
      lastSuccessfulNoticeDraftsUserIdRef.current = null;
      latestNoticeDraftLoadIdRef.current += 1;
      setDbCases([]);
      setProtocolCounts({});
      setLinkedProtocols([]);
      setCaseActivityEvents([]);
      setNoticeDrafts([]);
      setInitialLoadError(null);
      setLoading(false);
      return;
    }

    if (
      lastSuccessfulCaseActivityUserIdRef.current !== null
      && lastSuccessfulCaseActivityUserIdRef.current !== user.id
    ) {
      lastSuccessfulCaseActivityEventsRef.current = [];
      lastSuccessfulCaseActivityUserIdRef.current = null;
      setCaseActivityEvents([]);
    }

    try {
      const noticeDraftLoadId = ++latestNoticeDraftLoadIdRef.current;
      const loadNoticeDrafts = async () => {
        try {
          const result = await supabase
            .from("case_notice_drafts")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });
          return { data: (result.data ?? []) as CaseNoticeDraft[], failed: Boolean(result.error) };
        } catch {
          // Draft revisions are additive; older deployments must still load Cases.
          return { data: [] as CaseNoticeDraft[], failed: true };
        }
      };
      const loadActivityEvents = async () => {
        try {
          const result = await supabase
            .from("case_activity_events")
            .select("id, user_id, case_id, evidence_id, event_type, source_name, source_mime_type, source_size_bytes, occurred_at")
            .eq("user_id", user.id)
            .order("occurred_at", { ascending: false });
          return { data: (result.data ?? []) as CaseActivityEvent[], failed: Boolean(result.error) };
        } catch {
          // Activity provenance is additive; never hide established case/protocol data
          // when an older deployment or a transient request cannot provide it.
          return { data: [] as CaseActivityEvent[], failed: true };
        }
      };
      const activityResultPromise = loadActivityEvents();
      const noticeDraftResultPromise = loadNoticeDrafts();
      const [casesResult, protocolsResult] = await Promise.all([
        supabase
          .from("cases")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("protocols")
          .select("id, case_id, status, created_at")
          .eq("user_id", user.id)
          .not("case_id", "is", null),
      ]);

      if (fetchId !== latestFetchIdRef.current) return;

      if (casesResult.error || protocolsResult.error) {
        if (!hasLoadedInitialCasesRef.current) {
          setDbCases([]);
          setProtocolCounts({});
          setLinkedProtocols([]);
          setInitialLoadError("cases-load-error");
        } else {
          setDbCases(lastSuccessfulCasesRef.current);
          setProtocolCounts(lastSuccessfulProtocolCountsRef.current);
          setLinkedProtocols(lastSuccessfulLinkedProtocolsRef.current);
        }
        setLoading(false);
        return;
      }

      hasLoadedInitialCasesRef.current = true;
      setInitialLoadError(null);
      setDbCases((casesResult.data as Case[]) ?? []);
      if (protocolsResult.data) {
        const protocolRows = protocolsResult.data as LinkedProtocolRow[];
        const counts: Record<string, number> = {};
        for (const p of protocolRows) {
          if (p.case_id) counts[p.case_id] = (counts[p.case_id] || 0) + 1;
        }
        lastSuccessfulProtocolCountsRef.current = counts;
        lastSuccessfulLinkedProtocolsRef.current = protocolRows;
        setProtocolCounts(counts);
        setLinkedProtocols(protocolRows);
      } else {
        lastSuccessfulProtocolCountsRef.current = {};
        lastSuccessfulLinkedProtocolsRef.current = [];
        setProtocolCounts({});
        setLinkedProtocols([]);
      }
      lastSuccessfulCasesRef.current = (casesResult.data as Case[]) ?? [];
      setLoading(false);

      // Consume additive records independently: either source may be unavailable
      // forever without delaying core Cases or the other additive source.
      void activityResultPromise.then((activityResult) => {
        if (fetchId !== latestFetchIdRef.current || currentUserIdRef.current !== user.id) return;
        if (!activityResult.failed) {
          lastSuccessfulCaseActivityEventsRef.current = activityResult.data;
          lastSuccessfulCaseActivityUserIdRef.current = user.id;
          setCaseActivityEvents(activityResult.data);
        } else if (lastSuccessfulCaseActivityUserIdRef.current === user.id) {
          setCaseActivityEvents(lastSuccessfulCaseActivityEventsRef.current);
        } else {
          setCaseActivityEvents([]);
        }
      });
      void noticeDraftResultPromise.then((noticeDraftResult) => {
        if (
          fetchId !== latestFetchIdRef.current
          || noticeDraftLoadId !== latestNoticeDraftLoadIdRef.current
          || currentUserIdRef.current !== user.id
        ) return;
        if (!noticeDraftResult.failed) {
          lastSuccessfulNoticeDraftsRef.current = noticeDraftResult.data;
          lastSuccessfulNoticeDraftsUserIdRef.current = user.id;
          setNoticeDrafts(noticeDraftResult.data);
        } else if (lastSuccessfulNoticeDraftsUserIdRef.current === user.id) {
          setNoticeDrafts(lastSuccessfulNoticeDraftsRef.current);
        } else {
          setNoticeDrafts([]);
        }
      });
    } catch {
      if (fetchId !== latestFetchIdRef.current) return;
      if (!hasLoadedInitialCasesRef.current) {
        setDbCases([]);
        setProtocolCounts({});
        setLinkedProtocols([]);
        setInitialLoadError("cases-load-error");
      } else {
        setDbCases(lastSuccessfulCasesRef.current);
        setProtocolCounts(lastSuccessfulProtocolCountsRef.current);
        setLinkedProtocols(lastSuccessfulLinkedProtocolsRef.current);
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
    const openCaseIds = Object.keys(noticePreviewOpenByCaseRef.current);
    if (openCaseIds.length === 0) return;

    const completeCaseIds = new Set(
      dbCases.filter((item) => getCompleteNoticeSource(item) !== null).map((item) => item.id)
    );
    const staleCaseIds = openCaseIds.filter((caseId) => !completeCaseIds.has(caseId));
    if (staleCaseIds.length === 0) return;

    updateNoticePreviewOpenByCase((current) => {
      const next = { ...current };
      let changed = false;
      for (const caseId of staleCaseIds) {
        if (!next[caseId]) continue;
        delete next[caseId];
        changed = true;
      }
      return changed ? next : current;
    });
  }, [dbCases, updateNoticePreviewOpenByCase]);

  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (previousNoticePreviewUserIdRef.current === currentUserId) return;

    previousNoticePreviewUserIdRef.current = currentUserId;
    updateNoticePreviewOpenByCase((current) => (
      Object.keys(current).length === 0 ? current : {}
    ));
  }, [user?.id, updateNoticePreviewOpenByCase]);

  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (previousNoticeDraftUserIdRef.current === currentUserId) return;

    previousNoticeDraftUserIdRef.current = currentUserId;
    latestNoticeDraftLoadIdRef.current += 1;
    for (const caseId of Object.keys(noticeDraftRequestIdsRef.current)) {
      noticeDraftRequestIdsRef.current[caseId] += 1;
    }
    noticeDraftInFlightIdsRef.current.clear();
    lastSuccessfulNoticeDraftsRef.current = [];
    lastSuccessfulNoticeDraftsUserIdRef.current = null;
    setNoticeDrafts([]);
    setNoticeDraftCreatingByCase({});
    setNoticeDraftFeedbackByCase({});
  }, [user?.id]);

  useEffect(() => {
    const cleanupUserId = user?.id;
    if (!cleanupUserId) return;

    // Retry durable post-delete Storage cleanup independently of the deleted
    // card, which is no longer available as a user-triggered retry surface.
    let cleanupInFlight = false;
    let disposed = false;
    const retryEvidenceCleanup = async () => {
      if (cleanupInFlight || disposed) return;
      cleanupInFlight = true;
      try {
        const { data: cleanupJobs, error } = await supabase
          .from("case_evidence_cleanup_jobs")
          .select("case_id, storage_paths, pending_upload_paths")
          .eq("user_id", cleanupUserId);
        if (error) return;

        for (const job of cleanupJobs ?? []) {
          if (Array.isArray(job.pending_upload_paths) && job.pending_upload_paths.length > 0) {
            const { data: cleanupReady, error: reconciliationError } = await supabase.rpc(
              "reconcile_case_evidence_cleanup_uploads",
              { target_case_id: job.case_id }
            );
            if (reconciliationError || cleanupReady !== true) continue;
          }
          try {
            const paths = Array.isArray(job.storage_paths)
              ? job.storage_paths.filter((path: unknown): path is string => typeof path === "string")
              : [];
            await removeCaseEvidenceObjects(supabase.storage, paths);
            const { data: completed, error: completionError } = await supabase.rpc(
              "complete_case_evidence_cleanup",
              { target_case_id: job.case_id }
            );
            if (completionError || completed !== true) {
              throw completionError ?? new Error("Evidence cleanup retry was not acknowledged");
            }
            if (cleanupWarningCaseIdRef.current === job.case_id) {
              cleanupWarningCaseIdRef.current = null;
              setDeleteError((current) =>
                current === "cases-delete-evidence-cleanup-error" ? null : current
              );
            }
          } catch {
            // Continue with other jobs; this one remains durable for a later visit.
          }
        }
      } catch {
        // Keep unfinished durable jobs for the next authenticated page visit.
      } finally {
        cleanupInFlight = false;
      }
    };

    void retryEvidenceCleanup();
    // Upload completion can happen in another mounted Vault tab after the
    // initial pass. Poll the durable queue so terminal uploads and expired
    // leases are cleaned without requiring the user to revisit Cases.
    const stopCleanupRetry = scheduleCaseEvidenceCleanupRetry(() => {
      void retryEvidenceCleanup();
    });

    return () => {
      disposed = true;
      stopCleanupRetry();
    };
  }, [supabase, user?.id]);

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
    dossierMountedRef.current = true;
    const dossierInFlightIds = dossierInFlightIdsRef.current;
    const dossierRequestIds = dossierRequestIdsRef.current;
    const protocolPdfInFlightCaseIds = protocolPdfInFlightCaseIdsRef.current;
    const protocolPdfRequestIds = protocolPdfRequestIdsRef.current;
    return () => {
      dossierMountedRef.current = false;
      shareLinkRequestIdRef.current += 1;
      if (shareLinkResetTimerRef.current !== null) {
        window.clearTimeout(shareLinkResetTimerRef.current);
      }
      for (const timer of Object.values(reminderExportResetTimersRef.current)) {
        window.clearTimeout(timer);
      }
      for (const timer of Object.values(dossierFeedbackTimersRef.current)) {
        window.clearTimeout(timer);
      }
      for (const timer of Object.values(protocolPdfFeedbackTimersRef.current)) {
        window.clearTimeout(timer);
      }
      reminderExportResetTimersRef.current = {};
      reminderExportRequestIdsRef.current = {};
      dossierFeedbackTimersRef.current = {};
      protocolPdfFeedbackTimersRef.current = {};
      dossierInFlightIds.clear();
      protocolPdfInFlightCaseIds.clear();
      for (const caseId of Object.keys(dossierRequestIds)) {
        dossierRequestIds[caseId] += 1;
      }
      for (const caseId of Object.keys(protocolPdfRequestIds)) {
        protocolPdfRequestIds[caseId] += 1;
      }
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

  const [timelineRevision, setTimelineRevision] = useState(0);

  useEffect(() => {
    let refreshTimer: number | undefined;

    const scheduleNextCalendarDay = () => {
      refreshTimer = window.setTimeout(() => {
        setTimelineRevision((current) => current + 1);
        scheduleNextCalendarDay();
      }, getMillisecondsUntilNextSwissCalendarDay());
    };

    scheduleNextCalendarDay();
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, []);

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

  const cases = useMemo(() => {
    void timelineRevision;
    return buildComplianceCaseTimeline(caseInputs);
  }, [caseInputs, timelineRevision]);

  const linkedProtocolEventsByCase = useMemo(() => {
    const result: Record<string, LinkedCaseProtocolEvent[]> = {};

    for (const protocol of linkedProtocols) {
      if (!protocol.case_id || !protocol.id || !protocol.status || !protocol.created_at) continue;

      const events = result[protocol.case_id] ?? [];
      events.push({
        id: protocol.id,
        status: protocol.status,
        createdAt: protocol.created_at,
      });
      result[protocol.case_id] = events;
    }

    return result;
  }, [linkedProtocols]);

  const evidenceEventsByCase = useMemo(() => {
    const result: Record<string, LinkedCaseEvidenceEvent[]> = {};

    for (const event of caseActivityEvents) {
      if (!event.case_id || !event.id || !event.evidence_id || !event.source_name || !event.occurred_at) continue;

      const events = result[event.case_id] ?? [];
      events.push({
        id: event.id,
        evidenceId: event.evidence_id,
        eventType: event.event_type,
        sourceName: event.source_name,
        occurredAt: event.occurred_at,
      });
      result[event.case_id] = events;
    }

    return result;
  }, [caseActivityEvents]);

  const finalizedProtocolsByCase = useMemo(() => {
    const result: Record<string, FinalizedLinkedProtocolRow[]> = {};

    for (const protocol of linkedProtocols) {
      if (!protocol.case_id || !isFinalizedLinkedProtocol(protocol)) continue;
      const records = result[protocol.case_id] ?? [];
      records.push(protocol);
      result[protocol.case_id] = records;
    }

    for (const records of Object.values(result)) {
      records.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ||
          a.id.localeCompare(b.id)
      );
    }

    return result;
  }, [linkedProtocols]);

  const latestNoticeDraftByCase = useMemo(() => {
    const result: Record<string, CaseNoticeDraft> = {};
    for (const draft of noticeDrafts) {
      const current = result[draft.case_id];
      if (
        !current
        || draft.created_at > current.created_at
        || (draft.created_at === current.created_at && draft.id.localeCompare(current.id) > 0)
      ) {
        result[draft.case_id] = draft;
      }
    }
    return result;
  }, [noticeDrafts]);

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
    return filterCasesByStatus(searchScopedCases, statusFilter);
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
    if (updatingCaseId || hasDeletingCases || noticeDraftCreatingByCase[item.id]) return;
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
  const hasChecklistSave = Object.values(checklistSavingByCase).some(Boolean);
  const hasDossierGeneration = Object.values(dossierGeneratingByCase).some(Boolean);
  const hasProtocolPdfGeneration = Object.values(protocolPdfGeneratingByCase).some(Boolean);
  const hasNoticeDraftCreation = Object.values(noticeDraftCreatingByCase).some(Boolean);
  const hasAnyRowLevelMutation = Boolean(
    editingCaseId
    || updatingCaseId
    || hasDeletingCases
    || hasChecklistSave
    || hasDossierGeneration
    || hasProtocolPdfGeneration
    || hasNoticeDraftCreation
  );
  const hasVisibleChecklistSave = visibleCases.some((item) =>
    Boolean(checklistSavingByCase[item.id])
  );

  const checklistLabels: Record<FollowUpChecklistKey, string> = {
    defectDocumented: t("cases-checklist-defect-documented"),
    evidenceAttached: t("cases-checklist-evidence-attached"),
    noticeDrafted: t("cases-checklist-notice-drafted"),
    calendarReminderExported: t("cases-checklist-calendar-exported"),
  };

  async function setChecklistItem(caseId: string, key: FollowUpChecklistKey, value: boolean) {
    if (
      checklistSavingByCase[caseId]
      || noticeDraftCreatingByCase[caseId]
      || editingCaseId === caseId
      || updatingCaseId === caseId
      || deletingCaseIds[caseId]
      || dossierGeneratingByCase[caseId]
      || protocolPdfGeneratingByCase[caseId]
    ) {
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
      const { data: persisted, error } = await supabase.rpc("set_case_checklist_item", {
        target_case_id: caseId,
        target_key: key,
        target_value: value,
      });

      if (error || !persisted || typeof persisted !== "object" || Array.isArray(persisted)) {
        throw error ?? new Error("Checklist update was not confirmed");
      }

      const authoritativeChecklist = normalizeFollowUpChecklistState(persisted);
      lastSuccessfulCasesRef.current = applyChecklistState(
        lastSuccessfulCasesRef.current,
        authoritativeChecklist
      );
      setDbCases((current) => applyChecklistState(current, authoritativeChecklist));
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
    if (
      noticeDraftCreatingByCase[item.id]
      || editingCaseId === item.id
      || updatingCaseId === item.id
      || deletingCaseIds[item.id]
      || checklistSavingByCase[item.id]
      || dossierGeneratingByCase[item.id]
      || protocolPdfGeneratingByCase[item.id]
    ) return;
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

  function downloadCaseAuditRegister() {
    const currentSearchScopedCases = applyComplianceCaseView(
      buildComplianceCaseTimeline(caseInputs),
      regimeFilter,
      "all",
      sortMode
    );
    const query = searchTerm.trim().toLowerCase();
    const currentSearchResults = query
      ? currentSearchScopedCases.filter((item) =>
          `${item.projectName} ${item.canton}`.toLowerCase().includes(query)
        )
      : currentSearchScopedCases;
    const currentVisibleCases = filterCasesByStatus(currentSearchResults, statusFilter);
    const currentViewHasChecklistSave = currentVisibleCases.some((item) =>
      Boolean(checklistSavingByCase[item.id])
    );

    if (currentVisibleCases.length === 0 || currentViewHasChecklistSave) return;

    const content = buildCaseAuditRegisterCsv(
      currentVisibleCases.map((item) => ({
        item,
        checklist: effectiveChecklists[item.id] ?? item.checklistDefaults,
        protocolCount: protocolCounts[item.id] ?? 0,
      })),
      {
        title: t("cases-audit-register-title"),
        generatedAt: t("cases-chronology-generated-at"),
        caseId: t("cases-chronology-case-id"),
        projectName: t("cases-chronology-project"),
        canton: t("cases-chronology-canton"),
        regime: t("cases-audit-register-regime"),
        status: t("cases-audit-register-status"),
        noticeDeadline: t("cases-notice-deadline"),
        checklistProgress: t("cases-audit-register-checklist"),
        linkedProtocols: t("cases-linked-protocols"),
        auditReadiness: t("cases-audit-readiness"),
        regimes: {
          old: t("cases-old-law"),
          new: t("cases-new-law"),
        },
        statuses: {
          ok: t("cases-status-on-track"),
          warning: t("cases-status-attention"),
          urgent: t("cases-status-urgent"),
          expired: t("cases-status-expired"),
          "immediate-notice": t("cases-status-immediate-notice"),
        },
      },
      new Date()
    );
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    try {
      anchor.href = url;
      anchor.download = "baucompliance-case-audit-register.csv";
      anchor.click();
    } finally {
      anchor.remove();
      URL.revokeObjectURL(url);
    }
  }

  function downloadCaseChronology(item: ComplianceCaseViewModel) {
    if (
      noticeDraftCreatingByCase[item.id]
      || editingCaseId === item.id
      || updatingCaseId === item.id
      || deletingCaseIds[item.id]
      || checklistSavingByCase[item.id]
      || dossierGeneratingByCase[item.id]
      || protocolPdfGeneratingByCase[item.id]
    ) return;
    const content = buildCaseLegalChronologyCsv(
      item,
      linkedProtocolEventsByCase[item.id] ?? [],
      evidenceEventsByCase[item.id] ?? [],
      {
        title: t("cases-chronology-title"),
        generatedAt: t("cases-chronology-generated-at"),
        caseId: t("cases-chronology-case-id"),
        projectName: t("cases-chronology-project"),
        canton: t("cases-chronology-canton"),
        date: t("cases-chronology-date"),
        milestone: t("cases-chronology-milestone"),
        sourceId: t("cases-chronology-source-id"),
        sourceName: t("cases-chronology-source-name"),
        milestones: {
          contract: t("cases-legal-milestone-contract"),
          discovery: t("cases-legal-milestone-discovery"),
          "evidence-uploaded": t("cases-legal-milestone-evidence-uploaded"),
          "protocol-finalized": t("cases-legal-milestone-protocol-finalized"),
          "notice-deadline": t("cases-legal-milestone-notice-deadline"),
        },
      },
      new Date()
    );
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    try {
      anchor.href = url;
      anchor.download = `baucompliance-case-${item.id}-chronology.csv`;
      anchor.click();
    } finally {
      anchor.remove();
      URL.revokeObjectURL(url);
    }
  }

  async function downloadFinalizedProtocolPdf(protocol: FinalizedLinkedProtocolRow) {
    const caseId = protocol.case_id;
    if (
      !caseId
      || protocolPdfInFlightCaseIdsRef.current.has(caseId)
      || noticeDraftCreatingByCase[caseId]
      || editingCaseId === caseId
      || updatingCaseId === caseId
      || deletingCaseIds[caseId]
      || checklistSavingByCase[caseId]
      || dossierGeneratingByCase[caseId]
      || protocolPdfGeneratingByCase[caseId]
    ) {
      return;
    }

    protocolPdfInFlightCaseIdsRef.current.add(caseId);
    const requestId = (protocolPdfRequestIdsRef.current[caseId] ?? 0) + 1;
    protocolPdfRequestIdsRef.current[caseId] = requestId;
    const existingTimer = protocolPdfFeedbackTimersRef.current[caseId];
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
      delete protocolPdfFeedbackTimersRef.current[caseId];
    }
    setProtocolPdfFeedbackByCase((current) => {
      if (!(caseId in current)) return current;
      const next = { ...current };
      delete next[caseId];
      return next;
    });
    setProtocolPdfGeneratingByCase((current) => ({ ...current, [caseId]: true }));

    const showFeedback = (key: TranslationKey, tone: "success" | "error") => {
      setProtocolPdfFeedbackByCase((current) => ({ ...current, [caseId]: { key, tone } }));
      protocolPdfFeedbackTimersRef.current[caseId] = window.setTimeout(() => {
        if (protocolPdfRequestIdsRef.current[caseId] !== requestId) return;
        setProtocolPdfFeedbackByCase((current) => {
          if (!(caseId in current)) return current;
          const next = { ...current };
          delete next[caseId];
          return next;
        });
        delete protocolPdfFeedbackTimersRef.current[caseId];
      }, 2000);
    };

    try {
      const { data, error } = await supabase
        .from("protocols")
        .select("id, case_id, status, created_at, project_name, contractor, client, defect_description, signature_data")
        .eq("id", protocol.id)
        .eq("user_id", user?.id ?? "")
        .eq("status", "finalized")
        .single();
      if (error || !data) throw error ?? new Error("Finalized protocol not found");

      const finalizedProtocol = data as FinalizedProtocolPdfRow;
      const report = buildFinalizedProtocolReportFromRecord(finalizedProtocol);
      const blob = await pdf(
        <AuditReportPDF
          fileName={finalizedProtocol.project_name || "Project"}
          caseId={finalizedProtocol.id}
          contractor={finalizedProtocol.contractor}
          client={finalizedProtocol.client}
          report={report}
        />
      ).toBlob();
      if (!dossierMountedRef.current || protocolPdfRequestIdsRef.current[caseId] !== requestId) return;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = `baucompliance-protocol-${finalizedProtocol.id}.pdf`;
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(url);
      }
      showFeedback("cases-finalized-protocol-download-success", "success");
    } catch {
      if (!dossierMountedRef.current || protocolPdfRequestIdsRef.current[caseId] !== requestId) return;
      showFeedback("cases-finalized-protocol-download-error", "error");
    } finally {
      protocolPdfInFlightCaseIdsRef.current.delete(caseId);
      if (dossierMountedRef.current && protocolPdfRequestIdsRef.current[caseId] === requestId) {
        setProtocolPdfGeneratingByCase((current) => {
          const next = { ...current };
          delete next[caseId];
          return next;
        });
      }
    }
  }

  async function downloadCaseAuditDossier(
    item: ComplianceCaseViewModel,
    checklist: FollowUpChecklistState
  ) {
    if (
      dossierInFlightIdsRef.current.has(item.id)
      || noticeDraftCreatingByCase[item.id]
      || editingCaseId === item.id
      || updatingCaseId === item.id
      || deletingCaseIds[item.id]
      || checklistSavingByCase[item.id]
      || dossierGeneratingByCase[item.id]
      || protocolPdfGeneratingByCase[item.id]
    ) return;

    dossierInFlightIdsRef.current.add(item.id);
    const requestId = (dossierRequestIdsRef.current[item.id] ?? 0) + 1;
    dossierRequestIdsRef.current[item.id] = requestId;
    const existingTimer = dossierFeedbackTimersRef.current[item.id];
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
      delete dossierFeedbackTimersRef.current[item.id];
    }
    setDossierFeedbackByCase((current) => {
      if (!(item.id in current)) return current;
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setDossierGeneratingByCase((current) => ({ ...current, [item.id]: true }));

    try {
      const report = buildCaseAuditDossier({
        item: {
          ...item,
          nextAction: t(caseNextActionLabelKey[item.status]),
        },
        checklist,
        linkedProtocols: linkedProtocolEventsByCase[item.id] ?? [],
        labels: {
          title: t("cases-dossier-title"),
          generatedAt: t("cases-chronology-generated-at"),
          caseId: t("cases-chronology-case-id"),
          projectName: t("cases-chronology-project"),
          canton: t("cases-chronology-canton"),
          regime: t("cases-audit-register-regime"),
          status: t("cases-audit-register-status"),
          contractDate: t("cases-contract-date"),
          discoveryDate: t("cases-defect-discovered"),
          noticeDeadline: t("cases-notice-deadline"),
          noticeDeadlineNotFixed: t("cases-not-fixed"),
          nextAction: t("cases-next-legal-action"),
          checklist: t("cases-followup-checklist"),
          checklistReady: t("cases-dossier-ready"),
          checklistMissing: t("cases-audit-missing"),
          linkedProtocols: t("cases-dossier-finalized-protocols"),
          chronology: t("cases-legal-timeline-title"),
          noLinkedProtocols: t("cases-dossier-no-finalized-protocols"),
          legalDisclaimer: t("calc-disclaimer"),
          regimes: {
            old: t("cases-old-law"),
            new: t("cases-new-law"),
          },
          statuses: {
            ok: t("cases-status-on-track"),
            warning: t("cases-status-attention"),
            urgent: t("cases-status-urgent"),
            expired: t("cases-status-expired"),
            "immediate-notice": t("cases-status-immediate-notice"),
          },
          checklistItems: {
            defectDocumented: t("cases-checklist-defect-documented"),
            evidenceAttached: t("cases-checklist-evidence-attached"),
            noticeDrafted: t("cases-checklist-notice-drafted"),
            calendarReminderExported: t("cases-checklist-calendar-exported"),
          },
          milestones: {
            contract: t("cases-legal-milestone-contract"),
            discovery: t("cases-legal-milestone-discovery"),
            "evidence-uploaded": t("cases-legal-milestone-evidence-uploaded"),
            "protocol-finalized": t("cases-legal-milestone-protocol-finalized"),
            "notice-deadline": t("cases-legal-milestone-notice-deadline"),
          },
        },
        generatedAt: new Date(),
      });
      const blob = await pdf(<CaseAuditDossierPDF report={report} />).toBlob();
      if (!dossierMountedRef.current || dossierRequestIdsRef.current[item.id] !== requestId) return;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = `baucompliance-case-${item.id}-audit-dossier.pdf`;
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(url);
      }

      setDossierFeedbackByCase((current) => ({
        ...current,
        [item.id]: { key: "cases-dossier-download-success", tone: "success" },
      }));
      dossierFeedbackTimersRef.current[item.id] = window.setTimeout(() => {
        if (dossierRequestIdsRef.current[item.id] !== requestId) return;
        setDossierFeedbackByCase((current) => {
          if (!(item.id in current)) return current;
          const next = { ...current };
          delete next[item.id];
          return next;
        });
        delete dossierFeedbackTimersRef.current[item.id];
      }, 2000);
    } catch {
      if (!dossierMountedRef.current || dossierRequestIdsRef.current[item.id] !== requestId) return;
      setDossierFeedbackByCase((current) => ({
        ...current,
        [item.id]: { key: "cases-dossier-download-error", tone: "error" },
      }));
      dossierFeedbackTimersRef.current[item.id] = window.setTimeout(() => {
        if (dossierRequestIdsRef.current[item.id] !== requestId) return;
        setDossierFeedbackByCase((current) => {
          if (!(item.id in current)) return current;
          const next = { ...current };
          delete next[item.id];
          return next;
        });
        delete dossierFeedbackTimersRef.current[item.id];
      }, 2000);
    } finally {
      dossierInFlightIdsRef.current.delete(item.id);
      if (dossierMountedRef.current && dossierRequestIdsRef.current[item.id] === requestId) {
        setDossierGeneratingByCase((current) => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
      }
    }
  }

  async function handleCreateNoticeDraft(item: ComplianceCaseViewModel, persistedCase: Case) {
    const userId = user?.id;
    if (
      !userId
      || noticeDraftInFlightIdsRef.current.has(item.id)
      || editingCaseId !== null
      || updatingCaseId !== null
      || hasDeletingCases
      || hasChecklistSave
      || hasDossierGeneration
      || hasProtocolPdfGeneration
      || hasNoticeDraftCreation
    ) return;

    const payload = buildCaseNoticeDraftPayload(persistedCase, item);
    if (!payload) return;

    noticeDraftInFlightIdsRef.current.add(item.id);
    const requestId = (noticeDraftRequestIdsRef.current[item.id] ?? 0) + 1;
    noticeDraftRequestIdsRef.current[item.id] = requestId;
    setNoticeDraftFeedbackByCase((current) => {
      if (!(item.id in current)) return current;
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setNoticeDraftCreatingByCase((current) => ({ ...current, [item.id]: true }));

    const requestIsCurrent = () =>
      dossierMountedRef.current
      && currentUserIdRef.current === userId
      && noticeDraftRequestIdsRef.current[item.id] === requestId;

    try {
      const { data, error } = await supabase
        .from("case_notice_drafts")
        .insert({ user_id: userId, case_id: item.id, ...payload })
        .select("*")
        .single();
      if (error || !data) throw error ?? new Error("Draft revision insert was not confirmed");
      const savedDraft = data as CaseNoticeDraft;
      if (
        savedDraft.user_id !== userId
        || savedDraft.case_id !== item.id
        || !requestIsCurrent()
      ) {
        return;
      }

      // An older additive load must not overwrite the server row just returned.
      latestNoticeDraftLoadIdRef.current += 1;
      setNoticeDrafts((current) => {
        const next = [savedDraft, ...current.filter((draft) => draft.id !== savedDraft.id)];
        lastSuccessfulNoticeDraftsRef.current = next;
        lastSuccessfulNoticeDraftsUserIdRef.current = userId;
        return next;
      });
      setNoticeDraftFeedbackByCase((current) => ({
        ...current,
        [item.id]: "cases-notice-draft-created",
      }));
    } catch {
      if (!requestIsCurrent()) return;
      setNoticeDraftFeedbackByCase((current) => ({
        ...current,
        [item.id]: "cases-notice-draft-create-error",
      }));
    } finally {
      if (noticeDraftRequestIdsRef.current[item.id] === requestId) {
        noticeDraftInFlightIdsRef.current.delete(item.id);
      }
      if (requestIsCurrent()) {
        setNoticeDraftCreatingByCase((current) => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
      }
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
        notice_recipient_name: normalizeOptionalSourceFact(formData.noticeRecipientName),
        notice_recipient_address: normalizeOptionalSourceFact(formData.noticeRecipientAddress),
        defect_statement: normalizeOptionalSourceFact(formData.defectStatement),
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
    if (
      !user
      || updatingCaseId
      || deletingCaseIds[caseId]
      || noticeDraftCreatingByCase[caseId]
      || checklistSavingByCase[caseId]
      || dossierGeneratingByCase[caseId]
      || protocolPdfGeneratingByCase[caseId]
    ) return;
    const confirmText = t("cases-delete-confirm").replace("{projectName}", projectName);
    const confirmed = window.confirm(confirmText);
    if (!confirmed) return;

    setDeletingCaseIds((current) => ({ ...current, [caseId]: true }));

    try {
      // Capture paths and delete under one parent-row lock so concurrent evidence
      // metadata inserts are either included or fail against the deleted case.
      const { data: deletion, error } = await supabase.rpc("delete_case_with_evidence", {
        target_case_id: caseId,
      });
      if (error || !deletion || deletion.deleted !== true || !Array.isArray(deletion.storage_paths)) {
        throw error ?? new Error("Case deletion was not confirmed");
      }
      const evidencePaths = deletion.storage_paths.filter(
        (path: unknown): path is string => typeof path === "string"
      );
      const cleanupReady = deletion.cleanup_pending !== true;

      if (cleanupReady) {
        try {
          await removeCaseEvidenceObjects(supabase.storage, evidencePaths);
          // A concurrent durable retry may already have removed this job after
          // the same Storage cleanup. The RPC's false result then represents
          // idempotent success for this foreground path; only an RPC error means
          // cleanup acknowledgement itself failed.
          const { error: cleanupCompletionError } = await supabase.rpc(
            "complete_case_evidence_cleanup",
            { target_case_id: caseId }
          );
          if (cleanupCompletionError) {
            throw cleanupCompletionError;
          }
          if (cleanupWarningCaseIdRef.current === caseId) {
            cleanupWarningCaseIdRef.current = null;
            setDeleteError((current) =>
              current === "cases-delete-evidence-cleanup-error" ? null : current
            );
          } else if (cleanupWarningCaseIdRef.current === null) {
            setDeleteError(null);
          }
        } catch {
          // The case is already deleted; preserve that successful UI result while
          // surfacing the separate Storage cleanup failure for support follow-up.
          cleanupWarningCaseIdRef.current = caseId;
          setDeleteError("cases-delete-evidence-cleanup-error");
        }
      } else {
        // A pre-authorized upload is still in flight. Its terminal signal releases
        // the durable cleanup job for a later authenticated Cases-page visit.
        if (cleanupWarningCaseIdRef.current === null) setDeleteError(null);
      }
      clearNoticePreview(caseId);
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
      hasDeletingCases ||
      noticeDraftCreatingByCase[caseId] ||
      checklistSavingByCase[caseId] ||
      dossierGeneratingByCase[caseId] ||
      protocolPdfGeneratingByCase[caseId]
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
        notice_recipient_name: normalizeOptionalSourceFact(editFormData.noticeRecipientName),
        notice_recipient_address: normalizeOptionalSourceFact(editFormData.noticeRecipientAddress),
        defect_statement: normalizeOptionalSourceFact(editFormData.defectStatement),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("cases").update(payload).eq("id", caseId);

      if (error) {
        throw error;
      }

      if (
        !payload.notice_recipient_name
        || !payload.notice_recipient_address
        || !payload.defect_statement
      ) {
        clearNoticePreview(caseId);
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
            <div>
              <label htmlFor="cases-notice-recipient-name" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("cases-notice-recipient-name")}</label>
              <input id="cases-notice-recipient-name" type="text" maxLength={200} value={formData.noticeRecipientName} onChange={(e) => updateFormData({ ...formData, noticeRecipientName: e.target.value })} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60" disabled={saving} />
            </div>
            <div>
              <label htmlFor="cases-notice-recipient-address" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("cases-notice-recipient-address")}</label>
              <textarea id="cases-notice-recipient-address" maxLength={1000} rows={3} value={formData.noticeRecipientAddress} onChange={(e) => updateFormData({ ...formData, noticeRecipientAddress: e.target.value })} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60" disabled={saving} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="cases-defect-statement" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("cases-defect-statement")}</label>
              <textarea id="cases-defect-statement" maxLength={4000} rows={4} value={formData.defectStatement} onChange={(e) => updateFormData({ ...formData, defectStatement: e.target.value })} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60" disabled={saving} />
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

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={downloadCaseAuditRegister}
            disabled={visibleCases.length === 0 || hasVisibleChecklistSave}
            className="px-3 py-1.5 rounded-lg border border-blue-400/30 text-xs font-medium text-blue-100 hover:bg-blue-500/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("cases-export-audit-register")}
          </button>
          {hasActiveFilters && (
            <>
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
            </>
          )}
        </div>
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
            const isDossierGenerating = Boolean(dossierGeneratingByCase[item.id]);
            const isProtocolPdfGenerating = Boolean(protocolPdfGeneratingByCase[item.id]);
            const finalizedProtocols = finalizedProtocolsByCase[item.id] ?? [];
            const persistedCase = dbCases.find((dbItem) => dbItem.id === item.id);
            const completeNoticeSource = getCompleteNoticeSource(persistedCase);
            const hasCompleteNoticeSource = completeNoticeSource !== null;
            const noticeDraftPayload = persistedCase ? buildCaseNoticeDraftPayload(persistedCase, item) : null;
            const latestNoticeDraft = latestNoticeDraftByCase[item.id];
            const isNoticeDraftCreating = Boolean(noticeDraftCreatingByCase[item.id]);
            const isCaseBusy = isChecklistSaving || isDossierGenerating || isProtocolPdfGenerating || isNoticeDraftCreating;
            const isNoticePreviewOpen = Boolean(noticePreviewOpenByCase[item.id] && completeNoticeSource);
            const noticePreviewUnavailableId = `cases-notice-preview-unavailable-${item.id}`;

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
                      {formatCaseReminderReadiness(item, checklist, t)}
                    </span>
                    {(protocolCounts[item.id] ?? 0) > 0 && (
                      <span className="px-2.5 py-1 rounded-md border border-blue-500/30 text-blue-300 bg-blue-500/[0.08]">
                        {protocolCounts[item.id]} {t("cases-protocols")}
                      </span>
                    )}
                    {isCaseBusy ? (
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
                    {isCaseBusy ? (
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
                        if (!persistedCase) return;
                        openEditForm(persistedCase);
                      }}
                      disabled={Boolean(updatingCaseId) || hasDeletingCases || isCaseBusy}
                      className="px-2.5 py-1 rounded-md border border-white/[0.14] text-cream hover:bg-white/[0.06] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("cases-edit")}
                    </button>
                    <button
                      onClick={() => handleDeleteCase(item.id, item.projectName)}
                      aria-label={t("cases-delete")}
                      className="ml-2 p-1.5 rounded-md text-muted/40 hover:text-red-400 hover:bg-red-400/[0.06] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      title={t("cases-delete")}
                      disabled={!!deletingCaseIds[item.id] || Boolean(updatingCaseId) || isCaseBusy}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div
                  data-testid={`cases-action-snapshot-${item.id}`}
                  className="mb-5 grid gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-sm md:grid-cols-2 lg:grid-cols-6"
                >
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-3 md:col-span-2 lg:col-span-6">
                    <div className="text-[11px] uppercase tracking-[0.1em] text-emerald-200/80">
                      {t("cases-audit-readiness")}
                    </div>
                    <div className="mt-1 font-medium text-emerald-100">
                      {formatCaseAuditReadinessSummary(item, checklist, protocolCounts[item.id] ?? 0, t)}
                    </div>
                  </div>
                  <InfoCell label={t("cases-next-legal-action")} value={item.nextAction} />
                  <InfoCell
                    label={t("cases-deadline-countdown")}
                    value={item.deadlineCountdownLabel}
                    valueClassName={countdownClass[item.deadlineCountdownTone]}
                  />
                  <InfoCell
                    label={t("cases-linked-protocols")}
                    value={
                      (protocolCounts[item.id] ?? 0) > 0
                        ? String(protocolCounts[item.id])
                        : t("cases-linked-protocols-none")
                    }
                  />
                  <InfoCell
                    label={t("cases-evidence-readiness")}
                    value={checklist.evidenceAttached ? t("cases-evidence-complete") : t("cases-evidence-incomplete")}
                  />
                  <InfoCell
                    label={t("cases-notice-readiness")}
                    value={checklist.noticeDrafted ? t("cases-notice-ready") : t("cases-notice-pending")}
                  />
                  <InfoCell
                    label={t("cases-reminder-readiness")}
                    value={formatCaseReminderReadiness(item, checklist, t)}
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
                      <div>
                        <label htmlFor={`cases-edit-notice-recipient-name-${item.id}`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                          {t("cases-notice-recipient-name")}
                        </label>
                        <input id={`cases-edit-notice-recipient-name-${item.id}`} type="text" maxLength={200} value={editFormData.noticeRecipientName} onChange={(event) => updateEditForm({ ...editFormData, noticeRecipientName: event.target.value })} className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-cream outline-none focus:border-accent/40" disabled={updatingCaseId === item.id || hasDeletingCases} />
                      </div>
                      <div>
                        <label htmlFor={`cases-edit-notice-recipient-address-${item.id}`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                          {t("cases-notice-recipient-address")}
                        </label>
                        <textarea id={`cases-edit-notice-recipient-address-${item.id}`} maxLength={1000} rows={3} value={editFormData.noticeRecipientAddress} onChange={(event) => updateEditForm({ ...editFormData, noticeRecipientAddress: event.target.value })} className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-cream outline-none focus:border-accent/40" disabled={updatingCaseId === item.id || hasDeletingCases} />
                      </div>
                      <div className="md:col-span-2">
                        <label htmlFor={`cases-edit-defect-statement-${item.id}`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                          {t("cases-defect-statement")}
                        </label>
                        <textarea id={`cases-edit-defect-statement-${item.id}`} maxLength={4000} rows={4} value={editFormData.defectStatement} onChange={(event) => updateEditForm({ ...editFormData, defectStatement: event.target.value })} className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-cream outline-none focus:border-accent/40" disabled={updatingCaseId === item.id || hasDeletingCases} />
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

                <section aria-labelledby={`cases-notice-source-title-${item.id}`} className="mb-5 rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 id={`cases-notice-source-title-${item.id}`} className="text-xs font-semibold uppercase tracking-[0.08em] text-violet-200">
                      {t("cases-notice-source-title")}
                    </h3>
                    <span className={`rounded-md border px-2.5 py-1 text-xs ${hasCompleteNoticeSource ? "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-200" : "border-amber-500/30 bg-amber-500/[0.08] text-amber-200"}`}>
                      {t(hasCompleteNoticeSource ? "cases-notice-source-complete" : "cases-notice-source-incomplete")}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted">{t("cases-notice-source-description")}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <InfoCell label={t("cases-notice-recipient-name")} value={persistedCase?.notice_recipient_name ?? t("cases-notice-source-missing")} />
                    <InfoCell label={t("cases-notice-recipient-address")} value={persistedCase?.notice_recipient_address ?? t("cases-notice-source-missing")} valueClassName="whitespace-pre-wrap text-cream" />
                    <div className="md:col-span-2">
                      <InfoCell label={t("cases-defect-statement")} value={persistedCase?.defect_statement ?? t("cases-notice-source-missing")} valueClassName="whitespace-pre-wrap text-cream" />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-start gap-3">
                    <button
                      type="button"
                      aria-controls={`cases-notice-preview-${item.id}`}
                      aria-describedby={!hasCompleteNoticeSource ? noticePreviewUnavailableId : undefined}
                      aria-expanded={isNoticePreviewOpen}
                      disabled={!hasCompleteNoticeSource}
                      onClick={() => {
                        if (!completeNoticeSource) return;
                        updateNoticePreviewOpenByCase((current) => {
                          if (current[item.id]) {
                            const next = { ...current };
                            delete next[item.id];
                            return next;
                          }
                          return { ...current, [item.id]: true };
                        });
                      }}
                      className="rounded-lg border border-violet-400/30 px-3 py-2 text-sm font-medium text-violet-100 hover:bg-violet-500/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t(isNoticePreviewOpen ? "cases-notice-preview-hide" : "cases-notice-preview-show")}
                    </button>
                    <button
                      type="button"
                      aria-label={t("cases-notice-draft-create")}
                      disabled={!persistedCase || !noticeDraftPayload || hasAnyRowLevelMutation}
                      onClick={() => {
                        if (!persistedCase || !noticeDraftPayload) return;
                        void handleCreateNoticeDraft(item, persistedCase);
                      }}
                      className="rounded-lg border border-cyan-400/30 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t(isNoticeDraftCreating ? "cases-notice-draft-creating" : "cases-notice-draft-create")}
                    </button>
                    {!hasCompleteNoticeSource && (
                      <p id={noticePreviewUnavailableId} className="basis-full text-xs text-amber-200">
                        {t("cases-notice-preview-unavailable")}
                      </p>
                    )}
                    {!isNoticeDraftCreating && noticeDraftFeedbackByCase[item.id] && (
                      <p
                        role="status"
                        className={`basis-full text-xs ${
                          noticeDraftFeedbackByCase[item.id] === "cases-notice-draft-created"
                            ? "text-emerald-300"
                            : "text-rose-300"
                        }`}
                      >
                        {t(noticeDraftFeedbackByCase[item.id])}
                      </p>
                    )}
                  </div>
                  {isNoticePreviewOpen && completeNoticeSource && (
                    <section
                      id={`cases-notice-preview-${item.id}`}
                      data-testid={`cases-notice-preview-${item.id}`}
                      aria-labelledby={`cases-notice-preview-title-${item.id}`}
                      className="mt-4 rounded-xl border border-violet-300/30 bg-black/20 p-4"
                    >
                      <h3 id={`cases-notice-preview-title-${item.id}`} className="font-semibold text-cream">
                        {t("cases-notice-preview-title")}
                      </h3>
                      <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/[0.08] px-3 py-2 text-sm font-semibold text-amber-100">
                        {t("cases-notice-preview-status")}
                      </p>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <InfoCell label={t("cases-notice-preview-subject")} value={item.projectName} />
                        <InfoCell label={t("cases-canton")} value={item.canton} />
                        <InfoCell label={t("cases-notice-recipient-name")} value={completeNoticeSource.recipientName} />
                        <InfoCell label={t("cases-notice-recipient-address")} value={completeNoticeSource.recipientAddress} valueClassName="whitespace-pre-wrap text-cream" />
                        <div className="md:col-span-2">
                          <InfoCell label={t("cases-defect-statement")} value={completeNoticeSource.defectStatement} valueClassName="whitespace-pre-wrap text-cream" />
                        </div>
                        <div className="md:col-span-2 text-xs font-semibold uppercase tracking-[0.08em] text-violet-200">
                          {t("cases-notice-preview-context")}
                        </div>
                        <InfoCell label={t("cases-contract-date")} value={item.contractDateLabel} />
                        <InfoCell label={t("cases-defect-discovered")} value={item.discoveryDateLabel} />
                        <div className="md:col-span-2">
                          <InfoCell
                            label={t("cases-notice-preview-deadline")}
                            value={item.noticeDeadline ? item.noticeDeadlineLabel : t("cases-not-fixed")}
                          />
                        </div>
                      </div>
                      <p className="mt-4 text-xs text-muted">{t("cases-notice-preview-safety")}</p>
                    </section>
                  )}
                  {latestNoticeDraft && (
                    <section
                      data-testid={`cases-notice-draft-${item.id}`}
                      aria-labelledby={`cases-notice-draft-title-${item.id}`}
                      className="mt-4 rounded-xl border border-cyan-300/30 bg-cyan-500/[0.05] p-4"
                    >
                      <h3 id={`cases-notice-draft-title-${item.id}`} className="font-semibold text-cyan-100">
                        {t("cases-notice-draft-title")}
                      </h3>
                      <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/[0.08] px-3 py-2 text-sm font-semibold text-amber-100">
                        {t("cases-notice-draft-status")}
                      </p>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <InfoCell label={t("cases-notice-draft-created-at")} value={formatNoticeDraftCreatedAt(latestNoticeDraft.created_at, lang)} />
                        <InfoCell label={t("cases-notice-preview-subject")} value={latestNoticeDraft.project_name} />
                        <InfoCell label={t("cases-canton")} value={latestNoticeDraft.canton} />
                        <InfoCell label={t("cases-audit-register-regime")} value={t(latestNoticeDraft.regime === "old" ? "cases-old-law" : "cases-new-law")} />
                        <InfoCell label={t("cases-notice-recipient-name")} value={latestNoticeDraft.notice_recipient_name} />
                        <InfoCell label={t("cases-notice-recipient-address")} value={latestNoticeDraft.notice_recipient_address} valueClassName="whitespace-pre-wrap text-cream" />
                        <div className="md:col-span-2">
                          <InfoCell label={t("cases-defect-statement")} value={latestNoticeDraft.defect_statement} valueClassName="whitespace-pre-wrap text-cream" />
                        </div>
                        <div className="md:col-span-2 text-xs font-semibold uppercase tracking-[0.08em] text-cyan-200">
                          {t("cases-notice-draft-context")}
                        </div>
                        <InfoCell label={t("cases-contract-date")} value={formatNoticeDraftDate(latestNoticeDraft.contract_date)} />
                        <InfoCell label={t("cases-defect-discovered")} value={formatNoticeDraftDate(latestNoticeDraft.discovery_date)} />
                        <div className="md:col-span-2">
                          <InfoCell
                            label={t("cases-notice-preview-deadline")}
                            value={latestNoticeDraft.notice_deadline ? formatNoticeDraftDate(latestNoticeDraft.notice_deadline) : t("cases-not-fixed")}
                          />
                        </div>
                      </div>
                    </section>
                  )}
                </section>

                <details className="rounded-xl border border-white/[0.07] p-4 bg-white/[0.01]">
                  <summary className="cursor-pointer text-sm font-semibold text-cream">{t("cases-detail-summary")}</summary>
                  <div className="mt-4 grid md:grid-cols-3 gap-3 text-sm mb-4">
                    <InfoCell label={t("cases-next-legal-action")} value={item.nextAction} />
                    <InfoCell label={t("cases-deadline-countdown")} value={item.deadlineCountdownLabel} valueClassName={countdownClass[item.deadlineCountdownTone]} />
                    <InfoCell
                      label={t("cases-reminder-readiness")}
                      value={formatCaseReminderReadiness(item, checklist, t, { includeEmailReadiness: true })}
                    />
                  </div>

                  <section
                    data-testid={`cases-legal-timeline-${item.id}`}
                    aria-labelledby={`cases-legal-timeline-title-${item.id}`}
                    className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/[0.05] p-4"
                  >
                    <h3
                      id={`cases-legal-timeline-title-${item.id}`}
                      className="text-xs font-semibold uppercase tracking-[0.08em] text-blue-200"
                    >
                      {t("cases-legal-timeline-title")}
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      {t("cases-legal-timeline-desc")}
                    </p>
                    <ol className="mt-3 space-y-2 border-l border-blue-400/30 pl-4">
                      {deriveCaseLegalMilestones(
                        item,
                        linkedProtocolEventsByCase[item.id] ?? [],
                        evidenceEventsByCase[item.id] ?? []
                      ).map((milestone) => (
                        <li
                          key={milestone.id ?? milestone.kind}
                          className="flex items-center justify-between gap-4 text-sm"
                        >
                          <span className="text-cream">
                            {t(legalMilestoneLabelKey[milestone.kind])}
                            {milestone.sourceName && (
                              <span className="ml-2 font-mono text-xs text-blue-100">{milestone.sourceName}</span>
                            )}
                          </span>
                          <time dateTime={formatMilestoneDateTime(milestone.date)} className="text-blue-100">
                            {milestone.dateLabel}
                          </time>
                        </li>
                      ))}
                    </ol>
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => downloadCaseChronology(item)}
                        disabled={isCaseBusy}
                        className="rounded-lg border border-blue-400/30 px-3 py-2 text-sm text-blue-100 hover:bg-blue-500/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("cases-export-chronology-csv")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void downloadCaseAuditDossier(item, checklist)}
                        disabled={isCaseBusy}
                        className="rounded-lg border border-accent/40 px-3 py-2 text-sm text-accent hover:bg-accent/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isDossierGenerating ? t("cases-dossier-title") : t("cases-export-dossier-pdf")}
                      </button>
                    </div>
                    {dossierFeedbackByCase[item.id] && (
                      <p
                        role="status"
                        className={`mt-2 text-right text-xs ${
                          dossierFeedbackByCase[item.id].tone === "success"
                            ? "text-emerald-300"
                            : "text-rose-300"
                        }`}
                      >
                        {t(dossierFeedbackByCase[item.id].key)}
                      </p>
                    )}
                  </section>

                  {finalizedProtocols.length > 0 && (
                    <section
                      data-testid={`cases-finalized-protocols-${item.id}`}
                      aria-labelledby={`cases-finalized-protocols-title-${item.id}`}
                      className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-4"
                    >
                      <h3
                        id={`cases-finalized-protocols-title-${item.id}`}
                        className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-200"
                      >
                        {t("cases-finalized-protocols-title")}
                      </h3>
                      <p className="mt-1 text-xs text-muted">
                        {t("cases-finalized-protocols-desc")}
                      </p>
                      <ul className="mt-3 space-y-2">
                        {finalizedProtocols.map((protocol) => (
                          <li
                            key={protocol.id}
                            className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 text-xs">
                              <div className="truncate font-mono text-cream">{protocol.id}</div>
                              <time dateTime={protocol.created_at} className="mt-1 block text-muted">
                                {formatTimestampDateCH(new Date(protocol.created_at))}
                              </time>
                            </div>
                            <button
                              type="button"
                              onClick={() => void downloadFinalizedProtocolPdf(protocol)}
                              disabled={isCaseBusy}
                              className="rounded-lg border border-emerald-400/30 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isProtocolPdfGenerating
                                ? t("cases-finalized-protocol-generating")
                                : t("cases-download-finalized-protocol")}
                            </button>
                          </li>
                        ))}
                      </ul>
                      {protocolPdfFeedbackByCase[item.id] && (
                        <p
                          role="status"
                          className={`mt-2 text-right text-xs ${
                            protocolPdfFeedbackByCase[item.id].tone === "success"
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }`}
                        >
                          {t(protocolPdfFeedbackByCase[item.id].key)}
                        </p>
                      )}
                    </section>
                  )}

                  <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3 space-y-2">
                    <div className="text-xs uppercase tracking-[0.08em] text-muted/70">{t("cases-followup-checklist")}</div>
                    {Object.entries(checklistLabels).map(([key, label]) => {
                      const checklistKey = key as FollowUpChecklistKey;
                      return (
                        <label key={key} className={`flex items-center gap-2 text-sm text-cream ${isCaseBusy ? "opacity-70" : ""}`}>
                          <input
                            type="checkbox"
                            checked={checklist[checklistKey]}
                            disabled={isCaseBusy}
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
                          disabled={isCaseBusy}
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
