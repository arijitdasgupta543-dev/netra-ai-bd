import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "bn" | "en";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; L: (en: string, bn: string) => string; T: (b?: BiText) => string };

const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("bn");

  useEffect(() => {
    const saved = localStorage.getItem("netra-lang");
    if (saved === "en" || saved === "bn") setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("netra-lang", l);
  };

  const L = (en: string, bn: string) => (lang === "bn" ? bn : en);

  const T = (b?: BiText) => (b ? L(b.en, b.bn) : "–");

  return <LangContext.Provider value={{ lang, setLang, L, T }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside LangProvider");
  return ctx;
}

/** A bilingual pair; use with L(...pair) */
export type BiText = { en: string; bn: string };
