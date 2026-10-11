import { describe, it, expect } from 'vitest';
import type { Reading } from '@/domain/types';
import {
  HISTORY_DAY_MS,
  HISTORY_CUSTOM_MAX_DAYS,
  buildHistoryRows,
  canColumnsFor,
  resolvePeriod,
} from './history';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const min = (n: number) => n * 60_000;

function reading(t: number, over: Partial<Reading> = {}): Reading {
  return {
    trackerId: 'trk-1',
    deviceTime: new Date(t).toISOString(),
    receivedAt: new Date(t).toISOString(),
    lat: 25.2,
    lng: 55.3,
    speedKmh: 30,
    heading: 0,
    satellites: 10,
    ignition: true,
    moving: true,
    extVoltage: 13.8,
    intBattery: 4,
    gsm: 4,
    gnssOdometerKm: 0,
    ...over,
  } as Reading;
}

describe('resolvePeriod', () => {
  it('defaults to a 24 h window ending now', () => {
    const r = resolvePeriod({ period: '24h', nowMs: NOW, floorMs: null });
    expect(r).toEqual({ ok: true, fromMs: NOW - HISTORY_DAY_MS, toMs: NOW, clampedToFloor: false });
  });

  it('offers a 7 day window', () => {
    const r = resolvePeriod({ period: '7d', nowMs: NOW, floorMs: null });
    expect(r).toMatchObject({ ok: true, fromMs: NOW - 7 * HISTORY_DAY_MS });
  });

  it('refuses a custom range that starts after it ends', () => {
    const r = resolvePeriod({ period: 'custom', nowMs: NOW, customFromMs: NOW, customToMs: NOW - 1000, floorMs: null });
    expect(r).toEqual({ ok: false, error: 'from_after_to' });
  });

  it('refuses a custom range longer than the cap', () => {
    const r = resolvePeriod({
      period: 'custom',
      nowMs: NOW,
      customFromMs: NOW - (HISTORY_CUSTOM_MAX_DAYS + 1) * HISTORY_DAY_MS,
      customToMs: NOW,
      floorMs: null,
    });
    expect(r).toEqual({ ok: false, error: 'too_long' });
  });

  it('caps a custom end time at now', () => {
    const r = resolvePeriod({ period: 'custom', nowMs: NOW, customFromMs: NOW - min(60), customToMs: NOW + min(60), floorMs: null });
    expect(r).toMatchObject({ ok: true, toMs: NOW });
  });

  it('clamps a renter range to their window floor and flags it', () => {
    const floor = NOW - 2 * HISTORY_DAY_MS;
    const r = resolvePeriod({ period: '7d', nowMs: NOW, floorMs: floor });
    expect(r).toMatchObject({ ok: true, fromMs: floor, clampedToFloor: true });
  });

  it('refuses a range that ends before the renter window opened', () => {
    const floor = NOW - HISTORY_DAY_MS;
    const r = resolvePeriod({ period: 'custom', nowMs: NOW, customFromMs: NOW - 5 * HISTORY_DAY_MS, customToMs: NOW - 3 * HISTORY_DAY_MS, floorMs: floor });
    expect(r).toEqual({ ok: false, error: 'before_floor' });
  });
});

describe('buildHistoryRows', () => {
  it('interleaves readings with gap rows in time order', () => {
    const readings = [reading(NOW - min(60)), reading(NOW - min(59)), reading(NOW - min(20))];
    const rows = buildHistoryRows(readings, NOW - min(60), NOW);
    const gaps = rows.filter(r => r.kind === 'gap');
    expect(gaps.length).toBeGreaterThan(0);
    const times = rows.map(r => r.timeMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('shows a gap row for a silence longer than the gap window', () => {
    const readings = [reading(NOW - min(60)), reading(NOW - min(30))];
    const rows = buildHistoryRows(readings, NOW - min(60), NOW - min(30));
    const gap = rows.find(r => r.kind === 'gap');
    expect(gap).toBeDefined();
  });

  it('shows no gap rows when readings are dense', () => {
    const readings = Array.from({ length: 10 }, (_, i) => reading(NOW - min(10) + i * 60_000));
    const rows = buildHistoryRows(readings, NOW - min(10), NOW - min(1));
    expect(rows.filter(r => r.kind === 'gap')).toEqual([]);
  });
});

describe('canColumnsFor', () => {
  it('returns only the CAN columns the asset supports, in fixed order', () => {
    const cols = canColumnsFor(['rpm', 'fuelLevel', 'gnss', 'speed']);
    expect(cols.map(c => c.key)).toEqual(['fuelLevel', 'rpm']);
  });

  it('returns no columns for a Tier 1 asset', () => {
    expect(canColumnsFor(['gnss', 'speed', 'ignition'])).toEqual([]);
  });

  it('reads the matching reading field', () => {
    const [fuel] = canColumnsFor(['fuelLevel']);
    expect(fuel.read(reading(NOW, { fuelLevelPct: 42 }))).toBe(42);
    expect(fuel.read(reading(NOW))).toBeUndefined();
  });
});
