// Spec §8 / S27: WT-07 has one planned over-speed event yesterday, at 104 km/h.
// The simulator writes it into the readings, and the playback pins turn it into the
// single over-speed pin the walkthrough expects.

import { describe, it, expect, beforeEach } from 'vitest';
import { db, resetDb } from '@/server/db';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { buildPins } from '@/domain/playback';
import * as clock from '@/lib/clock';
import { ANCHOR_MS } from '@/server/seed/data';

const DAY = 86_400_000;

beforeEach(() => {
  resetDb();
  clock.setAnchor(ANCHOR_MS);
});

describe('WT-07 planned over-speed (S27)', () => {
  const yesterdayStart = () => Math.floor(clock.now() / DAY) * DAY - DAY;

  it('yesterday holds a 104 km/h run and nothing else over 100 km/h', () => {
    const wt07 = db.getState().assets.find(a => a.code === 'WT-07')!;
    const start = yesterdayStart();
    const readings = getReadingsForAsset(wt07, start, start + DAY - 1);
    const fast = readings.filter(r => r.speedKmh >= 100);
    expect(fast.length).toBeGreaterThan(0);
    expect(Math.max(...readings.map(r => r.speedKmh))).toBe(104);
    expect(new Set(fast.map(r => r.speedKmh))).toEqual(new Set([104]));
  });

  it('the playback window over that day gives exactly one over-speed pin', () => {
    const wt07 = db.getState().assets.find(a => a.code === 'WT-07')!;
    const start = yesterdayStart();
    const pins = buildPins({
      readings: getReadingsForAsset(wt07, start, start + DAY - 1),
      tier: 1,
      fromMs: start,
      toMs: start + DAY - 1,
      geofenceEvents: [],
    });
    expect(pins.map(p => p.label)).toEqual(['Over speed 104 km/h']);
  });

  it('today has no planned over-speed', () => {
    const wt07 = db.getState().assets.find(a => a.code === 'WT-07')!;
    const today = Math.floor(clock.now() / DAY) * DAY;
    const readings = getReadingsForAsset(wt07, today, clock.now());
    expect(readings.every(r => r.speedKmh < 100)).toBe(true);
  });
});
