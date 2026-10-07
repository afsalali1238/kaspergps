// Integration tests for playback data straight from the simulator — the data
// behind scenarios S27 (WT-07, Tier 1) and S28 (EX-04, Tier 3, renter).
import { describe, it, expect, afterEach } from 'vitest';
import { seed, ANCHOR_MS } from '@/server/seed/data';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { buildPlaybackData, clippedPeriod, trackSegments } from '@/domain/trips';
import { rentalWindow } from '@/server/access';
import * as clock from '@/lib/clock';
import type { Session } from '@/domain/types';

afterEach(() => clock.resetOffset());

function sessionFor(userId: string): Session {
  const user = seed.users.find(u => u.id === userId)!;
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: user.siteIds,
    role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

describe('S27 · WT-07 yesterday, Tier 1', () => {
  const asset = seed.assets.find(a => a.code === 'WT-07')!;
  const fromMs = ANCHOR_MS - 24 * 3600 * 1000;
  const toMs = ANCHOR_MS;

  it('has at least one trip with a distance and a start before an end', () => {
    const readings = getReadingsForAsset(asset, fromMs, toMs);
    const data = buildPlaybackData(readings, { assetId: asset.id, fromMs, toMs, tier: 1, canSupported: asset.canProfile.supported, alerts: seed.alerts });
    expect(data.trips.length).toBeGreaterThan(0);
    const trip = data.trips[0];
    expect(trip.endMs).toBeGreaterThan(trip.startMs);
    expect(trip.distanceKm).toBeGreaterThan(0);
  });

  it('shows the over-speed pin from the seeded alert with 104 km/h', () => {
    const readings = getReadingsForAsset(asset, fromMs, toMs);
    const data = buildPlaybackData(readings, { assetId: asset.id, fromMs, toMs, tier: 1, canSupported: asset.canProfile.supported, alerts: seed.alerts });
    const pin = data.events.find(e => e.kind === 'overspeed' && e.detail?.includes('104'));
    expect(pin).toBeDefined();
    expect(pin!.label).toBe('Over speed');
  });

  it('has no CAN values to read out on a Tier 1 asset', () => {
    const readings = getReadingsForAsset(asset, fromMs, toMs);
    expect(readings.every(r => r.rpm === undefined && r.fuelLevelPct === undefined)).toBe(true);
    const data = buildPlaybackData(readings, { assetId: asset.id, fromMs, toMs, tier: 1, canSupported: asset.canProfile.supported });
    expect(data.events.some(e => e.kind === 'refuel' || e.kind === 'fuel_drop')).toBe(false);
  });
});

describe('S28 · EX-04, Tier 3 rented to Marina', () => {
  const asset = seed.assets.find(a => a.code === 'EX-04')!;
  const lina = sessionFor('u-lina');
  const window = rentalWindow(lina, asset.id)!;

  it('clips the scrubber to the rental window', () => {
    const requested = { fromMs: ANCHOR_MS - 7 * 24 * 3600 * 1000, toMs: ANCHOR_MS };
    const clipped = clippedPeriod(requested.fromMs, requested.toMs, window);
    expect(clipped.fromMs).toBe(Math.max(requested.fromMs, window.start));
    expect(clipped.fromMs).toBe(window.start);
    expect(clipped.toMs).toBe(Math.min(requested.toMs, window.end));
    // Never before the rental start
    expect(clipped.fromMs).toBeGreaterThan(requested.fromMs);
  });

  it('has no readings before the rental start for the renter', () => {
    // The simulator does produce readings, but the renter's period starts at the window:
    const clippedPeriodMs = clippedPeriod(window.start - 12 * 3600 * 1000, ANCHOR_MS, window);
    const renterReadings = getReadingsForAsset(asset, clippedPeriodMs.fromMs, clippedPeriodMs.toMs);
    expect(clippedPeriodMs.fromMs).toBe(window.start);
    expect(renterReadings.length).toBeGreaterThan(0);
    expect(renterReadings.every(r => new Date(r.deviceTime).getTime() >= window.start)).toBe(true);
  });

  it('reads out RPM and load but not AdBlue', () => {
    const data = buildPlaybackData(getReadingsForAsset(asset, window.start, ANCHOR_MS), {
      assetId: asset.id,
      tier: 3,
      canSupported: asset.canProfile.supported,
      alerts: seed.alerts,
      geofences: seed.geofences.filter(g => g.tenantId === 't-emirates'),
      geofenceEvents: seed.geofenceEvents,
    });
    const pointsWithCan = data.track.filter(p => p.rpm !== undefined && p.engineLoadPct !== undefined);
    expect(pointsWithCan.length).toBeGreaterThan(10);
    expect(asset.canProfile.supported).not.toContain('adBlue');
    expect(data.track.every(p => p.adBluePct === undefined)).toBe(true);
    expect(data.trips.length).toBeGreaterThan(0);
  });

  it('never shows another tenant’s geofence events to the renter', () => {
    const marinaFences = seed.geofences.filter(g => g.tenantId === 't-marina');
    const data = buildPlaybackData(getReadingsForAsset(asset, window.start, ANCHOR_MS), {
      assetId: asset.id,
      tier: 3,
      canSupported: asset.canProfile.supported,
      geofences: marinaFences,
      geofenceEvents: seed.geofenceEvents,
    });
    const fenceEvents = data.events.filter(e => e.kind.startsWith('geofence'));
    const ownNames = new Set(marinaFences.map(g => g.name));
    expect(fenceEvents.every(e => Array.from(ownNames).some(name => e.label.includes(name)))).toBe(true);
    // Palm's fence events never appear for Marina
    expect(fenceEvents.some(e => e.label.includes('Palm Crescent works'))).toBe(false);
  });
});

describe('gaps in generated readings', () => {
  it('injects connectivity gaps that playback draws around', () => {
    const asset = seed.assets.find(a => a.code === 'FB-14')!;
    const fromMs = ANCHOR_MS - 3 * 24 * 3600 * 1000;
    const data = buildPlaybackData(getReadingsForAsset(asset, fromMs, ANCHOR_MS), {
      assetId: asset.id,
      fromMs,
      toMs: ANCHOR_MS,
      tier: 1,
      canSupported: asset.canProfile.supported,
    });
    expect(data.gaps.length).toBeGreaterThan(0);
    // Every gap is at least the break threshold, and no polyline crosses one
    for (const gap of data.gaps) expect(gap.minutes).toBeGreaterThanOrEqual(5);
    const segments = trackSegments(data.points);
    for (const segment of segments) {
      for (let i = 1; i < segment.length; i++) {
        const deltaMin = (segment[i].t - segment[i - 1].t) / 60000;
        expect(deltaMin).toBeLessThan(5);
      }
    }
  });

  it('is deterministic: the same asset and period produce the same track', () => {
    const asset = seed.assets.find(a => a.code === 'TP-21')!;
    const fromMs = ANCHOR_MS - 24 * 3600 * 1000;
    const first = getReadingsForAsset(asset, fromMs, ANCHOR_MS).map(r => `${r.deviceTime}|${r.lat}|${r.speedKmh}`);
    clock.jumpForwardHours(1); // jumping drops the cache
    clock.resetOffset();
    const second = getReadingsForAsset(asset, fromMs, ANCHOR_MS).map(r => `${r.deviceTime}|${r.lat}|${r.speedKmh}`);
    expect(second).toEqual(first);
  });
});
