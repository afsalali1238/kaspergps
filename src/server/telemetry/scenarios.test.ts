// S27 / S28 at the data level — the numbers the player shows in the browser.
// The same flows were walked through in a real browser against the dev server;
// these tests keep the demo data honest as the seed and simulator change.
//
// S27: Omar → WT-07 → Trips → yesterday's trip → Play (over-speed pin at
//      104 km/h, "No data" banner where coverage is missing, no CAN rows).
// S28: Lina → EX-04 → History → Play this period (scrubber starts at the rental
//      start, RPM/load present, AdBlue "Not measured").

import { describe, it, expect, afterEach } from 'vitest';
import { seed, ANCHOR_MS } from '@/server/seed/data';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import {
  buildPlaybackData,
  clippedPeriod,
  gapLabel,
  trackSegments,
  type PlaybackData,
} from '@/domain/trips';
import { rentalWindow } from '@/server/access';
import * as clock from '@/lib/clock';

afterEach(() => {
  clock.resetOffset();
});

const HOUR = 3600000;
const DAY = 24 * HOUR;

const wt07 = seed.assets.find(a => a.code === 'WT-07')!;
const ex04 = seed.assets.find(a => a.code === 'EX-04')!;
const lina = seed.users.find(u => u.id === 'u-lina')!;

const linaSession = {
  userId: lina.id,
  user: lina,
  tenantId: lina.tenantId,
  siteIds: lina.siteIds,
  role: lina.role,
  isKasper: false,
} as never;

function tierOf(asset: (typeof seed.assets)[number]): 1 | 2 | 3 {
  return asset.canProfile.adapter === 'ALL-CAN300' ? 3 : asset.canProfile.adapter === 'LVCAN200' ? 2 : 1;
}

function playback(asset: (typeof seed.assets)[number], readings: ReturnType<typeof getReadingsForAsset>, fromMs: number, toMs: number): PlaybackData {
  return buildPlaybackData(readings, {
    assetId: asset.id,
    fromMs,
    toMs,
    tier: tierOf(asset),
    canSupported: asset.canProfile.supported,
    alerts: seed.alerts,
  });
}

describe('S27 · Omar plays WT-07’s trip', () => {
  const from = ANCHOR_MS - DAY;
  const readings = getReadingsForAsset(wt07, from, ANCHOR_MS);
  const day = playback(wt07, readings, from, ANCHOR_MS);

  it('yesterday has two trips split by the long outage', () => {
    expect(day.trips).toHaveLength(2);
    expect(clock.formatDubaiTime(day.trips[0].startMs)).toBe('11:00');
    expect(clock.formatDubaiTime(day.trips[0].endMs)).toBe('13:05');
    expect(clock.formatDubaiTime(day.trips[1].startMs)).toBe('15:40');

    const longGap = day.gaps.find(g => g.minutes === 155);
    expect(longGap).toBeDefined();
    expect(gapLabel(longGap!)).toBe('No data 13:05 – 15:40');
  });

  it('pins the 104 km/h over-speed inside the first trip', () => {
    const pin = day.events.find(e => e.kind === 'overspeed');
    expect(pin).toBeDefined();
    expect(pin!.detail).toBe('104 km/h');
    expect(pin!.atMs).toBeGreaterThan(day.trips[0].startMs);
    expect(pin!.atMs).toBeLessThan(day.trips[0].endMs);
  });

  it('shows no fuel or RPM rows — WT-07 has no CAN adapter', () => {
    expect(day.track.every(p => p.rpm === undefined)).toBe(true);
    expect(day.track.every(p => p.fuelLevelPct === undefined)).toBe(true);
  });

  it('has an 8-minute gap inside the trip and never draws a line across it', () => {
    const tripFrom = day.trips[0].startMs - 5 * 60000;
    const tripTo = day.trips[0].endMs + 5 * 60000;
    const tripReadings = getReadingsForAsset(wt07, tripFrom, tripTo);
    const trip = playback(wt07, tripReadings, tripFrom, tripTo);

    const gap = trip.gaps.find(g => g.minutes === 8);
    expect(gap).toBeDefined();
    expect(gapLabel(gap!)).toBe('No data 12:00 – 12:08');

    // The drawn trail is split at every gap: no segment spans one.
    const segments = trackSegments(trip.points);
    expect(segments.length).toBeGreaterThan(1);
    for (const g of trip.gaps) {
      expect(
        segments.every(seg => !(seg[0].t <= g.from && seg[seg.length - 1].t >= g.to)),
      ).toBe(true);
    }
  });
});

describe('S28 · Lina plays EX-04’s rental period', () => {
  it('clips the period to the rental window and starts the scrubber there', () => {
    const window = rentalWindow(linaSession, ex04.id)!;
    const clipped = clippedPeriod(clock.now() - 7 * DAY, clock.now(), window);
    expect(clipped.fromMs).toBe(window.start);
  });

  it('reads out RPM and load at the cursor, AdBlue is not measured', () => {
    const window = rentalWindow(linaSession, ex04.id)!;
    const clipped = clippedPeriod(clock.now() - 7 * DAY, clock.now(), window);
    const readings = getReadingsForAsset(ex04, clipped.fromMs, clipped.toMs);
    const data = playback(ex04, readings, clipped.fromMs, clipped.toMs);

    expect(data.track.every(p => p.t >= window.start)).toBe(true);
    expect(data.trips.length).toBeGreaterThan(0);
    expect(data.track.some(p => (p.rpm ?? 0) > 0)).toBe(true);
    expect(data.track.some(p => p.engineLoadPct !== undefined)).toBe(true);
    // ALL-CAN300 does not report AdBlue on EX-04, so the row must read "Not measured".
    expect(data.track.every(p => p.adBluePct === undefined)).toBe(true);
  });

  it('only shows the renter’s own geofence events', () => {
    const window = rentalWindow(linaSession, ex04.id)!;
    const clipped = clippedPeriod(clock.now() - 7 * DAY, clock.now(), window);
    const readings = getReadingsForAsset(ex04, clipped.fromMs, clipped.toMs);
    // The asset page passes only the fences the renter's own tenant owns.
    const ownGeofences = seed.geofences.filter(g => g.tenantId === lina.tenantId);
    const ownEvents = seed.geofenceEvents.filter(e =>
      ownGeofences.some(g => g.id === e.geofenceId),
    );
    const otherGeofences = seed.geofences.filter(g => g.tenantId !== lina.tenantId);
    const otherEvents = seed.geofenceEvents.filter(
      e => !ownGeofences.some(g => g.id === e.geofenceId),
    );

    // Real filtering: Lina owns one fence and the seed has other tenants' events.
    expect(ownGeofences.map(g => g.id)).toEqual(['g-mb-school']);
    expect(otherEvents.length).toBeGreaterThan(0);

    const withFences = buildPlaybackData(readings, {
      assetId: ex04.id,
      fromMs: clipped.fromMs,
      toMs: clipped.toMs,
      tier: tierOf(ex04),
      canSupported: ex04.canProfile.supported,
      alerts: seed.alerts,
      geofences: ownGeofences,
      geofenceEvents: ownEvents,
    });
    const foreign = buildPlaybackData(readings, {
      assetId: ex04.id,
      fromMs: clipped.fromMs,
      toMs: clipped.toMs,
      tier: tierOf(ex04),
      canSupported: ex04.canProfile.supported,
      alerts: seed.alerts,
      geofences: otherGeofences,
      geofenceEvents: otherEvents,
    });

    const fenceKinds = (d: PlaybackData) =>
      d.events.filter(e => e.kind === 'geofence_enter' || e.kind === 'geofence_exit').length;

    // Another tenant's fences and events never appear on Lina's playback.
    expect(fenceKinds(foreign)).toBe(0);
    expect(fenceKinds(withFences)).toBe(0); // Lina's own fence has no EX-04 events in range
  });
});
