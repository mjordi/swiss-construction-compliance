"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut } from "lucide-react";
import { clsx } from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import type { de } from "@/locales";
import { navItems } from "@/components/dashboard/Sidebar";

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { logout } = useAuth();
  const { t } = useLanguage();

  const closeMenu = () => setIsOpen(false);

  return (
    <>
      <div className="lg:hidden sticky top-[59px] z-40 border-b border-white/[0.04] bg-[#0a0f1c]/95 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Dashboard
          </span>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm font-medium text-cream transition-colors hover:bg-white/[0.06]"
            aria-label="Open navigation menu"
            aria-expanded={isOpen}
            aria-controls="mobile-dashboard-nav"
          >
            <Menu className="h-4 w-4" />
            Menu
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-[#020617]/80 backdrop-blur-sm"
            aria-label="Close navigation menu"
            onClick={closeMenu}
          />

          <div
            id="mobile-dashboard-nav"
            className="absolute inset-y-0 left-0 flex w-full max-w-xs flex-col border-r border-white/[0.08] bg-[#0a0f1c] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-4">
              <span className="text-sm font-semibold tracking-tight text-cream">Navigation</span>
              <button
                type="button"
                onClick={closeMenu}
                className="rounded-lg border border-white/[0.08] p-2 text-muted transition-colors hover:text-cream hover:bg-white/[0.04]"
                aria-label="Close navigation menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 px-3 py-3">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMenu}
                    className={clsx(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-accent/[0.08] text-accent"
                        : "text-muted hover:bg-white/[0.03] hover:text-cream"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {t(item.label as keyof typeof de)}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-white/[0.04] px-4 py-4">
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  logout();
                }}
                className="flex w-full items-center gap-3 text-sm font-medium text-muted transition-colors duration-200 hover:text-red-400"
              >
                <LogOut className="h-4 w-4" />
                {t("menu-logout")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
