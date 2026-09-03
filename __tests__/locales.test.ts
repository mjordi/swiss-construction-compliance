import { describe, it, expect } from "vitest";
import { de, fr, it as itLocale, en } from "../locales/index";

const locales = { de, fr, it: itLocale, en };
const referenceKeys = Object.keys(de).sort();

describe("locales", () => {
  it("includes dashboard menu localization keys in every locale", () => {
    const requiredDashboardMenuKeys = [
      "menu-audit",
      "menu-deadlines",
      "menu-cases",
      "menu-protocols",
      "menu-vault",
      "menu-work",
      "menu-settings",
    ] as const;

    for (const [lang, translations] of Object.entries(locales)) {
      for (const key of requiredDashboardMenuKeys) {
        expect(translations[key], `Locale '${lang}' missing dashboard menu key '${key}'`).toBeDefined();
      }
    }
  });

  it("includes complete compliance work queue copy in every locale", () => {
    const keys = [
      "work-title", "work-description", "work-boundary", "work-loading", "work-error",
      "work-malformed", "work-retry", "work-empty-title", "work-empty-body", "work-open-case",
      "work-next-action", "work-countdown", "work-readiness", "work-progress",
      "work-linked-protocols", "work-priority-expired", "work-priority-immediate-notice",
      "work-priority-urgent", "work-priority-warning", "work-priority-lifecycle-review",
      "work-priority-incomplete-readiness", "work-reason-defect-not-documented",
      "work-reason-evidence-not-attached", "work-reason-notice-not-drafted",
      "work-reason-calendar-not-exported", "work-reason-protocol-missing",
    ] as const;

    for (const [lang, translations] of Object.entries(locales)) {
      for (const key of keys) {
        expect(translations[key], `Locale '${lang}' missing work queue key '${key}'`).toBeDefined();
      }
    }
  });

  it("keeps the personal point-in-time and no-governance/delivery boundary in every locale", () => {
    const expectedTerms = {
      de: [/persönliche/i, /momentaufnahme/i, /keine zuweisungen/i, /keine überwachung/i, /keine benachrichtigungen/i],
      fr: [/personnelle/i, /instantané/i, /aucune attribution/i, /aucune surveillance/i, /aucune notification/i],
      it: [/personale/i, /istantanea/i, /nessuna assegnazione/i, /nessun monitoraggio/i, /nessuna notifica/i],
      en: [/personal/i, /point-in-time/i, /no assignments/i, /no monitoring/i, /no notifications/i],
    } as const;

    for (const [lang, translations] of Object.entries(locales)) {
      for (const term of expectedTerms[lang as keyof typeof expectedTerms]) {
        expect(translations["work-boundary"], `Locale '${lang}' work boundary missing ${term}`).toMatch(term);
      }
    }
  });

  it("keeps the Italian empty state about schedule and readiness, not verified compliance", () => {
    expect(itLocale["work-empty-body"]).toMatch(/tempi previsti/i);
    expect(itLocale["work-empty-body"]).toMatch(/completamente preparati/i);
    expect(itLocale["work-empty-body"]).not.toMatch(/in regola/i);
  });

  it("includes complete protocol register copy in every locale", () => {
    const keys = [
      "protocols-title", "protocols-subtitle", "protocols-integrity-note", "protocols-loading", "protocols-empty-title",
      "protocols-empty-body", "protocols-error", "protocols-retry", "protocols-project",
      "protocols-contractor", "protocols-client", "protocols-record-id", "protocols-record-date",
      "protocols-signature", "protocols-signature-captured", "protocols-signature-missing",
      "protocols-context", "protocols-context-linked", "protocols-context-standalone",
      "protocols-download", "protocols-downloading", "protocols-download-success", "protocols-download-error",
      "protocols-audit-export-action", "protocols-audit-export-pending", "protocols-audit-export-guidance",
      "protocols-audit-export-success", "protocols-audit-export-error", "protocols-audit-export-generated-at",
      "protocols-audit-export-scope", "protocols-audit-export-scope-value", "protocols-audit-export-protocol-id",
      "protocols-audit-export-case-id", "protocols-audit-export-standalone", "protocols-audit-export-project",
      "protocols-audit-export-contractor", "protocols-audit-export-client", "protocols-audit-export-finalized-at",
      "protocols-audit-export-signature-state", "protocols-audit-export-signature-captured",
      "protocols-audit-export-signature-missing",
    ] as const;

    for (const [lang, translations] of Object.entries(locales)) {
      for (const key of keys) {
        expect(translations[key], `Locale '${lang}' missing protocol register key '${key}'`).toBeDefined();
      }
    }
  });

  it("keeps finalized protocol content, Case unlink, and account boundaries truthful in every locale", () => {
    const expectedTerms = {
      de: [/inhalt und signaturen.*nicht geändert/i, /nicht einzeln löschen/i, /löschen.*verknüpften Falls.*Fallzuordnung/i, /löschen ihres kontos.*protokolldatensätze gelöscht/i, /weder eine externe aufbewahrung noch absolute unveränderlichkeit/i],
      fr: [/contenu et les signatures.*ne peuvent pas être modifiés/i, /ne peuvent pas supprimer individuellement/i, /suppression.*Cas lié.*association au Cas/i, /suppression de votre compte.*enregistrements de protocole/i, /ni d.une conservation externe ni d.une immuabilité absolue/i],
      it: [/contenuto e le firme.*non possono essere modificati/i, /non possono eliminare singolarmente/i, /eliminazione.*Caso collegato.*associazione al Caso/i, /elimini il tuo account.*record di protocollo/i, /non si tratta di conservazione esterna né di immutabilità assoluta/i],
      en: [/content and signatures cannot be changed/i, /cannot individually delete/i, /deleting a linked Case.*Case association/i, /deleting your account.*protocol records/i, /not external retention or absolute immutability/i],
    } as const;

    for (const [lang, translations] of Object.entries(locales)) {
      const copy = translations["protocols-integrity-note"];
      for (const term of expectedTerms[lang as keyof typeof expectedTerms]) {
        expect(copy, `Locale '${lang}' protocol integrity copy is missing ${term}`).toMatch(term);
      }
    }
  });

  it("keeps the protocol audit index point-in-time and consequence boundaries truthful in every locale", () => {
    const expectedTerms = {
      de: [/momentaufnahme/i, /kein nachweis rechtlicher vollständigkeit/i, /zustellung/i, /annahme/i, /extern.*aufbewahrung/i],
      fr: [/instantané/i, /aucune preuve d.exhaustivité juridique/i, /livraison/i, /acceptation/i, /conservation externe/i],
      it: [/istantanea/i, /(?:nessuna|alcuna) prova di completezza giuridica/i, /consegna/i, /accettazione/i, /conservazione esterna/i],
      en: [/point-in-time/i, /not proof of legal completeness/i, /delivery/i, /acceptance/i, /external retention/i],
    } as const;

    for (const [lang, translations] of Object.entries(locales)) {
      const copy = `${translations["protocols-audit-export-guidance"]} ${translations["protocols-audit-export-scope-value"]}`;
      for (const term of expectedTerms[lang as keyof typeof expectedTerms]) {
        expect(copy, `Locale '${lang}' protocol audit export copy is missing ${term}`).toMatch(term);
      }
    }
  });

  it("includes dashboard priority action cockpit keys in every locale", () => {
    const requiredCockpitKeys = [
      "dashboard-action-cockpit-title",
      "dashboard-action-cockpit-description",
      "dashboard-action-cockpit-open",
    ] as const;

    for (const [lang, translations] of Object.entries(locales)) {
      for (const key of requiredCockpitKeys) {
        expect(translations[key], `Locale '${lang}' missing action cockpit key '${key}'`).toBeDefined();
      }
    }
  });

  it("includes vault localization keys in every locale", () => {
    const requiredVaultKeys = [
      "vault-title",
      "vault-subtitle",
      "vault-tab-projects",
      "vault-tab-archived",
      "vault-search-placeholder",
      "vault-loading",
      "vault-error-load",
      "vault-load-retry",
      "vault-status-active",
      "vault-status-review",
      "vault-status-archived",
      "vault-linked-protocols-label",
      "vault-evidence-show",
      "vault-evidence-hide",
      "vault-evidence-title",
      "vault-evidence-loading",
      "vault-evidence-empty",
      "vault-evidence-list-error",
      "vault-evidence-file-label",
      "vault-evidence-uploading",
      "vault-evidence-upload-success",
      "vault-evidence-upload-error",
      "vault-evidence-cleanup-warning",
      "vault-evidence-validation-empty",
      "vault-evidence-validation-type",
      "vault-evidence-validation-size",
      "vault-evidence-checklist-warning",
      "vault-evidence-download",
      "vault-evidence-downloading",
      "vault-evidence-download-error",
      "vault-evidence-read-only",
      "vault-last-prefix",
      "vault-last-updated",
      "vault-updated-prefix",
      "vault-updated-unit-hours",
      "vault-updated-unit-days",
      "vault-updated-unit-weeks",
      "vault-updated-less-than-hour",
      "vault-empty-search-title",
      "vault-empty-search-body-projects",
      "vault-empty-search-body-archived",
      "vault-empty-archived-title",
      "vault-empty-archived-body",
      "vault-empty-archived-body-no-active",
      "vault-empty-projects-title",
      "vault-empty-projects-body",
      "vault-empty-projects-body-no-archived",
      "vault-empty-action-clear-search",
      "vault-empty-action-show-projects",
      "vault-empty-action-show-archived",
      "vault-new-project",
      "vault-create-project",
      "vault-open-in-cases",
      "vault-archive-project",
      "vault-restore-project",
      "vault-update-status-error",
      "vault-audit-export-action",
      "vault-audit-export-preparing",
      "vault-audit-export-success",
      "vault-audit-export-error",
      "vault-audit-export-guidance",
      "vault-audit-export-generated-at",
      "vault-audit-export-scope",
      "vault-audit-export-scope-value",
      "vault-audit-export-case-id",
      "vault-audit-export-project",
      "vault-audit-export-lifecycle",
      "vault-audit-export-legal-status",
      "vault-audit-export-legal-regime",
      "vault-audit-export-deadline",
      "vault-audit-export-checklist-completed",
      "vault-audit-export-checklist-total",
      "vault-audit-export-missing",
      "vault-audit-export-linked-protocols",
      "vault-audit-export-source-updated",
      "vault-audit-export-none",
      "vault-audit-export-unavailable",
      "vault-audit-export-regime-old",
      "vault-audit-export-regime-new",
    ] as const;

    for (const [lang, translations] of Object.entries(locales)) {
      for (const key of requiredVaultKeys) {
        expect(translations[key], `Locale '${lang}' missing vault key '${key}'`).toBeDefined();
      }
    }
  });

  it("keeps the vault audit export scope truthful in every locale", () => {
    const expectedTerms = {
      de: [/vollständig/i, /momentaufnahme/i, /kein nachweis rechtlicher vollständigkeit/i],
      fr: [/complet/i, /instantané/i, /aucune preuve d.exhaustivité juridique/i],
      it: [/completo/i, /istantanea/i, /nessuna prova di completezza giuridica/i],
      en: [/complete/i, /point-in-time/i, /not proof of legal completeness/i],
    } as const;

    for (const [lang, translations] of Object.entries(locales)) {
      const copy = `${translations["vault-audit-export-guidance"]} ${translations["vault-audit-export-scope-value"]}`;
      for (const term of expectedTerms[lang as keyof typeof expectedTerms]) {
        expect(copy, `Locale '${lang}' vault audit export copy is missing ${term}`).toMatch(term);
      }
    }
  });

  it("includes settings profile feedback keys in every locale", () => {
    const requiredSettingsKeys = [
      "settings-profile-title",
      "settings-email",
      "settings-name",
      "settings-company",
      "settings-save",
      "settings-saved",
      "settings-profile-load-error",
      "settings-profile-save-error",
    ] as const;

    for (const [lang, translations] of Object.entries(locales)) {
      for (const key of requiredSettingsKeys) {
        expect(translations[key], `Locale '${lang}' missing settings key '${key}'`).toBeDefined();
      }
    }
  });

  it("includes deadlines localization keys in every locale", () => {
    const requiredDeadlineKeys = [
      "deadlines-reminder-label",
      "deadlines-reminder-days",
      "deadlines-share-link",
      "deadlines-share-link-copied",
      "deadlines-share-link-error",
      "deadlines-portfolio-title",
      "deadlines-portfolio-description",
      "deadlines-portfolio-loading",
      "deadlines-portfolio-error",
      "deadlines-portfolio-retry",
      "deadlines-portfolio-empty",
      "deadlines-portfolio-count",
      "deadlines-portfolio-download",
      "deadlines-portfolio-ready",
      "deadlines-portfolio-event-only-ready",
      "deadlines-portfolio-download-error",
      "deadlines-portfolio-guidance",
      "deadlines-portfolio-event-only-guidance",
      "deadlines-portfolio-milestone-notice",
      "deadlines-portfolio-milestone-warranty-2y",
      "deadlines-portfolio-milestone-limitation-5y",
      "deadlines-portfolio-ics-summary-template",
      "deadlines-portfolio-ics-source-label",
      "deadlines-portfolio-ics-source",
      "deadlines-portfolio-ics-project-label",
      "deadlines-portfolio-ics-case-label",
      "deadlines-portfolio-ics-contract-label",
      "deadlines-portfolio-ics-discovery-label",
      "deadlines-portfolio-ics-acceptance-label",
      "deadlines-portfolio-ics-point-in-time",
      "deadlines-portfolio-ics-alarm-singular",
      "deadlines-portfolio-ics-alarm-plural",
    ] as const;

    for (const [lang, translations] of Object.entries(locales)) {
      for (const key of requiredDeadlineKeys) {
        expect(translations[key], `Locale '${lang}' missing deadlines key '${key}'`).toBeDefined();
      }
    }
  });

  it("keeps localized portfolio calendar templates complete and truthful", () => {
    const importTerms = { de: /import/i, fr: /import/i, it: /importa/i, en: /import/i } as const;
    const noDeliveryTerms = {
      de: /keine e-mail- oder in-app-erinnerungen/i,
      fr: /aucun rappel par e-mail ni dans l’application/i,
      it: /non invia promemoria via e-mail o nell’app/i,
      en: /no email or in-app reminders/i,
    } as const;

    for (const [lang, translations] of Object.entries(locales)) {
      const locale = lang as keyof typeof importTerms;
      expect(translations["deadlines-portfolio-ics-summary-template"]).toMatch(/\{deadline\}.*\{project\}/);
      expect(translations["deadlines-portfolio-ics-alarm-singular"]).toMatch(/1/);
      expect(translations["deadlines-portfolio-ics-alarm-plural"]).toContain("{days}");
      expect(translations["deadlines-portfolio-ics-point-in-time"]).toMatch(/\.ics/i);
      expect(translations["deadlines-portfolio-ics-point-in-time"]).toMatch(importTerms[locale]);
      expect(translations["deadlines-portfolio-ics-point-in-time"]).toMatch(noDeliveryTerms[locale]);
      for (const key of [
        "deadlines-portfolio-milestone-notice",
        "deadlines-portfolio-milestone-warranty-2y",
        "deadlines-portfolio-milestone-limitation-5y",
        "deadlines-portfolio-ics-source-label",
        "deadlines-portfolio-ics-project-label",
        "deadlines-portfolio-ics-case-label",
        "deadlines-portfolio-ics-contract-label",
        "deadlines-portfolio-ics-discovery-label",
        "deadlines-portfolio-ics-acceptance-label",
      ] as const) {
        expect(translations[key].trim(), `Locale '${lang}' calendar label '${key}' must not be blank`).not.toBe("");
      }
    }
  });

  it("describes portfolio milestones without claiming monitoring or legal completeness", () => {
    const milestoneTerms = {
      de: [/rügefrist/i, /2-jahres.*sia/i, /5-jahres.*or/i],
      fr: [/notification.*60 jours/i, /garantie sia.*2 ans/i, /prescription.*5 ans.*co/i],
      it: [/notifica.*60 giorni/i, /garanzia sia.*2 anni/i, /prescrizione.*5 anni.*co/i],
      en: [/60-day notice/i, /two-year SIA warranty/i, /five-year CO limitation/i],
    } as const;
    const prohibitedClaims = {
      de: /aktive überwachung|rechtlich vollständig/i,
      fr: /surveillance active|exhaustivité juridique/i,
      it: /monitoraggio attivo|completezza giuridica/i,
      en: /active monitoring|legally complete/i,
    } as const;

    for (const [lang, translations] of Object.entries(locales)) {
      const locale = lang as keyof typeof milestoneTerms;
      const labels = [
        translations["deadlines-portfolio-milestone-notice"],
        translations["deadlines-portfolio-milestone-warranty-2y"],
        translations["deadlines-portfolio-milestone-limitation-5y"],
      ];
      milestoneTerms[locale].forEach((term, index) => expect(labels[index]).toMatch(term));
      const portfolioCopy = [
        translations["deadlines-portfolio-description"],
        translations["deadlines-portfolio-empty"],
        translations["deadlines-portfolio-count"],
      ].join(" ");
      expect(portfolioCopy).not.toMatch(prohibitedClaims[locale]);
    }
  });

  it("states the portfolio snapshot/import boundary and delivery limits in every locale", () => {
    const expectedTerms = {
      de: [/momentaufnahme/i, /\.ics/i, /import/i, /keine e-mail- oder in-app-erinnerungen/i],
      fr: [/instantané/i, /\.ics/i, /import/i, /aucun rappel par e-mail ni dans l’application/i],
      it: [/istantanea/i, /\.ics/i, /importa/i, /promemoria via e-mail o nell’app/i],
      en: [/point-in-time/i, /\.ics/i, /import/i, /no email or in-app reminders/i],
    } as const;

    for (const [lang, translations] of Object.entries(locales)) {
      const copy = [
        translations["deadlines-portfolio-guidance"],
        translations["deadlines-portfolio-ready"],
      ].join(" ");
      for (const term of expectedTerms[lang as keyof typeof expectedTerms]) {
        expect(copy, `Locale '${lang}' portfolio copy is missing ${term}`).toMatch(term);
      }
    }
  });

  it("states event-only portfolio behavior when reminders are empty in every locale", () => {
    const expectedTerms = {
      de: [/momentaufnahme/i, /import/i, /ohne (?:alarme|alarm).*erinner/i],
      fr: [/instantané/i, /import/i, /sans alerte ni rappel/i],
      it: [/istantanea/i, /importa/i, /senza avvisi né promemoria/i],
      en: [/point-in-time/i, /import/i, /no alerts or reminders/i],
    } as const;

    for (const [lang, translations] of Object.entries(locales)) {
      const copy = [
        translations["deadlines-portfolio-event-only-guidance"],
        translations["deadlines-portfolio-event-only-ready"],
      ].join(" ");
      for (const term of expectedTerms[lang as keyof typeof expectedTerms]) {
        expect(copy, `Locale '${lang}' event-only portfolio copy is missing ${term}`).toMatch(term);
      }
    }
  });

  it("states calendar import activation and reminder delivery limits in every locale", () => {
    const expectedTerms = {
      de: [".ics", "importieren", "keine e-mail- oder in-app-erinnerungen"],
      fr: [".ics", "importez", "aucun rappel par e-mail ni dans l’application"],
      it: [".ics", "importa", "promemoria via e-mail o nell’app"],
      en: [".ics", "import", "no email or in-app reminders"],
    } as const;

    for (const [lang, translations] of Object.entries(locales)) {
      const guidance = translations["reminders-activation-guidance"];
      expect(guidance, `Locale '${lang}' missing reminder activation guidance`).toBeDefined();
      for (const term of expectedTerms[lang as keyof typeof expectedTerms]) {
        expect(guidance.toLocaleLowerCase(lang), `Locale '${lang}' reminder guidance missing '${term}'`).toContain(term);
      }
    }
  });

  it("explains event-only calendar imports when no reminders are selected in every locale", () => {
    const expectedTerms = {
      de: [/\.ics/i, /import/i, /frist.*termin/i, /ohne (?:alarme|alarm).*erinner/i],
      fr: [/\.ics/i, /import/i, /échéance/i, /sans alerte ni rappel/i],
      it: [/\.ics/i, /importa/i, /eventi? .*scadenz/i, /senza avvisi né promemoria/i],
      en: [/\.ics/i, /import/i, /deadline event/i, /no alerts or reminders/i],
    } as const;

    for (const [lang, translations] of Object.entries(locales)) {
      const eventOnlyCopy = [
        translations["reminders-event-only-guidance"],
        translations["deadlines-download-event-only-ready"],
        translations["calc-download-ics-event-only-ready"],
      ].join(" ");
      for (const expectedTerm of expectedTerms[lang as keyof typeof expectedTerms]) {
        expect(eventOnlyCopy, `Locale '${lang}' event-only copy is missing ${expectedTerm}`).toMatch(expectedTerm);
      }
    }
  });

  it("tells users to import successful calendar downloads in every locale", () => {
    for (const [lang, translations] of Object.entries(locales)) {
      for (const key of ["deadlines-download-ready", "calc-download-ics-ready", "cases-export-ics-ready"] as const) {
        expect(translations[key], `Locale '${lang}' feedback '${key}' must require import`).toMatch(/import/i);
      }
    }
  });

  it("uses direct singular imperatives in the changed Italian reminder and marketing copy", () => {
    const changedItalianKeys = [
      "how-step2-title",
      "how-step2-desc",
      "feat-warranty-desc",
      "plan-team-f2",
      "plan-pro-f2",
      "deadlines-download-ready",
      "deadlines-download-event-only-ready",
      "reminders-activation-guidance",
      "reminders-event-only-guidance",
      "calc-download-ics-ready",
      "calc-download-ics-event-only-ready",
      "cases-export-ics-ready",
      "home-faq-a2",
    ] as const;
    const changedItalianCopy = changedItalianKeys.map((key) => itLocale[key]).join(" ");

    expect(changedItalianCopy).toMatch(/\bScarica\b/);
    expect(changedItalianCopy).toMatch(/\bImporta(?:lo|li)?\b/);
    expect(changedItalianCopy).not.toMatch(/\b(?:Scaricare|Importare|Calcolare)\b/i);
  });

  it("describes each public deadline feature truthfully without promising delivered alerts", () => {
    const calculationKeys = [
      "hero-title",
      "hero-subtitle",
      "how-step2-title",
      "how-step2-desc",
      "feat-warranty-title",
      "feat-warranty-desc",
      "plan-team-f2",
      "plan-pro-f2",
      "home-faq-a1",
      "home-faq-a2",
    ] as const;
    const calendarHandoffKeys = [
      "hero-subtitle",
      "how-step2-desc",
      "feat-warranty-desc",
      "plan-team-f2",
      "plan-pro-f2",
      "home-faq-a2",
    ] as const;
    const calculationTerm = {
      de: /berechn/i,
      fr: /calcul/i,
      it: /calcol/i,
      en: /calculat/i,
    } as const;
    const prohibitedDeliveryClaims = {
      de: /warnung|alarm|benachrichtig|überwach|nie wieder.*verpass/i,
      fr: /alert|surveill|ne manquez plus/i,
      it: /avvis|sorvegl|monitor|mai più.*mancat/i,
      en: /alert|notification|monitor|track|never miss/i,
    } as const;

    for (const [lang, translations] of Object.entries(locales)) {
      const locale = lang as keyof typeof calculationTerm;
      for (const key of calculationKeys) {
        const copy = translations[key];
        expect(copy, `Locale '${lang}' marketing key '${key}' must describe calculation`).toMatch(calculationTerm[locale]);
        expect(copy, `Locale '${lang}' marketing key '${key}' must not imply proactive delivery`).not.toMatch(
          prohibitedDeliveryClaims[locale]
        );
      }
      for (const key of calendarHandoffKeys) {
        const copy = translations[key];
        expect(copy, `Locale '${lang}' marketing key '${key}' must identify the .ics handoff`).toMatch(/\.ics/i);
        expect(copy, `Locale '${lang}' marketing key '${key}' must require calendar import`).toMatch(/import/i);
      }
    }
  });

  it("includes calculator share-link localization keys in every locale", () => {
    const requiredCalculatorShareKeys = [
      "calc-share-link",
      "calc-share-link-copied",
      "calc-share-link-error",
    ] as const;

    for (const [lang, translations] of Object.entries(locales)) {
      for (const key of requiredCalculatorShareKeys) {
        expect(translations[key], `Locale '${lang}' missing calculator share-link key '${key}'`).toBeDefined();
      }
    }
  });

  it("includes cases share-link and load-error localization keys in every locale", () => {
    const requiredCasesShareKeys = [
      "cases-share-link",
      "cases-share-link-copied",
      "cases-share-link-error",
      "cases-load-error",
      "cases-load-retry",
      "cases-open-in-vault",
      "cases-status-triage",
      "cases-create-error",
      "cases-delete-error",
      "cases-handoff-unavailable-title",
      "cases-handoff-unavailable-body",
      "cases-handoff-show-all",
      "cases-handoff-loading",
    ] as const;

    for (const [lang, translations] of Object.entries(locales)) {
      for (const key of requiredCasesShareKeys) {
        expect(translations[key], `Locale '${lang}' missing cases share-link key '${key}'`).toBeDefined();
      }
    }
  });

  it("includes notice preview disclosure labels in every locale", () => {
    const requiredNoticePreviewKeys = [
      "cases-notice-preview-show",
      "cases-notice-preview-hide",
    ] as const;

    for (const [lang, translations] of Object.entries(locales)) {
      for (const key of requiredNoticePreviewKeys) {
        expect(translations[key], `Locale '${lang}' missing notice preview key '${key}'`).toBeDefined();
      }
    }
  });

  it("includes notice draft revision labels in every locale", () => {
    const requiredNoticeDraftKeys = [
      "cases-notice-draft-create",
      "cases-notice-draft-creating",
      "cases-notice-draft-create-error",
      "cases-notice-draft-created",
      "cases-notice-draft-title",
      "cases-notice-draft-status",
      "cases-notice-draft-created-at",
      "cases-notice-draft-context",
      "cases-notice-draft-download",
      "cases-notice-draft-generating",
      "cases-notice-draft-download-success",
      "cases-notice-draft-download-error",
      "cases-notice-draft-pdf-title",
      "cases-notice-draft-pdf-saved",
      "cases-notice-draft-pdf-not-approved",
      "cases-notice-draft-pdf-not-sent",
      "cases-notice-draft-pdf-review-disclaimer",
      "cases-notice-draft-pdf-legal-disclaimer",
      "cases-notice-draft-pdf-revision-id",
      "cases-notice-draft-pdf-stored-deadline",
    ] as const;

    for (const [lang, translations] of Object.entries(locales)) {
      for (const key of requiredNoticeDraftKeys) {
        expect(translations[key], `Locale '${lang}' missing notice draft key '${key}'`).toBeDefined();
      }
    }
  });

  it("includes factual notice dispatch labels in every locale", () => {
    const requiredNoticeDispatchKeys = [
      "cases-legal-milestone-notice-dispatched",
      "cases-notice-dispatch-title",
      "cases-notice-dispatch-semantics",
      "cases-notice-dispatch-revision",
      "cases-notice-dispatch-at",
      "cases-notice-dispatch-channel",
      "cases-notice-dispatch-reference",
      "cases-notice-dispatch-submit",
      "cases-notice-dispatch-recording",
      "cases-notice-dispatch-invalid",
      "cases-notice-dispatch-recorded",
      "cases-notice-dispatch-error",
      "cases-notice-dispatch-recorded-at",
      "cases-notice-dispatch-channel-registered-mail",
      "cases-notice-dispatch-channel-a-mail-plus",
      "cases-notice-dispatch-channel-courier",
      "cases-notice-dispatch-channel-hand-delivery",
      "cases-notice-dispatch-evidence-title",
      "cases-notice-dispatch-evidence-semantics",
      "cases-notice-dispatch-evidence-select",
      "cases-notice-dispatch-evidence-submit",
      "cases-notice-dispatch-evidence-linking",
      "cases-notice-dispatch-evidence-linked",
      "cases-notice-dispatch-evidence-error",
      "cases-notice-dispatch-evidence-file",
      "cases-notice-dispatch-evidence-id",
      "cases-notice-dispatch-evidence-association-id",
      "cases-notice-dispatch-evidence-empty",
      "cases-notice-dispatch-evidence-open-vault",
      "cases-evidence-history-loading",
      "cases-evidence-history-unavailable",
      "cases-evidence-history-retry",
    ] as const;

    for (const [lang, translations] of Object.entries(locales)) {
      for (const key of requiredNoticeDispatchKeys) {
        expect(translations[key], `Locale '${lang}' missing notice dispatch key '${key}'`).toBeDefined();
      }
    }
  });

  it("describes dispatch evidence as user-linked without verification claims", () => {
    const userLinkedTerms = {
      de: /von ihnen verknüpft/i,
      fr: /liée par vos soins/i,
      it: /collegata da te/i,
      en: /user-linked/i,
    } as const;
    for (const [lang, translations] of Object.entries(locales)) {
      const copy = translations["cases-notice-dispatch-evidence-semantics"];
      expect(copy).toMatch(userLinkedTerms[lang as keyof typeof userLinkedTerms]);
      expect(copy).toMatch(/zustellung|réception|consegna|delivery/i);
      expect(copy).not.toMatch(/ist ein verifizierter nachweis|est une preuve vérifiée|è una prova verificata|is verified proof/i);
    }
  });

  it("includes login localization and feedback keys in every locale", () => {
    const requiredLoginKeys = [
      "login-subtitle",
      "login-email-label",
      "login-email-placeholder",
      "login-password-label",
      "login-password-placeholder",
      "login-authenticating",
      "login-encryption",
      "login-demo-divider",
      "login-demo-account",
      "login-source-prefix",
      "login-signup-title",
      "login-signup-subtitle",
      "login-signup-btn",
      "login-signup-success",
      "login-name-label",
      "login-name-placeholder",
      "login-have-account",
      "login-no-account",
      "login-error-name-required",
      "login-error-config",
      "login-error-invalid-credentials",
      "login-error-email-not-confirmed",
      "login-error-user-exists",
      "login-error-password-too-short",
      "login-error-signup-disabled",
      "login-error-generic",
    ] as const;

    for (const [lang, translations] of Object.entries(locales)) {
      for (const key of requiredLoginKeys) {
        expect(translations[key], `Locale '${lang}' missing login key '${key}'`).toBeDefined();
      }
    }
  });

  it("preserves the vault empty-search query placeholder across locales", () => {
    for (const [lang, translations] of Object.entries(locales)) {
      expect(
        translations["vault-empty-search-title"],
        `Locale '${lang}' must preserve the {query} placeholder`
      ).toContain("{query}");
    }
  });

  it("preserves the vault last-updated placeholder across locales", () => {
    for (const [lang, translations] of Object.entries(locales)) {
      expect(
        translations["vault-last-updated"],
        `Locale '${lang}' must preserve the {relative} placeholder`
      ).toContain("{relative}");
    }
  });

  it("all locales export the same keys as 'de'", () => {
    for (const [lang, translations] of Object.entries(locales)) {
      const keys = Object.keys(translations).sort();
      expect(keys, `Locale '${lang}' key mismatch`).toEqual(referenceKeys);
    }
  });

  it("no locale has empty string values (except intentionally empty period fields)", () => {
    // Some keys are intentionally empty (e.g. plan-enterprise-period has no billing period)
    const allowEmpty = new Set(["plan-enterprise-period", "stakes-stat3-unit"]);
    for (const [lang, translations] of Object.entries(locales)) {
      for (const [key, value] of Object.entries(translations)) {
        if (allowEmpty.has(key)) continue;
        expect(value, `Locale '${lang}' key '${key}' is empty`).not.toBe("");
      }
    }
  });

  it("all locales have at least the expected number of keys", () => {
    const minKeys = 50;
    for (const [lang, translations] of Object.entries(locales)) {
      expect(
        Object.keys(translations).length,
        `Locale '${lang}' has fewer than ${minKeys} keys`
      ).toBeGreaterThanOrEqual(minKeys);
    }
  });
});
