// The pins the demo player must show, from the seeded readings (spec §8.7, §11.15).
// Each seeded event the alerts talk about has to appear as a pin, in words, with the
// place the machine was at — otherwise the player shows a trip with nothing on it while
// the Alerts tab claims something happened.

import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '@/server/db';
import { ANCHOR_MS, dubaiAt } from '@/server/seed/data';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { PIN_TRIP_MAX, buildPins } from '@/domain/playback';
import { groupTrips } from '@/domain/trips';
import { tierOf } from '@/server/capability-catalog';
import { formatDubaiDateTime } from '@/lib/clock';
import * as clock from '@/lib/clock';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const MONTH = 31 * DAY;

beforeEach(() => {
  resetDb();
  clock.setAnchor(ANCHOR_MS);
});

const assetOf = (code: string) => db.getState().assets.find(a => a.code === code)!;
const tierFor = (code: string) => tierOf(assetOf(code).canProfile.adapter);

function pins(code: string, fromMs: number, toMs: number) {
  return buildPins({
    readings: getReadingsForAsset(assetOf(code), fromMs, toMs),
    tier: tierFor(code),
    fromMs,
    toMs,
    geofenceEvents: [],
  });
}

describe('seeded events appear as playback pins', () => {
  it('TP-21: the three harsh events of its alert, in words, each while driving', () => {
    const from = ANCHOR_MS - WEEK;
    const harsh = pins('TP-21', from, ANCHOR_MS).filter(p => p.kind === 'harsh');
    expect(harsh.map(p => p.label)).toEqual(['Harsh braking', 'Harsh acceleration', 'Harsh cornering']);
    for (const p of harsh) {
      expect(p.atMs).toBeGreaterThanOrEqual(from);
      expect(p.atMs).toBeLessThanOrEqual(ANCHOR_MS);
      expect(p.lat).toBeDefined();
      expect(p.lng).toBeDefined();
    }
    // The alert says three events in the two days before it opened.
    const alert = db.getState().alerts.find(a => a.id === 'al-tp21-harsh')!;
    const sinceAlert = harsh.filter(p => p.atMs >= new Date(alert.openedAt).getTime());
    expect(sinceAlert).toHaveLength(3);
  });

  it('LB-05: its towing event, at 23:40 with the ignition off', () => {
    const from = ANCHOR_MS - WEEK;
    const towing = pins('LB-05', from, ANCHOR_MS).filter(p => p.kind === 'towing');
    expect(towing).toHaveLength(1);
    expect(towing[0].label).toBe('Moved with ignition off');
    // The tow runs 23:40–23:50; a machine with the engine off reports every 10 minutes,
    // so the pin sits on the reading inside that window that shows it being dragged.
    expect(towing[0].atMs).toBeGreaterThanOrEqual(dubaiAt(1, 23, 40));
    expect(towing[0].atMs).toBeLessThanOrEqual(dubaiAt(1, 23, 50));
    const readings = getReadingsForAsset(assetOf('LB-05'), towing[0].atMs, towing[0].atMs);
    expect(readings[0].ignition).toBe(false);
    expect(readings[0].speedKmh).toBeGreaterThan(3);
  });

  it('TP-23 and EX-11: a power cut where the vehicle feed dies', () => {
    const from = ANCHOR_MS - WEEK;
    const tp23 = pins('TP-23', from, ANCHOR_MS).filter(p => p.kind === 'power_cut');
    expect(tp23).toHaveLength(1);
    expect(tp23[0].atMs).toBe(ANCHOR_MS - 2 * 3_600_000);
    expect(tp23[0].label).toBe('Power cut — on tracker battery');

    const ex11 = pins('EX-11', from, ANCHOR_MS).filter(p => p.kind === 'power_cut');
    expect(ex11.map(p => formatDubaiDateTime(p.atMs))).toEqual(['6 Oct 03:30']);
  });

  it('GN-01: its refills and the 18% drop at 02:10 with the engine off', () => {
    const from = ANCHOR_MS - WEEK;
    const all = pins('GN-01', from, ANCHOR_MS);
    const refuels = all.filter(p => p.kind === 'refuel');
    const drops = all.filter(p => p.kind === 'fuel_drop');
    expect(refuels.length).toBeGreaterThan(0);
    for (const p of refuels) expect(p.label).toMatch(/^Refuelled \d+ points$/);
    const theft = drops.find(p => p.atMs === dubaiAt(0, 2, 10));
    expect(theft, 'the 02:10 drop is a pin').toBeDefined();
    expect(theft!.label).toBe('Fuel fell 18 points');
  });

  it('a Tier 1 fleet gets no fuel pins at all', () => {
    const from = ANCHOR_MS - WEEK;
    const omars = pins('FB-12', from, ANCHOR_MS);
    expect(omars.filter(p => p.kind === 'refuel' || p.kind === 'fuel_drop')).toEqual([]);
    expect(omars.filter(p => p.kind === 'trip_start').length).toBe(omars.filter(p => p.kind === 'trip_stop').length);
  });

  it('every working machine drives in the week, and its day window carries the trip pins', () => {
    const from = ANCHOR_MS - WEEK;
    for (const code of ['FB-12', 'EX-04', 'LB-05', 'TP-21', 'WT-07', 'WL-06']) {
      const trips = groupTrips(getReadingsForAsset(assetOf(code), from, ANCHOR_MS));
      expect(trips.length, `${code} drives in the week`).toBeGreaterThan(0);
      // A week of an excavator is 60+ shuffles: no boundary pins (see PIN_TRIP_MAX).
      // A day is a few trips: the pins are there, one pair per trip.
      const day = groupTrips(getReadingsForAsset(assetOf(code), ANCHOR_MS - DAY, ANCHOR_MS));
      const dayPins = pins(code, ANCHOR_MS - DAY, ANCHOR_MS);
      const startPins = dayPins.filter(p => p.kind === 'trip_start');
      if (day.length <= PIN_TRIP_MAX) {
        expect(startPins.length, `${code} day pins`).toBe(day.length);
      } else {
        expect(startPins, `${code} day pins`).toEqual([]);
      }
    }

    // A 24 h generator never leaves its site, so it makes no trips — and its week still
    // has pins (the refuels the Engine & fuel tab reports).
    const generator = pins('GN-01', from, ANCHOR_MS);
    expect(generator.filter(p => p.kind === 'trip_start' || p.kind === 'trip_stop')).toEqual([]);
    expect(generator.filter(p => p.kind === 'refuel').length).toBeGreaterThan(0);
  });

  it('a month of readings still builds pins (the History tab can ask for a long window)', () => {
    const from = ANCHOR_MS - MONTH;
    const all = pins('EX-04', from, ANCHOR_MS);
    // Hundreds of site shuffles: no trip-boundary pins at this density, but the events
    // that matter (refuels, drops, harsh, over-speed) are still there.
    expect(all.filter(p => p.kind === 'trip_start')).toEqual([]);
    expect(all.filter(p => p.kind === 'refuel').length).toBeGreaterThan(5);
    for (const p of all) {
      expect(p.atMs).toBeGreaterThanOrEqual(from);
      expect(p.atMs).toBeLessThanOrEqual(ANCHOR_MS);
    }
    const times = all.map(p => p.atMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
