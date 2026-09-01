"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import PageHeader from "@/components/dashboard/PageHeader";
import { AuditReportPDF } from "@/components/dashboard/AuditReportPDF";
import { CaseAuditDossierPDF } from "@/components/dashboard/CaseAuditDossierPDF";
import { CaseNoticeDraftPDF } from "@/components/dashboard/CaseNoticeDraftPDF";
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
import type { Case, CaseActivityEvent, CaseEvidence, CaseNoticeDraft, Protocol } from "@/lib/database.types";
import {
  CASE_NOTICE_DISPATCH_CHANNELS,
  CASE_NOTICE_DISPATCH_CHANNEL_KEYS,
  buildCaseNoticeDispatchPayload,
  normalizeCaseNoticeDispatch,
  normalizeCaseNoticeDispatchEvidence,
  selectLatestNoticeDispatchByCase,
  selectNoticeDispatchEvidenceByDispatch,
  type CaseNoticeDispatch,
  type CaseNoticeDispatchChannel,
  type CaseNoticeDispatchEvidence,
} from "@/lib/case-notice-dispatch";
import { buildCaseNoticeDraftPayload } from "@/lib/case-notice-draft";
import {
  buildCaseNoticeDraftReport,
  caseNoticeDraftPdfFilename,
} from "@/lib/case-notice-draft-report";
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
import { parseCaseHandoffId } from "@/lib/case-handoff";
import { buildCaseVaultHref } from "@/lib/vault";
import {
  formatDateCH,
  formatTimestampDateCH,
  getSwissCalendarDateInputValue,
  getMillisecondsUntilNextSwissCalendarDay,
  sanitizeDateQueryParam,
  validateAcceptanceChronology,
  validateRuegefristInput,
} from "@/lib/legal-utils";
import type { TranslationKey } from "@/locales";

type LinkedProtocolRow = Pick<
  Protocol,
  | "id"
  | "case_id"
  | "status"
  | "finalized_at"
>;

type FinalizedProtocolPdfRow = Omit<Pick<
  Protocol,
  | "id"
  | "case_id"
  | "status"
  | "finalized_at"
  | "project_name"
  | "contractor"
  | "client"
  | "defect_description"
  | "signature_data"
>, "status" | "finalized_at"> & { status: "finalized"; finalized_at: string };

type FinalizedLinkedProtocolRow = Omit<LinkedProtocolRow, "status" | "finalized_at"> & {
  status: "finalized";
  finalized_at: string;
};

const NOTICE_DISPATCH_PAGE_SIZE = 1000;
const EVIDENCE_HISTORY_PAGE_SIZE = 1000;
type LoadReadiness = "loading" | "ready" | "error";

function isFinalizedLinkedProtocol(
  protocol: LinkedProtocolRow
): protocol is FinalizedLinkedProtocolRow {
  return protocol.status === "finalized" && Boolean(protocol.finalized_at);
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
  "notice-dispatched": "cases-legal-milestone-notice-dispatched",
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
  acceptanceDate: string;
  noticeRecipientName: string;
  noticeRecipientAddress: string;
  defectStatement: string;
};

const EMPTY_CASE_FORM: CaseFormState = {
  projectName: "",
  canton: "ZH",
  contractDate: "",
  discoveryDate: "",
  acceptanceDate: "",
  noticeRecipientName: "",
  noticeRecipientAddress: "",
  defectStatement: "",
};

function buildCaseFormState(item: Pick<Case, "project_name" | "canton" | "contract_date" | "discovery_date" | "acceptance_date" | "notice_recipient_name" | "notice_recipient_address" | "defect_statement">): CaseFormState {
  return {
    projectName: item.project_name,
    canton: item.canton,
    contractDate: item.contract_date.slice(0, 10),
    discoveryDate: item.discovery_date.slice(0, 10),
    acceptanceDate: item.acceptance_date?.slice(0, 10) ?? "",
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
  const checklistInFlightIdsRef = useRef<Set<string>>(new Set());
  const deletingCaseIdsRef = useRef<Set<string>>(new Set());
  const updatingCaseIdRef = useRef<string | null>(null);
  const editingCaseIdRef = useRef<string | null>(null);
  const [protocolCounts, setProtocolCounts] = useState<Record<string, number>>({});
  const [linkedProtocols, setLinkedProtocols] = useState<LinkedProtocolRow[]>([]);
  const [caseActivityEvents, setCaseActivityEvents] = useState<CaseActivityEvent[]>([]);
  const [noticeDrafts, setNoticeDrafts] = useState<CaseNoticeDraft[]>([]);
  const [noticeDispatches, setNoticeDispatches] = useState<CaseNoticeDispatch[]>([]);
  const [noticeDispatchEvidence, setNoticeDispatchEvidence] = useState<CaseNoticeDispatchEvidence[]>([]);
  const [caseEvidence, setCaseEvidence] = useState<CaseEvidence[]>([]);
  const [evidenceHistoryState, setEvidenceHistoryState] = useState<LoadReadiness>("loading");
  const [dispatchEvidenceLinkingByCase, setDispatchEvidenceLinkingByCase] = useState<Record<string, boolean>>({});
  const [dispatchEvidenceFeedbackByDispatch, setDispatchEvidenceFeedbackByDispatch] = useState<Record<string, TranslationKey>>({});
  const dispatchEvidenceInFlightRef = useRef<Set<string>>(new Set());
  const dispatchEvidenceRequestIdsRef = useRef<Record<string, number>>({});
  const [noticeDispatchHistoryState, setNoticeDispatchHistoryState] = useState<LoadReadiness>("loading");
  const [noticeDispatchRecordingByCase, setNoticeDispatchRecordingByCase] = useState<Record<string, boolean>>({});
  const [noticeDispatchFeedbackByCase, setNoticeDispatchFeedbackByCase] = useState<Record<string, TranslationKey>>({});
  const noticeDispatchInFlightIdsRef = useRef<Set<string>>(new Set());
  const noticeDispatchRequestIdsRef = useRef<Record<string, number>>({});
  const latestNoticeDispatchLoadIdRef = useRef(0);
  const noticeDispatchHistoryLoadingRef = useRef(true);
  const [noticeDraftCreatingByCase, setNoticeDraftCreatingByCase] = useState<Record<string, boolean>>({});
  const [noticeDraftFeedbackByCase, setNoticeDraftFeedbackByCase] = useState<Record<string, TranslationKey>>({});
  const noticeDraftInFlightIdsRef = useRef<Set<string>>(new Set());
  const noticeDraftRequestIdsRef = useRef<Record<string, number>>({});
  const [noticeDraftPdfFeedbackByCase, setNoticeDraftPdfFeedbackByCase] = useState<
    Record<string, { key: TranslationKey; tone: "success" | "error" }>
  >({});
  const [noticeDraftPdfGeneratingByCase, setNoticeDraftPdfGeneratingByCase] = useState<Record<string, boolean>>({});
  const noticeDraftPdfFeedbackTimersRef = useRef<Record<string, number>>({});
  const noticeDraftPdfRequestIdsRef = useRef<Record<string, number>>({});
  const noticeDraftPdfInFlightCaseIdsRef = useRef<Set<string>>(new Set());
  const latestNoticeDraftByCaseRef = useRef<Record<string, CaseNoticeDraft>>({});
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
  const lastSuccessfulDispatchEvidenceRef = useRef<CaseNoticeDispatchEvidence[]>([]);
  const lastSuccessfulDispatchEvidenceUserIdRef = useRef<string | null>(null);
  const lastSuccessfulCaseEvidenceRef = useRef<CaseEvidence[]>([]);
  const lastSuccessfulCaseEvidenceUserIdRef = useRef<string | null>(null);
  const filterStateRef = useRef({
    regimeFilter,
    statusFilter,
    sortMode,
    searchTerm,
  });
  const skipNextUrlWriteRef = useRef(false);
  const lastUrlReplacementRef = useRef<string | null>(null);
  const lastObservedSearchRef = useRef<string | null>(null);

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
      lastSuccessfulDispatchEvidenceRef.current = [];
      lastSuccessfulDispatchEvidenceUserIdRef.current = null;
      lastSuccessfulCaseEvidenceRef.current = [];
      lastSuccessfulCaseEvidenceUserIdRef.current = null;
      latestNoticeDraftLoadIdRef.current += 1;
      latestNoticeDispatchLoadIdRef.current += 1;
      setDbCases([]);
      setProtocolCounts({});
      setLinkedProtocols([]);
      setCaseActivityEvents([]);
      setNoticeDrafts([]);
      setNoticeDispatches([]);
      setNoticeDispatchEvidence([]);
      setCaseEvidence([]);
      noticeDispatchHistoryLoadingRef.current = true;
      setNoticeDispatchHistoryState("loading");
      setEvidenceHistoryState("loading");
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
      const noticeDispatchLoadId = ++latestNoticeDispatchLoadIdRef.current;
      noticeDispatchHistoryLoadingRef.current = true;
      setNoticeDispatchHistoryState("loading");
      setEvidenceHistoryState("loading");
      const loadNoticeDrafts = async () => {
        try {
          const result = await supabase
            .from("latest_case_notice_drafts")
            .select("*")
            .eq("user_id", user.id);
          return { data: (result.data ?? []) as CaseNoticeDraft[], failed: Boolean(result.error) };
        } catch {
          // Draft revisions are additive; older deployments must still load Cases.
          return { data: [] as CaseNoticeDraft[], failed: true };
        }
      };
      const loadNoticeDispatches = async () => {
        try {
          const loaded: CaseNoticeDispatch[] = [];
          let cursor: Pick<CaseNoticeDispatch, "dispatched_at" | "id"> | null = null;
          for (;;) {
            let query = supabase
              .from("case_notice_dispatches")
              .select("*")
              .eq("user_id", user.id)
              .order("dispatched_at", { ascending: false })
              .order("id", { ascending: true })
              .limit(NOTICE_DISPATCH_PAGE_SIZE);
            if (cursor) {
              query = query.or(
                `dispatched_at.lt.${cursor.dispatched_at},and(dispatched_at.eq.${cursor.dispatched_at},id.gt.${cursor.id})`
              );
            }
            const result = await query;
            if (result.error) throw result.error;
            const page = ((result.data ?? []) as unknown[])
              .map(normalizeCaseNoticeDispatch)
              .filter((row): row is CaseNoticeDispatch => row !== null);
            loaded.push(...page);
            if ((result.data?.length ?? 0) < NOTICE_DISPATCH_PAGE_SIZE) break;
            const lastRecord = page.at(-1);
            if (!lastRecord) throw new Error("Dispatch history page could not be normalized");
            cursor = { dispatched_at: lastRecord.dispatched_at, id: lastRecord.id };
          }
          return { data: loaded, failed: false };
        } catch {
          return { data: [] as CaseNoticeDispatch[], failed: true };
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
      const loadDispatchEvidence = async () => {
        try {
          const loaded: CaseNoticeDispatchEvidence[] = [];
          let cursor: Pick<CaseNoticeDispatchEvidence, "created_at" | "id"> | null = null;
          for (;;) {
            let query = supabase.from("case_notice_dispatch_evidence")
              .select("*")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .order("id", { ascending: true })
              .limit(EVIDENCE_HISTORY_PAGE_SIZE);
            if (cursor) {
              query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`);
            }
            const result = await query;
            if (result.error) throw result.error;
            const rawPage = (result.data ?? []) as Array<{ id?: unknown; created_at?: unknown }>;
            const page = rawPage.map(normalizeCaseNoticeDispatchEvidence)
              .filter((row): row is CaseNoticeDispatchEvidence => row !== null);
            loaded.push(...page);
            if ((result.data?.length ?? 0) < EVIDENCE_HISTORY_PAGE_SIZE) break;
            const rawLastRecord = rawPage.at(-1);
            if (typeof rawLastRecord?.created_at !== "string" || typeof rawLastRecord.id !== "string") {
              throw new Error("Dispatch evidence page cursor was invalid");
            }
            cursor = { created_at: rawLastRecord.created_at, id: rawLastRecord.id };
          }
          return { data: loaded, failed: false };
        } catch { return { data: [] as CaseNoticeDispatchEvidence[], failed: true }; }
      };
      const loadCaseEvidence = async () => {
        try {
          const loaded: CaseEvidence[] = [];
          let cursor: Pick<CaseEvidence, "created_at" | "id"> | null = null;
          for (;;) {
            let query = supabase.from("case_evidence")
              .select("id, user_id, case_id, original_name, storage_path, mime_type, size_bytes, created_at")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .order("id", { ascending: true })
              .limit(EVIDENCE_HISTORY_PAGE_SIZE);
            if (cursor) {
              query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`);
            }
            const result = await query;
            if (result.error) throw result.error;
            const page = (result.data ?? []) as CaseEvidence[];
            loaded.push(...page);
            if ((result.data?.length ?? 0) < EVIDENCE_HISTORY_PAGE_SIZE) break;
            const lastRecord = page.at(-1);
            if (!lastRecord) throw new Error("Case evidence page was empty");
            cursor = { created_at: lastRecord.created_at, id: lastRecord.id };
          }
          return { data: loaded, failed: false };
        } catch { return { data: [] as CaseEvidence[], failed: true }; }
      };
      const activityResultPromise = loadActivityEvents();
      const noticeDraftResultPromise = loadNoticeDrafts();
      const noticeDispatchResultPromise = loadNoticeDispatches();
      const dispatchEvidenceResultPromise = loadDispatchEvidence();
      const caseEvidenceResultPromise = loadCaseEvidence();
      // Attach before the core queries settle so an early return cannot strand
      // the additive readiness gates in their loading state.
      consumeAdditiveResultPromises(user);
      const [casesResult, protocolsResult] = await Promise.all([
        supabase
          .from("cases")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("protocols")
          .select("id, case_id, status, finalized_at")
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

      function consumeAdditiveResultPromises(user: { id: string }) {
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
      void noticeDispatchResultPromise.then((dispatchResult) => {
        if (
          fetchId !== latestFetchIdRef.current
          || noticeDispatchLoadId !== latestNoticeDispatchLoadIdRef.current
          || currentUserIdRef.current !== user.id
        ) return;
        if (!dispatchResult.failed) {
          setNoticeDispatches(dispatchResult.data);
          noticeDispatchHistoryLoadingRef.current = false;
          setNoticeDispatchHistoryState("ready");
        } else {
          setNoticeDispatches([]);
          noticeDispatchHistoryLoadingRef.current = false;
          setNoticeDispatchHistoryState("error");
        }
      });
      void Promise.all([dispatchEvidenceResultPromise, caseEvidenceResultPromise]).then(([dispatchEvidenceResult, caseEvidenceResult]) => {
        if (fetchId !== latestFetchIdRef.current || currentUserIdRef.current !== user.id) return;

        if (!dispatchEvidenceResult.failed && !caseEvidenceResult.failed) {
          lastSuccessfulDispatchEvidenceRef.current = dispatchEvidenceResult.data;
          lastSuccessfulDispatchEvidenceUserIdRef.current = user.id;
          lastSuccessfulCaseEvidenceRef.current = caseEvidenceResult.data;
          lastSuccessfulCaseEvidenceUserIdRef.current = user.id;
          setNoticeDispatchEvidence(dispatchEvidenceResult.data);
          setCaseEvidence(caseEvidenceResult.data);
          setEvidenceHistoryState("ready");
          return;
        }

        setNoticeDispatchEvidence(
          lastSuccessfulDispatchEvidenceUserIdRef.current === user.id
            ? lastSuccessfulDispatchEvidenceRef.current
            : []
        );
        setCaseEvidence(
          lastSuccessfulCaseEvidenceUserIdRef.current === user.id
            ? lastSuccessfulCaseEvidenceRef.current
            : []
        );
        setEvidenceHistoryState("error");
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
      }
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
    latestNoticeDispatchLoadIdRef.current += 1;
    for (const caseId of Object.keys(noticeDispatchRequestIdsRef.current)) {
      noticeDispatchRequestIdsRef.current[caseId] += 1;
    }
    for (const dispatchId of Object.keys(dispatchEvidenceRequestIdsRef.current)) {
      dispatchEvidenceRequestIdsRef.current[dispatchId] += 1;
    }
    noticeDispatchInFlightIdsRef.current.clear();
    dispatchEvidenceInFlightRef.current.clear();
    setNoticeDispatches([]);
    setNoticeDispatchEvidence([]);
    setCaseEvidence([]);
    setNoticeDispatchHistoryState("loading");
    setEvidenceHistoryState("loading");
    lastSuccessfulDispatchEvidenceRef.current = [];
    lastSuccessfulDispatchEvidenceUserIdRef.current = null;
    lastSuccessfulCaseEvidenceRef.current = [];
    lastSuccessfulCaseEvidenceUserIdRef.current = null;
    setDispatchEvidenceLinkingByCase({});
    setDispatchEvidenceFeedbackByDispatch({});
    setNoticeDispatchRecordingByCase({});
    setNoticeDispatchFeedbackByCase({});
    for (const caseId of Object.keys(noticeDraftRequestIdsRef.current)) {
      noticeDraftRequestIdsRef.current[caseId] += 1;
    }
    for (const caseId of Object.keys(noticeDraftPdfRequestIdsRef.current)) {
      noticeDraftPdfRequestIdsRef.current[caseId] += 1;
    }
    noticeDraftInFlightIdsRef.current.clear();
    noticeDraftPdfInFlightCaseIdsRef.current.clear();
    for (const timer of Object.values(noticeDraftPdfFeedbackTimersRef.current)) {
      window.clearTimeout(timer);
    }
    noticeDraftPdfFeedbackTimersRef.current = {};
    lastSuccessfulNoticeDraftsRef.current = [];
    lastSuccessfulNoticeDraftsUserIdRef.current = null;
    setNoticeDrafts([]);
    setNoticeDraftCreatingByCase({});
    setNoticeDraftFeedbackByCase({});
    setNoticeDraftPdfGeneratingByCase({});
    setNoticeDraftPdfFeedbackByCase({});
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
  const requestedCaseId = useMemo(
    () => parseCaseHandoffId(new URLSearchParams(searchParamString).get("case")),
    [searchParamString]
  );

  const replaceUrlOnce = useCallback((sourceSearch: string, nextSearch: string) => {
    const replacementKey = `${sourceSearch}\n${nextSearch}`;
    if (lastUrlReplacementRef.current === replacementKey) return;
    lastUrlReplacementRef.current = replacementKey;
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, { scroll: false });
  }, [pathname, router]);

  useEffect(() => {
    if (lastObservedSearchRef.current === searchParamString) return;
    lastObservedSearchRef.current = searchParamString;
    lastUrlReplacementRef.current = null;
  }, [searchParamString]);

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
    const rawRequestedCaseId = params.get("case");

    if (params.has("regime") && nextRegime === "all") sanitizedParams.delete("regime");
    if (params.has("status") && nextStatus === "all") sanitizedParams.delete("status");
    if (params.has("sort") && nextSort === "nearest-deadline") sanitizedParams.delete("sort");
    if (rawRequestedCaseId !== null && parseCaseHandoffId(rawRequestedCaseId) === null) {
      sanitizedParams.delete("case");
    }
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
      replaceUrlOnce(searchParamString, sanitizedSearch);
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
  }, [searchParamString, replaceUrlOnce]);

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
      replaceUrlOnce(current, next);
    }
  }, [regimeFilter, statusFilter, sortMode, searchTerm, searchParams, replaceUrlOnce]);

  useEffect(() => {
    dossierMountedRef.current = true;
    const dossierInFlightIds = dossierInFlightIdsRef.current;
    const dossierRequestIds = dossierRequestIdsRef.current;
    const protocolPdfInFlightCaseIds = protocolPdfInFlightCaseIdsRef.current;
    const protocolPdfRequestIds = protocolPdfRequestIdsRef.current;
    const noticeDraftPdfInFlightCaseIds = noticeDraftPdfInFlightCaseIdsRef.current;
    const noticeDraftPdfRequestIds = noticeDraftPdfRequestIdsRef.current;
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
      for (const timer of Object.values(noticeDraftPdfFeedbackTimersRef.current)) {
        window.clearTimeout(timer);
      }
      reminderExportResetTimersRef.current = {};
      reminderExportRequestIdsRef.current = {};
      dossierFeedbackTimersRef.current = {};
      protocolPdfFeedbackTimersRef.current = {};
      noticeDraftPdfFeedbackTimersRef.current = {};
      dossierInFlightIds.clear();
      protocolPdfInFlightCaseIds.clear();
      noticeDraftPdfInFlightCaseIds.clear();
      for (const caseId of Object.keys(dossierRequestIds)) {
        dossierRequestIds[caseId] += 1;
      }
      for (const caseId of Object.keys(protocolPdfRequestIds)) {
        protocolPdfRequestIds[caseId] += 1;
      }
      for (const caseId of Object.keys(noticeDraftPdfRequestIds)) {
        noticeDraftPdfRequestIds[caseId] += 1;
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
      if (!protocol.case_id || !protocol.id || !protocol.status || !protocol.finalized_at) continue;

      const events = result[protocol.case_id] ?? [];
      events.push({
        id: protocol.id,
        status: protocol.status,
        createdAt: protocol.finalized_at,
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
          new Date(b.finalized_at).getTime() - new Date(a.finalized_at).getTime() ||
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
  latestNoticeDraftByCaseRef.current = latestNoticeDraftByCase;

  const latestNoticeDispatchByCase = useMemo(
    () => selectLatestNoticeDispatchByCase(noticeDispatches),
    [noticeDispatches]
  );
  const noticeDispatchesByCase = useMemo(() => {
    const result: Record<string, CaseNoticeDispatch[]> = {};
    for (const dispatch of noticeDispatches) {
      (result[dispatch.case_id] ??= []).push(dispatch);
    }
    return result;
  }, [noticeDispatches]);
  const noticeDispatchEvidenceByDispatch = useMemo(
    () => selectNoticeDispatchEvidenceByDispatch(noticeDispatchEvidence),
    [noticeDispatchEvidence]
  );
  const caseEvidenceByCase = useMemo(() => {
    const result: Record<string, CaseEvidence[]> = {};
    for (const record of caseEvidence) (result[record.case_id] ??= []).push(record);
    return result;
  }, [caseEvidence]);

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
    if (requestedCaseId) {
      const isOwnedCase = dbCases.some(
        (item) => item.id === requestedCaseId && item.user_id === user?.id
      );
      if (!isOwnedCase) return [];
      const requestedCase = cases.find((item) => item.id === requestedCaseId);
      return requestedCase ? [requestedCase] : [];
    }
    return filterCasesByStatus(searchScopedCases, statusFilter);
  }, [requestedCaseId, dbCases, user?.id, cases, searchScopedCases, statusFilter]);

  const clearCaseHandoffHref = useMemo(() => {
    const params = new URLSearchParams(searchParamString);
    params.delete("case");
    const next = params.toString();
    return next ? `${pathname}?${next}` : pathname;
  }, [pathname, searchParamString]);

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

  function guardCaseNavigation(event: ReactMouseEvent<HTMLAnchorElement>, caseId: string) {
    if (
      dispatchEvidenceInFlightRef.current.has(caseId)
      || noticeDispatchInFlightIdsRef.current.has(caseId)
      || checklistInFlightIdsRef.current.has(caseId)
      || deletingCaseIdsRef.current.has(caseId)
      || updatingCaseIdRef.current === caseId
      || editingCaseIdRef.current === caseId
      || noticeDraftInFlightIdsRef.current.has(caseId)
      || noticeDraftPdfInFlightCaseIdsRef.current.has(caseId)
      || dossierInFlightIdsRef.current.has(caseId)
      || protocolPdfInFlightCaseIdsRef.current.has(caseId)
    ) {
      event.preventDefault();
    }
  }

  function openEditForm(item: Case) {
    if (
      updatingCaseIdRef.current
      || deletingCaseIdsRef.current.size > 0
      || noticeDispatchInFlightIdsRef.current.has(item.id)
      || dispatchEvidenceInFlightRef.current.has(item.id)
      || noticeDraftCreatingByCase[item.id]
    ) return;
    setCaseUpdateFeedback(null);
    editingCaseIdRef.current = item.id;
    setEditingCaseId(item.id);
    setEditFormData(buildCaseFormState(item));
  }

  function closeEditForm() {
    if (updatingCaseIdRef.current) return;
    editingCaseIdRef.current = null;
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

  const caseAcceptanceDateValidationError =
    !formData.contractDate || !formData.discoveryDate
      ? null
      : validateAcceptanceChronology(
      formData.contractDate,
      formData.acceptanceDate,
      formData.discoveryDate,
      getSwissCalendarDateInputValue()
    );

  const editCaseDateValidationError = useMemo(() => {
    if (!editFormData.contractDate || !editFormData.discoveryDate) return null;
    return validateRuegefristInput(
      new Date(editFormData.contractDate),
      new Date(editFormData.discoveryDate)
    );
  }, [editFormData.contractDate, editFormData.discoveryDate]);

  const editCaseAcceptanceDateValidationError =
    !editFormData.contractDate || !editFormData.discoveryDate
      ? null
      : validateAcceptanceChronology(
      editFormData.contractDate,
      editFormData.acceptanceDate,
      editFormData.discoveryDate,
      getSwissCalendarDateInputValue()
    );

  const hasDeletingCases = Object.keys(deletingCaseIds).length > 0;
  const hasChecklistSave = Object.values(checklistSavingByCase).some(Boolean);
  const hasDossierGeneration = Object.values(dossierGeneratingByCase).some(Boolean);
  const hasProtocolPdfGeneration = Object.values(protocolPdfGeneratingByCase).some(Boolean);
  const hasNoticeDraftCreation = Object.values(noticeDraftCreatingByCase).some(Boolean);
  const hasNoticeDispatchRecording = Object.values(noticeDispatchRecordingByCase).some(Boolean);
  const hasDispatchEvidenceLinking = Object.values(dispatchEvidenceLinkingByCase).some(Boolean);
  const hasAnyRowLevelMutation = Boolean(
    editingCaseId
    || updatingCaseId
    || hasDeletingCases
    || hasChecklistSave
    || hasDossierGeneration
    || hasProtocolPdfGeneration
    || hasNoticeDraftCreation
    || hasNoticeDispatchRecording
    || hasDispatchEvidenceLinking
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
      noticeDispatchInFlightIdsRef.current.has(caseId)
      || dispatchEvidenceInFlightRef.current.has(caseId)
      || checklistInFlightIdsRef.current.has(caseId)
      || noticeDraftCreatingByCase[caseId]
      || editingCaseId === caseId
      || updatingCaseId === caseId
      || deletingCaseIds[caseId]
      || dossierGeneratingByCase[caseId]
      || protocolPdfGeneratingByCase[caseId]
      || noticeDraftPdfGeneratingByCase[caseId]
    ) {
      return;
    }

    checklistInFlightIdsRef.current.add(caseId);
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
      checklistInFlightIdsRef.current.delete(caseId);
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
      noticeDispatchInFlightIdsRef.current.has(item.id)
      || dispatchEvidenceInFlightRef.current.has(item.id)
      || noticeDraftCreatingByCase[item.id]
      || editingCaseId === item.id
      || updatingCaseId === item.id
      || deletingCaseIds[item.id]
      || checklistSavingByCase[item.id]
      || dossierGeneratingByCase[item.id]
      || protocolPdfGeneratingByCase[item.id]
      || noticeDraftPdfGeneratingByCase[item.id]
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
    const currentCases = buildComplianceCaseTimeline(caseInputs);
    let currentVisibleCases: ComplianceCaseViewModel[];

    if (requestedCaseId) {
      const isOwnedCase = dbCases.some(
        (item) => item.id === requestedCaseId && item.user_id === user?.id
      );
      const requestedCase = isOwnedCase
        ? currentCases.find((item) => item.id === requestedCaseId)
        : undefined;
      currentVisibleCases = requestedCase ? [requestedCase] : [];
    } else {
      const currentSearchScopedCases = applyComplianceCaseView(
        currentCases,
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
      currentVisibleCases = filterCasesByStatus(currentSearchResults, statusFilter);
    }
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
      noticeDispatchHistoryState !== "ready"
      || evidenceHistoryState !== "ready"
      || noticeDispatchInFlightIdsRef.current.has(item.id)
      || dispatchEvidenceInFlightRef.current.has(item.id)
      || noticeDraftCreatingByCase[item.id]
      || editingCaseId === item.id
      || updatingCaseId === item.id
      || deletingCaseIds[item.id]
      || checklistSavingByCase[item.id]
      || dossierGeneratingByCase[item.id]
      || protocolPdfGeneratingByCase[item.id]
      || noticeDraftPdfGeneratingByCase[item.id]
      || noticeDispatchRecordingByCase[item.id]
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
        supportingEvidenceName: t("cases-notice-dispatch-evidence-file"),
        supportingEvidenceId: t("cases-notice-dispatch-evidence-id"),
        supportingEvidenceAssociationId: t("cases-notice-dispatch-evidence-association-id"),
        milestones: {
          contract: t("cases-legal-milestone-contract"),
          discovery: t("cases-legal-milestone-discovery"),
          "evidence-uploaded": t("cases-legal-milestone-evidence-uploaded"),
          "protocol-finalized": t("cases-legal-milestone-protocol-finalized"),
          "notice-dispatched": t("cases-legal-milestone-notice-dispatched"),
          "notice-deadline": t("cases-legal-milestone-notice-deadline"),
        },
        dispatchChannels: {
          "registered-mail": t("cases-notice-dispatch-channel-registered-mail"),
          "a-mail-plus": t("cases-notice-dispatch-channel-a-mail-plus"),
          courier: t("cases-notice-dispatch-channel-courier"),
          "hand-delivery": t("cases-notice-dispatch-channel-hand-delivery"),
        },
      },
      new Date(),
      noticeDispatchesByCase[item.id] ?? [],
      noticeDispatchEvidence,
      caseEvidenceByCase[item.id] ?? []
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
      || noticeDispatchInFlightIdsRef.current.has(caseId)
      || dispatchEvidenceInFlightRef.current.has(caseId)
      || noticeDraftCreatingByCase[caseId]
      || editingCaseId === caseId
      || updatingCaseId === caseId
      || deletingCaseIds[caseId]
      || checklistSavingByCase[caseId]
      || dossierGeneratingByCase[caseId]
      || protocolPdfGeneratingByCase[caseId]
      || noticeDraftPdfGeneratingByCase[caseId]
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
        .select("id, case_id, status, finalized_at, project_name, contractor, client, defect_description, signature_data")
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
      noticeDispatchHistoryState !== "ready"
      || evidenceHistoryState !== "ready"
      || dossierInFlightIdsRef.current.has(item.id)
      || noticeDispatchInFlightIdsRef.current.has(item.id)
      || dispatchEvidenceInFlightRef.current.has(item.id)
      || noticeDraftCreatingByCase[item.id]
      || editingCaseId === item.id
      || updatingCaseId === item.id
      || deletingCaseIds[item.id]
      || checklistSavingByCase[item.id]
      || dossierGeneratingByCase[item.id]
      || protocolPdfGeneratingByCase[item.id]
      || noticeDraftPdfGeneratingByCase[item.id]
      || noticeDispatchRecordingByCase[item.id]
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
        noticeDispatches: noticeDispatchesByCase[item.id] ?? [],
        dispatchEvidence: noticeDispatchEvidence,
        evidence: caseEvidenceByCase[item.id] ?? [],
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
          supportingEvidence: t("cases-notice-dispatch-evidence-file"),
          supportingEvidenceId: t("cases-notice-dispatch-evidence-id"),
          supportingEvidenceAssociationId: t("cases-notice-dispatch-evidence-association-id"),
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
            "notice-dispatched": t("cases-legal-milestone-notice-dispatched"),
            "notice-deadline": t("cases-legal-milestone-notice-deadline"),
          },
          dispatchChannels: {
            "registered-mail": t("cases-notice-dispatch-channel-registered-mail"),
            "a-mail-plus": t("cases-notice-dispatch-channel-a-mail-plus"),
            courier: t("cases-notice-dispatch-channel-courier"),
            "hand-delivery": t("cases-notice-dispatch-channel-hand-delivery"),
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

  async function downloadCaseNoticeDraftPdf(draft: CaseNoticeDraft) {
    const caseId = draft.case_id;
    const draftId = draft.id;
    const userId = user?.id;
    if (
      !userId
      || draft.user_id !== userId
      || noticeDraftPdfInFlightCaseIdsRef.current.has(caseId)
      || noticeDispatchInFlightIdsRef.current.has(caseId)
      || dispatchEvidenceInFlightRef.current.has(caseId)
      || noticeDraftCreatingByCase[caseId]
      || editingCaseId === caseId
      || updatingCaseId === caseId
      || deletingCaseIds[caseId]
      || checklistSavingByCase[caseId]
      || dossierGeneratingByCase[caseId]
      || protocolPdfGeneratingByCase[caseId]
      || noticeDraftPdfGeneratingByCase[caseId]
    ) return;

    const report = buildCaseNoticeDraftReport(draft, {
      title: t("cases-notice-draft-pdf-title"),
      saved: t("cases-notice-draft-pdf-saved"),
      notApproved: t("cases-notice-draft-pdf-not-approved"),
      notSent: t("cases-notice-draft-pdf-not-sent"),
      reviewDisclaimer: t("cases-notice-draft-pdf-review-disclaimer"),
      legalDisclaimer: t("cases-notice-draft-pdf-legal-disclaimer"),
      draftId: t("cases-notice-draft-pdf-revision-id"),
      createdAt: t("cases-notice-draft-created-at"),
      projectName: t("cases-notice-preview-subject"),
      canton: t("cases-canton-label"),
      recipientName: t("cases-notice-recipient-name"),
      recipientAddress: t("cases-notice-recipient-address"),
      defectStatement: t("cases-defect-statement"),
      contractDate: t("cases-contract-date"),
      discoveryDate: t("cases-defect-discovered"),
      noticeDeadline: t("cases-notice-draft-pdf-stored-deadline"),
      noticeDeadlineNotFixed: t("cases-not-fixed"),
      regime: t("cases-audit-register-regime"),
      regimes: {
        old: t("cases-old-law"),
        new: t("cases-new-law"),
      },
    });

    noticeDraftPdfInFlightCaseIdsRef.current.add(caseId);
    const requestId = (noticeDraftPdfRequestIdsRef.current[caseId] ?? 0) + 1;
    noticeDraftPdfRequestIdsRef.current[caseId] = requestId;
    const existingTimer = noticeDraftPdfFeedbackTimersRef.current[caseId];
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
      delete noticeDraftPdfFeedbackTimersRef.current[caseId];
    }
    setNoticeDraftPdfFeedbackByCase((current) => {
      if (!(caseId in current)) return current;
      const next = { ...current };
      delete next[caseId];
      return next;
    });
    setNoticeDraftPdfGeneratingByCase((current) => ({ ...current, [caseId]: true }));

    const requestOwnershipIsCurrent = () =>
      dossierMountedRef.current
      && currentUserIdRef.current === userId
      && noticeDraftPdfRequestIdsRef.current[caseId] === requestId;
    const sourceIsCurrent = () =>
      requestOwnershipIsCurrent()
      && latestNoticeDraftByCaseRef.current[caseId]?.id === draftId;
    const showFeedback = (key: TranslationKey, tone: "success" | "error") => {
      setNoticeDraftPdfFeedbackByCase((current) => ({ ...current, [caseId]: { key, tone } }));
      noticeDraftPdfFeedbackTimersRef.current[caseId] = window.setTimeout(() => {
        if (noticeDraftPdfRequestIdsRef.current[caseId] !== requestId) return;
        setNoticeDraftPdfFeedbackByCase((current) => {
          if (!(caseId in current)) return current;
          const next = { ...current };
          delete next[caseId];
          return next;
        });
        delete noticeDraftPdfFeedbackTimersRef.current[caseId];
      }, 2000);
    };

    try {
      const blob = await pdf(<CaseNoticeDraftPDF report={report} />).toBlob();
      if (!sourceIsCurrent()) return;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = caseNoticeDraftPdfFilename(draftId);
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(url);
      }
      showFeedback("cases-notice-draft-download-success", "success");
    } catch {
      if (!sourceIsCurrent()) return;
      showFeedback("cases-notice-draft-download-error", "error");
    } finally {
      if (noticeDraftPdfRequestIdsRef.current[caseId] === requestId) {
        noticeDraftPdfInFlightCaseIdsRef.current.delete(caseId);
      }
      if (requestOwnershipIsCurrent()) {
        setNoticeDraftPdfGeneratingByCase((current) => {
          const next = { ...current };
          delete next[caseId];
          return next;
        });
      }
    }
  }

  async function handleRecordNoticeDispatch(
    event: FormEvent<HTMLFormElement>,
    item: ComplianceCaseViewModel,
    selectedDraft: CaseNoticeDraft
  ) {
    event.preventDefault();
    const userId = user?.id;
    const caseId = item.id;
    if (
      !userId
      || selectedDraft.user_id !== userId
      || selectedDraft.case_id !== caseId
      || latestNoticeDraftByCaseRef.current[caseId]?.id !== selectedDraft.id
      || noticeDispatchHistoryLoadingRef.current
      || noticeDispatchInFlightIdsRef.current.has(caseId)
      || dispatchEvidenceInFlightRef.current.has(caseId)
      || checklistInFlightIdsRef.current.has(caseId)
      || deletingCaseIdsRef.current.has(caseId)
      || updatingCaseIdRef.current !== null
      || editingCaseIdRef.current !== null
      || noticeDraftInFlightIdsRef.current.has(caseId)
      || noticeDraftPdfInFlightCaseIdsRef.current.has(caseId)
      || editingCaseId !== null
      || updatingCaseId !== null
      || hasDeletingCases
      || hasChecklistSave
      || hasDossierGeneration
      || hasProtocolPdfGeneration
      || dossierInFlightIdsRef.current.has(caseId)
      || protocolPdfInFlightCaseIdsRef.current.has(caseId)
    ) return;

    const form = new FormData(event.currentTarget);
    const payload = buildCaseNoticeDispatchPayload({
      dispatchedAt: String(form.get("dispatched_at") ?? ""),
      channel: String(form.get("channel") ?? "") as CaseNoticeDispatchChannel,
      reference: String(form.get("reference") ?? ""),
    });
    if (!payload) {
      setNoticeDispatchFeedbackByCase((current) => ({ ...current, [caseId]: "cases-notice-dispatch-invalid" }));
      return;
    }

    noticeDispatchInFlightIdsRef.current.add(caseId);
    const requestId = (noticeDispatchRequestIdsRef.current[caseId] ?? 0) + 1;
    noticeDispatchRequestIdsRef.current[caseId] = requestId;
    setNoticeDispatchRecordingByCase((current) => ({ ...current, [caseId]: true }));
    setNoticeDispatchFeedbackByCase((current) => {
      const next = { ...current };
      delete next[caseId];
      return next;
    });
    const requestIsCurrent = () =>
      dossierMountedRef.current
      && currentUserIdRef.current === userId
      && noticeDispatchRequestIdsRef.current[caseId] === requestId
      && latestNoticeDraftByCaseRef.current[caseId]?.id === selectedDraft.id;

    try {
      const { data, error } = await supabase
        .from("case_notice_dispatches")
        .insert({
          user_id: userId,
          case_id: caseId,
          notice_draft_id: selectedDraft.id,
          ...payload,
        })
        .select("*")
        .single();
      const saved = normalizeCaseNoticeDispatch(data);
      if (error || !saved) throw error ?? new Error("Dispatch insert was not confirmed");
      if (
        !requestIsCurrent()
        || saved.user_id !== userId
        || saved.case_id !== caseId
        || saved.notice_draft_id !== selectedDraft.id
      ) return;
      latestNoticeDispatchLoadIdRef.current += 1;
      setNoticeDispatches((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setNoticeDispatchFeedbackByCase((current) => ({ ...current, [caseId]: "cases-notice-dispatch-recorded" }));
    } catch {
      if (requestIsCurrent()) {
        setNoticeDispatchFeedbackByCase((current) => ({ ...current, [caseId]: "cases-notice-dispatch-error" }));
      }
    } finally {
      if (noticeDispatchRequestIdsRef.current[caseId] === requestId) {
        noticeDispatchInFlightIdsRef.current.delete(caseId);
      }
      if (requestIsCurrent()) {
        setNoticeDispatchRecordingByCase((current) => {
          const next = { ...current };
          delete next[caseId];
          return next;
        });
      }
    }
  }

  async function handleLinkDispatchEvidence(
    event: FormEvent<HTMLFormElement>,
    item: ComplianceCaseViewModel,
    dispatch: CaseNoticeDispatch
  ) {
    event.preventDefault();
    const userId = user?.id;
    const caseId = item.id;
    const evidenceId = String(new FormData(event.currentTarget).get("evidence_id") ?? "");
    const selectedEvidence = (caseEvidenceByCase[caseId] ?? []).find((record) => record.id === evidenceId);
    if (!userId || evidenceHistoryState !== "ready" || dispatch.user_id !== userId || dispatch.case_id !== caseId
      || latestNoticeDispatchByCase[caseId]?.id !== dispatch.id
      || noticeDispatchEvidenceByDispatch[dispatch.id]
      || !selectedEvidence || selectedEvidence.user_id !== userId
      || dispatchEvidenceInFlightRef.current.has(caseId)
      || noticeDispatchInFlightIdsRef.current.has(caseId)
      || checklistInFlightIdsRef.current.has(caseId)
      || deletingCaseIdsRef.current.has(caseId)
      || updatingCaseIdRef.current !== null
      || editingCaseIdRef.current !== null
      || noticeDraftInFlightIdsRef.current.has(caseId)
      || noticeDraftPdfInFlightCaseIdsRef.current.has(caseId)
      || dossierInFlightIdsRef.current.has(caseId)
      || protocolPdfInFlightCaseIdsRef.current.has(caseId)
      || noticeDraftCreatingByCase[caseId]
      || noticeDraftPdfGeneratingByCase[caseId]
      || checklistSavingByCase[caseId]
      || deletingCaseIds[caseId]
      || dossierGeneratingByCase[caseId]
      || protocolPdfGeneratingByCase[caseId]
      || noticeDispatchRecordingByCase[caseId]) return;

    dispatchEvidenceInFlightRef.current.add(caseId);
    const requestId = (dispatchEvidenceRequestIdsRef.current[dispatch.id] ?? 0) + 1;
    dispatchEvidenceRequestIdsRef.current[dispatch.id] = requestId;
    setDispatchEvidenceLinkingByCase((current) => ({ ...current, [caseId]: true }));
    setDispatchEvidenceFeedbackByDispatch((current) => {
      const next = { ...current }; delete next[dispatch.id]; return next;
    });
    const requestIsCurrent = () => dossierMountedRef.current
      && currentUserIdRef.current === userId
      && dispatchEvidenceRequestIdsRef.current[dispatch.id] === requestId;
    const acceptSavedAssociation = async (candidate: unknown) => {
      const saved = normalizeCaseNoticeDispatchEvidence(candidate);
      if (!saved || !requestIsCurrent() || saved.user_id !== userId || saved.case_id !== caseId
        || saved.dispatch_id !== dispatch.id) return false;
      if (!(caseEvidenceByCase[caseId] ?? []).some((record) => record.id === saved.evidence_id)) {
        const { data: evidenceData, error: evidenceError } = await supabase.from("case_evidence")
          .select("id, user_id, case_id, original_name, storage_path, mime_type, size_bytes, created_at")
          .eq("user_id", userId)
          .eq("case_id", caseId)
          .eq("id", saved.evidence_id)
          .maybeSingle();
        const winningEvidence = evidenceData as CaseEvidence | null;
        if (evidenceError || !requestIsCurrent() || !winningEvidence
          || winningEvidence.id !== saved.evidence_id || winningEvidence.user_id !== userId
          || winningEvidence.case_id !== caseId || typeof winningEvidence.original_name !== "string"
          || typeof winningEvidence.storage_path !== "string" || typeof winningEvidence.size_bytes !== "number"
          || typeof winningEvidence.created_at !== "string"
          || !["application/pdf", "image/jpeg", "image/png"].includes(winningEvidence.mime_type)) return false;
        setCaseEvidence((current) => {
          const next = [winningEvidence, ...current.filter((row) => row.id !== winningEvidence.id)];
          lastSuccessfulCaseEvidenceRef.current = next;
          lastSuccessfulCaseEvidenceUserIdRef.current = userId;
          return next;
        });
      }
      setNoticeDispatchEvidence((current) => {
        const next = [saved, ...current.filter((row) => row.dispatch_id !== dispatch.id)];
        lastSuccessfulDispatchEvidenceRef.current = next;
        lastSuccessfulDispatchEvidenceUserIdRef.current = userId;
        return next;
      });
      setDispatchEvidenceFeedbackByDispatch((current) => ({
        ...current,
        [dispatch.id]: saved.evidence_id === evidenceId
          ? "cases-notice-dispatch-evidence-linked"
          : "cases-notice-dispatch-evidence-existing",
      }));
      return true;
    };
    try {
      const { data, error } = await supabase.from("case_notice_dispatch_evidence").insert({
        user_id: userId, case_id: caseId, dispatch_id: dispatch.id, evidence_id: evidenceId,
      }).select("*").single();
      if (error || !data) throw error ?? new Error("Evidence association was not confirmed");
      await acceptSavedAssociation(data);
    } catch {
      let reconciled = false;
      try {
        const { data, error } = await supabase.from("case_notice_dispatch_evidence")
          .select("*")
          .eq("user_id", userId)
          .eq("dispatch_id", dispatch.id)
          .maybeSingle();
        reconciled = !error && await acceptSavedAssociation(data);
      } catch {
        // The original insert and reconciliation are both ambiguous; report failure below.
      }
      if (!reconciled && requestIsCurrent()) {
        setDispatchEvidenceFeedbackByDispatch((current) => ({ ...current, [dispatch.id]: "cases-notice-dispatch-evidence-error" }));
      }
    } finally {
      if (dispatchEvidenceRequestIdsRef.current[dispatch.id] === requestId) dispatchEvidenceInFlightRef.current.delete(caseId);
      if (requestIsCurrent()) setDispatchEvidenceLinkingByCase((current) => {
        const next = { ...current }; delete next[caseId]; return next;
      });
    }
  }

  async function handleCreateNoticeDraft(item: ComplianceCaseViewModel, persistedCase: Case) {
    const userId = user?.id;
    if (
      !userId
      || noticeDraftInFlightIdsRef.current.has(item.id)
      || noticeDispatchInFlightIdsRef.current.has(item.id)
      || dispatchEvidenceInFlightRef.current.has(item.id)
      || editingCaseId !== null
      || updatingCaseId !== null
      || hasDeletingCases
      || hasChecklistSave
      || hasDossierGeneration
      || hasProtocolPdfGeneration
      || hasNoticeDraftCreation
      || noticeDraftPdfInFlightCaseIdsRef.current.has(item.id)
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
      caseDateValidationError ||
      caseAcceptanceDateValidationError
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
        acceptance_date: formData.acceptanceDate || null,
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
      || updatingCaseIdRef.current
      || noticeDispatchInFlightIdsRef.current.has(caseId)
      || dispatchEvidenceInFlightRef.current.has(caseId)
      || deletingCaseIdsRef.current.has(caseId)
      || noticeDraftCreatingByCase[caseId]
      || checklistSavingByCase[caseId]
      || dossierGeneratingByCase[caseId]
      || protocolPdfGeneratingByCase[caseId]
      || noticeDraftPdfGeneratingByCase[caseId]
    ) return;
    const confirmText = t("cases-delete-confirm").replace("{projectName}", projectName);
    const confirmed = window.confirm(confirmText);
    if (!confirmed) return;

    deletingCaseIdsRef.current.add(caseId);
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
      deletingCaseIdsRef.current.delete(caseId);
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
      editCaseAcceptanceDateValidationError ||
      updatingCaseIdRef.current ||
      noticeDispatchInFlightIdsRef.current.has(caseId) ||
      dispatchEvidenceInFlightRef.current.has(caseId) ||
      hasDeletingCases ||
      noticeDraftCreatingByCase[caseId] ||
      checklistSavingByCase[caseId] ||
      dossierGeneratingByCase[caseId] ||
      protocolPdfGeneratingByCase[caseId] ||
      noticeDraftPdfGeneratingByCase[caseId]
    ) {
      return;
    }

    updatingCaseIdRef.current = caseId;
    setUpdatingCaseId(caseId);

    try {
      const payload = {
        project_name: editFormData.projectName,
        canton: editFormData.canton,
        contract_date: editFormData.contractDate,
        discovery_date: editFormData.discoveryDate,
        acceptance_date: editFormData.acceptanceDate || null,
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
      editingCaseIdRef.current = null;
      setEditingCaseId(null);
      resetEditForm();
      setCaseUpdateFeedback({ caseId, key: "cases-update-success", tone: "success" });
      triggerCasesRefresh();
    } catch {
      setCaseUpdateFeedback({ caseId, key: "cases-update-error", tone: "error" });
    } finally {
      if (updatingCaseIdRef.current === caseId) updatingCaseIdRef.current = null;
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
      <div
        role={requestedCaseId ? "status" : undefined}
        className="flex items-center justify-center py-20"
      >
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        {requestedCaseId && <span className="sr-only">{t("cases-handoff-loading")}</span>}
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
              <label htmlFor="cases-acceptance-date" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">{t("cases-acceptance-date-input")}</label>
              <input id="cases-acceptance-date" type="date" value={formData.acceptanceDate} onChange={(e) => updateFormData({ ...formData, acceptanceDate: e.target.value })} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-60" disabled={saving} />
              {caseAcceptanceDateValidationError && (
                <p className="mt-2 text-xs text-red-400">{t(`cases-${caseAcceptanceDateValidationError}`)}</p>
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
            <button type="submit" disabled={saving || !!caseDateValidationError || !!caseAcceptanceDateValidationError} className="px-5 py-2.5 bg-accent hover:bg-accent/90 text-white font-semibold rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
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
          {requestedCaseId && visibleCases.length > 0 && (
            <Link
              href={clearCaseHandoffHref}
              className="px-3 py-1.5 rounded-lg border border-amber-400/30 text-xs font-medium text-amber-100 hover:bg-amber-500/[0.1]"
            >
              {t("cases-handoff-show-all")}
            </Link>
          )}
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
      ) : requestedCaseId && loading ? (
        <div role="status" className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
          <span className="sr-only">{t("cases-handoff-loading")}</span>
        </div>
      ) : requestedCaseId && visibleCases.length === 0 ? (
        <div
          role="alert"
          className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] px-5 py-4 text-sm text-amber-100"
        >
          <h2 className="font-semibold text-amber-50">{t("cases-handoff-unavailable-title")}</h2>
          <p className="mt-1">{t("cases-handoff-unavailable-body")}</p>
          <Link
            href={clearCaseHandoffHref}
            className="mt-3 inline-flex rounded-lg border border-amber-200/30 px-4 py-2 font-medium text-amber-50 hover:bg-amber-500/[0.12]"
          >
            {t("cases-handoff-show-all")}
          </Link>
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
            const latestNoticeDispatch = latestNoticeDispatchByCase[item.id];
            const latestDispatchEvidenceLink = latestNoticeDispatch
              ? noticeDispatchEvidenceByDispatch[latestNoticeDispatch.id]
              : undefined;
            const latestDispatchEvidence = latestDispatchEvidenceLink
              ? (caseEvidenceByCase[item.id] ?? []).find((record) => record.id === latestDispatchEvidenceLink.evidence_id)
              : undefined;
            const isDispatchEvidenceLinking = Boolean(dispatchEvidenceLinkingByCase[item.id]);
            const isNoticeDispatchRecording = Boolean(noticeDispatchRecordingByCase[item.id]);
            const isNoticeDraftCreating = Boolean(noticeDraftCreatingByCase[item.id]);
            const isNoticeDraftPdfGenerating = Boolean(noticeDraftPdfGeneratingByCase[item.id]);
            const isCaseBusy = isChecklistSaving || isDossierGenerating || isProtocolPdfGenerating || isNoticeDraftCreating || isNoticeDraftPdfGenerating || isNoticeDispatchRecording || isDispatchEvidenceLinking;
            const isNoticeDispatchHistoryLoading = noticeDispatchHistoryState === "loading";
            const isAuditHistoryReady = noticeDispatchHistoryState !== "loading" && evidenceHistoryState !== "loading";
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
                        onClick={(event) => guardCaseNavigation(event, item.id)}
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
                        onClick={(event) => guardCaseNavigation(event, item.id)}
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
                    value={latestNoticeDispatch ? t("cases-notice-dispatch-recorded") : (checklist.noticeDrafted ? t("cases-notice-ready") : t("cases-notice-pending"))}
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
                        <label htmlFor={`cases-edit-acceptance-date-${item.id}`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                          {t("cases-acceptance-date-input")}
                        </label>
                        <input
                          id={`cases-edit-acceptance-date-${item.id}`}
                          type="date"
                          value={editFormData.acceptanceDate}
                          onChange={(event) => updateEditForm({ ...editFormData, acceptanceDate: event.target.value })}
                          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-cream outline-none [color-scheme:dark] focus:border-accent/40"
                          disabled={updatingCaseId === item.id || hasDeletingCases}
                        />
                        {editCaseAcceptanceDateValidationError && (
                          <p className="mt-2 text-xs text-red-400">{t(`cases-${editCaseAcceptanceDateValidationError}`)}</p>
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
                        disabled={updatingCaseId === item.id || hasDeletingCases || !!editCaseDateValidationError || !!editCaseAcceptanceDateValidationError}
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
                      disabled={!hasCompleteNoticeSource || isCaseBusy}
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
                      disabled={!persistedCase || !noticeDraftPayload || hasAnyRowLevelMutation || isNoticeDraftPdfGenerating}
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
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          aria-label={t("cases-notice-draft-download")}
                          disabled={isCaseBusy}
                          onClick={() => void downloadCaseNoticeDraftPdf(latestNoticeDraft)}
                          className="rounded-lg border border-cyan-400/30 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {t(isNoticeDraftPdfGenerating ? "cases-notice-draft-generating" : "cases-notice-draft-download")}
                        </button>
                        {!isNoticeDraftPdfGenerating && noticeDraftPdfFeedbackByCase[item.id] && (
                          <p
                            role="status"
                            className={`text-xs ${
                              noticeDraftPdfFeedbackByCase[item.id].tone === "success"
                                ? "text-emerald-300"
                                : "text-rose-300"
                            }`}
                          >
                            {t(noticeDraftPdfFeedbackByCase[item.id].key)}
                          </p>
                        )}
                      </div>
                      <form
                        data-testid={`cases-notice-dispatch-form-${item.id}`}
                        className="mt-4 rounded-lg border border-emerald-400/25 bg-emerald-500/[0.05] p-3"
                        onSubmit={(event) => void handleRecordNoticeDispatch(event, item, latestNoticeDraft)}
                      >
                        <h4 className="text-sm font-semibold text-emerald-100">{t("cases-notice-dispatch-title")}</h4>
                        <p className="mt-1 text-xs text-muted">{t("cases-notice-dispatch-semantics")}</p>
                        <p className="mt-1 break-all font-mono text-xs text-cyan-100">
                          {t("cases-notice-dispatch-revision")}: {latestNoticeDraft.id}
                        </p>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <label className="text-xs text-muted">
                            {t("cases-notice-dispatch-at")} (Europe/Zurich)
                            <input name="dispatched_at" type="datetime-local" step="1" required disabled={isCaseBusy || isNoticeDispatchHistoryLoading} className="mt-1 w-full rounded border border-white/10 bg-black/20 p-2 text-cream [color-scheme:dark]" />
                          </label>
                          <label className="text-xs text-muted">
                            {t("cases-notice-dispatch-channel")}
                            <select name="channel" disabled={isCaseBusy || isNoticeDispatchHistoryLoading} className="mt-1 w-full rounded border border-white/10 bg-black p-2 text-cream">
                              {CASE_NOTICE_DISPATCH_CHANNELS.map((channel) => (
                                <option key={channel} value={channel}>{t(CASE_NOTICE_DISPATCH_CHANNEL_KEYS[channel] as TranslationKey)}</option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-muted">
                            {t("cases-notice-dispatch-reference")}
                            <input name="reference" maxLength={200} disabled={isCaseBusy || isNoticeDispatchHistoryLoading} className="mt-1 w-full rounded border border-white/10 bg-black/20 p-2 text-cream" />
                          </label>
                        </div>
                        <button type="submit" disabled={isCaseBusy || isNoticeDispatchHistoryLoading} className="mt-3 rounded-lg border border-emerald-400/30 px-3 py-2 text-sm text-emerald-100 disabled:opacity-50">
                          {t(isNoticeDispatchRecording ? "cases-notice-dispatch-recording" : "cases-notice-dispatch-submit")}
                        </button>
                        {noticeDispatchFeedbackByCase[item.id] && (
                          <p role="status" className={`mt-2 text-xs ${noticeDispatchFeedbackByCase[item.id] === "cases-notice-dispatch-recorded" ? "text-emerald-300" : "text-rose-300"}`}>
                            {t(noticeDispatchFeedbackByCase[item.id])}
                          </p>
                        )}
                        {latestNoticeDispatch && (
                          <div data-testid={`cases-notice-dispatch-${item.id}`} className="mt-3 text-xs text-emerald-100">
                            <div>{t("cases-notice-dispatch-recorded-at")}: {formatNoticeDraftCreatedAt(latestNoticeDispatch.dispatched_at, lang)}</div>
                            <div>{t("cases-notice-dispatch-channel")}: {t(CASE_NOTICE_DISPATCH_CHANNEL_KEYS[latestNoticeDispatch.channel] as TranslationKey)}</div>
                            <div>{t("cases-notice-dispatch-revision")}: {latestNoticeDispatch.notice_draft_id}</div>
                            {latestNoticeDispatch.reference && <div>{t("cases-notice-dispatch-reference")}: {latestNoticeDispatch.reference}</div>}
                          </div>
                        )}
                      </form>
                      {latestNoticeDispatch && (
                        <div className="mt-3 rounded-lg border border-blue-400/25 bg-blue-500/[0.05] p-3 text-xs">
                          <h4 className="text-sm font-semibold text-blue-100">{t("cases-notice-dispatch-evidence-title")}</h4>
                          <p className="mt-1 text-muted">{t("cases-notice-dispatch-evidence-semantics")}</p>
                          {evidenceHistoryState === "loading" ? (
                            <p className="mt-2 text-blue-100">{t("cases-evidence-history-loading")}</p>
                          ) : evidenceHistoryState === "error" ? (
                            <div id={`cases-evidence-history-error-${item.id}`} className="mt-2 text-rose-200">
                              <p role="alert">{t("cases-evidence-history-unavailable")}</p>
                              <button
                                type="button"
                                disabled={isCaseBusy}
                                onClick={() => {
                                  if (noticeDispatchInFlightIdsRef.current.has(item.id)) return;
                                  triggerCasesRefresh();
                                }}
                                className="mt-2 rounded border border-rose-300/30 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {t("cases-evidence-history-retry")}
                              </button>
                            </div>
                          ) : latestDispatchEvidenceLink && latestDispatchEvidence ? (
                            <div data-testid={`cases-notice-dispatch-evidence-${item.id}`} className="mt-2 text-blue-100">
                              <div>{t("cases-notice-dispatch-evidence-file")}: {latestDispatchEvidence.original_name}</div>
                              <div>{t("cases-notice-dispatch-evidence-id")}: {latestDispatchEvidence.id}</div>
                              <div>{t("cases-notice-dispatch-evidence-association-id")}: {latestDispatchEvidenceLink.id}</div>
                            </div>
                          ) : (caseEvidenceByCase[item.id] ?? []).length > 0 ? (
                            <form data-testid={`cases-notice-dispatch-evidence-form-${item.id}`} onSubmit={(event) => void handleLinkDispatchEvidence(event, item, latestNoticeDispatch)} className="mt-2 flex flex-wrap items-end gap-2">
                              <label className="text-muted">
                                {t("cases-notice-dispatch-evidence-select")}
                                <select name="evidence_id" required disabled={isCaseBusy} className="mt-1 block rounded border border-white/10 bg-black p-2 text-cream">
                                  {(caseEvidenceByCase[item.id] ?? []).map((record) => <option key={record.id} value={record.id}>{record.original_name} · {record.id}</option>)}
                                </select>
                              </label>
                              <button type="submit" disabled={isCaseBusy} className="rounded border border-blue-400/30 px-3 py-2 text-blue-100 disabled:opacity-50">
                                {t(isDispatchEvidenceLinking ? "cases-notice-dispatch-evidence-linking" : "cases-notice-dispatch-evidence-submit")}
                              </button>
                            </form>
                          ) : (
                            <p className="mt-2 text-blue-100">
                              {t("cases-notice-dispatch-evidence-empty")}{" "}
                              {isCaseBusy ? (
                                <span aria-disabled="true" className="cursor-not-allowed opacity-60">{t("cases-notice-dispatch-evidence-open-vault")}</span>
                              ) : (
                                <Link href={buildCaseVaultHref(item.projectName)} onClick={(event) => guardCaseNavigation(event, item.id)}>
                                  {t("cases-notice-dispatch-evidence-open-vault")}
                                </Link>
                              )}
                            </p>
                          )}
                          {dispatchEvidenceFeedbackByDispatch[latestNoticeDispatch.id] && <p role="status" className="mt-2 text-blue-100">{t(dispatchEvidenceFeedbackByDispatch[latestNoticeDispatch.id])}</p>}
                        </div>
                      )}
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
                    {isAuditHistoryReady && <ol className="mt-3 space-y-2 border-l border-blue-400/30 pl-4">
                      {deriveCaseLegalMilestones(
                        item,
                        linkedProtocolEventsByCase[item.id] ?? [],
                        evidenceEventsByCase[item.id] ?? [],
                        noticeDispatchesByCase[item.id] ?? [],
                        {
                          "registered-mail": t("cases-notice-dispatch-channel-registered-mail"),
                          "a-mail-plus": t("cases-notice-dispatch-channel-a-mail-plus"),
                          courier: t("cases-notice-dispatch-channel-courier"),
                          "hand-delivery": t("cases-notice-dispatch-channel-hand-delivery"),
                        },
                        noticeDispatchEvidence,
                        caseEvidence
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
                            {milestone.supportingEvidenceName && (
                              <span className="ml-2 font-mono text-xs text-blue-100">
                                {t("cases-notice-dispatch-evidence-file")}: {milestone.supportingEvidenceName}
                                {milestone.supportingEvidenceId && (
                                  <> · {t("cases-notice-dispatch-evidence-id")}: {milestone.supportingEvidenceId}</>
                                )}
                                {milestone.supportingEvidenceAssociationId && (
                                  <> · {t("cases-notice-dispatch-evidence-association-id")}: {milestone.supportingEvidenceAssociationId}</>
                                )}
                              </span>
                            )}
                          </span>
                          <time dateTime={formatMilestoneDateTime(milestone.date)} className="text-blue-100">
                            {milestone.dateLabel}
                          </time>
                        </li>
                      ))}
                    </ol>}
                    {noticeDispatchHistoryState === "error" && (
                      <p id={`cases-notice-dispatch-history-error-${item.id}`} role="alert" className="mt-4 text-sm text-rose-200">
                        {t("cases-notice-dispatch-history-unavailable")}
                      </p>
                    )}
                    {!latestNoticeDispatch && evidenceHistoryState !== "ready" && (
                      <div id={`cases-evidence-history-status-${item.id}`} className="mt-4 text-sm text-rose-200">
                        <p role={evidenceHistoryState === "error" ? "alert" : undefined}>
                          {t(evidenceHistoryState === "loading" ? "cases-evidence-history-loading" : "cases-evidence-history-unavailable")}
                        </p>
                        {evidenceHistoryState === "error" && (
                          <button
                            type="button"
                            disabled={isCaseBusy}
                            onClick={() => {
                              if (noticeDispatchInFlightIdsRef.current.has(item.id)) return;
                              triggerCasesRefresh();
                            }}
                            className="mt-2 rounded border border-rose-300/30 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {t("cases-evidence-history-retry")}
                          </button>
                        )}
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => downloadCaseChronology(item)}
                        aria-describedby={
                          noticeDispatchHistoryState === "error"
                            ? `cases-notice-dispatch-history-error-${item.id}`
                            : evidenceHistoryState === "error"
                              ? `cases-evidence-history-status-${item.id}`
                              : undefined
                        }
                        disabled={isCaseBusy || noticeDispatchHistoryState !== "ready" || evidenceHistoryState !== "ready"}
                        className="rounded-lg border border-blue-400/30 px-3 py-2 text-sm text-blue-100 hover:bg-blue-500/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("cases-export-chronology-csv")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void downloadCaseAuditDossier(item, checklist)}
                        aria-describedby={
                          noticeDispatchHistoryState === "error"
                            ? `cases-notice-dispatch-history-error-${item.id}`
                            : evidenceHistoryState === "error"
                              ? `cases-evidence-history-status-${item.id}`
                              : undefined
                        }
                        disabled={isCaseBusy || noticeDispatchHistoryState !== "ready" || evidenceHistoryState !== "ready"}
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
                              <time dateTime={protocol.finalized_at} className="mt-1 block text-muted">
                                {formatTimestampDateCH(new Date(protocol.finalized_at))}
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
                    <div
                      role="region"
                      aria-label={t("cases-export-ics")}
                      className="mt-4 flex flex-col items-end gap-2"
                    >
                      <p className="max-w-2xl text-right text-xs leading-relaxed text-muted">
                        {t("reminders-activation-guidance")}
                      </p>
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
