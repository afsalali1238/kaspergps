'use client';

// Customer-facing localisation (spec §14).
//
// English strings stay in the components and are passed to t() as the fallback,
// so an English render is byte-identical to before this layer existed. Arabic
// comes from public/locales/ar.json — a first draft that is marked
// "Draft — needs native review" in its _meta block.
//
// The locale is decided by the URL prefix (/ar/...), which proxy.ts rewrites to
// the underlying English route while tagging the request with
// x-kasper-locale. The root layout reads that header and hands the locale to
// LocaleProvider, so the first paint is already Arabic and RTL;
// usePathname() then keeps the provider honest on client-side navigation.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  localeFromPath,
  localisePath,
  translate,
  type Locale,
  type Vars,
} from './dictionary';

export {
  ARABIC_DICTIONARY,
  ARABIC_META,
  localeFromPath,
  localisePath,
  stripLocale,
  translate,
  isRtl,
  LOCALES,
  type Locale,
  type Vars,
} from './dictionary';

const LocaleContext = createContext<Locale>('en');

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const [current, setCurrent] = useState<Locale>(locale);
  const pathname = usePathname();

  // The server knows the locale from the proxy header; the client re-checks the
  // URL so client-side navigation between /app and /ar/app can't drift.
  useEffect(() => {
    // Outside the Next router (tests, storybook) pathname is null: keep whatever
    // the server handed us instead of silently falling back to English.
    if (!pathname) return;
    const fromPath = localeFromPath(pathname);
    setCurrent(prev => (prev === fromPath ? prev : fromPath));
  }, [pathname]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = current;
    root.dir = current === 'ar' ? 'rtl' : 'ltr';
  }, [current]);

  return <LocaleContext.Provider value={current}>{children}</LocaleContext.Provider>;
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

/** The other language, for the user menu's Language item. */
export function useLocaleSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const other: Locale = locale === 'ar' ? 'en' : 'ar';
  return useMemo(
    () => ({ locale, other, href: localisePath(other, pathname ?? '/app') }),
    [locale, other, pathname]
  );
}
