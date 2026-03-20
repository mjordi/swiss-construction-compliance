"use client";

import { Bell, Shield, CreditCard, LogOut } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import { useLanguage } from "@/context/LanguageContext";

export default function Settings() {
  const { t } = useLanguage();

  return (
    <div>
      <header className="mb-6">
        <PageHeader marker={t("settings-marker")} title={t("settings-title")} subtitle={t("settings-subtitle")} />
      </header>

      <div className="space-y-6">
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-accent/[0.08] border border-accent/15 rounded-xl flex items-center justify-center text-accent text-lg font-[family-name:var(--font-display)] italic">
                MJ
              </div>
              <div>
                <h3 className="text-lg font-semibold text-cream">Michael Jordi</h3>
                <p className="text-muted text-sm">mjordi.ch@gmail.com</p>
              </div>
            </div>
            <button className="px-4 py-2 border border-white/[0.06] rounded-lg text-[13px] text-muted hover:text-cream hover:bg-white/[0.03] transition-all duration-300">
              {t("settings-edit-profile")}
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white/[0.02] border border-accent/15 p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent via-accent/30 to-transparent" />
          <div className="absolute top-0 right-0 p-4">
            <span className="bg-accent/[0.1] text-accent text-[10px] font-semibold tracking-[0.1em] uppercase px-3 py-1 rounded-lg border border-accent/20">{t("settings-pro-active")}</span>
          </div>
          <h3 className="text-lg font-semibold text-cream mb-4 flex items-center gap-2.5">
            <CreditCard className="w-5 h-5 text-accent" /> {t("settings-subscription")}
          </h3>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-2xl font-[family-name:var(--font-display)] italic text-cream mb-1">
                CHF 89.00 <span className="text-sm font-sans not-italic text-muted">{t("settings-subscription-period")}</span>
              </div>
              <p className="text-sm text-muted">{t("settings-next-billing")}: March 1, 2026</p>
            </div>
            <button className="text-[13px] text-muted hover:text-accent underline underline-offset-4 transition-colors duration-300">{t("settings-manage-billing")}</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-6 hover:bg-white/[0.03] hover:border-white/[0.08] transition-all duration-300 cursor-pointer group">
            <Bell className="w-7 h-7 text-blue-400 mb-4 group-hover:scale-110 transition-transform duration-300" />
            <h4 className="font-semibold text-cream mb-2">{t("settings-notifications-title")}</h4>
            <p className="text-sm text-muted">{t("settings-notifications-desc")}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-6 hover:bg-white/[0.03] hover:border-white/[0.08] transition-all duration-300 cursor-pointer group">
            <Shield className="w-7 h-7 text-emerald-400 mb-4 group-hover:scale-110 transition-transform duration-300" />
            <h4 className="font-semibold text-cream mb-2">{t("settings-security-title")}</h4>
            <p className="text-sm text-muted">{t("settings-security-desc")}</p>
          </div>
        </div>

        <div className="text-center pt-8">
          <button className="text-red-400/80 hover:text-red-400 text-[13px] font-medium flex items-center justify-center gap-2 mx-auto transition-colors duration-300">
            <LogOut className="w-4 h-4" /> {t("settings-signout-all")}
          </button>
        </div>
      </div>
    </div>
  );
}
