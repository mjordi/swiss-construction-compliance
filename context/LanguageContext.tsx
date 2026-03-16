"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { de, fr, it, en, SUPPORTED_LANGUAGES } from "@/locales";
import type { TranslationKey } from "@/locales";

type Language = (typeof SUPPORTED_LANGUAGES)[number];

const locales = { de, fr, it, en } as const;

interface LanguageContextType {
  lang: Language;
  t: (key: TranslationKey) => string;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>("de");

  const t = (key: TranslationKey): string => {
    const translation = locales[lang][key];
    if (translation === undefined) {
      console.warn(`Missing translation for key: ${key} in language: ${lang}`);
      return key;
    }
    return translation;
  };

  const setLanguage = (newLang: Language) => {
    setLang(newLang);
    document.documentElement.lang = newLang;
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
