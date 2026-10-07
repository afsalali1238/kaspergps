// Arabic catalogue checks — spec 16. The catalogue is a draft, but it must at
// least stay complete enough that every key the wired screens ask for resolves,
// and it must never drift into Arabic-Indic digits (codes, times and money stay
// Latin).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import ar from '../../public/locales/ar.json';
import { arabicLeafCount, hasArabic, translate } from '@/lib/i18n';

const ROOT = path.resolve(__dirname, '../..');

/** Screens that are actually localised today. */
const WIRED_SOURCES = [
  'src/components/layout/AppShell.tsx',
  'app/sign-in/page.tsx',
  'app/t/[token]/page.tsx',
  'app/app/page.tsx',
  'app/app/billing/page.tsx',
  'app/app/downloads/page.tsx',
  'app/app/schedules/page.tsx',
  'app/app/reports/page.tsx',
];

function walk(node: unknown, pathSoFar: string[] = []): { path: string; value: string }[] {
  if (typeof node === 'string') return [{ path: pathSoFar.join('.'), value: node }];
  if (typeof node !== 'object' || node === null) return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    walk(value, [...pathSoFar, key]),
  );
}

const leaves = walk(ar);

describe('catalogue shape', () => {
  it('is marked as a draft pending native review', () => {
    expect(ar._meta.status).toBe('Draft — needs native review');
    expect(ar._meta.direction).toBe('rtl');
  });

  it('has no empty strings', () => {
    expect(leaves.filter(l => l.value.trim() === '')).toEqual([]);
  });

  it('uses Latin digits only — never Arabic-Indic numerals', () => {
    const arabicIndic = /[\u0660-\u0669\u06F0-\u06F9]/;
    const offenders = leaves.filter(l => arabicIndic.test(l.value));
    expect(offenders).toEqual([]);
  });

  it('keeps the leaf count stable enough to notice an accidental truncation', () => {
    expect(arabicLeafCount()).toBeGreaterThan(300);
  });
});

describe('keys the wired screens ask for', () => {
  it('every literal key passed to t() exists in the catalogue', () => {
    const missing: string[] = [];
    for (const file of WIRED_SOURCES) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) {
        if (!hasArabic(match[1])) missing.push(`${file}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('covers the map KPI strip and filter row (template keys)', () => {
    for (const key of [
      'map.kpi.live',
      'map.kpi.idle',
      'map.kpi.stale',
      'map.kpi.offline',
      'map.kpi.unknown',
      'map.kpi.noTracker',
      'map.assetCount',
      'map.filters.site',
      'map.filters.type',
      'map.filters.show',
      'map.filters.owned',
      'map.filters.rented',
      'map.filters.clearSearch',
      'map.filters.clearFilters',
      'map.filters.searchPlaceholder',
      'map.emptyTitle',
      'map.emptyDescription',
      'map.rentedBadge',
      'common.all',
      'common.demo',
    ]) {
      expect(hasArabic(key), key).toBe(true);
    }
  });

  it('covers the reports, downloads and schedules screens', () => {
    for (const key of [
      'billing.title',
      'billing.columns.issuer',
      'billing.statuses.partPaid',
      'billing.recordPayment',
      'downloads.title',
      'downloads.downloadAgain',
      'downloads.noAccess',
      'downloads.bySchedule',
      'downloads.byYou',
      'downloads.skipped',
      'downloads.outbox',
      'schedules.title',
      'schedules.frequency.daily',
      'schedules.weekday.mon',
      'schedules.pausedAfterSkips',
      'schedules.resume',
      'reports.run',
      'reports.scheduleThis',
      'reports.types.locationHistory',
      'reports.types.drivingEvents',
    ]) {
      expect(hasArabic(key), key).toBe(true);
    }
  });

  it('covers every nav label and every link-end reason', () => {
    for (const key of [
      'nav.map',
      'nav.alerts',
      'nav.reports',
      'nav.downloads',
      'nav.geofences',
      'nav.certificates',
      'nav.billing',
      'nav.maintenance',
      'nav.costAndRoi',
      'nav.settings',
      'nav.signOut',
      'publicTracking.inactiveExpired',
      'publicTracking.inactiveRevoked',
      'publicTracking.inactiveCancelled',
      'publicTracking.inactiveJobClosed',
      'publicTracking.inactiveAccessEnded',
      'publicTracking.inactiveNotFound',
    ]) {
      expect(hasArabic(key), key).toBe(true);
    }
  });
});

describe('lookup behaviour', () => {
  it('returns the English fallback in English', () => {
    expect(translate('en', 'nav.map', 'Map')).toBe('Map');
  });

  it('returns Arabic in Arabic and interpolates Latin digits', () => {
    expect(translate('ar', 'nav.map', 'Map')).not.toBe('Map');
    expect(
      translate('ar', 'publicTracking.arrivingAbout', 'Arriving about 10:19 (in 19 min)', {
        time: '10:19',
        minutes: 19,
      }),
    ).toContain('10:19');
    const arabicLine = translate('ar', 'publicTracking.arrivingAbout', 'x', { time: '10:19', minutes: 19 });
    expect(/[\u0660-\u0669]/.test(arabicLine)).toBe(false);
  });

  it('falls back to English when a key is missing, rather than blank UI', () => {
    expect(translate('ar', 'not.a.real.key', 'Map')).toBe('Map');
  });

  it('leaves unknown placeholders alone', () => {
    expect(translate('ar', 'publicTracking.updated', 'Updated 10:00', {})).toContain('{time}');
  });
});
