"use client";

import { Shield, FileText, Lock, Settings, LogOut, Clock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import type { de } from "@/locales";

export const navItems = [
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
    <aside className="hidden lg:flex w-56 shrink-0 bg-white/[0.01] border-r border-white/[0.04] flex-col sticky top-[59px] h-[calc(100vh-59px)]">
      {/* User */}
      {user && (
        <div className="px-5 pt-5 pb-4 border-b border-white/[0.04]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/[0.08] border border-accent/15 flex items-center justify-center text-[11px] font-semibold text-accent">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-cream truncate">{user.name}</div>
              <div className="text-[10px] text-muted/60 truncate">{user.email}</div>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-[13px] font-medium",
                isActive
                  ? "bg-accent/[0.08] text-accent"
                  : "text-muted hover:text-cream hover:bg-white/[0.03]"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {t(item.label as keyof typeof de)}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-white/[0.04]">
        <button
          onClick={logout}
          className="flex items-center gap-3 text-muted hover:text-red-400 transition-colors duration-200 text-[13px] font-medium w-full"
        >
          <LogOut className="w-4 h-4" />
          {t("menu-logout")}
        </button>
      </div>
    </aside>
  );
}
