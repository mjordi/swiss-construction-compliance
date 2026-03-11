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

  return (
    <aside className="w-64 shrink-0 border-r border-white/[0.04] flex flex-col sticky top-[57px] h-[calc(100vh-57px)] z-40">
      {/* User info */}
      {user && (
        <div className="px-6 pt-6 pb-4">
          <div className="text-[11px] text-muted font-medium tracking-wide">
            {t("menu-logged-in")} {user.name}
          </div>
        </div>
      )}

      <nav className="flex-1 px-3 py-2 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3.5 px-4 py-2.5 rounded-lg transition-all duration-300 text-[13px] font-medium",
                isActive
                  ? "bg-accent/[0.08] text-accent border border-accent/15"
                  : "text-muted hover:text-cream hover:bg-white/[0.03] border border-transparent"
              )}
            >
              <item.icon className="w-[18px] h-[18px]" />
              {t(item.label as keyof typeof de)}
            </Link>
          );
        })}
      </nav>

      <div className="px-6 py-6 border-t border-white/[0.04]">
        <button
          onClick={logout}
          className="flex items-center gap-3 text-muted hover:text-red-400 transition-colors duration-300 text-[13px] font-medium w-full"
        >
          <LogOut className="w-[18px] h-[18px]" />
          {t("menu-logout")}
        </button>
      </div>
    </aside>
  );
}
