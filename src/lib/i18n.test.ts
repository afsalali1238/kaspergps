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
  'app/app/alerts/page.tsx',
  'app/app/certificates/page.tsx',
  'app/app/settings/page.tsx',
  'app/app/assets/[id]/page.tsx',
  'app/app/geofences/page.tsx',
  'app/app/maintenance/page.tsx',
  'app/app/cost/page.tsx',
  'src/components/playback/Player.tsx',
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
      'alerts.openCount',
      'alerts.words.faultCode',
      'alerts.maintenanceDue',
      'alerts.filters.all',
      'certificates.tableTitle',
      'certificates.sealIntact',
      'certificates.aboutBody',
      'common.cancel',
      'settings.subtitle',
      'settings.users.sendInvite',
      'settings.sites.mapHint',
      'settings.assets.classes.lightVehicle',
      'settings.assets.newAssetNote',
      'settings.users.needsAdmin',
      'asset.notFound',
      'asset.rented',
      'asset.trips.count',
      'asset.table.maxSpeed',
      'asset.playback.playPeriod',
      'asset.kasperView',
      'common.last24h',
      'common.last30d',
      'reports.title',
      'reports.subtitle',
      'reports.scopeMultiple',
      'reports.selectAssets',
      'reports.formatExcel',
      'reports.phases.dayOne',
      'reports.types.fuelDescription',
      'geofences.title',
      'geofences.kinds.restricted',
      'geofences.circleShape',
      'geofences.events7d',
      'geofences.emptyDescription',
      'maintenance.subtitle',
      'cost.subtitle',
      'playback.title',
      'playback.tripOf',
      'playback.events',
      'playback.states.moving',
      'playback.reducedMotion',
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

  it('never shows a raw placeholder — it falls back to English instead', () => {
    // asset.rental.until is "حتى {time}" in Arabic; a screen that forgets to
    // pass the time must not print the braces.
    expect(translate('ar', 'asset.rental.until', 'until 11 Oct 18:00')).toBe('until 11 Oct 18:00');
    expect(translate('ar', 'asset.rental.until', 'until 11 Oct 18:00', { time: '11 Oct 18:00' }))
      .toBe('حتى 11 Oct 18:00');
  });

  it('never invents a value for a placeholder the caller did not pass', () => {
    // Arabic has "{time}" here; with no value the English sentence is shown
    // rather than a sentence with braces in it.
    const out = translate('ar', 'publicTracking.updated', 'Updated 10:00', {});
    expect(out).toBe('Updated 10:00');
    expect(out).not.toContain('{');
  });

  it('keeps the values the screens inject (a translated sentence without the placeholder loses data)', () => {
    // Every key here is passed vars by a wired screen. If the Arabic template
    // forgets one, the customer sees a sentence with the number missing.
    const cases: { key: string; vars: Record<string, string> }[] = [
      { key: 'asset.lastUpdated', vars: { time: '14:32' } },
      { key: 'asset.minutesAgo', vars: { count: '4' } },
      { key: 'asset.offlineSince', vars: { time: '14:32' } },
      { key: 'asset.rental.rentedTo', vars: { name: 'Marina Builders' } },
      { key: 'asset.rental.until', vars: { time: '12 Oct 18:00' } },
      { key: 'asset.rental.from', vars: { time: '7 Oct 08:00' } },
      { key: 'asset.rental.historyStarts', vars: { time: '7 Oct 08:00' } },
      { key: 'asset.rental.historyNotice', vars: { time: '7 Oct 08:00' } },
      { key: 'asset.trackingLinks.expires', vars: { time: '7 Oct 23:59' } },
      { key: 'asset.kasperView', vars: { owner: 'Al Noor', renter: 'Marina' } },
      { key: 'asset.trips.count', vars: { count: '2' } },
      { key: 'alerts.openCount', vars: { count: '4' } },
      { key: 'alerts.since', vars: { time: '14:32', site: 'Al Quoz Yard' } },
      { key: 'alerts.acknowledgedBy', vars: { name: 'Omar', time: '09:00' } },
      { key: 'downloads.generatedAt', vars: { time: '6 Oct 07:00' } },
      { key: 'downloads.size', vars: { size: '40' } },
      { key: 'schedules.atHour', vars: { hour: '07' } },
      { key: 'schedules.nextRun', vars: { time: '7 Oct 07:00' } },
      { key: 'schedules.lastRun', vars: { time: '6 Oct 07:00' } },
      { key: 'schedules.deliverTo', vars: { email: 'lina@marina.ae' } },
      { key: 'schedules.pausedAfterSkips', vars: { count: '2' } },
      { key: 'schedules.firstRun', vars: { time: '7 Oct 07:00' } },
      { key: 'reports.fromTo', vars: { from: '1 Oct', to: '6 Oct' } },
      { key: 'reports.assetCount', vars: { count: '2' } },
      { key: 'certificates.lastMonth', vars: { month: 'Sep 2026' } },
      { key: 'publicTracking.arrivingAbout', vars: { time: '10:19', minutes: '19' } },
      { key: 'publicTracking.arrived', vars: { time: '14:50' } },
      { key: 'publicTracking.updated', vars: { time: '14:32' } },
      { key: 'publicTracking.linkCreated', vars: { date: '6 Oct 2026', time: '08:00' } },
      { key: 'publicTracking.expires', vars: { date: '7 Oct 2026', time: '00:00' } },
      { key: 'asset.noTracker.requestedOn', vars: { date: '6 Oct 2026' } },
      { key: 'map.assetCount', vars: { count: '12' } },
      { key: 'certificates.dataGaps', vars: { count: '2' } },
      { key: 'certificates.voidTitle', vars: { number: 'MUC-2026-0001' } },
      { key: 'certificates.reissueTitle', vars: { number: 'MUC-2026-0001' } },
      { key: 'certificates.bookingOption', vars: { ref: 'BK-1011', from: '1 Oct', to: '5 Oct' } },
      { key: 'playback.noData', vars: { from: '13:05', to: '15:40' } },
      { key: 'playback.title', vars: { code: 'EX-04' } },
      { key: 'playback.tripTitle', vars: { code: 'EX-04' } },
      { key: 'playback.tripOf', vars: { index: '2', total: '5' } },
      { key: 'playback.tripStarts', vars: { time: '11:01' } },
      { key: 'playback.periodStartsInYourRental', vars: { time: '7 Oct 08:00' } },
    ];

    const missing = cases
      .filter(c => {
        const text = translate('ar', c.key, 'FALLBACK', c.vars);
        return Object.values(c.vars).some(value => !text.includes(value));
      })
      .map(c => c.key);

    expect(missing).toEqual([]);
  });
});
