// Locale routing for the prototype (spec §14).
//
// Next 16 renamed `middleware.ts` to `proxy.ts` — this is the same hook. It
// rewrites the Arabic URLs onto the English routes (/ar/app/alerts → /app/alerts)
// so no screen has to be duplicated, and tags the request with
// `x-kasper-locale: ar` so the root layout can render `lang="ar" dir="rtl"` on
// the server (no flash of English, no hydration mismatch).
//
// The Language toggle also writes a `kasper_lang` cookie. Unprefixed customer
// routes honour that cookie so the public tracking page can flip to Arabic
// without a /ar prefix. The Kasper console and the developer tools stay
// English: /ar/console/*, /ar/dev/* and /en/* get redirected to their plain
// English URL, and a kasper_lang=ar cookie is ignored on those prefixes.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  ENGLISH_ONLY_PREFIXES,
  LANG_COOKIE,
  isEnglishOnlyPath,
  resolveLocale,
} from './src/i18n/locale';

export const LOCALE_HEADER = 'x-kasper-locale';

function cookieOptions() {
  return { path: '/', sameSite: 'lax' as const, maxAge: 31536000 };
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // /en/... is a convenience alias for the English route.
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    const rest = pathname.slice(3) || '/';
    const response = NextResponse.redirect(new URL(`${rest}${search}`, request.url));
    response.cookies.set(LANG_COOKIE, 'en', cookieOptions());
    return response;
  }

  const isArUrl = pathname === '/ar' || pathname.startsWith('/ar/');
  const rest = isArUrl ? pathname.slice(3) || '/' : pathname;

  // Console and developer tools have no Arabic copy.
  if (isArUrl && isEnglishOnlyPath(rest)) {
    return NextResponse.redirect(new URL(`${rest}${search}`, request.url));
  }

  const cookie = request.cookies.get(LANG_COOKIE)?.value;
  const locale = resolveLocale({
    pathname,
    cookie: cookie ? `${LANG_COOKIE}=${cookie}` : undefined,
  });

  if (isArUrl) {
    const url = request.nextUrl.clone();
    url.pathname = rest;

    const headers = new Headers(request.headers);
    headers.set(LOCALE_HEADER, 'ar');

    const response = NextResponse.rewrite(url, { request: { headers } });
    response.headers.set(LOCALE_HEADER, 'ar');
    response.cookies.set(LANG_COOKIE, 'ar', cookieOptions());
    return response;
  }

  if (locale === 'ar') {
    const headers = new Headers(request.headers);
    headers.set(LOCALE_HEADER, 'ar');
    const response = NextResponse.next({ request: { headers } });
    response.headers.set(LOCALE_HEADER, 'ar');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/ar',
    '/ar/:path*',
    '/en',
    '/en/:path*',
    '/((?!_next/static|_next/image|favicon.ico|locales/).*)',
  ],
};

// Re-export so tests can pin the prefixes the proxy uses.
export const ENGLISH_ONLY = ENGLISH_ONLY_PREFIXES;
