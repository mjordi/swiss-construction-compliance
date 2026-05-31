"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Shield, LogOut, Loader2, Check, User, AlertCircle } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { getSupabase } from "@/lib/supabase";
import { hasSettingsProfileChanges, normalizeSettingsProfileSnapshot } from "@/lib/settings";
import type { TranslationKey } from "@/locales";

type PasswordFeedback =
  | { kind: "translation"; key: TranslationKey }
  | { kind: "message"; message: string };

export default function Settings() {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const supabase = getSupabase();

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [loadedProfile, setLoadedProfile] = useState<{ fullName: string; company: string } | null>(null);
  const [profileError, setProfileError] = useState<TranslationKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const latestProfileFormRef = useRef({ fullName: "", company: "" });

  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<PasswordFeedback | null>(null);

  useEffect(() => {
    latestProfileFormRef.current = { fullName, company };
  }, [company, fullName]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    void supabase
      .from("profiles")
      .select("full_name, company")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }: { data: { full_name: string | null; company: string | null } | null; error: { message: string } | null }) => {
        if (cancelled) return;

        if (error) {
          setProfileError("settings-profile-load-error");
          return;
        }

        const nextProfile = normalizeSettingsProfileSnapshot({
          fullName: data?.full_name ?? "",
          company: data?.company ?? "",
        });

        latestProfileFormRef.current = nextProfile;
        setLoadedProfile(nextProfile);
        setFullName(nextProfile.fullName);
        setCompany(nextProfile.company);
        setProfileError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setProfileError("settings-profile-load-error");
      });

    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  const hasUnsavedProfileChanges = useMemo(
    () => hasSettingsProfileChanges({ fullName, company }, loadedProfile),
    [company, fullName, loadedProfile]
  );
  const passwordErrorMessage = passwordFeedback?.kind === "translation" ? t(passwordFeedback.key) : passwordFeedback?.message ?? null;

  const handleSaveProfile = async () => {
    if (!user || !hasUnsavedProfileChanges) return;

    const normalizedProfile = normalizeSettingsProfileSnapshot({ fullName, company });

    setSaving(true);
    setSaved(false);
    setProfileError(null);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: normalizedProfile.fullName, company: normalizedProfile.company })
        .eq("id", user.id);

      if (error) {
        setProfileError("settings-profile-save-error");
        return;
      }

      setLoadedProfile(normalizedProfile);

      const latestVisibleProfile = normalizeSettingsProfileSnapshot(latestProfileFormRef.current);
      const formStillMatchesSubmittedProfile = !hasSettingsProfileChanges(latestVisibleProfile, normalizedProfile);

      if (formStillMatchesSubmittedProfile) {
        latestProfileFormRef.current = normalizedProfile;
        setFullName(normalizedProfile.fullName);
        setCompany(normalizedProfile.company);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setSaved(false);
      }
    } catch {
      setProfileError("settings-profile-save-error");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      setPasswordFeedback({ kind: "translation", key: "settings-password-min" });
      return;
    }

    setUpdatingPassword(true);
    setPasswordFeedback(null);
    setPasswordUpdated(false);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordFeedback({ kind: "message", message: error.message });
        return;
      }

      setPasswordUpdated(true);
      setNewPassword("");
      setTimeout(() => setPasswordUpdated(false), 2000);
    } catch (error) {
      setPasswordFeedback({
        kind: "message",
        message: error instanceof Error && error.message ? error.message : "Unable to update password. Please try again.",
      });
    } finally {
      setUpdatingPassword(false);
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
                onChange={(e) => {
                  const nextFullName = e.target.value;
                  latestProfileFormRef.current = {
                    ...latestProfileFormRef.current,
                    fullName: nextFullName,
                  };
                  setFullName(nextFullName);
                  setSaved(false);
                  setProfileError(null);
                }}
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
                onChange={(e) => {
                  const nextCompany = e.target.value;
                  latestProfileFormRef.current = {
                    ...latestProfileFormRef.current,
                    company: nextCompany,
                  };
                  setCompany(nextCompany);
                  setSaved(false);
                  setProfileError(null);
                }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none transition-colors duration-200"
              />
            </div>
          </div>

          {profileError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-400/15 bg-red-400/[0.06] px-4 py-3 text-[13px] text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t(profileError)}</span>
            </div>
          )}

          <button
            onClick={handleSaveProfile}
            disabled={saving || !hasUnsavedProfileChanges}
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
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordFeedback(null);
                  setPasswordUpdated(false);
                }}
                placeholder="••••••••"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none transition-colors duration-200"
              />
              <p className="text-[11px] text-muted/60 mt-1">{t("settings-password-min")}</p>
            </div>

            {passwordErrorMessage && (
              <div className="text-red-400 text-[13px] bg-red-400/[0.06] border border-red-400/15 rounded-lg px-4 py-2.5">
                {passwordErrorMessage}
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
