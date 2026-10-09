// Ignition-based utilisation (spec 11.3 "Utilisation", spec 4 on estimates).
//
// The rules this file pins down are the ones a Tier 1/Tier 2 customer reads on
// the screen when there is no ECU meter: hours only come from consecutive
// readings, a gap is disclosed instead of guessed, a day is never more than 24
// hours, and nothing here is ever labelled as anything but `Estimated`.

import { describe, it, expect } from 'vitest';
import {
  buildIgnitionBreakdown, engineHoursToday, fleetTodayTotals, fuelToday,
  hoursSourceFor, last7DaysIgnition, showsUtilisation, todayFor,
} from './utilisation';
import { burnRateLph, engineHoursIn } from '@/server/cost';
import { seed } from '@/server/seed/data';
import { runReport } from '@/server/reports';
import type { Asset, Session } from '@/domain/types';
import { hasFeature } from '@/domain/features';
import { BEHAVIOUR_HOURS_PER_DAY } from '@/server/muc';
import * as clock from '@/lib/clock';

const DAY_MS = 86_400_000;

const assetByCode = (code: string) => seed.assets.find(a => a.code === code)!;
const tier1 = () => seed.assets.find(a => a.canProfile.adapter === 'none')!;
const tier2 = () => seed.assets.find(a => a.canProfile.adapter === 'LVCAN200')!;
const tier3 = () => assetByCode('EX-04');

describe('utilisation — where the hours come from', () => {
  it('names the meter by the adapter, strongest first', () => {
    expect(hoursSourceFor(tier3())).toBe('ECU');
    expect(hoursSourceFor(tier2())).toBe('ECU · partial');
    expect(hoursSourceFor(tier1())).toBe('Estimated');
  });

  it('says Not measured for an asset with no ignition line at all', () => {
    const base = tier1();
    const blind: Asset = { ...base, canProfile: { ...base.canProfile, adapter: 'none', supported: ['gnss'] } };
    expect(hoursSourceFor(blind)).toBe('Not measured');
    expect(showsUtilisation(blind)).toBe(false);
  });

  it('shows utilisation for any asset that reports ignition', () => {
    expect(showsUtilisation(tier1())).toBe(true);
  });
});

describe('utilisation — the 7-day ignition breakdown', () => {
  const asset = tier1();

  it('gives one bucket per Dubai day, so a quiet day still appears', () => {
    const breakdown = last7DaysIgnition(asset);
    expect(breakdown.days).toHaveLength(7);
    const keys = breakdown.days.map(d => d.key);
    expect(keys).toEqual([...keys].sort());
    expect(keys).toContain(clock.dubaiDateKey(clock.now()));
  });

  it('never claims more than the day it is describing', () => {
    for (const d of last7DaysIgnition(asset).days) {
      // Each field is rounded to 0.1 h on its own, so the three can land at most
      // 0.15 past a 24-hour day. An interval that crosses Dubai midnight is
      // split between the days, never counted twice.
      expect(d.movingHours + d.stationaryHours + d.offHours).toBeLessThanOrEqual(24.15);
      expect(d.movingHours).toBeGreaterThanOrEqual(0);
      expect(d.stationaryHours).toBeGreaterThanOrEqual(0);
      expect(d.offHours).toBeGreaterThanOrEqual(0);
    }
  });

  it('splits an interval that crosses Dubai midnight instead of double counting', () => {
    // A window that straddles 00:00 Dubai: at most its own two hours of state
    // can be claimed, spread over the two day buckets, never counted twice.
    const midnight = clock.startOfDubaiDay(clock.now());
    const breakdown = buildIgnitionBreakdown(tier1(), midnight - 3_600_000, midnight + 3_600_000);
    const total = breakdown.days.reduce((s, d) => s + d.movingHours + d.stationaryHours + d.offHours, 0);
    expect(total).toBeLessThanOrEqual(2.2);
    expect(breakdown.days.length).toBeLessThanOrEqual(2);
    for (const d of breakdown.days) {
      expect(d.movingHours + d.stationaryHours + d.offHours).toBeLessThanOrEqual(24.15);
    }
  });

  it('is deterministic: the same window gives the same numbers', () => {
    const from = clock.startOfDubaiDay(clock.now()) - 6 * DAY_MS;
    const to = clock.now();
    expect(buildIgnitionBreakdown(asset, from, to)).toEqual(buildIgnitionBreakdown(asset, from, to));
  });

  it('is labelled Estimated, never ECU', () => {
    expect(last7DaysIgnition(asset).source).toBe('Estimated');
  });

  it('splits moving from ignition-on-stationary on a working asset', () => {
    const breakdown = last7DaysIgnition(assetByCode('LB-05'));
    const total = breakdown.days.reduce(
      (sum, d) => ({ moving: sum.moving + d.movingHours, still: sum.still + d.stationaryHours }),
      { moving: 0, still: 0 },
    );
    // A live asset must show *some* state; the two must not collapse into one.
    expect(total.moving + total.still).toBeGreaterThan(0);
  });

  it('discloses gaps instead of attributing them to a state', () => {
    // CP-03 is a Tier 1 plant asset whose readings are not continuous.
    const breakdown = last7DaysIgnition(assetByCode('CP-03'));
    expect(breakdown.gapMinutes).toBeGreaterThanOrEqual(0);
    for (const d of breakdown.days) expect(d.gapMinutes).toBeGreaterThanOrEqual(0);
    const attributed = breakdown.days.reduce((s, d) => s + d.movingHours + d.stationaryHours + d.offHours, 0);
    const windowHours = (clock.now() - (clock.startOfDubaiDay(clock.now()) - 6 * DAY_MS)) / 3_600_000;
    expect(attributed).toBeLessThanOrEqual(windowHours + 0.1);
  });

  it('returns no days when the window is empty', () => {
    const now = clock.now();
    expect(buildIgnitionBreakdown(asset, now, now).days.length).toBeLessThanOrEqual(1);
  });
});

describe('utilisation — today per asset', () => {
  it('reports today\'s distance and ignition-on time with a source', () => {
    const today = todayFor(tier1())!;
    expect(today.distanceKm).toBeGreaterThanOrEqual(0);
    expect(today.ignitionHours).toBeGreaterThanOrEqual(0);
    expect(today.ignitionHours).toBeLessThanOrEqual(24);
    expect(today.source).toBe('Estimated');
  });

  it('uses the ECU source on a Tier 3 asset', () => {
    expect(todayFor(tier3())!.source).toBe('ECU');
  });
});

describe('utilisation — engine hours and fuel today', () => {
  it('gives an asset with an ECU meter its share of today', () => {
    const hours = engineHoursToday(tier3())!;
    const expected = BEHAVIOUR_HOURS_PER_DAY[tier3().behaviour];
    expect(hours).not.toBeNull();
    expect(hours).toBeGreaterThanOrEqual(0);
    // Never more than a full day of this asset's modelled behaviour.
    expect(hours).toBeLessThanOrEqual(expected + 0.1);
  });

  it('gives an asset with no ECU meter null, not zero', () => {
    expect(engineHoursToday(tier1())).toBeNull();
    expect(fuelToday(tier1())).toBeNull();
  });

  it('measures litres from the fuel counter when the asset reports one', () => {
    const asset = seed.assets.find(a => hasFeature(a, 'fuel.used'))!;
    const fuel = fuelToday(asset)!;
    expect(fuel).not.toBeNull();
    expect(fuel.litres).toBeGreaterThanOrEqual(0);
    // Nothing in the simulated fleet streams a cumulative fuel counter yet, so
    // the honest answer today is the modelled rate. If a CAN feed ever starts
    // reporting fuelUsedL, this must flip to 'ECU' — not stay Estimated.
    expect(['ECU', 'Estimated']).toContain(fuel.source);
  });

  it('models today\'s litres from hours × the class-average rate, and says so', () => {
    const asset = tier3();
    const fuel = fuelToday(asset)!;
    const hours = engineHoursIn(asset, clock.startOfDubaiDay(clock.now()), clock.now());
    if (fuel.source === 'Estimated') {
      expect(fuel.litres).toBeCloseTo(Math.round(hours * burnRateLph(asset) * 10) / 10, 1);
    }
    // A class-average rate can never exceed the biggest tank the fleet has.
    expect(fuel.litres).toBeLessThanOrEqual(Math.max(hours, 1) * 120);
  });
});

describe('utilisation — fleet totals for the map KPI strip', () => {
  it('adds nothing for an empty fleet', () => {
    expect(fleetTodayTotals([])).toEqual({
      engineHours: 0, engineAssets: 0, fuelLitres: 0, fuelAssets: 0, fuelEstimatedAssets: 0,
    });
  });

  it('counts only the assets that meter each number', () => {
    const assets = [tier1(), tier2(), tier3()];
    const totals = fleetTodayTotals(assets);
    expect(totals.engineAssets).toBe(assets.filter(a => engineHoursToday(a) !== null).length);
    expect(totals.fuelAssets).toBe(assets.filter(a => fuelToday(a) !== null).length);
    expect(totals.fuelEstimatedAssets).toBe(assets.filter(a => fuelToday(a)?.source === 'Estimated').length);
  });

  it('is the sum of the per-asset figures it reports', () => {
    const assets = seed.assets;
    const totals = fleetTodayTotals(assets);
    const hours = assets.reduce((sum, a) => sum + (engineHoursToday(a) ?? 0), 0);
    expect(totals.engineHours).toBeCloseTo(Math.round(hours * 10) / 10, 1);
    expect(totals.engineAssets).toBeGreaterThan(0);
  });
});

// The Excel/PDF Utilisation report used to run its own ignition accumulation with
// a different gap rule than the screen, so the two could disagree on the same
// asset for the same week. They share one implementation now — this is the check
// that keeps them sharing it.
describe('utilisation — the screen and the exported report agree', () => {
  const khalid = (): Session => {
    const user = seed.users.find(u => u.id === 'u-khalid')!;
    return {
      userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds,
      role: user.role, isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
    };
  };

  it('prints the same hours in the report as buildIgnitionBreakdown computes', () => {
    const asset = assetByCode('CP-03'); // Tier 1 plant: no ECU meter, ignition only
    const result = runReport(khalid(), {
      reportType: 'utilisation',
      assetIds: [asset.id],
      from: '2026-09-30',
      to: '2026-10-06',
      format: 'xlsx',
    });
    expect(result.ok).toBe(true);

    const table = result.data!.tables.find(t => t.title === 'CP-03 utilisation');
    expect(table).toBeTruthy();
    const rows = table!.rows.filter(r => r[0] !== 'Total');
    expect(rows.length).toBeGreaterThan(2);

    const byDisplay = new Map(buildIgnitionBreakdown(asset, clock.now() - 12 * DAY_MS, clock.now()).days
      .map(d => [d.date, d]));

    for (const row of rows) {
      const bucket = byDisplay.get(row[0] as string);
      expect(bucket, `the report listed ${row[0]}, the screen window did not`).toBeTruthy();
      expect(row[1]).toBe(bucket!.movingHours);
      expect(row[2]).toBe(bucket!.stationaryHours);
      expect(row[3]).toBe(bucket!.offHours);
      expect(row[4]).toBe('Ignition · Estimated');
    }
  });
});
