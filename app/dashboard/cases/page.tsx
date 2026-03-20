import PageHeader from "@/components/dashboard/PageHeader";
import {
  buildComplianceCaseTimeline,
  type ComplianceCaseInput,
  type ComplianceCaseViewModel,
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

export default function CasesPage() {
  return (
    <div>
      <div className="mb-8">
        <PageHeader
          marker="Cases"
          title="Case Timeline"
          subtitle="Mock compliance timeline for contract regime and defect-notice deadlines."
        />
      </div>

      <div className="space-y-4">
        {cases.map((item) => (
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

            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm mb-5">
              <InfoCell label="Contract date" value={item.contractDateLabel} />
              <InfoCell label="Defect discovered" value={item.discoveryDateLabel} />
              <InfoCell label="Regime" value={item.regimeLabel} />
              <InfoCell label="60-day deadline" value={item.noticeDeadlineLabel} />
              <InfoCell label="Next action" value={item.nextAction} />
            </div>

            <div className="rounded-xl border border-white/[0.07] p-4">
              <div className="text-[11px] uppercase tracking-[0.12em] text-muted/70 mb-3 font-semibold">
                Timeline
              </div>
              <ol className="grid md:grid-cols-3 gap-3 text-sm">
                <TimelineStep title="Contract signed" value={item.contractDateLabel} />
                <TimelineStep title="Defect discovered" value={item.discoveryDateLabel} />
                <TimelineStep title="Notice deadline" value={item.noticeDeadlineLabel} />
              </ol>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.01] p-3">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted/60 mb-1">{label}</div>
      <div className="text-cream">{value}</div>
    </div>
  );
}

function TimelineStep({ title, value }: { title: string; value: string }) {
  return (
    <li className="relative rounded-lg border border-white/[0.05] bg-white/[0.01] p-3">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted/60 mb-1">{title}</div>
      <div className="text-cream">{value}</div>
    </li>
  );
}
