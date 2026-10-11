import { describe, it, expect } from 'vitest';
import type { Reading } from '@/domain/types';
import {
  advancePlayhead,
  buildSpans,
  gapAt,
  positionAt,
  sortReadings,
  stateOf,
  stepPlayhead,
  trailDistanceKm,
  trailUntil,
  PLAYBACK_GAP_MS,
  REDUCED_MOTION_STEP_MS,
} from './playback';

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

describe('stateOf', () => {
  it('colours moving, stationary-on and off', () => {
    expect(stateOf(reading(0, { ignition: true, speedKmh: 40 }))).toBe('moving');
    expect(stateOf(reading(0, { ignition: true, speedKmh: 0 }))).toBe('stationary_on');
    expect(stateOf(reading(0, { ignition: false, speedKmh: 0 }))).toBe('off');
  });
});

describe('buildSpans', () => {
  it('reports the whole window as no data when there are no readings', () => {
    const spans = buildSpans([], T0, T0 + min(30));
    expect(spans).toEqual([{ fromMs: T0, toMs: T0 + min(30), state: 'no_data' }]);
  });

  it('turns a silence longer than the gap window into no_data', () => {
    const readings = [
      reading(0),
      reading(min(1)),
      reading(min(2)),
      reading(min(2) + min(20)), // 20 min silence, longer than the 10 min window
    ];
    const spans = buildSpans(readings, T0, T0 + min(25));
    // The last reading holds its state for 10 min (to 12 min), then no data until 22 min.
    const gap = gapAt(spans, T0 + min(15));
    expect(gap).not.toBeNull();
    expect(gap!.fromMs).toBe(T0 + min(2) + PLAYBACK_GAP_MS);
    expect(gap!.toMs).toBe(T0 + min(22));
  });

  it('never extends a reading state across a gap', () => {
    const readings = [reading(0, { speedKmh: 40 }), reading(min(30), { speedKmh: 40 })];
    const spans = buildSpans(readings, T0, T0 + min(30));
    expect(gapAt(spans, T0 + min(15))).not.toBeNull();
    expect(spans.find(s => s.state === 'moving' && s.fromMs <= T0 + min(15) && s.toMs > T0 + min(15))).toBeUndefined();
  });

  it('keeps no_data before the first reading', () => {
    const spans = buildSpans([reading(min(5))], T0, T0 + min(10));
    expect(spans[0]).toEqual({ fromMs: T0, toMs: T0 + min(5), state: 'no_data' });
  });
});

describe('positionAt', () => {
  it('returns null before the first reading', () => {
    expect(positionAt([reading(min(5))], T0)).toBeNull();
  });

  it('reports no_data when the last fix is older than the gap window', () => {
    const sorted = sortReadings([reading(0)]);
    expect(positionAt(sorted, T0 + min(15))).toEqual({ kind: 'no_data' });
  });

  it('interpolates between two ignition-on readings under 2 minutes apart', () => {
    const sorted = sortReadings([
      reading(0, { lat: 25.0, lng: 55.0 }),
      reading(min(1), { lat: 25.2, lng: 55.2 }),
    ]);
    const fix = positionAt(sorted, T0 + 30_000);
    expect(fix).toMatchObject({ interpolated: true });
    expect((fix as { lat: number }).lat).toBeCloseTo(25.1, 6);
    expect((fix as { lng: number }).lng).toBeCloseTo(55.1, 6);
  });

  it('does not interpolate when one side has ignition off', () => {
    const sorted = sortReadings([
      reading(0, { lat: 25.0 }),
      reading(min(1), { lat: 25.2, ignition: false, speedKmh: 0 }),
    ]);
    const fix = positionAt(sorted, T0 + 30_000);
    expect(fix).toMatchObject({ interpolated: false, lat: 25.0 });
  });

  it('does not interpolate across a gap, even with both sides ignition on', () => {
    const sorted = sortReadings([
      reading(0, { lat: 25.0 }),
      reading(min(5), { lat: 25.5 }),
    ]);
    const fix = positionAt(sorted, T0 + min(2));
    expect(fix).toMatchObject({ interpolated: false, lat: 25.0 });
  });
});

describe('advancePlayhead and stepPlayhead', () => {
  const readings = [reading(0), reading(min(1)), reading(min(30)), reading(min(31))];
  const endMs = T0 + min(31);
  const spans = buildSpans(readings, T0, endMs);

  it('moves by wall time times speed', () => {
    const r = advancePlayhead(T0, 1000, 60, endMs, spans);
    expect(r.timeMs).toBe(T0 + 60_000);
    expect(r.jumped).toBeNull();
  });

  it('jumps the whole gap and never lands inside it', () => {
    // Playhead at 1 min; 10 min of wall time at 1x reaches the gap at 11 min.
    const r = advancePlayhead(T0 + min(1), min(10), 1, endMs, spans);
    expect(r.jumped).not.toBeNull();
    expect(r.timeMs).toBe(T0 + min(30));
    expect(gapAt(spans, r.timeMs)).toBeNull();
  });

  it('never moves past the end', () => {
    const dense = Array.from({ length: 32 }, (_, i) => reading(min(i)));
    const denseSpans = buildSpans(dense, T0, endMs);
    expect(advancePlayhead(T0, min(10), 300, endMs, denseSpans).timeMs).toBe(endMs);
  });

  it('reduced-motion step moves by the fixed step and also jumps gaps', () => {
    expect(stepPlayhead(T0, endMs, spans).timeMs).toBe(T0 + REDUCED_MOTION_STEP_MS);
    // From 7 min one 5-minute step reaches 12 min, past the gap start at 11 min.
    const r = stepPlayhead(T0 + min(7), endMs, spans);
    expect(r.timeMs).toBe(T0 + min(30));
    expect(r.jumped).not.toBeNull();
  });
});

describe('trailDistanceKm', () => {
  it('sums distance within lines and never bridges a gap', () => {
    // Two 1-degree latitude hops (~111 km each) in one line, then a far-off line.
    const lines = [
      [
        { lat: 25, lng: 55, ms: 0 },
        { lat: 26, lng: 55, ms: 1 },
        { lat: 27, lng: 55, ms: 2 },
      ],
      [{ lat: 40, lng: 55, ms: 3 }],
    ];
    const km = trailDistanceKm(lines);
    expect(km).toBeGreaterThan(220);
    expect(km).toBeLessThan(224);
  });
});

describe('trailUntil', () => {
  it('returns every point when no cap is given', () => {
    const many = Array.from({ length: 6000 }, (_, i) => reading(i * 1000));
    const lines = trailUntil(sortReadings(many), T0, T0 + 5999 * 1000, Number.POSITIVE_INFINITY);
    expect(lines.flat().length).toBe(6000);
  });

  it('splits the trail at gaps', () => {
    const sorted = sortReadings([reading(0), reading(min(1)), reading(min(30)), reading(min(31))]);
    const lines = trailUntil(sorted, T0, T0 + min(31));
    expect(lines.map(l => l.length)).toEqual([2, 2]);
  });

  it('stops at the current time', () => {
    const sorted = sortReadings([reading(0), reading(min(1)), reading(min(2))]);
    const lines = trailUntil(sorted, T0, T0 + min(1));
    expect(lines.flat().length).toBe(2);
  });

  it('caps the trail at 5,000 points and keeps the latest point', () => {
    const many = Array.from({ length: 20_000 }, (_, i) => reading(i * 1000, { lat: 25 + i / 1e6 }));
    const sorted = sortReadings(many);
    const end = T0 + 19_999 * 1000;
    const lines = trailUntil(sorted, T0, end);
    const total = lines.reduce((n, l) => n + l.length, 0);
    expect(total).toBeLessThanOrEqual(5000);
    const flat = lines.flat();
    expect(flat[flat.length - 1].ms).toBe(end);
  });
});
