// Unit tests for trip detection, gaps, downsampling and playback events (spec 11.15).
import { describe, it, expect } from 'vitest';
import type { Reading, Alert, Geofence, GeofenceEvent } from '@/domain/types';
import {
  buildTrack,
  detectTrips,
  detectGaps,
  downsampleTrack,
  detectFuelEvents,
  buildEvents,
  buildPlaybackData,
  interpolatePosition,
  gapAt,
  gapLabel,
  trackSegments,
  stateOfReading,
} from '@/domain/trips';
import { TRACK_BREAK_MIN } from '@/config/thresholds';

const T0 = new Date('2026-10-05T07:00:00Z').getTime();

function reading(minutes: number, overrides: Partial<Reading> = {}): Reading {
  const at = T0 + minutes * 60 * 1000;
  return {
    trackerId: 'tr-test',
    deviceTime: new Date(at).toISOString(),
    receivedAt: new Date(at + 5000).toISOString(),
    // ~0.006° per minute ≈ 667 m/min ≈ 40 km/h
    lat: 25.0 + minutes * 0.006,
    lng: 55.0,
    speedKmh: 40,
    heading: 90,
    satellites: 10,
    ignition: true,
    moving: true,
    extVoltage: 26,
    intBattery: 4,
    gsm: 4,
    gnssOdometerKm: 100 + minutes,
    ...overrides,
  };
}

/** A day of 30-second readings between two minute marks. */
function series(startMin: number, endMin: number, overrides: (m: number) => Partial<Reading> = () => ({})): Reading[] {
  const out: Reading[] = [];
  for (let m = startMin; m < endMin; m += 0.5) {
    out.push(reading(m, overrides(m)));
  }
  return out;
}

describe('states', () => {
  it('is moving when speed is at or above the idle threshold', () => {
    expect(stateOfReading(reading(0, { speedKmh: 12, moving: true }))).toBe('moving');
    expect(stateOfReading(reading(0, { speedKmh: 0, moving: false, ignition: true }))).toBe('stationary');
    expect(stateOfReading(reading(0, { speedKmh: 0, moving: false, ignition: false }))).toBe('off');
  });
});

describe('gaps', () => {
  it('finds a gap only when it is at least the break threshold', () => {
    const times = [T0, T0 + 60000, T0 + 2 * 60000, T0 + 40 * 60000, T0 + 40.5 * 60000];
    const gaps = detectGaps(times, TRACK_BREAK_MIN);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].minutes).toBe(38);
    expect(gapAt(gaps, T0 + 20 * 60000)).not.toBeNull();
    expect(gapAt(gaps, T0 + 60000)).toBeNull();
  });

  it('labels a gap as "No data HH:MM – HH:MM"', () => {
    expect(gapLabel({ from: T0, to: T0 + 45 * 60000, minutes: 45 })).toMatch(/^No data \d{2}:\d{2} – \d{2}:\d{2}$/);
  });

  it('never adds distance across a gap', () => {
    const readings = [reading(0), reading(0.5), reading(60), reading(60.5)];
    const { track } = buildTrack(readings);
    const gap = track[3].gpsDistanceKm - track[2].gpsDistanceKm;
    const normal = track[1].gpsDistanceKm - track[0].gpsDistanceKm;
    // The jump across the hour would be far longer than the 30-second step.
    expect(gap).toBeLessThanOrEqual(normal * 3);
  });
});

describe('trip detection', () => {
  it('starts at ignition on + speed above 3 km/h and ends after 5 min stopped', () => {
    const readings = [
      reading(0, { speedKmh: 0, moving: false, ignition: false }), // off — no trip
      ...series(1, 10), // 9 minutes driving
      ...series(10, 17, () => ({ speedKmh: 0, moving: false, ignition: true })), // 7 min idling — ends the trip
      ...series(20, 25, () => ({ speedKmh: 0, moving: false, ignition: false })), // parked
    ];
    const { track, gaps } = buildTrack(readings);
    const trips = detectTrips(track, gaps);
    expect(trips).toHaveLength(1);
    expect(trips[0].startMs).toBe(T0 + 60 * 1000);
    // ended 5 minutes into the idle period
    expect(trips[0].endMs).toBe(T0 + 15 * 60 * 1000);
    expect(trips[0].distanceKm).toBeGreaterThan(0);
    expect(trips[0].maxSpeedKmh).toBe(40);
  });

  it('ends a trip at ignition off', () => {
    const readings = [...series(0, 10), ...series(10, 12, () => ({ speedKmh: 0, moving: false, ignition: false }))];
    const { track, gaps } = buildTrack(readings);
    const trips = detectTrips(track, gaps);
    expect(trips).toHaveLength(1);
    // The trip closes on the first reading with the ignition off.
    expect(trips[0].endMs).toBe(T0 + 10 * 60 * 1000);
  });

  it('ends the trip at a long gap and lists the gap', () => {
    const readings = [...series(0, 10), ...series(70, 80)];
    const { track, gaps } = buildTrack(readings);
    const trips = detectTrips(track, gaps);
    expect(trips).toHaveLength(2);
    expect(trips[1].startMs).toBe(T0 + 70 * 60 * 1000);
    expect(trips[0].endMs).toBe(T0 + 9.5 * 60 * 1000);
  });

  it('records the distance and moving minutes per trip', () => {
    const readings = series(0, 10);
    const { track, gaps } = buildTrack(readings);
    const trip = detectTrips(track, gaps)[0];
    expect(trip.distanceKm).toBeGreaterThan(5);
    expect(trip.durationMin).toBe(10);
    expect(trip.movingMin).toBe(10);
  });
});

describe('downsampling', () => {
  it('keeps at most the maximum number of points', () => {
    const readings: Reading[] = [];
    for (let i = 0; i < 2000; i++) readings.push(reading(i * 0.5));
    const { track } = buildTrack(readings);
    const points = downsampleTrack(track, 500);
    expect(points.length).toBeLessThanOrEqual(500);
    expect(points[0].t).toBe(track[0].t);
    expect(points[points.length - 1].t).toBe(track[track.length - 1].t);
  });

  it('keeps trip boundaries and gap edges', () => {
    const readings = [...series(0, 20), ...series(60, 80)];
    const { track, gaps } = buildTrack(readings);
    const trips = detectTrips(track, gaps);
    const points = downsampleTrack(track, 10);
    for (const trip of trips) {
      expect(points.some(p => p.t === trip.startMs)).toBe(true);
      expect(points.some(p => p.t === trip.endMs)).toBe(true);
    }
  });
});

describe('marker interpolation', () => {
  it('interpolates inside a trip when readings are less than 2 minutes apart', () => {
    const { track, gaps } = buildTrack(series(0, 5));
    const trips = detectTrips(track, gaps);
    expect(trips.length).toBeGreaterThan(0);
    const mid = track[2].t + 15000;
    const pos = interpolatePosition(track, mid);
    expect(pos?.interpolated).toBe(true);
    expect(pos!.lat).toBeGreaterThan(track[2].lat);
    expect(pos!.lat).toBeLessThan(track[3].lat);
  });

  it('does not interpolate across a gap', () => {
    const { track, gaps } = buildTrack([...series(0, 10), ...series(70, 80)]);
    detectTrips(track, gaps);
    const gapStartIndex = track.findIndex(p => p.t === T0 + 9.5 * 60 * 1000);
    const ms = (track[gapStartIndex].t + track[gapStartIndex + 1].t) / 2;
    const pos = interpolatePosition(track, ms);
    expect(pos?.interpolated).toBe(false);
    expect(pos!.lat).toBe(track[gapStartIndex].lat);
  });

  it('does not interpolate between two different trips', () => {
    // Two trips separated by a 15-minute data gap: the marker must snap, not slide.
    const readings = [...series(0, 5), ...series(20, 25)];
    const { track, gaps } = buildTrack(readings);
    const trips = detectTrips(track, gaps);
    expect(trips).toHaveLength(2);

    const boundaryIndex = track.findIndex(p => p.t === T0 + 4.5 * 60 * 1000);
    const jumped = track[boundaryIndex + 1];
    const ms = track[boundaryIndex].t + 5 * 60 * 1000; // still before the next reading
    const pos = interpolatePosition(track, ms);
    expect(pos!.interpolated).toBe(false);
    expect(pos!.lat).toBe(track[boundaryIndex].lat);
    expect(jumped.t - track[boundaryIndex].t).toBeGreaterThan(10 * 60 * 1000);
  });
});

describe('events', () => {
  const fence: Geofence = {
    id: 'g-1',
    tenantId: 't-1',
    name: 'Al Quoz Yard',
    kind: 'yard',
    shape: { type: 'circle', center: { lat: 25, lng: 55 }, radiusM: 300 },
    alertOnEnter: true,
    alertOnExit: true,
    assetIds: 'all',
    createdBy: 'u-1',
    createdAt: T0,
  };
  const otherFence: Geofence = { ...fence, id: 'g-2', tenantId: 't-2', name: 'Someone else’s fence' };

  it('adds trip start and stop pins', () => {
    const { track, gaps } = buildTrack(series(0, 10));
    const trips = detectTrips(track, gaps);
    const events = buildEvents({ track, trips, gaps, assetId: 'a-1' });
    expect(events.filter(e => e.kind === 'trip_start')).toHaveLength(1);
    expect(events.filter(e => e.kind === 'trip_stop')).toHaveLength(1);
  });

  it('adds an over-speed pin from the alert with its detail (WT-07, 104 km/h)', () => {
    const { track, gaps } = buildTrack(series(0, 10));
    const trips = detectTrips(track, gaps);
    const alerts: Alert[] = [
      { id: 'al-wt07-speed', assetId: 'a-1', type: 'overspeed', openedAt: T0 + 5 * 60000, detail: 'Over speed: 104 km/h' },
    ];
    const events = buildEvents({ track, trips, gaps, alerts, assetId: 'a-1' });
    const pin = events.find(e => e.kind === 'overspeed');
    expect(pin?.detail).toBe('Over speed: 104 km/h');
    expect(pin?.atMs).toBe(T0 + 5 * 60000);
  });

  it('includes only the viewer’s own geofences', () => {
    const { track, gaps } = buildTrack(series(0, 10));
    const trips = detectTrips(track, gaps);
    const geofenceEvents: GeofenceEvent[] = [
      { id: 'ge-1', geofenceId: 'g-1', assetId: 'a-1', type: 'exit', at: T0 + 6 * 60000 },
      { id: 'ge-2', geofenceId: 'g-2', assetId: 'a-1', type: 'enter', at: T0 + 7 * 60000 },
    ];
    const events = buildEvents({ track, trips, gaps, geofences: [fence], geofenceEvents, assetId: 'a-1' });
    const fences = events.filter(e => e.kind.startsWith('geofence'));
    expect(fences).toHaveLength(1);
    expect(fences[0].label).toContain('Al Quoz Yard');
    expect(events.some(e => e.label.includes(otherFence.name))).toBe(false);
  });

  it('shows refuel and fuel drop pins for Tier 2/3 only', () => {
    const readings: Reading[] = [
      reading(0, { fuelLevelPct: 60, canOdometerKm: 100 }),
      reading(1, { fuelLevelPct: 61 }),
      reading(2, { fuelLevelPct: 95 }),
      reading(3, { fuelLevelPct: 94, ignition: false, moving: false, speedKmh: 0 }),
      reading(5, { fuelLevelPct: 70, ignition: false, moving: false, speedKmh: 0 }),
    ];
    const { track, gaps } = buildTrack(readings);
    const fuel = detectFuelEvents(track);
    expect(fuel.map(f => f.kind)).toEqual(['refuel', 'fuel_drop']);

    const trips = detectTrips(track, gaps);
    const pinTier3 = buildEvents({ track, trips, gaps, assetId: 'a-1', tier: 3, canSupported: ['fuelLevel'] });
    expect(pinTier3.some(e => e.kind === 'refuel')).toBe(true);
    const pinTier1 = buildEvents({ track, trips, gaps, assetId: 'a-1', tier: 1, canSupported: [] });
    expect(pinTier1.some(e => e.kind === 'refuel' || e.kind === 'fuel_drop')).toBe(false);
  });
});

describe('buildPlaybackData', () => {
  it('returns a downsampled trail, the full track, trips and events together', () => {
    const readings = [...series(0, 20), ...series(60, 80)];
    const data = buildPlaybackData(readings, { assetId: 'a-1', maxPoints: 50 });
    expect(data.points.length).toBeLessThanOrEqual(50);
    expect(data.track.length).toBe(readings.length);
    expect(data.trips).toHaveLength(2);
    expect(data.gaps).toHaveLength(1);
    expect(data.events.length).toBeGreaterThan(0);
    expect(data.totalDistanceKm).toBeGreaterThan(0);
  });

  it('breaks drawn polylines at gaps so nothing is drawn across them', () => {
    const readings = [...series(0, 10), ...series(70, 80)];
    const { track } = buildTrack(readings);
    const segments = trackSegments(track);
    expect(segments).toHaveLength(2);
  });
});
