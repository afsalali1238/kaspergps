// Unit tests for the ETA maths (spec 11.14).
import { describe, it, expect } from 'vitest';
import {
  straightLineKm,
  roadDistanceKm,
  averageMovingSpeedKmh,
  roundToMinute,
  computeEta,
  minutesAway,
  isArrivedAt,
  type EtaReading,
} from '@/domain/eta';
import { ETA_ROAD_FACTOR, STALE_AFTER_SEC } from '@/config/thresholds';

const NOW = new Date('2026-10-06T10:00:00Z').getTime();

function reading(partial: Partial<EtaReading> & { lat: number; lng: number }): EtaReading {
  return {
    atMs: NOW - 60 * 1000,
    speedKmh: 60,
    moving: true,
    ...partial,
  };
}

// Jebel Ali Yard → Al Habtoor site (the seeded FB-12 booking destination)
const START = { lat: 25.0118, lng: 55.1132 };
const DEST = { name: 'Al Habtoor site, Al Barsha', lat: 25.113, lng: 55.2 };

describe('distance', () => {
  it('is zero for the same point', () => {
    expect(straightLineKm(START, START)).toBe(0);
  });

  it('applies the 1.3 road factor', () => {
    expect(roadDistanceKm(START, DEST)).toBeCloseTo(straightLineKm(START, DEST) * ETA_ROAD_FACTOR, 6);
  });

  it('matches a known distance within tolerance', () => {
    // ~14.8 km straight line between the two Dubai points above
    expect(straightLineKm(START, DEST)).toBeGreaterThan(14);
    expect(straightLineKm(START, DEST)).toBeLessThan(16);
  });

  it('treats 200 m as arrived and 300 m as not arrived', () => {
    expect(isArrivedAt({ lat: 25.0, lng: 55.0 }, { lat: 25.001, lng: 55.0 })).toBe(true); // ~111 m
    expect(isArrivedAt({ lat: 25.0, lng: 55.0 }, { lat: 25.003, lng: 55.0 })).toBe(false); // ~333 m
  });
});

describe('speed', () => {
  it('averages moving readings in the last 15 minutes only', () => {
    const readings: EtaReading[] = [
      reading({ lat: 25, lng: 55, speedKmh: 100, atMs: NOW - 40 * 60 * 1000 }), // too old
      reading({ lat: 25, lng: 55, speedKmh: 40, atMs: NOW - 10 * 60 * 1000 }),
      reading({ lat: 25, lng: 55, speedKmh: 60, atMs: NOW - 5 * 60 * 1000 }),
      reading({ lat: 25, lng: 55, speedKmh: 0, atMs: NOW - 2 * 60 * 1000, moving: false }),
    ];
    expect(averageMovingSpeedKmh(readings, NOW)).toBe(50);
  });

  it('defaults to 40 km/h when nothing moved in the window', () => {
    const readings = [reading({ lat: 25, lng: 55, speedKmh: 0, moving: false })];
    expect(averageMovingSpeedKmh(readings, NOW)).toBe(40);
  });

  it('clamps slow averages up to 25 and fast ones down to 80', () => {
    expect(averageMovingSpeedKmh([reading({ lat: 25, lng: 55, speedKmh: 8 })], NOW)).toBe(25);
    expect(averageMovingSpeedKmh([reading({ lat: 25, lng: 55, speedKmh: 120 })], NOW)).toBe(80);
  });
});

describe('computeEta', () => {
  it('rounds the arrival time to the minute', () => {
    // 25 km/h clamped minimum? no — use 50 km/h and a known distance
    const r = reading({ lat: START.lat, lng: START.lng, speedKmh: 50 });
    const eta = computeEta({ destination: DEST, readings: [r], nowMs: NOW });
    expect(eta.state).toBe('en_route');
    expect(eta.etaAt! % 60000).toBe(0);
    const expected = NOW + (roadDistanceKm(START, DEST) / 50) * 3600 * 1000;
    expect(eta.etaAt).toBe(roundToMinute(expected));
  });

  it('returns exactly { destinationName, etaAt, state } while en route', () => {
    const r = reading({ lat: START.lat, lng: START.lng, speedKmh: 50 });
    const eta = computeEta({ destination: DEST, readings: [r], nowMs: NOW });
    expect(Object.keys(eta).sort()).toEqual(['destinationName', 'etaAt', 'state']);
    expect(eta.destinationName).toBe('Al Habtoor site, Al Barsha');
  });

  it('is arrived when a reading is inside 200 m, at the arrival reading time', () => {
    const arrivedAt = NOW - 20 * 60 * 1000;
    const readings: EtaReading[] = [
      reading({ lat: START.lat, lng: START.lng, atMs: NOW - 60 * 60 * 1000 }),
      reading({ lat: 25.1131, lng: 55.2002, atMs: arrivedAt }),
    ];
    const eta = computeEta({ destination: DEST, readings, nowMs: NOW });
    expect(eta.state).toBe('arrived');
    expect(eta.etaAt).toBe(arrivedAt);
  });

  it('stays arrived even when the asset leaves later', () => {
    const readings: EtaReading[] = [
      reading({ lat: 25.1131, lng: 55.2002, atMs: NOW - 30 * 60 * 1000 }),
      reading({ lat: START.lat, lng: START.lng, atMs: NOW - 2 * 60 * 1000, speedKmh: 70 }),
    ];
    expect(computeEta({ destination: DEST, readings, nowMs: NOW }).state).toBe('arrived');
  });

  it('is unavailable when there is no reading after the link started', () => {
    const eta = computeEta({ destination: DEST, readings: [], nowMs: NOW });
    expect(eta.state).toBe('unavailable');
    expect(eta.etaAt).toBeNull();
    expect(Object.keys(eta).sort()).toEqual(['destinationName', 'etaAt', 'state']);
  });

  it('is unavailable when the last reading is older than S', () => {
    const fresh = reading({ lat: START.lat, lng: START.lng, atMs: NOW - (STALE_AFTER_SEC - 1) * 1000 });
    const old = reading({ lat: START.lat, lng: START.lng, atMs: NOW - (STALE_AFTER_SEC + 1) * 1000 });
    expect(computeEta({ destination: DEST, readings: [fresh], nowMs: NOW }).state).toBe('en_route');
    expect(computeEta({ destination: DEST, readings: [old], nowMs: NOW }).state).toBe('unavailable');
  });

  it('never exposes coordinates', () => {
    const r = reading({ lat: START.lat, lng: START.lng, speedKmh: 50 });
    const eta = computeEta({ destination: DEST, readings: [r], nowMs: NOW });
    const serialised = JSON.stringify(eta);
    expect(serialised).not.toContain('25.0118');
    expect(serialised).not.toContain('55.1132');
    expect(serialised).toContain('Al Habtoor site, Al Barsha');
  });

  it('reports minutes away', () => {
    expect(minutesAway(NOW + 18 * 60000 + 20000, NOW)).toBe(18);
    expect(minutesAway(NOW - 5 * 60000, NOW)).toBe(0);
  });
});
