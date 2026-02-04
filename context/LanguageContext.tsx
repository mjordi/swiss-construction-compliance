"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import * as locales from "@/locales";

type Language = keyof typeof locales;
type Translations = typeof locales.de;

interface LanguageContextType {
  lang: Language;
  t: (key: keyof Translations) => string;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>("de");

  const t = (key: keyof Translations): string => {
    const translation = locales[lang][key];
    if (!translation) {
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
