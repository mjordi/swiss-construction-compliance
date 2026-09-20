"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  const accountId = user?.id ?? null;
  const supabase = useMemo(() => getSupabase(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const isPasswordRecovery = new URLSearchParams(searchParamString).get("recovery") === "1";
  const latestSearchParamStringRef = useRef(searchParamString);
  latestSearchParamStringRef.current = searchParamString;
  const mountedRef = useRef(false);
  const currentAccountIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  const saveGenerationRef = useRef(0);
  const passwordGenerationRef = useRef(0);
  const profileSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passwordSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [loadedProfile, setLoadedProfile] = useState<{ fullName: string; company: string } | null>(null);
  const [stateOwnerAccountId, setStateOwnerAccountId] = useState<string | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [profileError, setProfileError] = useState<TranslationKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const latestProfileFormRef = useRef({ fullName: "", company: "" });

  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<PasswordFeedback | null>(null);
  const latestPasswordRef = useRef("");
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (currentAccountIdRef.current === accountId) return;

    currentAccountIdRef.current = accountId;
    loadGenerationRef.current += 1;
    saveGenerationRef.current += 1;
    passwordGenerationRef.current += 1;
  }, [accountId]);

  useEffect(() => {
    latestProfileFormRef.current = { fullName, company };
  }, [company, fullName]);

  useEffect(() => {
    latestPasswordRef.current = newPassword;
  }, [newPassword]);

  useEffect(() => {
    if (isPasswordRecovery && accountId !== null && stateOwnerAccountId === accountId) {
      passwordInputRef.current?.focus();
    }
  }, [accountId, isPasswordRecovery, stateOwnerAccountId]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      loadGenerationRef.current += 1;
      saveGenerationRef.current += 1;
      passwordGenerationRef.current += 1;
      if (profileSuccessTimerRef.current) clearTimeout(profileSuccessTimerRef.current);
      if (passwordSuccessTimerRef.current) clearTimeout(passwordSuccessTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const loadGeneration = ++loadGenerationRef.current;

    if (profileSuccessTimerRef.current) {
      clearTimeout(profileSuccessTimerRef.current);
      profileSuccessTimerRef.current = null;
    }
    if (passwordSuccessTimerRef.current) {
      clearTimeout(passwordSuccessTimerRef.current);
      passwordSuccessTimerRef.current = null;
    }

    latestProfileFormRef.current = { fullName: "", company: "" };
    latestPasswordRef.current = "";
    setStateOwnerAccountId(accountId);
    setFullName("");
    setCompany("");
    setLoadedProfile(null);
    setProfileReady(false);
    setProfileError(null);
    setSaving(false);
    setSaved(false);
    setNewPassword("");
    setUpdatingPassword(false);
    setPasswordUpdated(false);
    setPasswordFeedback(null);

    if (!accountId) return;

    const isCurrentLoad = () =>
      mountedRef.current &&
      currentAccountIdRef.current === accountId &&
      loadGenerationRef.current === loadGeneration;

    void supabase
      .from("profiles")
      .select("full_name, company")
      .eq("id", accountId)
      .maybeSingle()
      .then(({ data, error }: { data: { full_name: string | null; company: string | null } | null; error: { message: string } | null }) => {
        if (!isCurrentLoad()) return;

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
        setProfileReady(true);
      })
      .catch(() => {
        if (!isCurrentLoad()) return;
        setProfileError("settings-profile-load-error");
      });
  }, [accountId, supabase]);

  const ownsVisibleState = accountId !== null && stateOwnerAccountId === accountId;
  const visibleFullName = ownsVisibleState ? fullName : "";
  const visibleCompany = ownsVisibleState ? company : "";
  const visibleProfileReady = ownsVisibleState && profileReady;
  const visibleNewPassword = ownsVisibleState ? newPassword : "";
  const visibleSaving = ownsVisibleState && saving;
  const visibleSaved = ownsVisibleState && saved;
  const visibleUpdatingPassword = ownsVisibleState && updatingPassword;
  const visiblePasswordUpdated = ownsVisibleState && passwordUpdated;
  const visibleProfileError = ownsVisibleState ? profileError : null;
  const visiblePasswordFeedback = ownsVisibleState ? passwordFeedback : null;
  const hasUnsavedProfileChanges = useMemo(
    () => ownsVisibleState && hasSettingsProfileChanges({ fullName, company }, loadedProfile),
    [company, fullName, loadedProfile, ownsVisibleState]
  );
  const passwordErrorMessage =
    visiblePasswordFeedback?.kind === "translation"
      ? t(visiblePasswordFeedback.key)
      : visiblePasswordFeedback?.message ?? null;

  const handleSaveProfile = async () => {
    if (!accountId || stateOwnerAccountId !== accountId || !profileReady || !hasUnsavedProfileChanges) return;

    const submittedAccountId = accountId;
    const saveGeneration = ++saveGenerationRef.current;
    const normalizedProfile = normalizeSettingsProfileSnapshot({ fullName, company });
    const isCurrentSave = () =>
      mountedRef.current &&
      currentAccountIdRef.current === submittedAccountId &&
      saveGenerationRef.current === saveGeneration;

    if (profileSuccessTimerRef.current) {
      clearTimeout(profileSuccessTimerRef.current);
      profileSuccessTimerRef.current = null;
    }
    setSaving(true);
    setSaved(false);
    setProfileError(null);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: normalizedProfile.fullName, company: normalizedProfile.company })
        .eq("id", submittedAccountId);

      if (!isCurrentSave()) return;

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
        profileSuccessTimerRef.current = setTimeout(() => {
          if (isCurrentSave()) setSaved(false);
          profileSuccessTimerRef.current = null;
        }, 2000);
      } else {
        setSaved(false);
      }
    } catch {
      if (isCurrentSave()) setProfileError("settings-profile-save-error");
    } finally {
      if (isCurrentSave()) setSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!accountId || stateOwnerAccountId !== accountId) return;

    const submittedPassword = newPassword;

    if (submittedPassword.length < 6) {
      setPasswordFeedback({ kind: "translation", key: "settings-password-min" });
      return;
    }

    const submittedAccountId = accountId;
    const passwordGeneration = ++passwordGenerationRef.current;
    const isCurrentPasswordUpdate = () =>
      mountedRef.current &&
      currentAccountIdRef.current === submittedAccountId &&
      passwordGenerationRef.current === passwordGeneration;

    if (passwordSuccessTimerRef.current) {
      clearTimeout(passwordSuccessTimerRef.current);
      passwordSuccessTimerRef.current = null;
    }
    latestPasswordRef.current = submittedPassword;
    setUpdatingPassword(true);
    setPasswordFeedback(null);
    setPasswordUpdated(false);

    try {
      const { error } = await supabase.auth.updateUser({ password: submittedPassword });
      if (!isCurrentPasswordUpdate()) return;

      if (error) {
        setPasswordFeedback({ kind: "message", message: error.message });
        return;
      }

      if (latestPasswordRef.current === submittedPassword) {
        latestPasswordRef.current = "";
        setPasswordUpdated(true);
        setNewPassword("");
        passwordSuccessTimerRef.current = setTimeout(() => {
          if (isCurrentPasswordUpdate()) setPasswordUpdated(false);
          passwordSuccessTimerRef.current = null;
        }, 2000);
        if (isPasswordRecovery) {
          const params = new URLSearchParams(latestSearchParamStringRef.current);
          params.delete("recovery");
          const query = params.toString();
          router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
        }
      }
    } catch (error) {
      if (!isCurrentPasswordUpdate()) return;
      setPasswordFeedback({
        kind: "message",
        message: error instanceof Error && error.message ? error.message : "Unable to update password. Please try again.",
      });
    } finally {
      if (isCurrentPasswordUpdate()) setUpdatingPassword(false);
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
              <label htmlFor="settings-full-name" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">
                {t("settings-name")}
              </label>
              <input
                id="settings-full-name"
                type="text"
                value={visibleFullName}
                disabled={!visibleProfileReady}
                onChange={(e) => {
                  if (!visibleProfileReady) return;
                  const nextFullName = e.target.value;
                  latestProfileFormRef.current = {
                    ...latestProfileFormRef.current,
                    fullName: nextFullName,
                  };
                  if (profileSuccessTimerRef.current) {
                    clearTimeout(profileSuccessTimerRef.current);
                    profileSuccessTimerRef.current = null;
                  }
                  setFullName(nextFullName);
                  setSaved(false);
                  setProfileError(null);
                }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none transition-colors duration-200"
              />
            </div>
            <div>
              <label htmlFor="settings-company" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">
                {t("settings-company")}
              </label>
              <input
                id="settings-company"
                type="text"
                value={visibleCompany}
                disabled={!visibleProfileReady}
                onChange={(e) => {
                  if (!visibleProfileReady) return;
                  const nextCompany = e.target.value;
                  latestProfileFormRef.current = {
                    ...latestProfileFormRef.current,
                    company: nextCompany,
                  };
                  if (profileSuccessTimerRef.current) {
                    clearTimeout(profileSuccessTimerRef.current);
                    profileSuccessTimerRef.current = null;
                  }
                  setCompany(nextCompany);
                  setSaved(false);
                  setProfileError(null);
                }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none transition-colors duration-200"
              />
            </div>
          </div>

          {visibleProfileError && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-400/15 bg-red-400/[0.06] px-4 py-3 text-[13px] text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t(visibleProfileError)}</span>
            </div>
          )}

          <button
            aria-live="polite"
            onClick={handleSaveProfile}
            disabled={!visibleProfileReady || visibleSaving || !hasUnsavedProfileChanges}
            className="px-5 py-2.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center gap-2 text-sm"
          >
            {visibleSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : visibleSaved ? (
              <Check className="w-4 h-4" />
            ) : null}
            {visibleSaved ? t("settings-saved") : t("settings-save")}
          </button>
        </div>

        {/* Password change */}
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-8">
          <h3 className="text-lg font-semibold text-cream mb-6 flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-emerald-400" /> {t("settings-password-title")}
          </h3>

          {isPasswordRecovery && (
            <p className="mb-4 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-100">
              {t("settings-password-recovery-guidance")}
            </p>
          )}

          <div className="max-w-sm space-y-4">
            <div>
              <label htmlFor="settings-new-password" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted mb-1.5">
                {t("settings-new-password")}
              </label>
              <input
                ref={passwordInputRef}
                id="settings-new-password"
                type="password"
                value={visibleNewPassword}
                disabled={!ownsVisibleState}
                onChange={(e) => {
                  const nextPassword = e.target.value;
                  if (passwordSuccessTimerRef.current) {
                    clearTimeout(passwordSuccessTimerRef.current);
                    passwordSuccessTimerRef.current = null;
                  }
                  latestPasswordRef.current = nextPassword;
                  setNewPassword(nextPassword);
                  setPasswordFeedback(null);
                  setPasswordUpdated(false);
                }}
                placeholder="••••••••"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-cream focus:border-accent/40 outline-none transition-colors duration-200"
              />
              <p className="text-[11px] text-muted/60 mt-1">{t("settings-password-min")}</p>
            </div>

            {passwordErrorMessage && (
              <div role="alert" className="text-red-400 text-[13px] bg-red-400/[0.06] border border-red-400/15 rounded-lg px-4 py-2.5">
                {passwordErrorMessage}
              </div>
            )}

            <button
              aria-live="polite"
              onClick={handleUpdatePassword}
              disabled={!ownsVisibleState || visibleUpdatingPassword || !visibleNewPassword}
              className="px-5 py-2.5 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] disabled:opacity-40 text-cream font-semibold rounded-lg transition-all duration-200 flex items-center gap-2 text-sm"
            >
              {visibleUpdatingPassword ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : visiblePasswordUpdated ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : null}
              {visiblePasswordUpdated ? t("settings-password-updated") : t("settings-update-password")}
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
