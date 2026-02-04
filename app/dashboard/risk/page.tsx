"use client";

import { useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { scaleQuantize } from "d3-scale";
import { Tooltip } from "react-tooltip";
import { AlertTriangle, TrendingUp, Info } from "lucide-react";

// Simplified topojson for Switzerland would ideally be fetched. 
// For this demo, we'll use a placeholder or generic Europe map zoomed in if we can,
// but since fetching external topojson is complex without a URL, 
// I will build a conceptual interactive list/map interface first which is robust.
// Actually, let's make a high-fidelity "Interactive Grid" which is more reliable than map libraries without local topojson assets.

const cantons = [
  { id: "ZH", name: "Zürich", risk: 85, trend: "up", description: "Strict enforcement of digital handover protocols." },
  { id: "BE", name: "Bern", risk: 62, trend: "stable", description: "Standard adherence to 2026 revisions." },
  { id: "GE", name: "Genève", risk: 92, trend: "up", description: "High liability exposure for complex renovations." },
  { id: "VD", name: "Vaud", risk: 78, trend: "up", description: "Focus on energy compliance documentation." },
  { id: "BS", name: "Basel-Stadt", risk: 70, trend: "stable", description: "Moderate risk; watch for chemical safety clauses." },
  { id: "TI", name: "Ticino", risk: 65, trend: "down", description: "Local variances in permitting processes." },
  { id: "LU", name: "Luzern", risk: 55, trend: "stable", description: "Relaxed interpretation of notification periods." },
];

const colorScale = scaleQuantize<string>()
  .domain([0, 100])
  .range(["#4ade80", "#facc15", "#fb923c", "#ef4444"]);

export default function RiskMap() {
  const [selectedCanton, setSelectedCanton] = useState(cantons[0]);

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-100px)] flex flex-col">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Canton Risk Matrix</h1>
        <p className="text-slate-400">Real-time legislative risk assessment by region.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        
        {/* Main "Map" View - Interactive Grid for Stability */}
        <div className="lg:col-span-2 glass-card rounded-3xl p-6 relative overflow-hidden flex flex-col">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 via-yellow-400 to-red-500" />
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 overflow-y-auto pr-2 custom-scrollbar">
            {cantons.map((canton) => (
              <div 
                key={canton.id}
                onClick={() => setSelectedCanton(canton)}
                className={`p-6 rounded-2xl border transition cursor-pointer flex flex-col justify-between h-40 ${
                  selectedCanton.id === canton.id 
                    ? "bg-white/10 border-accent shadow-[0_0_30px_rgba(249,115,22,0.15)]" 
                    : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10"
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="font-bold text-lg">{canton.id}</span>
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: colorScale(canton.risk) }}
                  />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-300">{canton.name}</div>
                  <div className="text-xs text-slate-500 mt-1">Risk Score: {canton.risk}/100</div>
                </div>
              </div>
            ))}
            
            {/* Placeholders to fill grid */}
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] flex items-center justify-center opacity-50">
                <span className="text-slate-600 text-xs uppercase tracking-widest">No Data</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar Details Panel */}
        <div className="glass-card rounded-3xl p-8 flex flex-col border-t-4 border-accent">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold">{selectedCanton.name}</h2>
            <div className="px-3 py-1 bg-white/10 rounded-full text-xs font-mono">{selectedCanton.id}</div>
          </div>

          <div className="flex items-center gap-4 mb-8">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90">
                <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-700" />
                <circle 
                  cx="48" cy="48" r="40" 
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
                <TrendingUp className={`w-4 h-4 ${selectedCanton.trend === 'up' ? 'text-red-400' : 'text-green-400'}`} />
                <span>Trend: {selectedCanton.trend === 'up' ? 'Increasing' : 'Stable'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span>Alerts: 2 Active</span>
              </div>
            </div>
          </div>

          <div className="bg-white/5 rounded-xl p-5 mb-6 flex-1">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" /> Legal Context
            </h3>
            <p className="text-sm leading-relaxed text-slate-300">
              {selectedCanton.description}
            </p>
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="text-xs text-slate-500 mb-1">Key 2026 Change</div>
              <div className="text-sm">Art. 371 OR (Strict)</div>
            </div>
          </div>

          <button className="w-full py-4 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl shadow-lg shadow-accent/20 transition">
            Generate Canton Report
          </button>
        </div>
      </div>
    </div>
  );
}
