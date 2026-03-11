"use client";

import { useState } from "react";
import { scaleQuantize } from "d3-scale";
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";

const cantons = [
  { id: "ZH", name: "Zürich",      risk: 88, trend: "up",     description: "Strictest enforcement of digital handover protocols. Dense urban construction with complex multi-party liability chains." },
  { id: "BE", name: "Bern",        risk: 62, trend: "stable", description: "Standard adherence to 2026 revisions. Federal city status adds administrative layers to permitting." },
  { id: "LU", name: "Luzern",      risk: 55, trend: "stable", description: "Moderate risk environment. Relaxed interpretation of notification periods for minor defects." },
  { id: "UR", name: "Uri",         risk: 38, trend: "stable", description: "Low construction volume. Simple permitting processes; rural-focused building regulations." },
  { id: "SZ", name: "Schwyz",      risk: 45, trend: "stable", description: "Growing residential development near lake shores. Some heightened heritage protection zones." },
  { id: "OW", name: "Obwalden",    risk: 36, trend: "down",   description: "Very low construction density. Cooperative cantonal authority, fast permit turnaround." },
  { id: "NW", name: "Nidwalden",   risk: 37, trend: "stable", description: "Small canton with streamlined building code. Limited complex project exposure." },
  { id: "GL", name: "Glarus",      risk: 40, trend: "stable", description: "Modest construction activity. Local building inspectors known for pragmatic approach." },
  { id: "ZG", name: "Zug",         risk: 72, trend: "up",     description: "High-value residential and commercial projects. Wealth concentration drives premium liability exposure." },
  { id: "FR", name: "Fribourg",    risk: 58, trend: "stable", description: "Bilingual canton with dual legal interpretations. French/German variance in OR application." },
  { id: "SO", name: "Solothurn",   risk: 52, trend: "stable", description: "Industrial heritage zones add compliance complexity. Moderate enforcement of new warranty rules." },
  { id: "BS", name: "Basel-Stadt", risk: 82, trend: "up",     description: "Dense urban environment, chemical industry proximity. Strict safety clauses and hazmat compliance requirements." },
  { id: "BL", name: "Basel-Landschaft", risk: 67, trend: "stable", description: "Suburban growth belt around Basel. Increasing construction density with cross-cantonal projects." },
  { id: "SH", name: "Schaffhausen", risk: 48, trend: "stable", description: "Small canton with cross-border German influence. Standard warranty regime applies." },
  { id: "AR", name: "Appenzell Ausserrhoden", risk: 41, trend: "stable", description: "Rural semi-canton. Traditional construction practices; lower digital adoption of protocols." },
  { id: "AI", name: "Appenzell Innerrhoden", risk: 39, trend: "down",   description: "Smallest Swiss canton. Minimal complex construction; direct democracy slows regulatory change." },
  { id: "SG", name: "St. Gallen",  risk: 60, trend: "stable", description: "Active industrial and residential construction. Regional hub with growing multi-family housing projects." },
  { id: "GR", name: "Graubünden",  risk: 53, trend: "stable", description: "Tourism-driven construction in protected alpine zones. Heritage and landscape law adds compliance layers." },
  { id: "AG", name: "Aargau",      risk: 65, trend: "up",     description: "High construction volume due to Zurich corridor growth. Industrial and residential mix raises liability exposure." },
  { id: "TG", name: "Thurgau",     risk: 50, trend: "stable", description: "Agricultural canton with moderate construction activity. Pragmatic cantonal building authority." },
  { id: "TI", name: "Ticino",      risk: 66, trend: "down",   description: "Cross-border Italian legal influence. Local variances in permitting; watch for holiday property regulations." },
  { id: "VD", name: "Vaud",        risk: 79, trend: "up",     description: "Second-highest risk canton. Strong focus on energy compliance documentation and thermal performance certificates." },
  { id: "VS", name: "Valais",      risk: 57, trend: "stable", description: "Alpine construction challenges. Tourism and resort developments face specific seasonal permitting constraints." },
  { id: "NE", name: "Neuchâtel",   risk: 54, trend: "stable", description: "Watch manufacturing heritage zone protections. Moderate liability exposure in urban renewal projects." },
  { id: "GE", name: "Genève",      risk: 93, trend: "up",     description: "Highest liability exposure. Dense urban fabric, international property values, and strict renovation regulations." },
  { id: "JU", name: "Jura",        risk: 44, trend: "stable", description: "Youngest canton. Still harmonizing building code with national OR 2026 revisions." },
];

const colorScale = scaleQuantize<string>()
  .domain([0, 100])
  .range(["#4ade80", "#a3e635", "#facc15", "#fb923c", "#ef4444"]);

const TrendIcon = ({ trend }: { trend: string }) => {
  if (trend === "up")   return <TrendingUp   className="w-4 h-4 text-red-400" />;
  if (trend === "down") return <TrendingDown className="w-4 h-4 text-green-400" />;
  return <Minus className="w-4 h-4 text-muted" />;
};

export default function RiskMap() {
  const [selectedCanton, setSelectedCanton] = useState(cantons[0]);

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      <header className="mb-8">
        <h1 className="text-3xl font-[family-name:var(--font-display)] italic text-cream mb-2">Canton Risk Matrix</h1>
        <p className="text-muted text-sm">Real-time legislative risk assessment for all 26 Swiss cantons.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">

        {/* Main Grid */}
        <div className="lg:col-span-2 rounded-2xl bg-white/[0.02] border border-white/[0.05] p-6 relative overflow-hidden flex flex-col">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-green-400 via-yellow-400 to-red-500" />

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto pr-2 custom-scrollbar">
            {cantons.map((canton) => (
              <div
                key={canton.id}
                onClick={() => setSelectedCanton(canton)}
                className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer flex flex-col justify-between h-32 ${
                  selectedCanton.id === canton.id
                    ? "bg-white/[0.06] border-accent/30 shadow-[0_0_30px_rgba(217,119,6,0.08)]"
                    : "bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.08]"
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="font-semibold text-cream">{canton.id}</span>
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: colorScale(canton.risk) }}
                  />
                </div>
                <div>
                  <div className="text-[12px] font-medium text-muted truncate">{canton.name}</div>
                  <div className="text-[11px] text-muted/60 mt-0.5">{canton.risk}/100</div>
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-4 pt-4 border-t border-white/[0.04] flex items-center gap-4 text-[11px] text-muted">
            <span className="font-semibold uppercase tracking-wider">Risk:</span>
            {[
              { color: "#4ade80", label: "Low (0-39)" },
              { color: "#facc15", label: "Medium (40-59)" },
              { color: "#fb923c", label: "High (60-79)" },
              { color: "#ef4444", label: "Critical (80+)" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar Details */}
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-8 flex flex-col relative overflow-y-auto">
          <div className="absolute top-0 left-0 w-[2px] h-full bg-gradient-to-b from-accent via-accent/30 to-transparent" />

          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-[family-name:var(--font-display)] italic text-cream">{selectedCanton.name}</h2>
            <div className="px-2.5 py-1 bg-white/[0.04] border border-white/[0.06] rounded-lg text-[11px] font-mono text-muted">{selectedCanton.id}</div>
          </div>

          <div className="flex items-center gap-4 mb-8">
            <div className="relative w-24 h-24 flex-shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/[0.06]" />
                <circle
                  cx="48" cy="48" r="40"
                  stroke={colorScale(selectedCanton.risk)}
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={`${selectedCanton.risk * 2.51} 251.2`}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-[family-name:var(--font-display)] italic text-cream">{selectedCanton.risk}</span>
                <span className="text-[9px] text-muted uppercase tracking-[0.15em] font-semibold">RISK</span>
              </div>
            </div>

            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted">
                <TrendIcon trend={selectedCanton.trend} />
                <span>Trend: {selectedCanton.trend === "up" ? "Rising" : selectedCanton.trend === "down" ? "Falling" : "Stable"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span>Active Alerts: {selectedCanton.risk >= 80 ? 3 : selectedCanton.risk >= 60 ? 2 : 1}</span>
              </div>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-5 mb-6 flex-1">
            <h3 className="text-[11px] font-semibold text-muted uppercase tracking-[0.12em] mb-3 flex items-center gap-2">
              <Info className="w-3.5 h-3.5" /> Legal Context
            </h3>
            <p className="text-sm leading-relaxed text-muted">
              {selectedCanton.description}
            </p>
            <div className="mt-4 pt-4 border-t border-white/[0.04]">
              <div className="text-[11px] text-muted/60 mb-1">Key 2026 Change</div>
              <div className="text-sm text-cream font-medium">Art. 371 OR (Strict)</div>
            </div>
          </div>

          <button className="w-full py-3.5 bg-accent hover:bg-accent/90 text-white font-semibold rounded-lg shadow-lg shadow-accent/10 transition-colors duration-300">
            Generate Canton Report
          </button>
        </div>
      </div>
    </div>
  );
}
