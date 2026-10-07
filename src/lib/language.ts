// Language plumbing for the prototype — deliberately tiny and dependency-free
// (the store and the server-rendered public page both need it).
//
// Scope (spec 16): only the customer screens (/sign-in, /app/*) and the public
// tracking page (/t/[token]) are mirrored. The Kasper console stays English and
// left-to-right. Codes, plate numbers, times, distances and money always use
// Latin digits.

export type Language = 'en' | 'ar';

export const LANGUAGE_COOKIE = 'kasper_lang';
export const LANGUAGE_MAX_AGE = 60 * 60 * 24 * 365; // one year

export const LANGUAGES: { id: Language; label: string; short: string }[] = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'ar', label: 'العربية', short: 'عربي' },
];

export function languageFromCookie(value: string | null | undefined): Language {
  return value === 'ar' ? 'ar' : 'en';
}

/** Client-only: the language the visitor last chose. */
export function readLanguageCookie(): Language {
  if (typeof document === 'undefined') return 'en';
  const match = document.cookie.split('; ').find(c => c.startsWith(`${LANGUAGE_COOKIE}=`));
  return languageFromCookie(match?.slice(LANGUAGE_COOKIE.length + 1));
}

/** The public page is server-rendered, so the choice also lives in a cookie. */
export function setLanguageCookie(language: Language): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${LANGUAGE_COOKIE}=${language}; path=/; max-age=${LANGUAGE_MAX_AGE}; samesite=lax`;
}

export function dirOf(language: Language): 'rtl' | 'ltr' {
  return language === 'ar' ? 'rtl' : 'ltr';
}
