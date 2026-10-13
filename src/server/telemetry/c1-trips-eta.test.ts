// C1 (UI-UPGRADE §9, BUILDER §1): FB-12 reaches the Al Habtoor site about 30 min after
// the anchor and the public ETA agrees with that arrival; plant working on a site does
// not log a "trip" for every shuffle.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, resetDb } from '@/server/db';
import { getReadingsForAsset, getReadingForAsset, computeStatus } from '@/server/telemetry/simulator';
import { resolveTrackingLink } from '@/server/links';
import { groupTrips } from '@/domain/trips';
import { PIN_TRIP_MAX } from '@/domain/playback';
import { ANCHOR_MS } from '@/server/seed/data';
import * as clock from '@/lib/clock';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const FB12_TOKEN = 'k7Qm2Xc9TpLw4ZaN8rVb3Ye5';
const DEST = { lat: 25.1130, lng: 55.2000 };
const asset = (code: string) => db.getState().assets.find(a => a.code === code)!;
const kmToDest = (r: { lat: number; lng: number }) => Math.hypot((r.lat - DEST.lat) * 111, (r.lng - DEST.lng) * 101);

/** The first reading time FB-12 is within 150 m of the site (ETA_ARRIVED_M), after the anchor. */
function fb12ArrivedAt(): number {
  clock.setOffsetMs(3 * 3600_000);
  const rs = getReadingsForAsset(asset('FB-12'), ANCHOR_MS - 30 * MIN, clock.now());
  const hit = rs.find(r => kmToDest(r) < 0.15);
  if (!hit) throw new Error('FB-12 never arrives');
  return new Date(hit.deviceTime).getTime();
}

beforeEach(() => { resetDb(); clock.setOffsetMs(0); });
afterEach(() => clock.setOffsetMs(0));

describe('FB-12 arrives about 30 min after the anchor (owner decision)', () => {
  it('arrives at Al Habtoor between anchor +25 and +35 min, at a truck speed of 25–60 km/h', () => {
    const arrived = fb12ArrivedAt();
    expect(arrived - ANCHOR_MS).toBeGreaterThanOrEqual(25 * MIN);
    expect(arrived - ANCHOR_MS).toBeLessThanOrEqual(35 * MIN);
    clock.setOffsetMs(0);
    const driving = getReadingsForAsset(asset('FB-12'), ANCHOR_MS - 5 * MIN, ANCHOR_MS).filter(r => r.moving);
    expect(driving.length).toBeGreaterThan(0);
    for (const r of driving) {
      expect(r.speedKmh).toBeGreaterThanOrEqual(25);
      expect(r.speedKmh).toBeLessThanOrEqual(60);
    }
  });

  it.each([0, 10, 20])('the tracking ETA at anchor +%i min is within ±5 min of the arrival', m => {
    const arrived = fb12ArrivedAt();
    clock.setOffsetMs(m * MIN);
    const eta = resolveTrackingLink(FB12_TOKEN)!.eta!;
    expect(eta.state).toBe('en_route');
    expect(Math.abs(eta.etaAt - arrived)).toBeLessThanOrEqual(5 * MIN);
  });

  it('stays at the site afterwards, and the link reads Arrived at the real arrival time', () => {
    const arrived = fb12ArrivedAt();
    for (const m of [40, 90, 240]) {
      clock.setOffsetMs(m * MIN);
      expect(kmToDest(getReadingForAsset(asset('FB-12'))!), `+${m} min`).toBeLessThan(0.15);
      const eta = resolveTrackingLink(FB12_TOKEN)!.eta!;
      expect(eta.state, `+${m} min`).toBe('arrived');
      // Not the time the page was opened: the time FB-12 got there (within one reading).
      expect(Math.abs(eta.etaAt - arrived), `+${m} min`).toBeLessThanOrEqual(2 * MIN);
      expect(computeStatus(asset('FB-12'))).toBe('live');
    }
  });
});

describe('plant does not log a trip for every site shuffle', () => {
  const dubaiDays = (n: number) => {
    const today = clock.startOfDubaiDay(ANCHOR_MS);
    return Array.from({ length: n }, (_, i) => today - (n - i) * DAY);
  };

  it('EX-04 and WL-06 make at most 2 trips on each Dubai day of the last 4 weeks, and some in each week', () => {
    for (const code of ['EX-04', 'WL-06']) {
      const days = dubaiDays(28);
      const perDay = days.map(d => groupTrips(getReadingsForAsset(asset(code), d, d + DAY - 1)).length);
      for (const [i, n] of perDay.entries()) expect(n, `${code} on day ${i - 28}`).toBeLessThanOrEqual(2);
      for (let w = 0; w < 4; w++) {
        expect(perDay.slice(w * 7, w * 7 + 7).reduce((a, b) => a + b, 0), `${code} week ${w}`).toBeGreaterThan(0);
      }
    }
  });

  it('a week of plant is a few trips, so its playback carries trip pins (PIN_TRIP_MAX)', () => {
    for (const code of ['EX-04', 'WL-06', 'CR-05']) {
      const week = groupTrips(getReadingsForAsset(asset(code), ANCHOR_MS - 7 * DAY, ANCHOR_MS)).length;
      expect(week, code).toBeLessThanOrEqual(PIN_TRIP_MAX);
    }
  });

  it('a shuffle on site reads under IDLE_SPEED_KMH, so it is not "moving"', () => {
    const rs = getReadingsForAsset(asset('EX-04'), ANCHOR_MS - 2 * DAY, ANCHOR_MS);
    const slow = rs.filter(r => r.ignition && r.speedKmh > 0 && r.speedKmh < 3);
    expect(slow.length).toBeGreaterThan(0);
    for (const r of slow) expect(r.moving).toBe(false);
  });

  it('trucks still drive their runs: TP-21, LB-05 and WT-07 keep 10+ trips a week', () => {
    for (const code of ['TP-21', 'LB-05', 'WT-07']) {
      const week = groupTrips(getReadingsForAsset(asset(code), ANCHOR_MS - 7 * DAY, ANCHOR_MS)).length;
      expect(week, code).toBeGreaterThanOrEqual(10);
    }
  });
});
