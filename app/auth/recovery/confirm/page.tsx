"use client";

import { Suspense } from "react";
import { LockKeyhole } from "lucide-react";
import { useSearchParams } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { useLanguage } from "@/context/LanguageContext";

function RecoveryConfirmationContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const confirmationId = searchParams.get("confirmation_id") ?? "";

  return (
    <div className="w-full max-w-sm p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-center">
      <div className="w-12 h-12 rounded-xl bg-accent/[0.08] border border-accent/15 flex items-center justify-center mx-auto mb-5">
        <LockKeyhole className="w-5 h-5 text-accent" />
      </div>
      <h1 className="text-2xl font-[family-name:var(--font-display)] italic text-cream mb-2">
        {t("recovery-confirm-title")}
      </h1>
      <p className="text-[13px] text-muted mb-6">{t("recovery-confirm-body")}</p>
      <form action="/auth/recovery" method="post">
        <input type="hidden" name="confirmation_id" value={confirmationId} />
        <button
          disabled={!confirmationId}
          className="w-full bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg shadow-lg shadow-accent/10 transition-all duration-200"
        >
          {t("recovery-confirm-button")}
        </button>
      </form>
    </div>
  );
}

export default function RecoveryConfirmationPage() {
  return (
    <div className="min-h-screen flex flex-col noise-overlay">
      <div className="h-[2px] bg-gradient-to-r from-accent via-accent/40 to-transparent" />
      <SiteHeader />

      <main className="flex-1 flex items-center justify-center p-6">
        <Suspense fallback={null}>
          <RecoveryConfirmationContent />
        </Suspense>
      </main>
    </div>
  );
}
