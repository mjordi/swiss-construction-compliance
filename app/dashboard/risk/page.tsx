"use client";

import { useMemo, useState } from "react";
import { scaleQuantize } from "d3-scale";
import { AlertTriangle, Download, Info, Minus, Search, TrendingDown, TrendingUp } from "lucide-react";

type Trend = "up" | "down" | "stable";
type Severity = "critical" | "high" | "medium";

type Canton = {
  id: string;
  name: string;
  risk: number;
  trend: Trend;
  description: string;
  focus: string;
  lawChange: string;
};

const cantons: Canton[] = [
  { id: "ZH", name: "Zürich", risk: 85, trend: "up", description: "Strict enforcement of digital handover protocols.", focus: "Digital handover evidence", lawChange: "Art. 371 OR · accelerated defect notice scrutiny" },
  { id: "BE", name: "Bern", risk: 62, trend: "stable", description: "Standard adherence to 2026 revisions.", focus: "Documentation completeness", lawChange: "Art. 367 OR · contractor response timing" },
  { id: "GE", name: "Genève", risk: 92, trend: "up", description: "High liability exposure for complex renovations.", focus: "Renovation dispute exposure", lawChange: "Art. 371 OR · burden-of-proof sensitivity" },
  { id: "VD", name: "Vaud", risk: 78, trend: "up", description: "Focus on energy compliance documentation.", focus: "Energy paperwork traceability", lawChange: "Art. 370 OR · missing annexes risk" },
  { id: "BS", name: "Basel-Stadt", risk: 70, trend: "stable", description: "Moderate risk; watch for chemical safety clauses.", focus: "Material safety evidence", lawChange: "Art. 365 OR · specialist contractor obligations" },
  { id: "TI", name: "Ticino", risk: 65, trend: "down", description: "Local variances in permitting processes.", focus: "Permit-linked acceptance", lawChange: "Art. 369 OR · acceptance exceptions" },
  { id: "LU", name: "Luzern", risk: 55, trend: "stable", description: "Relaxed interpretation of notification periods.", focus: "Warranty tracking hygiene", lawChange: "Art. 370 OR · notification timing" },
];

const colorScale = scaleQuantize<string>()
  .domain([0, 100])
  .range(["#4ade80", "#facc15", "#fb923c", "#ef4444"]);

const getSeverity = (risk: number): Severity => {
  if (risk >= 85) return "critical";
  if (risk >= 65) return "high";
  return "medium";
};

const getAlertCount = (risk: number) => (risk >= 80 ? 3 : risk >= 65 ? 2 : 1);

export default function RiskMap() {
  const [selectedCantonId, setSelectedCantonId] = useState(cantons[0].id);
  const [query, setQuery] = useState("");
  const [trendFilter, setTrendFilter] = useState<Trend | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");

  const filteredCantons = useMemo(() => {
    const q = query.trim().toLowerCase();

    return cantons
      .filter((canton) => (trendFilter === "all" ? true : canton.trend === trendFilter))
      .filter((canton) => (severityFilter === "all" ? true : getSeverity(canton.risk) === severityFilter))
      .filter((canton) => {
        if (!q) return true;
        return [canton.id, canton.name, canton.description, canton.focus].some((value) =>
          value.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.risk - a.risk);
  }, [query, severityFilter, trendFilter]);

  const selectedCanton = filteredCantons.find((canton) => canton.id === selectedCantonId) ?? filteredCantons[0] ?? cantons[0];
  const criticalCount = cantons.filter((canton) => getSeverity(canton.risk) === "critical").length;
  const risingCount = cantons.filter((canton) => canton.trend === "up").length;
  const averageRisk = Math.round(cantons.reduce((sum, canton) => sum + canton.risk, 0) / cantons.length);

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      <header className="mb-8 flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Canton Risk Matrix</h1>
          <p className="text-slate-400">Prioritize the regions most likely to create warranty disputes or documentation exposure.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card rounded-2xl p-5 border border-white/10">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Portfolio average</div>
            <div className="text-3xl font-bold">{averageRisk}</div>
            <div className="text-sm text-slate-400 mt-1">Across {cantons.length} tracked cantons</div>
          </div>
          <div className="glass-card rounded-2xl p-5 border border-white/10">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Critical exposure</div>
            <div className="text-3xl font-bold text-red-400">{criticalCount}</div>
            <div className="text-sm text-slate-400 mt-1">Need tighter handover evidence</div>
          </div>
          <div className="glass-card rounded-2xl p-5 border border-white/10">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Rising trend</div>
            <div className="text-3xl font-bold text-amber-300">{risingCount}</div>
            <div className="text-sm text-slate-400 mt-1">Cantons trending upward this cycle</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-2 glass-card rounded-3xl p-6 relative overflow-hidden flex flex-col">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 via-yellow-400 to-red-500" />

          <div className="flex flex-col xl:flex-row gap-3 mb-5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search canton, risk focus, or legal context..."
                className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-accent/50"
              />
            </div>

            <div className="flex gap-3">
              <select
                value={trendFilter}
                onChange={(event) => setTrendFilter(event.target.value as Trend | "all")}
                className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none"
              >
                <option value="all">All trends</option>
                <option value="up">Increasing</option>
                <option value="stable">Stable</option>
                <option value="down">Decreasing</option>
              </select>

              <select
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value as Severity | "all")}
                className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none"
              >
                <option value="all">All severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto pr-2 custom-scrollbar">
            {filteredCantons.map((canton) => {
              const severity = getSeverity(canton.risk);

              return (
                <button
                  key={canton.id}
                  onClick={() => setSelectedCantonId(canton.id)}
                  className={`text-left p-6 rounded-2xl border transition h-48 ${
                    selectedCanton.id === canton.id
                      ? "bg-white/10 border-accent shadow-[0_0_30px_rgba(249,115,22,0.15)]"
                      : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10"
                  }`}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="font-bold text-lg">{canton.id}</div>
                      <div className="text-sm text-slate-400">{canton.name}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colorScale(canton.risk) }} />
                      <span className="text-xs uppercase tracking-widest text-slate-500">{severity}</span>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Risk score</span>
                      <span className="font-semibold">{canton.risk}/100</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Alerts</span>
                      <span className="font-semibold">{getAlertCount(canton.risk)} active</span>
                    </div>
                    <div className="text-xs text-slate-500 pt-2 border-t border-white/5">{canton.focus}</div>
                  </div>
                </button>
              );
            })}

            {filteredCantons.length === 0 && (
              <div className="col-span-full border border-white/10 rounded-2xl p-8 text-center text-slate-400 bg-white/[0.02]">
                No cantons match your current filters.
              </div>
            )}
          </div>
        </div>

        <div className="glass-card rounded-3xl p-8 flex flex-col border-t-4 border-accent">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold">{selectedCanton.name}</h2>
              <div className="text-sm text-slate-500 mt-1">Top operational focus: {selectedCanton.focus}</div>
            </div>
            <div className="px-3 py-1 bg-white/10 rounded-full text-xs font-mono">{selectedCanton.id}</div>
          </div>

          <div className="flex items-center gap-4 mb-8">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90">
                <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-700" />
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  stroke={colorScale(selectedCanton.risk)}
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={`${selectedCanton.risk * 2.51} 251.2`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold">{selectedCanton.risk}</span>
                <span className="text-[10px] text-slate-400">RISK</span>
              </div>
            </div>

            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                {selectedCanton.trend === "up" && <TrendingUp className="w-4 h-4 text-red-400" />}
                {selectedCanton.trend === "down" && <TrendingDown className="w-4 h-4 text-emerald-400" />}
                {selectedCanton.trend === "stable" && <Minus className="w-4 h-4 text-slate-400" />}
                <span>
                  Trend: {selectedCanton.trend === "up" ? "Increasing" : selectedCanton.trend === "down" ? "Decreasing" : "Stable"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span>Alerts: {getAlertCount(selectedCanton.risk)} active</span>
              </div>
            </div>
          </div>

          <div className="bg-white/5 rounded-xl p-5 mb-6 flex-1 space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Info className="w-4 h-4" /> Legal context
              </h3>
              <p className="text-sm leading-relaxed text-slate-300">{selectedCanton.description}</p>
            </div>

            <div className="pt-4 border-t border-white/5 space-y-3 text-sm text-slate-300">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Key 2026 change</span>
                <span className="text-right">{selectedCanton.lawChange}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Recommended action</span>
                <span className="text-right">Tighten protocol completeness and evidence capture</span>
              </div>
            </div>
          </div>

          <button className="w-full py-4 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl shadow-lg shadow-accent/20 transition flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> Export canton brief
          </button>
        </div>
      </div>
    </div>
  );
}
