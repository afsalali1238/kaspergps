'use client';

// The one place a screen asks for its language.
//
//   const { t, dir, language, setLanguage } = useT();
//   t('nav.map', 'Map')
//
// The value is provided by <LanguageProvider> from the cookie that the server
// already read (app/layout.tsx), so the server HTML and the first client render
// agree — no hydration mismatch, and Arabic is correct from the first paint.
//
// The Kasper console must not use this: it stays English and LTR (spec 16).

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { translate, hasArabic, type TFunction } from '@/lib/i18n';
import { dirOf, setLanguageCookie, type Language } from '@/lib/language';

export interface UseT {
  language: Language;
  dir: 'rtl' | 'ltr';
  /** Arabic copy exists for this key (the language menu can warn when it does not). */
  covered: (key: string) => boolean;
  t: TFunction;
  setLanguage: (language: Language) => void;
}

const LanguageContext = createContext<UseT>({
  language: 'en',
  dir: 'ltr',
  covered: hasArabic,
  t: (key, fallback) => fallback,
  setLanguage: () => {},
});

export function LanguageProvider({
  initial,
  children,
}: {
  initial: Language;
  children: React.ReactNode;
}) {
  const [language, setLanguage] = useState<Language>(initial);

  const change = useCallback((next: Language) => {
    setLanguageCookie(next); // the public page is server-rendered from this cookie
    setLanguage(next);
  }, []);

  const value = useMemo<UseT>(() => {
    const t: TFunction = (key, fallback, vars) => translate(language, key, fallback, vars);
    return {
      language,
      dir: dirOf(language),
      covered: hasArabic,
      t,
      setLanguage: change,
    };
  }, [language, change]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT(): UseT {
  return useContext(LanguageContext);
}
