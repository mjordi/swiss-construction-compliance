"use client";

import Link from "next/link";
import Sidebar from "@/components/dashboard/Sidebar";
import { useLanguage } from "@/context/LanguageContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t, lang, setLanguage } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col noise-overlay">
      {/* Top accent line */}
      <div className="h-[2px] bg-gradient-to-r from-accent via-accent/40 to-transparent" />

      {/* Header — matches home page */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0a0f1c]/80 border-b border-white/[0.04]">
        <div className="px-6 md:px-10 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-accent/10 border border-accent/20 flex items-center justify-center">
              <div className="w-3 h-3 rounded-sm bg-accent" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Bau<span className="text-accent">Compliance</span>
            </span>
          </Link>

          <div className="flex gap-6 items-center">
            <div className="flex bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5">
              {(["de", "fr", "it", "en"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLanguage(l)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide transition-all duration-300 ${
                    lang === l
                      ? "bg-accent/15 text-accent"
                      : "text-muted hover:text-cream"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 ml-64 p-10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[400px] bg-gradient-to-b from-accent/[0.03] to-transparent pointer-events-none" />
          <div className="relative">{children}</div>
        </main>
      </div>
    </div>
  );
}
