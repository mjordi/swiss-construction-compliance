"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { de, fr, it, en, SUPPORTED_LANGUAGES } from "@/locales";
import type { TranslationKey } from "@/locales";

type Language = (typeof SUPPORTED_LANGUAGES)[number];

const locales = { de, fr, it, en } as const;
const STORAGE_KEY = "baucompliance.language";

interface LanguageContextType {
  lang: Language;
  t: (key: TranslationKey) => string;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function isSupportedLanguage(value: string | null): value is Language {
  return value !== null && SUPPORTED_LANGUAGES.includes(value as Language);
}

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return "de";

  const params = new URLSearchParams(window.location.search);
  const queryLang = params.get("lang");
  if (isSupportedLanguage(queryLang)) return queryLang;

  const storedLang = window.localStorage.getItem(STORAGE_KEY);
  if (isSupportedLanguage(storedLang)) return storedLang;

  const browserLang = window.navigator.language.toLowerCase().split("-")[0];
  if (isSupportedLanguage(browserLang)) return browserLang;

  return "de";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = lang;
    window.localStorage.setItem(STORAGE_KEY, lang);

    const url = new URL(window.location.href);
    if (lang === "de") {
      url.searchParams.delete("lang");
    } else {
      url.searchParams.set("lang", lang);
    }

    window.history.replaceState({}, "", url);
  }, [lang]);

  const t = useMemo(
    () =>
      (key: TranslationKey): string => {
        const translation = locales[lang][key];
        if (translation === undefined) {
          console.warn(`Missing translation for key: ${key} in language: ${lang}`);
          return key;
        }
        return translation;
      },
    [lang]
  );

  const setLanguage = (newLang: Language) => {
    setLang(newLang);
  };

  return (
    <LanguageContext.Provider value={{ lang, t, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
