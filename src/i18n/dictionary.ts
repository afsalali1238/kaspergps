// Pure localisation helpers — no React, so server components (the public
// tracking page) can call translate() directly. The React bindings live in
// src/i18n/index.tsx.

import ar from '../../public/locales/ar.json';
import { type Locale } from './locale';

export {
  LANG_COOKIE,
  LOCALES,
  ENGLISH_ONLY_PREFIXES,
  localeFromPath,
  localeFromCookie,
  localeCookie,
  localisePath,
  stripLocale,
  resolveLocale,
  isEnglishOnlyPath,
  isRtl,
  type Locale,
} from './locale';

export const ARABIC_DICTIONARY = ar as Record<string, unknown>;
export const ARABIC_META = (ar as { _meta?: Record<string, string> })._meta ?? {};

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
