// ETA maths tests (spec 11.14).
import { describe, it, expect } from 'vitest';
import {
  averageMovingSpeedKmh, computeEta, etaSpeedKmh, haversineKm,
  ETA_SPEED_DEFAULT_KMH, ETA_SPEED_MAX_KMH, ETA_SPEED_MIN_KMH,
} from './eta';
import type { Reading } from '@/domain/types';

function reading(atMs: number, speedKmh: number): Reading {
  return {
    trackerId: 'tr-x',
    deviceTime: new Date(atMs).toISOString(),
    receivedAt: new Date(atMs).toISOString(),
    lat: 25, lng: 55, speedKmh, heading: 0, satellites: 10,
    ignition: true, moving: speedKmh > 3, extVoltage: 24, intBattery: 4, gsm: 3,
    gnssOdometerKm: 0,
  };
}

const NOW = new Date('2026-10-06T10:00:00+04:00').getTime();

describe('eta — haversine', () => {
  it('is zero for the same point', () => {
    expect(haversineKm({ lat: 25, lng: 55 }, { lat: 25, lng: 55 })).toBe(0);
  });

  it('measures about 1 degree of latitude as 111 km', () => {
    const d = haversineKm({ lat: 25, lng: 55 }, { lat: 26, lng: 55 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});

describe('eta — speed', () => {
  it('averages moving readings inside the last 15 minutes only', () => {
    const readings = [
      reading(NOW - 5 * 60 * 1000, 40),
      reading(NOW - 10 * 60 * 1000, 60),
      reading(NOW - 30 * 60 * 1000, 90), // outside the window
      reading(NOW - 2 * 60 * 1000, 0), // not moving
    ];
    expect(averageMovingSpeedKmh(readings, NOW)).toBe(50);
  });

  it('returns null when nothing moved', () => {
    expect(averageMovingSpeedKmh([reading(NOW - 60 * 1000, 0)], NOW)).toBeNull();
  });

  it('clamps to 25–80 km/h and defaults to 40', () => {
    expect(etaSpeedKmh(null)).toBe(ETA_SPEED_DEFAULT_KMH);
    expect(etaSpeedKmh(5)).toBe(ETA_SPEED_MIN_KMH);
    expect(etaSpeedKmh(120)).toBe(ETA_SPEED_MAX_KMH);
    expect(etaSpeedKmh(52)).toBe(52);
  });
});

describe('eta — computeEta', () => {
  it('rounds the arrival time to the minute', () => {
    const eta = computeEta({ lat: 25, lng: 55 }, { lat: 25.1, lng: 55 }, NOW, 40);
    expect(eta.state).toBe('en_route');
    expect(eta.etaAt % 60000).toBe(0);
    // ~11.1 km straight line × 1.3 = ~14.4 km at 40 km/h ≈ 22 min
    expect(eta.etaAt).toBeGreaterThan(NOW + 15 * 60000);
    expect(eta.etaAt).toBeLessThan(NOW + 30 * 60000);
  });

  it('reports arrived within 200 m of the destination', () => {
    const eta = computeEta({ lat: 25, lng: 55 }, { lat: 25.0005, lng: 55 }, NOW, 40);
    expect(eta.state).toBe('arrived');
    expect(eta.etaAt).toBe(NOW);
  });

  it('keeps an arrival sticky once recorded', () => {
    const eta = computeEta({ lat: 25, lng: 56 }, { lat: 25, lng: 55 }, NOW, 40, NOW - 10 * 60000);
    expect(eta.state).toBe('arrived');
    expect(eta.etaAt).toBe(NOW - 10 * 60000);
  });
});
