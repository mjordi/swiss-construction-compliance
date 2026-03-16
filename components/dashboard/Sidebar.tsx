"use client";

import { Shield, FileText, Lock, Settings, LogOut, Clock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import type { de } from "@/locales";

const navItems = [
  { icon: FileText, label: "menu-audit", href: "/dashboard" },
  { icon: Shield, label: "menu-risk", href: "/dashboard/risk" },
  { icon: Clock, label: "menu-deadlines", href: "/dashboard/deadlines" },
  { icon: Lock, label: "menu-vault", href: "/dashboard/vault" },
  { icon: Settings, label: "menu-settings", href: "/dashboard/settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "?";

  return (
    <aside className="w-56 shrink-0 bg-white/[0.015] border-r border-white/[0.04] flex flex-col sticky top-[61px] h-[calc(100vh-61px)]">
      {/* User */}
      {user && (
        <div className="px-4 pt-5 pb-4 border-b border-white/[0.04]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-accent/[0.1] border border-accent/20 flex items-center justify-center text-[10px] font-bold text-accent tracking-tight">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-cream truncate leading-tight">{user.name}</div>
              <div className="text-[10px] text-muted/50 truncate">{user.email}</div>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pt-4 pb-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-muted/40">
        {t("menu-nav" as keyof typeof de)}
      </div>

      <nav className="flex-1 px-2 py-1 space-y-px">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-2.5 px-3 py-2 rounded-md transition-all duration-200 text-[13px] font-medium relative",
                isActive
                  ? "bg-accent/[0.06] text-accent"
                  : "text-muted hover:text-cream hover:bg-white/[0.02]"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-accent rounded-r" />
              )}
              <item.icon className="w-4 h-4 shrink-0" />
              {t(item.label as keyof typeof de)}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-white/[0.04]">
        <button
          onClick={logout}
          className="flex items-center gap-2.5 text-muted/60 hover:text-red-400 transition-colors duration-200 text-[12px] font-medium w-full"
        >
          <LogOut className="w-3.5 h-3.5" />
          {t("menu-logout")}
        </button>
      </div>
    </aside>
  );
}
