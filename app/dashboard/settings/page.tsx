"use client";

import { useState, useEffect } from "react";
import { Shield, LogOut, Loader2, Check, User } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { getSupabase } from "@/lib/supabase";

export default function Settings() {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const supabase = getSupabase();

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, company")
      .eq("id", user.id)
      .single()
      .then(({ data }: { data: { full_name: string | null; company: string | null } | null }) => {
        if (data) {
          setFullName(data.full_name ?? "");
          setCompany(data.company ?? "");
        }
      });
  }, [user, supabase]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    await supabase
      .from("profiles")
      .update({ full_name: fullName, company })
      .eq("id", user.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      setPasswordError(t("settings-password-min"));
      return;
    }
    setUpdatingPassword(true);
    setPasswordError(null);
    setPasswordUpdated(false);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);
    if (error) {
      setPasswordError(error.message);
    } else {
      setPasswordUpdated(true);
      setNewPassword("");
      setTimeout(() => setPasswordUpdated(false), 2000);
    }
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "?";

  return (
    <div>
      <header className="mb-6">
        <PageHeader marker={t("settings-marker")} title={t("settings-title")} subtitle={t("settings-subtitle")} />
      </header>

      <div className="space-y-6">
        {/* Profile card */}
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-8">
          <h3 className="text-lg font-semibold text-cream mb-6 flex items-center gap-2.5">
            <User className="w-5 h-5 text-accent" /> {t("settings-profile-title")}
          </h3>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-accent/[0.08] border border-accent/15 rounded-xl flex items-center justify-center text-accent text-lg font-[family-name:var(--font-display)] italic">
              {initials}
            </div>
            <div>
              <div className="text-sm text-muted">{t("settings-email")}</div>
              <div className="text-cream font-medium">{user?.email}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">
                {t("settings-name")}
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none transition-colors duration-200"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">
                {t("settings-company")}
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none transition-colors duration-200"
              />
            </div>
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="px-5 py-2.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center gap-2 text-sm"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4" />
            ) : null}
            {saved ? t("settings-saved") : t("settings-save")}
          </button>
        </div>

        {/* Password change */}
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-8">
          <h3 className="text-lg font-semibold text-cream mb-6 flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-emerald-400" /> {t("settings-password-title")}
          </h3>

          <div className="max-w-sm space-y-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">
                {t("settings-new-password")}
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none transition-colors duration-200"
              />
              <p className="text-[11px] text-muted/60 mt-1">{t("settings-password-min")}</p>
            </div>

            {passwordError && (
              <div className="text-red-400 text-[13px] bg-red-400/[0.06] border border-red-400/15 rounded-lg px-4 py-2.5">
                {passwordError}
              </div>
            )}

            <button
              onClick={handleUpdatePassword}
              disabled={updatingPassword || !newPassword}
              className="px-5 py-2.5 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] disabled:opacity-40 text-cream font-semibold rounded-lg transition-all duration-200 flex items-center gap-2 text-sm"
            >
              {updatingPassword ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : passwordUpdated ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : null}
              {passwordUpdated ? t("settings-password-updated") : t("settings-update-password")}
            </button>
          </div>
        </div>

        {/* Sign out */}
        <div className="text-center pt-4">
          <button
            onClick={logout}
            className="text-red-400/80 hover:text-red-400 text-[13px] font-medium flex items-center justify-center gap-2 mx-auto transition-colors duration-300"
          >
            <LogOut className="w-4 h-4" /> {t("settings-signout-all")}
          </button>
        </div>
      </div>
    </div>
  );
}
