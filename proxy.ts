// Locale routing for the prototype (spec §14).
//
// Next 16 renamed `middleware.ts` to `proxy.ts` — this is the same hook. It
// rewrites the Arabic URLs onto the English routes (/ar/app/alerts → /app/alerts)
// so no screen has to be duplicated, and tags the request with
// `x-kasper-locale: ar` so the root layout can render `lang="ar" dir="rtl"` on
// the server (no flash of English, no hydration mismatch).
//
// The Kasper console and the developer tools stay English: /ar/console/*,
// /ar/dev/* and /en/* get redirected to their plain English URL.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const LOCALE_HEADER = 'x-kasper-locale';

const ENGLISH_ONLY = ['/console', '/dev'];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // /en/... is a convenience alias for the English route.
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    const rest = pathname.slice(3) || '/';
    return NextResponse.redirect(new URL(`${rest}${search}`, request.url));
  }

  if (pathname !== '/ar' && !pathname.startsWith('/ar/')) {
    return NextResponse.next();
  }

  const rest = pathname.slice(3) || '/';

  // Console and developer tools have no Arabic copy.
  if (ENGLISH_ONLY.some(prefix => rest === prefix || rest.startsWith(`${prefix}/`))) {
    return NextResponse.redirect(new URL(`${rest}${search}`, request.url));
  }

  const url = request.nextUrl.clone();
  url.pathname = rest;

  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, 'ar');

  const response = NextResponse.rewrite(url, { request: { headers } });
  response.headers.set(LOCALE_HEADER, 'ar');
  // Expose the choice to the client (language menu, tests, debugging).
  response.cookies.set('kasper_locale', 'ar', { path: '/', sameSite: 'lax' });
  return response;
}

export const config = {
  matcher: ['/ar', '/ar/:path*', '/en', '/en/:path*'],
};
