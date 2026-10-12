// J2 proof: the simulated data is believable at the anchor (spec §8.2, §9).
// Statuses below are copied from the asset table in BUILD_PROMPT.md §8.2, not from the fixture.
import { describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { computeStatus, getReadingForAsset, getReadingsForAsset, isCanReadingAvailable } from '@/server/telemetry/simulator';
import { fuelStateAt, refuelTimesFor, GN01_DROP_AT } from '@/server/telemetry/fuel';
import { haversineKm } from '@/server/telemetry/movement';
import * as clock from '@/lib/clock';
import type { Asset, Reading } from '@/domain/types';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Hour of day in Dubai (UTC+4, no DST), independent of the process TZ. */
const dubaiHour = (ms: number) => ((ms + 4 * HOUR) % DAY) / HOUR;
const asset = (code: string): Asset => db.getState().assets.find(a => a.code === code)!;
const siteOf = (id: string) => db.getState().sites.find(s => s.id === id)!;

/** §8.2 status at the anchor, per asset. */
const SPEC_STATUS: Record<string, string> = {
  'FB-12': 'live', 'FB-14': 'live', 'LB-02': 'live', 'LB-05': 'idle', 'TP-21': 'live',
  'TP-22': 'live', 'TP-23': 'offline', 'WT-07': 'live', 'WT-08': 'stale', 'PU-31': 'live',
  'EX-04': 'live', 'EX-07': 'offline', 'EX-11': 'live', 'WL-03': 'idle', 'WL-06': 'live',
  'BD-02': 'live', 'BH-05': 'live', 'GR-01': 'idle', 'CP-03': 'live', 'GN-01': 'live',
  'GN-02': 'stale', 'LD-09': 'no_tracker', 'CR-02': 'idle', 'CR-05': 'stale', 'CR-08': 'live',
  'TH-01': 'live', 'TH-04': 'live', 'FL-09': 'unknown', 'FL-10': 'idle', 'BL-01': 'live',
  'SL-02': 'offline', 'MW-01': 'no_tracker', 'PU-41': 'live', 'PU-51': 'live', 'PU-52': 'idle',
  'VN-01': 'live',
};

/** The CAN parameter each supported name fills on a reading (spec §6.1). */
const CAN_FIELD: Record<string, keyof Reading> = {
  rpm: 'rpm', engineLoad: 'engineLoadPct', fuelLevel: 'fuelLevelPct', fuelUsed: 'fuelUsedL',
  fuelRate: 'fuelRateLph', canOdometer: 'canOdometerKm', coolantTemp: 'coolantC',
  engineHours: 'engineHours', faultCodes: 'activeDtcs', adBlue: 'adBluePct',
};

function readingsOn(code: string, dayOffset: number): Reading[] {
  const day = clock.startOfDubaiDay(clock.now()) + dayOffset * DAY;
  return getReadingsForAsset(asset(code), day, day + DAY - 1);
}

describe('§8.2 asset table at the anchor', () => {
  it('has a status for all 36 assets, matching the spec table', () => {
    expect(Object.keys(SPEC_STATUS)).toHaveLength(36);
    expect(db.getState().assets).toHaveLength(36);
    for (const [code, status] of Object.entries(SPEC_STATUS)) {
      expect(computeStatus(asset(code)), `${code} status at the anchor`).toBe(status);
    }
  });

  it.each(db.getState().assets.map(a => a.code))('%s: supported CAN params have values; unsupported have none', code => {
    const a = asset(code);
    const r = getReadingForAsset(a);
    if (!r) return; // no tracker, or never reported
    const supported = new Set<string>(a.canProfile.supported);
    const fitted = isCanReadingAvailable(a, new Date(r.deviceTime).getTime());
    for (const [param, field] of Object.entries(CAN_FIELD)) {
      const value = r[field];
      if (supported.has(param) && fitted) {
        expect(value, `${code} ${param}`).not.toBeUndefined();
      } else {
        expect(value, `${code} ${param} must be absent`).toBeUndefined();
      }
    }
  });

  it('Tier 3 assets do not all read the same fuel level', () => {
    const levels = db.getState().assets
      .filter(a => a.canProfile.supported.includes('fuelLevel') && a.canProfile.adapter !== 'none')
      .map(a => getReadingForAsset(a)?.fuelLevelPct)
      .filter((v): v is number => v !== undefined);
    expect(levels.length).toBeGreaterThan(5);
    expect(new Set(levels).size).toBeGreaterThan(levels.length / 2);
  });

  it('working machines at the anchor run at working load and speed (EX-04, WL-06, TH-01, GN-01, BD-02)', () => {
    for (const code of ['EX-04', 'WL-06', 'TH-01', 'GN-01', 'BD-02']) {
      const r = getReadingForAsset(asset(code))!;
      expect(r.ignition, code).toBe(true);
      expect(r.rpm!, code).toBeGreaterThanOrEqual(1200);
      expect(r.rpm!, code).toBeLessThanOrEqual(2100);
      expect(r.engineLoadPct!, code).toBeGreaterThanOrEqual(35);
      expect(r.engineLoadPct!, code).toBeLessThanOrEqual(85);
    }
  });

  it('FB-12 is driving at the anchor, from Jebel Ali towards the Al Habtoor site', () => {
    const a = asset('FB-12');
    const r = getReadingForAsset(a)!;
    expect(r.moving).toBe(true);
    expect(r.speedKmh).toBeGreaterThan(3);
    const dest = { lat: 25.1130, lng: 55.2000 };
    const start = siteOf(a.homeSiteId).center;
    expect(haversineKm(r, dest)).toBeLessThan(haversineKm(start, dest));
    expect(haversineKm(r, dest)).toBeGreaterThan(0.5);
  });
});

describe('§9 movement', () => {
  it('a plant machine starts its shift at 07:00 Dubai and works in its yard', () => {
    const rs = readingsOn('WL-03', -1); // yesterday, not rented
    const on = rs.filter(r => r.ignition);
    expect(on.length).toBeGreaterThan(0);
    const first = new Date(on[0].deviceTime).getTime();
    expect(dubaiHour(first)).toBeGreaterThanOrEqual(7);
    expect(dubaiHour(first)).toBeLessThan(7.02);
    const yard = siteOf(asset('WL-03').homeSiteId).center;
    for (const r of rs) expect(haversineKm(r, yard)).toBeLessThan(0.3);
  });

  it('a truck runs between sites at 20–90 km/h when moving, with a steadily rising odometer', () => {
    const rs = readingsOn('LB-02', -1);
    const moving = rs.filter(r => r.moving);
    expect(moving.length).toBeGreaterThan(20);
    for (const r of moving) {
      expect(r.speedKmh).toBeGreaterThanOrEqual(20);
      expect(r.speedKmh).toBeLessThanOrEqual(90);
    }
    for (let i = 1; i < rs.length; i++) {
      expect(rs[i].gnssOdometerKm).toBeGreaterThanOrEqual(rs[i - 1].gnssOdometerKm);
    }
    const km = rs.at(-1)!.gnssOdometerKm - rs[0].gnssOdometerKm;
    expect(km).toBeGreaterThan(5);
    expect(km).toBeLessThan(400);
  });

  it('a generator stays put', () => {
    const rs = readingsOn('GN-02', -1);
    const home = siteOf(asset('GN-02').homeSiteId).center;
    for (const r of rs) expect(haversineKm(r, home)).toBeLessThan(0.1);
  });

  it('a rented machine sits at the renter\'s site during the rental, not at its yard', () => {
    const ex04 = asset('EX-04');
    const r = getReadingForAsset(ex04)!;
    const renter = siteOf('s-marina-dh').center;
    const yard = siteOf(ex04.homeSiteId).center;
    expect(haversineKm(r, renter)).toBeLessThan(0.5);
    expect(haversineKm(r, yard)).toBeGreaterThan(2);
  });

  it('a parked machine reports every 10 minutes and its heading does not spin', () => {
    const rs = readingsOn('CR-08', -1).filter(r => !r.ignition);
    expect(rs.length).toBeGreaterThan(10);
    for (let i = 1; i < rs.length; i++) {
      const gap = new Date(rs[i].deviceTime).getTime() - new Date(rs[i - 1].deviceTime).getTime();
      expect(gap).toBe(10 * MIN);
      expect(rs[i].heading).toBe(rs[i - 1].heading);
    }
  });
});

describe('§9 fuel', () => {
  it('GN-01 drops 18% at 02:10 Dubai with the engine off', () => {
    const gn = asset('GN-01');
    const before = fuelStateAt(gn, GN01_DROP_AT - 5 * MIN).levelPct;
    const after = fuelStateAt(gn, GN01_DROP_AT + 5 * MIN).levelPct;
    expect(dubaiHour(GN01_DROP_AT)).toBeCloseTo(2 + 10 / 60, 2);
    expect(before - after).toBeGreaterThan(17);
    expect(before - after).toBeLessThan(19);
  });

  it('refuels add 40–70% and only happen during the shift', () => {
    const ex = asset('EX-04');
    const times = refuelTimesFor(ex);
    expect(times.length).toBeGreaterThan(3);
    for (const t of times) {
      const jump = fuelStateAt(ex, t).levelPct - fuelStateAt(ex, t - MIN).levelPct;
      expect(jump).toBeGreaterThan(39);
      expect(jump).toBeLessThan(71);
      expect(dubaiHour(t)).toBeGreaterThanOrEqual(7);
      expect(dubaiHour(t)).toBeLessThan(18);
    }
  });

  it('fuel falls with use between refuels', () => {
    const ex = asset('EX-04');
    const t0 = clock.now() - 3 * HOUR;
    expect(fuelStateAt(ex, t0 + HOUR).levelPct).toBeLessThanOrEqual(fuelStateAt(ex, t0).levelPct + 0.0001);
  });
});

describe('§8.2 readings keep time', () => {
  it('no reading is later than the clock', () => {
    const now = clock.now();
    for (const a of db.getState().assets) {
      const r = getReadingForAsset(a);
      if (r) expect(new Date(r.deviceTime).getTime(), a.code).toBeLessThanOrEqual(now);
    }
  });
});
