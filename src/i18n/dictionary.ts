// Pure localisation helpers — no React, so server components (the public
// tracking page) can call translate() directly. The React bindings live in
// src/i18n/index.tsx.

import ar from '../../public/locales/ar.json';

export type Locale = 'en' | 'ar';

export const LOCALES: Locale[] = ['en', 'ar'];
export const ARABIC_DICTIONARY = ar as Record<string, unknown>;
export const ARABIC_META = (ar as { _meta?: Record<string, string> })._meta ?? {};

/** Route prefixes that stay English no matter what (spec §14: console stays English). */
export const ENGLISH_ONLY_PREFIXES = ['/console', '/dev'];

export function localeFromPath(pathname: string | null | undefined): Locale {
  if (!pathname) return 'en';
  return pathname === '/ar' || pathname.startsWith('/ar/') ? 'ar' : 'en';
}

/** Strip a leading /ar so the rest of the app can work with English route paths. */
export function stripLocale(pathname: string): string {
  if (pathname === '/ar') return '/';
  return pathname.startsWith('/ar/') ? pathname.slice(3) : pathname;
}

/** Add the locale prefix to a route path (console and dev tools stay English). */
export function localisePath(locale: Locale, path: string): string {
  if (!path.startsWith('/')) return path;
  if (locale === 'en') return stripLocale(path);
  if (ENGLISH_ONLY_PREFIXES.some(prefix => path.startsWith(prefix))) return path;
  const raw = stripLocale(path);
  return raw === '/' ? '/ar' : `/ar${raw}`;
}

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, dictionary);
}

export type Vars = Record<string, string | number>;

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}

/** Pure lookup: Arabic when locale is ar and the key exists, English otherwise. */
export function translate(locale: Locale, key: string, fallback: string, vars?: Vars): string {
  if (locale === 'en') return interpolate(fallback, vars);
  const value = lookup(ARABIC_DICTIONARY, key);
  if (typeof value !== 'string' || value.length === 0) return interpolate(fallback, vars);
  return interpolate(value, vars);
}

/** True when the screen should render right-to-left. */
export function isRtl(locale: Locale): boolean {
  return locale === 'ar';
}
