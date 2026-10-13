// Moving the demo clock forward must move the machines with it: readings are
// generated up to "now", so a cached day must not outlive a clock change.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, resetDb } from '@/server/db';
import { getReadingForAsset, computeStatus } from '@/server/telemetry/simulator';
import * as clock from '@/lib/clock';

const asset = (code: string) => db.getState().assets.find(a => a.code === code)!;

beforeEach(() => {
  resetDb();
  clock.setOffsetMs(0);
});
afterEach(() => clock.setOffsetMs(0));

describe('clock moves', () => {
  it('a moving truck keeps reporting and moves on when the clock jumps 30 min', () => {
    const before = getReadingForAsset(asset('FB-12'))!;
    clock.setOffsetMs(30 * 60000);
    const after = getReadingForAsset(asset('FB-12'))!;
    expect(computeStatus(asset('FB-12'))).toBe('live');
    expect(new Date(after.deviceTime).getTime()).toBeGreaterThan(new Date(before.deviceTime).getTime());
    expect(clock.now() - new Date(after.deviceTime).getTime()).toBeLessThan(5 * 60000);
  });

  it('+1 h turns WT-08 Offline, while working plant stays Live (§13)', () => {
    clock.setOffsetMs(3600000);
    expect(computeStatus(asset('WT-08'))).toBe('offline');
    expect(computeStatus(asset('EX-04'))).toBe('live');
  });

  it('jumping back gives the same readings as before', () => {
    const first = getReadingForAsset(asset('EX-04'))!;
    clock.setOffsetMs(2 * 3600000);
    getReadingForAsset(asset('EX-04'));
    clock.setOffsetMs(0);
    const again = getReadingForAsset(asset('EX-04'))!;
    // Same place, time and machine state; only sensor noise (voltage, satellites) may differ.
    for (const k of ['deviceTime', 'lat', 'lng', 'ignition', 'moving', 'fuelLevelPct', 'engineLoadPct', 'engineHours'] as const) {
      expect(again[k], k).toEqual(first[k]);
    }
  });

  it('alerted scenarios age with the clock: TP-23 stays offline, EX-07 more so', () => {
    clock.setOffsetMs(3 * 3600000);
    expect(computeStatus(asset('TP-23'))).toBe('offline');
    const tp23 = getReadingForAsset(asset('TP-23'))!;
    expect(new Date(tp23.deviceTime).getTime()).toBeLessThanOrEqual(clock.getAnchor() - 40 * 60000);
    clock.setOffsetMs(-2.5 * 3600000); // 07:30, before the 08:00 power cut: still driving
    expect(computeStatus(asset('TP-23'))).not.toBe('offline');
  });

  // Owner decision (BUILDER §1, 13 Oct): FB-12 arrives about 30 min after the anchor, not 90.
  it('FB-12 reaches the Al Habtoor site about 30 min after the anchor and stays there (§9)', () => {
    const dest = { lat: 25.1130, lng: 55.2000 };
    const km = (r: { lat: number; lng: number }) => Math.hypot((r.lat - dest.lat) * 111, (r.lng - dest.lng) * 101);
    clock.setOffsetMs(10 * 60000);
    expect(km(getReadingForAsset(asset('FB-12'))!)).toBeGreaterThan(5);
    clock.setOffsetMs(35 * 60000);
    expect(km(getReadingForAsset(asset('FB-12'))!)).toBeLessThan(0.5);
    clock.setOffsetMs(4 * 3600000);
    expect(km(getReadingForAsset(asset('FB-12'))!)).toBeLessThan(0.5);
  });
});
