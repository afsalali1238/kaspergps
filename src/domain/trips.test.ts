// The trip rule (spec §11.5), in one place: the Trips tab (src/server/trips.ts) and the
// playback pins (src/domain/playback.ts) both read it from here, so a pin and a row of
// the Trips table can never disagree about when a trip began or ended.

import { beforeEach, describe, expect, it } from 'vitest';
import type { Reading } from '@/domain/types';
import { TRIP_GAP_MS, TRIP_STOP_END_MS, groupTrips, isDriving } from '@/domain/trips';
import { db, resetDb } from '@/server/db';
import { ANCHOR_MS } from '@/server/seed/data';
import { detectTrips } from '@/server/trips';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import * as clock from '@/lib/clock';

const T0 = Date.parse('2026-10-10T08:00:00Z');
const min = (n: number) => n * 60_000;

function reading(offsetMs: number, over: Partial<Reading> = {}): Reading {
  return {
    trackerId: 'trk-1',
    deviceTime: new Date(T0 + offsetMs).toISOString(),
    receivedAt: new Date(T0 + offsetMs).toISOString(),
    lat: 25.2,
    lng: 55.3,
    speedKmh: 40,
    heading: 90,
    satellites: 12,
    ignition: true,
    moving: true,
    extVoltage: 13.8,
    intBattery: 4,
    gsm: 4,
    gnssOdometerKm: 0,
    ...over,
  } as Reading;
}

const parked = (offsetMs: number) => reading(offsetMs, { ignition: false, moving: false, speedKmh: 0 });

describe('groupTrips', () => {
  it('needs ignition on and more than the idle speed to count as driving', () => {
    expect(isDriving(reading(0, { speedKmh: 30 }))).toBe(true);
    expect(isDriving(reading(0, { speedKmh: 3 }))).toBe(false); // exactly idle: not driving
    expect(isDriving(reading(0, { speedKmh: 30, ignition: false }))).toBe(false);
  });

  it('one trip from ignition on with speed, ended by standing still for 5 minutes', () => {
    const windows = groupTrips([
      parked(0),
      reading(min(1), { speedKmh: 30 }),
      reading(min(2), { speedKmh: 60 }),
      reading(min(3), { speedKmh: 0 }), // the stop starts here
      reading(min(5), { speedKmh: 0 }), // two minutes standing: still the same trip
      reading(min(8), { speedKmh: 0 }), // five minutes standing: the trip ended at min(2)
    ]);
    expect(windows).toHaveLength(1);
    expect(windows[0].startMs).toBe(T0 + min(1));
    // The trip's readings are the ones where the machine was driving: a stopped machine
    // adds no distance and no top speed, so it is not part of the trip.
    expect(windows[0].endMs).toBe(T0 + min(2));
    expect(windows[0].readings.map(r => r.deviceTime)).toEqual([
      new Date(T0 + min(1)).toISOString(),
      new Date(T0 + min(2)).toISOString(),
    ]);
  });

  it('a 5-minute stop splits the day into two trips, however often the machine reports', () => {
    // Every 30 s with the engine on (an idling machine): the old rule, which measured
    // "time since the previous reading", would never end the trip.
    const standing = Array.from({ length: 12 }, (_, i) => reading(min(4) + i * 30_000, { speedKmh: 0 }));
    const windows = groupTrips([
      reading(0, { speedKmh: 40 }),
      reading(min(1), { speedKmh: 40 }),
      ...standing,
      reading(min(10), { speedKmh: 40 }), // sets off again on a new trip
      reading(min(11), { speedKmh: 40 }),
    ]);
    expect(windows.map(w => [w.startMs - T0, w.endMs - T0])).toEqual([
      [0, min(1)],
      [min(10), min(11)],
    ]);
  });

  it('ignition off ends the trip immediately', () => {
    const windows = groupTrips([reading(0), parking()]);
    expect(windows).toHaveLength(1);
    expect(windows[0].endMs).toBe(T0);
  });

  it('a silence longer than the gap window splits one trip into two', () => {
    const windows = groupTrips([
      reading(0),
      reading(min(1)),
      reading(min(1) + TRIP_GAP_MS + min(1)),
      reading(min(1) + TRIP_GAP_MS + min(2)),
    ]);
    expect(windows.map(w => [w.startMs - T0, w.endMs - T0])).toEqual([
      [0, min(1)],
      [min(1) + TRIP_GAP_MS + min(1), min(1) + TRIP_GAP_MS + min(2)],
    ]);
  });

  it('a stop shorter than the rule does not end the trip', () => {
    const windows = groupTrips([
      reading(0, { speedKmh: 0 }),
      reading(TRIP_STOP_END_MS - 1000, { speedKmh: 0 }),
      reading(TRIP_STOP_END_MS - 1000 + min(1), { speedKmh: 40 }),
    ]);
    expect(windows).toHaveLength(1);
    expect(windows[0].endMs).toBe(T0 + TRIP_STOP_END_MS - 1000 + min(1));
  });

  it('readings with the engine off and no driving give no trips, and the input order does not matter', () => {
    expect(groupTrips([parked(0), parked(min(3))])).toEqual([]);
    const outOfOrder = [reading(min(2)), reading(min(0)), reading(min(1))];
    expect(groupTrips(outOfOrder)[0].readings.map(r => r.deviceTime)).toEqual([
      new Date(T0).toISOString(),
      new Date(T0 + min(1)).toISOString(),
      new Date(T0 + min(2)).toISOString(),
    ]);
    expect(outOfOrder.map(r => r.deviceTime)).toEqual([
      new Date(T0 + min(2)).toISOString(),
      new Date(T0).toISOString(),
      new Date(T0 + min(1)).toISOString(),
    ]);
  });
});

function parking(): Reading {
  return reading(min(1), { ignition: false, moving: false, speedKmh: 0 });
}

describe('the Trips tab and the playback pins share this rule', () => {
  beforeEach(() => {
    resetDb();
    clock.setAnchor(ANCHOR_MS);
  });

  it('detectTrips() reports exactly the windows groupTrips() finds, for every seeded asset', () => {
    const from = ANCHOR_MS - 7 * 86_400_000;
    for (const asset of db.getState().assets) {
      const readings = getReadingsForAsset(asset, from, ANCHOR_MS);
      const windows = groupTrips(readings).map(w => [w.startMs, w.endMs]);
      const trips = detectTrips(asset, from, ANCHOR_MS).map(t => [t.startMs, t.endMs]);
      expect(trips, asset.code).toEqual(windows);
    }
  });

  it('the fleet does drive in the week: the shared rule is not vacuously true', () => {
    const from = ANCHOR_MS - 7 * 86_400_000;
    const total = db.getState().assets.reduce(
      (sum, asset) => sum + groupTrips(getReadingsForAsset(asset, from, ANCHOR_MS)).length,
      0,
    );
    expect(total).toBeGreaterThan(20);
  });
});
