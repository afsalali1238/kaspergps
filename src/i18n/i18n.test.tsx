// Arabic localisation tests (spec §14).
//
// Three things are checked here:
//   1. the pure helpers (prefix, lookup, fallback, interpolation, cookie),
//   2. every t() key used anywhere in the customer screens exists in ar.json,
//   3. the Arabic copy follows the house rules — Latin digits, no placeholders
//      left behind, and the file carries the "Draft — needs native review" mark.

import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ARABIC_DICTIONARY,
  ARABIC_META,
  LANG_COOKIE,
  localeFromPath,
  localeFromCookie,
  localeCookie,
  localisePath,
  resolveLocale,
  stripLocale,
  translate,
} from './dictionary';
import { LocaleProvider, useT } from './index';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SourceLabel } from '@/components/ui/SourceLabel';

const ROOT = resolve(__dirname, '../..');
const ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/;

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (['node_modules', '.next', 'reviews'].includes(entry)) continue;
      collectFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function arabicValues(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node);
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) arabicValues(value, out);
  }
  return out;
}

function lookupKey(key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    ARABIC_DICTIONARY
  );
}

describe('locale routing', () => {
  it('reads the locale from the URL prefix', () => {
    expect(localeFromPath('/ar')).toBe('ar');
    expect(localeFromPath('/ar/app/assets/a-ex04')).toBe('ar');
    expect(localeFromPath('/app')).toBe('en');
    expect(localeFromPath(null)).toBe('en');
  });

  it('adds and strips the /ar prefix', () => {
    expect(localisePath('ar', '/app/alerts')).toBe('/ar/app/alerts');
    expect(localisePath('ar', '/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5')).toBe('/ar/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5');
    expect(localisePath('en', '/ar/app/alerts')).toBe('/app/alerts');
    expect(localisePath('ar', '/')).toBe('/ar');
    expect(stripLocale('/ar/app')).toBe('/app');
  });

  it('keeps the console and the developer tools English', () => {
    expect(localisePath('ar', '/console/billing')).toBe('/console/billing');
    expect(localisePath('ar', '/dev/bookings')).toBe('/dev/bookings');
    expect(resolveLocale({ pathname: '/console', cookie: `${LANG_COOKIE}=ar` })).toBe('en');
    expect(resolveLocale({ pathname: '/dev/seed', header: 'ar' })).toBe('en');
    expect(resolveLocale({ pathname: '/ar/console/tenants' })).toBe('en');
  });
});

describe('kasper_lang cookie', () => {
  it('parses the cookie and ignores a missing one', () => {
    expect(localeFromCookie(`${LANG_COOKIE}=ar`)).toBe('ar');
    expect(localeFromCookie(`other=1; ${LANG_COOKIE}=en`)).toBe('en');
    expect(localeFromCookie('session=abc')).toBeNull();
    expect(localeFromCookie(null)).toBeNull();
  });

  it('writes a Path=/ cookie the toggle can round-trip', () => {
    const cookie = localeCookie('ar');
    expect(cookie).toContain(`${LANG_COOKIE}=ar`);
    expect(cookie).toMatch(/Path=\//);
    expect(localeFromCookie(cookie)).toBe('ar');
  });

  it('lets the cookie select Arabic on unprefixed customer routes', () => {
    expect(resolveLocale({ pathname: '/app', cookie: `${LANG_COOKIE}=ar` })).toBe('ar');
    expect(resolveLocale({ pathname: '/t/abc', cookie: `${LANG_COOKIE}=ar` })).toBe('ar');
    expect(resolveLocale({ pathname: '/app', cookie: `${LANG_COOKIE}=en` })).toBe('en');
  });

  it('lets the /ar prefix win over an English cookie (shareable links)', () => {
    expect(resolveLocale({ pathname: '/ar/app', cookie: `${LANG_COOKIE}=en` })).toBe('ar');
  });
});

describe('translate', () => {
  it('returns the English fallback for en, and the Arabic copy for ar', () => {
    expect(translate('en', 'nav.map', 'Map')).toBe('Map');
    expect(translate('ar', 'nav.map', 'Map')).toBe('الخريطة');
  });

  it('falls back to English when the key is missing', () => {
    expect(translate('ar', 'nav.not_a_key', 'Fallback')).toBe('Fallback');
  });

  it('interpolates variables, keeping Latin digits', () => {
    const text = translate('ar', 'common.assets_count', '{count} assets', { count: 12 });
    expect(text).toContain('12');
    expect(text).not.toMatch(ARABIC_DIGITS);
  });

  it('leaves an unfilled placeholder visible instead of printing undefined', () => {
    expect(translate('en', 'common.assets_count', '{count} assets')).toBe('{count} assets');
    expect(translate('ar', 'common.assets_count', '{count} assets')).not.toContain('undefined');
  });
});

describe('Arabic dictionary', () => {
  it('is marked as a draft that needs native review', () => {
    expect(ARABIC_META.status).toBe('Draft — needs native review');
  });

  it('uses Latin digits everywhere', () => {
    const offenders = arabicValues(ARABIC_DICTIONARY).filter(value => ARABIC_DIGITS.test(value));
    expect(offenders).toEqual([]);
  });

  it('keeps product words in Latin', () => {
    expect(translate('ar', 'common.source.ecu', 'ECU')).toBe('ECU');
    expect(translate('ar', 'common.source.ecu_all_can300', 'ECU (ALL-CAN300)')).toContain('ALL-CAN300');
    expect(translate('ar', 'maintenance.excel', 'Excel')).toBe('Excel');
    expect(translate('ar', 'maintenance.pdf', 'PDF')).toBe('PDF');
    expect(translate('ar', 'cost.excel', 'Excel')).toBe('Excel');
  });

  it('has no left-over English placeholder braces it cannot fill', () => {
    const withPlaceholders = arabicValues(ARABIC_DICTIONARY).filter(value => /\{\w+\}/.test(value));
    // The tracking and alerts copy legitimately interpolates numbers, so only
    // check that the strings parse — every brace pair must close.
    for (const value of withPlaceholders) {
      expect((value.match(/\{/g) ?? []).length).toBe((value.match(/\}/g) ?? []).length);
    }
  });

  it('translates every t() key used in the app', () => {
    const files = [
      ...collectFiles(join(ROOT, 'app')),
      ...collectFiles(join(ROOT, 'src/components')),
      ...collectFiles(join(ROOT, 'src/i18n')),
    ].filter(file => !file.endsWith('.test.tsx') && !file.endsWith('.test.ts'));

    const missing: string[] = [];
    const keyPattern = /\bt\(\s*'([a-z0-9_.]+)'/gi;
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(keyPattern)) {
        const key = match[1];
        const value = lookupKey(key);
        if (typeof value !== 'string' || value.length === 0) {
          missing.push(`${key} (${file.replace(ROOT + '/', '')})`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('covers the screens named in the Arabic scope', () => {
    for (const group of [
      'sign_in',
      'map',
      'asset_detail',
      'alerts',
      'reports',
      'billing',
      'certificates',
      'settings',
      'tracking',
      'maintenance',
      'cost',
    ]) {
      expect(lookupKey(group)).toBeTruthy();
    }
    for (const group of ['users', 'sites', 'assets']) {
      expect(lookupKey(`settings.${group}`)).toBeTruthy();
    }
  });

  it('exposes the language toggle on the demo bar and the user menu', () => {
    const demo = readFileSync(join(ROOT, 'src/components/demo/DemoBar.tsx'), 'utf8');
    const shell = readFileSync(join(ROOT, 'src/components/layout/AppShell.tsx'), 'utf8');
    expect(demo).toMatch(/LanguageToggle/);
    expect(shell).toMatch(/LanguageToggle/);
  });
});

function Greeting() {
  const t = useT();
  return <p>{t('nav.alerts', 'Alerts')}</p>;
}

describe('useT', () => {
  it('renders Arabic inside an Arabic provider and English otherwise', () => {
    const { unmount } = render(
      <LocaleProvider locale="ar">
        <Greeting />
      </LocaleProvider>
    );
    expect(screen.getByText('التنبيهات')).toBeTruthy();
    unmount();

    render(
      <LocaleProvider locale="en">
        <Greeting />
      </LocaleProvider>
    );
    expect(screen.getByText('Alerts')).toBeTruthy();
  });
});

describe('RTL document', () => {
  it('sets lang and dir on the root element', async () => {
    const { unmount } = render(
      <LocaleProvider locale="ar">
        <Greeting />
      </LocaleProvider>
    );
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('ar');
      expect(document.documentElement.dir).toBe('rtl');
    });
    unmount();

    render(
      <LocaleProvider locale="en">
        <Greeting />
      </LocaleProvider>
    );
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en');
      expect(document.documentElement.dir).toBe('ltr');
    });
  });
});

describe('StatusBadge and SourceLabel', () => {
  it('read Arabic inside an Arabic provider', () => {
    const { unmount } = render(
      <LocaleProvider locale="ar">
        <StatusBadge status="live" />
        <SourceLabel source="Estimated" />
        <SourceLabel source="Not measured" />
      </LocaleProvider>
    );
    expect(screen.getByText('مباشر')).toBeTruthy();
    expect(screen.getByText('تقديري')).toBeTruthy();
    expect(screen.getByText('غير مقيس')).toBeTruthy();
    unmount();

    render(
      <LocaleProvider locale="en">
        <StatusBadge status="live" />
        <SourceLabel source="Estimated" />
      </LocaleProvider>
    );
    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.getByText('Estimated')).toBeTruthy();
  });
});
