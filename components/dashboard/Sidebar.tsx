"use client";

import { Shield, FileText, Lock, Settings, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

const navItems = [
  { icon: FileText, label: "menu-audit", href: "/dashboard" },
  { icon: Shield, label: "menu-risk", href: "/dashboard/risk" },
  { icon: Lock, label: "menu-vault", href: "/dashboard/vault" },
  { icon: Settings, label: "menu-settings", href: "/dashboard/settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <aside className="w-72 bg-card/30 backdrop-blur-xl border-r border-white/5 flex flex-col fixed h-full left-0 top-0 z-40">
      <div className="p-8">
        <div className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 font-[family-name:var(--font-outfit)]">
          Bau<span className="text-accent">Compliance</span>
        </div>
        {user && <div className="text-xs text-slate-500 mt-2 font-medium">{t("menu-logged-in")} {user.name}</div>}
      </div>

      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-4 px-6 py-4 rounded-xl transition font-medium",
                isActive 
                  ? "bg-accent/10 text-accent" 
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <item.icon className="w-5 h-5" />
              {t(item.label as any)}
            </Link>
          );
        })}
      </nav>

      <div className="p-8 border-t border-white/5">
        <button 
          onClick={logout}
          className="flex items-center gap-4 text-slate-500 hover:text-red-400 transition text-sm font-medium w-full"
        >
          <LogOut className="w-5 h-5" />
          {t("menu-logout")}
        </button>
      </div>
    </aside>
  );
}
