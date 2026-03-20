"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/dashboard/PageHeader";
import {
  applyComplianceCaseView,
  buildComplianceCaseTimeline,
  type ComplianceCaseInput,
  type ComplianceCaseViewModel,
  type CaseRegimeFilter,
  type CaseSortMode,
  type CaseStatusFilter,
} from "@/lib/case-timeline";

const mockCases: ComplianceCaseInput[] = [
  {
    id: "case-1",
    projectName: "Wohnpark Seefeld",
    canton: "ZH",
    contractDate: new Date("2025-11-14"),
    discoveryDate: new Date("2026-03-10"),
  },
  {
    id: "case-2",
    projectName: "Schulhaus Muri West",
    canton: "AG",
    contractDate: new Date("2026-01-10"),
    discoveryDate: new Date("2026-03-15"),
  },
  {
    id: "case-3",
    projectName: "Clinique du Lac",
    canton: "VD",
    contractDate: new Date("2026-02-22"),
    discoveryDate: new Date("2026-03-01"),
  },
  {
    id: "case-4",
    projectName: "Residenza Bellavista",
    canton: "TI",
    contractDate: new Date("2024-09-05"),
    discoveryDate: new Date("2026-03-04"),
  },
];

const cases = buildComplianceCaseTimeline(mockCases);

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

export default function CasesPage() {
  const [regimeFilter, setRegimeFilter] = useState<CaseRegimeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<CaseStatusFilter>("all");
  const [sortMode, setSortMode] = useState<CaseSortMode>("nearest-deadline");

  const visibleCases = useMemo(
    () => applyComplianceCaseView(cases, regimeFilter, statusFilter, sortMode),
    [regimeFilter, sortMode, statusFilter]
  );

  return (
    <div>
      <div className="mb-8">
        <PageHeader
          marker="Cases"
          title="Case Timeline"
          subtitle="Action-first view for defect notice triage and preparation readiness."
        />
      </div>

      <section className="mb-6 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] grid gap-3 md:grid-cols-3">
        <FilterSelect
          label="Regime"
          value={regimeFilter}
          onChange={(value) => setRegimeFilter(value as CaseRegimeFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "old", label: "Old law" },
            { value: "new", label: "New law" },
          ]}
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as CaseStatusFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "ok", label: "On track" },
            { value: "warning", label: "Attention" },
            { value: "urgent", label: "Urgent" },
            { value: "expired", label: "Expired" },
          ]}
        />
        <FilterSelect
          label="Sort"
          value={sortMode}
          onChange={(value) => setSortMode(value as CaseSortMode)}
          options={[
            { value: "nearest-deadline", label: "Nearest deadline" },
            { value: "most-urgent", label: "Most urgent" },
          ]}
        />
      </section>

      <div className="space-y-4">
        {visibleCases.map((item) => (
          <article
            key={item.id}
            className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05]"
          >
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-cream">{item.projectName}</h2>
                <p className="text-sm text-muted mt-1">Canton {item.canton}</p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-md border border-white/[0.12] text-muted">
                  {item.regimeLabel}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-md border font-medium ${statusClass[item.status]}`}
                >
                  {item.statusLabel}
                </span>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm mb-5">
              <InfoCell label="Contract date" value={item.contractDateLabel} />
              <InfoCell label="Defect discovered" value={item.discoveryDateLabel} />
              <InfoCell label="60-day notice" value={item.noticeApplies ? "Applies" : "Not fixed"} />
              <InfoCell label="Notice deadline" value={item.noticeDeadlineLabel} />
            </div>

            <details className="rounded-xl border border-white/[0.07] p-4 bg-white/[0.01]">
              <summary className="cursor-pointer text-sm font-semibold text-cream">
                Case detail and reminder readiness
              </summary>
              <div className="mt-4 grid md:grid-cols-3 gap-3 text-sm">
                <InfoCell label="Next legal action" value={item.nextAction} />
                <InfoCell
                  label="Deadline countdown"
                  value={item.deadlineCountdownLabel}
                  valueClassName={countdownClass[item.deadlineCountdownTone]}
                />
                <InfoCell
                  label="Reminder readiness"
                  value={[
                    item.reminderReadiness.calendarExportReady
                      ? "Calendar export ready"
                      : "Calendar export pending",
                    item.reminderReadiness.emailReminderPlanned
                      ? "Email reminder planned"
                      : "Email reminder not planned",
                    item.reminderReadiness.evidenceComplete
                      ? "Evidence complete"
                      : "Evidence incomplete",
                  ].join(" · ")}
                />
              </div>
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}

function InfoCell({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.01] p-3">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted/60 mb-1">{label}</div>
      <div className={valueClassName ?? "text-cream"}>{value}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="text-sm text-muted">
      <span className="block text-[11px] uppercase tracking-[0.08em] text-muted/60 mb-1">{label}</span>
      <select
        className="w-full rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-cream"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-black text-cream">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
