'use client';

// Customer-facing localisation (spec §14).
//
// English strings stay in the components and are passed to t() as the fallback,
// so an English render is byte-identical to before this layer existed. Arabic
// comes from public/locales/ar.json — a first draft that is marked
// "Draft — needs native review" in its _meta block.
//
// The locale is decided by:
//   1. the URL prefix (/ar/...) — shareable Arabic links, first paint via proxy;
//   2. the kasper_lang cookie the Language toggle writes;
//   3. English otherwise.
// Console and /dev stay English even when the cookie is Arabic. The root layout
// reads the proxy header so RTL starts on the first paint; LocaleProvider
// remounts children when the locale changes so every string re-translates.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  isEnglishOnlyPath,
  localeCookie,
  localisePath,
  resolveLocale,
  translate,
  type Locale,
  type Vars,
} from './dictionary';

export {
  ARABIC_DICTIONARY,
  ARABIC_META,
  LANG_COOKIE,
  localeFromPath,
  localeFromCookie,
  localeCookie,
  localisePath,
  stripLocale,
  resolveLocale,
  translate,
  isRtl,
  isEnglishOnlyPath,
  LOCALES,
  type Locale,
  type Vars,
} from './dictionary';

const LocaleContext = createContext<Locale>('en');
const SetLocaleContext = createContext<(next: Locale) => void>(() => {});

function applyDocumentLocale(locale: Locale) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = locale;
  root.dir = locale === 'ar' ? 'rtl' : 'ltr';
}

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const [current, setCurrent] = useState<Locale>(locale);
  const pathname = usePathname();

  // The server knows the locale from the proxy header / cookie; the client
  // re-checks the URL and cookie so client-side navigation can't drift.
  useEffect(() => {
    // Outside the Next router (tests, storybook) pathname is null: keep whatever
    // the server handed us instead of silently falling back to English.
    if (!pathname) return;
    const next = resolveLocale({
      pathname,
      cookie: typeof document !== 'undefined' ? document.cookie : undefined,
    });
    setCurrent(prev => (prev === next ? prev : next));
  }, [pathname]);

  useEffect(() => {
    applyDocumentLocale(current);
  }, [current]);

  const setLocale = useCallback(
    (next: Locale) => {
      if (typeof document !== 'undefined') {
        document.cookie = localeCookie(next);
      }
      // The user asked for `next`. Console/dev are the only override — an
      // /ar URL must not pin the locale after they click EN (the toggle also
      // navigates off /ar, but the flip has to be visible before that lands).
      const forced: Locale = isEnglishOnlyPath(pathname) ? 'en' : next;
      setCurrent(forced);
      applyDocumentLocale(forced);
    },
    [pathname]
  );

  return (
    <LocaleContext.Provider value={current}>
      <SetLocaleContext.Provider value={setLocale}>
        {/* Remount on locale change so strings captured in state/memos re-translate. */}
        <React.Fragment key={current}>{children}</React.Fragment>
      </SetLocaleContext.Provider>
    </LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT() {
  const locale = useLocale();
  return useCallback(
    (key: string, fallback: string, vars?: Vars) => translate(locale, key, fallback, vars),
    [locale]
  );
}

/** Locale-aware href helper: /app/alerts becomes /ar/app/alerts in Arabic. */
export function useHref() {
  const locale = useLocale();
  return useCallback((path: string) => localisePath(locale, path), [locale]);
}

/** The other language, for the user menu's Language item and the demo-bar toggle. */
export function useLocaleSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const setLocale = useContext(SetLocaleContext);
  const other: Locale = locale === 'ar' ? 'en' : 'ar';
  const href = localisePath(other, pathname ?? '/app');

  const switchLocale = useCallback(() => {
    setLocale(other);
  }, [other, setLocale]);

  return useMemo(
    () => ({ locale, other, href, switchLocale }),
    [locale, other, href, switchLocale]
  );
}
