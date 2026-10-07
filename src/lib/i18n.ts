// Translation lookup for the prototype.
//
// English is written inline in the screens; Arabic lives in
// public/locales/ar.json (draft — needs native review before a customer sees it).
// `translate()` falls back to the English string whenever a key is missing, so a
// half-finished catalogue degrades to English rather than to blank UI.

import ar from '../../public/locales/ar.json';
import type { Language } from './language';

type Vars = Record<string, string | number>;

/** Dot-path lookup into the Arabic catalogue. */
function lookup(path: string): string | undefined {
  let node: unknown = ar;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Translate `key` into `language`, or return `fallback` (the English text).
 * Numbers and times are injected as-is, so they stay in Latin digits.
 */
export function translate(language: Language, key: string, fallback: string, vars?: Vars): string {
  const template = language === 'ar' ? lookup(key) : undefined;
  if (template === undefined) return fallback;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    vars[name] === undefined ? whole : String(vars[name]),
  );
}

export type TFunction = (key: string, fallback: string, vars?: Vars) => string;

/** True when Arabic actually has this key — used by the coverage test. */
export function hasArabic(key: string): boolean {
  return lookup(key) !== undefined;
}

export function arabicLeafCount(): number {
  const count = (node: unknown): number => {
    if (typeof node === 'string') return 1;
    if (typeof node !== 'object' || node === null) return 0;
    return Object.values(node as Record<string, unknown>).reduce<number>((n, v) => n + count(v), 0);
  };
  return count(ar);
}
