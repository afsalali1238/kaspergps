// Locale routing and cookie helpers — no dictionary, so proxy.ts can import
// this without pulling ar.json into the edge bundle.

export type Locale = 'en' | 'ar';

export const LOCALES: Locale[] = ['en', 'ar'];

/** Cookie written by the language toggle and by /ar/... visits. */
export const LANG_COOKIE = 'kasper_lang';

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

export function isEnglishOnlyPath(pathname: string | null | undefined): boolean {
  const stripped = stripLocale(pathname ?? '');
  return ENGLISH_ONLY_PREFIXES.some(
    prefix => stripped === prefix || stripped.startsWith(`${prefix}/`)
  );
}

/** Read kasper_lang from a Cookie header or document.cookie. `null` means unset. */
export function localeFromCookie(cookie: string | null | undefined): Locale | null {
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (name === LANG_COOKIE) return value === 'ar' ? 'ar' : 'en';
  }
  return null;
}

/** Cookie string the toggle writes. */
export function localeCookie(locale: Locale): string {
  return `${LANG_COOKIE}=${locale}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

/**
 * Decide the locale for a request.
 *
 * Priority: console/dev stay English; then the /ar URL prefix (shareable
 * links); then the x-kasper-locale header the proxy sets; then the
 * kasper_lang cookie the toggle writes.
 */
export function resolveLocale(input: {
  pathname?: string | null;
  cookie?: string | null;
  header?: string | null;
}): Locale {
  if (isEnglishOnlyPath(input.pathname)) return 'en';
  if (localeFromPath(input.pathname) === 'ar') return 'ar';
  if (input.header === 'ar') return 'ar';
  if (localeFromCookie(input.cookie) === 'ar') return 'ar';
  return 'en';
}

/** True when the screen should render right-to-left. */
export function isRtl(locale: Locale): boolean {
  return locale === 'ar';
}
