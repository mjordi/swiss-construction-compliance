"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Paperclip } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import {
  buildCaseEvidencePath,
  CASE_EVIDENCE_BUCKET,
  CASE_EVIDENCE_MIME_TYPES,
  sanitizeCaseEvidenceDownloadName,
  validateCaseEvidenceFile,
  type CaseEvidenceValidationError,
} from "@/lib/case-evidence";
import type { CaseEvidence } from "@/lib/database.types";
import { getSupabase } from "@/lib/supabase";
import type { TranslationKey } from "@/locales";

interface CaseEvidencePanelProps {
  userId: string;
  caseId: string;
  caseName: string;
  readOnly?: boolean;
}

const validationKey: Record<CaseEvidenceValidationError, TranslationKey> = {
  empty: "vault-evidence-validation-empty",
  "too-large": "vault-evidence-validation-size",
  "unsupported-type": "vault-evidence-validation-type",
};

export default function CaseEvidencePanel({
  userId,
  caseId,
  caseName,
  readOnly = false,
}: CaseEvidencePanelProps) {
  const { t } = useLanguage();
  const supabase = useMemo(() => getSupabase(), []);
  const [expanded, setExpanded] = useState(false);
  const [evidence, setEvidence] = useState<CaseEvidence[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ key: TranslationKey; kind: "status" | "alert" } | null>(null);
  const [downloadingPaths, setDownloadingPaths] = useState<string[]>([]);
  const mountedRef = useRef(false);
  const contextGenerationRef = useRef(0);
  const loadRequestRef = useRef(0);
  const loadPendingRef = useRef(false);
  const uploadPendingRef = useRef(false);
  const downloadPendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    contextGenerationRef.current += 1;
    loadRequestRef.current += 1;
    loadPendingRef.current = false;
    uploadPendingRef.current = false;
    downloadPendingRef.current.clear();
    setExpanded(false);
    setEvidence([]);
    setLoading(false);
    setUploading(false);
    setDownloadingPaths([]);
    setMessage(null);
  }, [caseId, userId]);

  const loadEvidence = useCallback(async () => {
    if (loadPendingRef.current) return;
    loadPendingRef.current = true;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setMessage(null);

    try {
      const { data, error } = await supabase
        .from("case_evidence")
        .select("*")
        .eq("user_id", userId)
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setEvidence((data ?? []) as CaseEvidence[]);
    } catch {
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setMessage({ key: "vault-evidence-list-error", kind: "alert" });
    } finally {
      if (requestId === loadRequestRef.current) loadPendingRef.current = false;
      if (mountedRef.current && requestId === loadRequestRef.current) setLoading(false);
    }
  }, [caseId, supabase, userId]);

  const toggleExpanded = useCallback(() => {
    if (expanded) {
      loadRequestRef.current += 1;
      loadPendingRef.current = false;
      setExpanded(false);
      setLoading(false);
      return;
    }
    setExpanded(true);
    void loadEvidence();
  }, [expanded, loadEvidence]);

  const handleUpload = useCallback(async (file: File | undefined) => {
    if (!file || readOnly || loadPendingRef.current || uploadPendingRef.current) return;
    const validationError = validateCaseEvidenceFile(file);
    if (validationError) {
      setMessage({ key: validationKey[validationError], kind: "alert" });
      return;
    }

    uploadPendingRef.current = true;
    const generation = contextGenerationRef.current;
    const isCurrentContext = () => mountedRef.current && generation === contextGenerationRef.current;
    setUploading(true);
    setMessage(null);
    const storagePath = buildCaseEvidencePath(userId, caseId, file.type);

    try {
      const bucket = supabase.storage.from(CASE_EVIDENCE_BUCKET);
      const { error: uploadError } = await bucket.upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      let metadata: CaseEvidence;
      try {
        const { data, error } = await supabase
          .from("case_evidence")
          .insert({
            user_id: userId,
            case_id: caseId,
            storage_path: storagePath,
            original_name: file.name,
            mime_type: file.type,
            size_bytes: file.size,
          })
          .select("*")
          .single();
        if (error || !data) throw error ?? new Error("Evidence metadata was not returned");
        metadata = data as CaseEvidence;
      } catch (metadataError) {
        let cleanupSucceeded = false;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const { error: removeError } = await bucket.remove([storagePath]);
            if (!removeError) {
              cleanupSucceeded = true;
              break;
            }
          } catch {
            // A rejected removal is retried by the next iteration.
          }
        }
        if (!cleanupSucceeded) {
          if (isCurrentContext()) setMessage({ key: "vault-evidence-cleanup-warning", kind: "alert" });
          return;
        }
        throw metadataError;
      }

      if (isCurrentContext()) {
        loadRequestRef.current += 1;
        loadPendingRef.current = false;
        setLoading(false);
        setEvidence((current) => [metadata as CaseEvidence, ...current.filter((item) => item.id !== metadata.id)]);
      }

      try {
        const { data: checklistConfirmation, error: checklistError } = await supabase.rpc(
          "mark_case_evidence_attached",
          { target_case_id: caseId }
        );
        if (checklistError || checklistConfirmation !== true) {
          throw checklistError ?? new Error("Checklist update was not confirmed");
        }

        if (isCurrentContext()) setMessage({ key: "vault-evidence-upload-success", kind: "status" });
      } catch {
        if (isCurrentContext()) setMessage({ key: "vault-evidence-checklist-warning", kind: "alert" });
      }
    } catch {
      if (isCurrentContext()) setMessage({ key: "vault-evidence-upload-error", kind: "alert" });
    } finally {
      if (isCurrentContext()) {
        uploadPendingRef.current = false;
        setUploading(false);
      }
    }
  }, [caseId, readOnly, supabase, userId]);

  const handleDownload = useCallback(async (item: CaseEvidence) => {
    if (downloadPendingRef.current.has(item.storage_path)) return;
    const generation = contextGenerationRef.current;
    const isCurrentContext = () => mountedRef.current && generation === contextGenerationRef.current;
    downloadPendingRef.current.add(item.storage_path);
    setDownloadingPaths((current) => [...current, item.storage_path]);
    setMessage(null);
    const safeOriginalName = sanitizeCaseEvidenceDownloadName(item.original_name);

    try {
      const { data, error } = await supabase.storage
        .from(CASE_EVIDENCE_BUCKET)
        .createSignedUrl(item.storage_path, 60, { download: safeOriginalName });
      if (error || !data?.signedUrl) throw error ?? new Error("Signed URL missing");
      if (!isCurrentContext()) return;
      const anchor = document.createElement("a");
      anchor.href = data.signedUrl;
      anchor.download = safeOriginalName;
      anchor.rel = "noopener noreferrer";
      anchor.click();
    } catch {
      if (isCurrentContext()) setMessage({ key: "vault-evidence-download-error", kind: "alert" });
    } finally {
      if (isCurrentContext()) {
        downloadPendingRef.current.delete(item.storage_path);
        setDownloadingPaths((current) => current.filter((path) => path !== item.storage_path));
      }
    }
  }, [supabase]);

  return (
    <section className="pointer-events-auto relative z-20 mt-3 border-t border-white/10 pt-3" aria-label={`${t("vault-evidence-title")} ${caseName}`}>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); toggleExpanded(); }}
        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
        aria-expanded={expanded}
      >
        <Paperclip className="h-4 w-4" />
        {t(expanded ? "vault-evidence-hide" : "vault-evidence-show")}
      </button>

      {expanded ? (
        <div className="mt-3 space-y-3 rounded-xl bg-black/20 p-3" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-white">{t("vault-evidence-title")}</h4>
            {readOnly ? <span className="text-xs text-slate-400">{t("vault-evidence-read-only")}</span> : null}
          </div>

          {!readOnly ? (
            <label className="block text-xs text-slate-300">
              <span>{t("vault-evidence-file-label")}</span>
              <input
                type="file"
                aria-label={t("vault-evidence-file-label")}
                accept={CASE_EVIDENCE_MIME_TYPES.join(",")}
                disabled={uploading || loading}
                className="mt-2 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  void handleUpload(file);
                }}
              />
            </label>
          ) : null}

          {uploading ? <p role="status" className="flex items-center gap-2 text-xs text-slate-300"><Loader2 className="h-3 w-3 animate-spin" />{t("vault-evidence-uploading")}</p> : null}
          {message ? <p role={message.kind} className={message.kind === "alert" ? "text-xs text-amber-300" : "text-xs text-emerald-300"}>{t(message.key)}</p> : null}
          {loading ? (
            <p role="status" className="flex items-center gap-2 text-xs text-slate-300"><Loader2 className="h-3 w-3 animate-spin" />{t("vault-evidence-loading")}</p>
          ) : evidence.length === 0 ? (
            <p className="text-xs text-slate-400">{t("vault-evidence-empty")}</p>
          ) : (
            <ul className="space-y-2">
              {evidence.map((item) => {
                const downloading = downloadingPaths.includes(item.storage_path);
                return (
                  <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.03] p-2">
                    <span className="min-w-0 truncate text-xs text-slate-200" title={item.original_name}>{item.original_name}</span>
                    <button
                      type="button"
                      disabled={downloading}
                      aria-label={`${t("vault-evidence-download")} ${item.original_name}`}
                      onClick={() => void handleDownload(item)}
                      className="inline-flex shrink-0 items-center gap-1 text-xs text-blue-300 hover:text-blue-200 disabled:opacity-60"
                    >
                      {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                      {t(downloading ? "vault-evidence-downloading" : "vault-evidence-download")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
