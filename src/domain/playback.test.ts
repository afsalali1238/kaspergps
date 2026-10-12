import { describe, it, expect } from 'vitest';
import type { Reading } from '@/domain/types';
import { groupTrips } from '@/domain/trips';
import {
  advancePlayhead,
  buildPins,
  buildSpans,
  gapAt,
  positionAt,
  sortReadings,
  stateOf,
  stepPlayhead,
  trailDistanceKm,
  trailUntil,
  PIN_ROW_GAP_PCT,
  PLAYBACK_GAP_MS,
  REDUCED_MOTION_STEP_MS,
  pinRows,
  pinMarkerHtml,
  type PlaybackPin,
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

describe('event pins (spec 11.15)', () => {
  const window = { fromMs: T0 - min(5), toMs: T0 + min(60) };
  const pin = (over: { readings: Reading[]; tier?: 1 | 2 | 3; geofenceEvents?: { atMs: number; type: 'enter' | 'exit'; geofenceName: string }[] }) =>
    buildPins({
      readings: over.readings,
      tier: over.tier ?? 1,
      fromMs: window.fromMs,
      toMs: window.toMs,
      geofenceEvents: over.geofenceEvents ?? [],
    });

  const of = (pins: PlaybackPin[], kind: PlaybackPin['kind']) => pins.filter(p => p.kind === kind);

  it('one over-speed pin per run, at its first reading, labelled with the top speed', () => {
    const readings = [
      reading(0, { speedKmh: 60 }),
      reading(min(1), { speedKmh: 101 }),
      reading(min(2), { speedKmh: 104 }),
      reading(min(3), { speedKmh: 90 }),
      reading(min(4), { speedKmh: 102 }),
    ];
    const pins = of(pin({ readings }), 'overspeed');
    expect(pins.map(p => [p.kind, p.label])).toEqual([
      ['overspeed', 'Over speed 104 km/h'],
      ['overspeed', 'Over speed 102 km/h'],
    ]);
    expect(pins[0].atMs).toBe(T0 + min(1));
  });

  it('a silence inside an over-speed run starts a new pin', () => {
    const readings = [reading(0, { speedKmh: 105 }), reading(min(11), { speedKmh: 105 })];
    expect(pin({ readings }).filter(p => p.kind === 'overspeed')).toHaveLength(2);
  });

  it('a fuel drop of 10 points or more gives a pin on Tier 2 and 3, never on Tier 1', () => {
    const readings = [
      reading(0, { fuelLevelPct: 80 }),
      reading(min(1), { fuelLevelPct: 65 }),
    ];
    expect(of(pin({ readings, tier: 2 }), 'fuel_drop').map(p => p.kind)).toEqual(['fuel_drop']);
    expect(of(pin({ readings, tier: 3 }), 'fuel_drop')[0].label).toBe('Fuel fell 15 points');
    expect(of(pin({ readings, tier: 1 }), 'fuel_drop')).toEqual([]);
  });

  it('a fuel drop across a data gap is not measured, so it gives no pin', () => {
    const readings = [
      reading(0, { fuelLevelPct: 80 }),
      reading(min(20), { fuelLevelPct: 40 }),
    ];
    expect(of(pin({ readings, tier: 3 }), 'fuel_drop')).toEqual([]);
  });

  it('a refill of 5 points or more gives a pin on Tier 2 and 3, never on Tier 1', () => {
    const readings = [
      reading(0, { fuelLevelPct: 40 }),
      reading(min(1), { fuelLevelPct: 44 }),
      reading(min(2), { fuelLevelPct: 60 }),
    ];
    expect(of(pin({ readings, tier: 2 }), 'refuel').map(p => p.label)).toEqual(['Refuelled 16 points']);
    expect(of(pin({ readings, tier: 3 }), 'refuel')).toHaveLength(1);
    // 4 points on its own is below the 5-point rule.
    expect(of(pin({ readings: readings.slice(0, 2), tier: 3 }), 'refuel')).toEqual([]);
    expect(of(pin({ readings, tier: 1 }), 'refuel')).toEqual([]);
  });

  it('a refill across a data gap is not measured, so it gives no pin', () => {
    const readings = [
      reading(0, { fuelLevelPct: 40 }),
      reading(min(20), { fuelLevelPct: 90 }),
    ];
    expect(of(pin({ readings, tier: 3 }), 'refuel')).toEqual([]);
  });

  it('harsh events in the readings become pins, in words, with their place', () => {
    const readings = [
      reading(0),
      reading(min(1), { event: 'harsh_brake', lat: 25.4, lng: 55.6 }),
      reading(min(2), { event: 'harsh_accel' }),
      reading(min(3), { event: 'harsh_corner' }),
    ];
    const pins = of(pin({ readings }), 'harsh');
    expect(pins.map(p => p.label)).toEqual(['Harsh braking', 'Harsh acceleration', 'Harsh cornering']);
    expect(pins[0].atMs).toBe(T0 + min(1));
    expect(pins[0].lat).toBe(25.4);
    expect(pins[0].lng).toBe(55.6);
  });

  it('a power cut becomes one pin where the vehicle feed goes dead', () => {
    const readings = [
      reading(0, { extVoltage: 24 }),
      reading(min(1), { extVoltage: 12.4 }),
      reading(min(2), { extVoltage: 0.1, lat: 25.5, lng: 55.7 }),
      reading(min(3), { extVoltage: 0 }),
      reading(min(4), { extVoltage: 0.1 }),
    ];
    const pins = of(pin({ readings }), 'power_cut');
    expect(pins).toHaveLength(1);
    expect(pins[0].label).toBe('Power cut — on tracker battery');
    expect(pins[0].atMs).toBe(T0 + min(2));
    expect([pins[0].lat, pins[0].lng]).toEqual([25.5, 55.7]);
  });

  it('a single low reading that rebounds gives no power-cut pin', () => {
    const readings = [
      reading(0, { extVoltage: 24 }),
      reading(min(1), { extVoltage: 0.4 }),
      reading(min(2), { extVoltage: 26 }),
    ];
    expect(of(pin({ readings }), 'power_cut')).toEqual([]);
  });

  it('rolling with the ignition off is a towing pin, one per run', () => {
    const readings = [
      reading(0, { speedKmh: 0 }),
      // Parked, then dragged: moving with the ignition off.
      reading(min(1), { ignition: false, moving: false, speedKmh: 4 }),
      reading(min(2), { ignition: false, moving: false, speedKmh: 4 }),
      reading(min(3), { ignition: false, moving: false, speedKmh: 0 }),
      reading(min(4), { ignition: true, speedKmh: 40 }), // driven away: not towing
    ];
    const pins = of(pin({ readings }), 'towing');
    expect(pins.map(p => p.label)).toEqual(['Moved with ignition off']);
    expect(pins[0].atMs).toBe(T0 + min(1));
  });

  it('a long window full of short trips gets no trip-boundary pins', () => {
    // An excavator working on one site shuffles about: the trip rule calls each shuffle a
    // trip, and 30 of them would fill the scrubber with pins that repeat the state colours.
    const readings = Array.from({ length: 30 }, (_, i) => [
      reading(i * min(20), { speedKmh: 40 }),
      reading(i * min(20) + min(6), { speedKmh: 0 }),
    ]).flat();
    const pins = pin({ readings });
    expect(of(pins, 'trip_start')).toEqual([]);
    expect(of(pins, 'trip_stop')).toEqual([]);
    // The trips themselves are still there for the Trips tab; only the pins are dropped.
    expect(groupTrips(readings).length).toBeGreaterThan(3);
  });

  it('a trip start and its stop become pins at the trip\'s own times', () => {
    const readings = [
      reading(0, { speedKmh: 0 }), // parked with the engine off
      reading(min(1), { ignition: false, moving: false, speedKmh: 0 }),
      reading(min(2), { speedKmh: 30 }), // trip starts
      reading(min(3), { speedKmh: 50 }), // the trip's last moving reading
      reading(min(9), { speedKmh: 0 }), // stood still 6 min: the trip ends, at min(3)
      reading(min(20), { speedKmh: 0 }),
    ];
    const pins = pin({ readings });
    // The stop sits on the trip's last reading, the same time and place the Trips tab
    // reports as the trip's end — the readings only say it had stopped when the next one
    // arrived, and inventing a time in between is the interpolation the spec forbids.
    expect(of(pins, 'trip_start').map(p => p.atMs)).toEqual([T0 + min(2)]);
    expect(of(pins, 'trip_stop').map(p => p.atMs)).toEqual([T0 + min(3)]);
    expect(pins.filter(p => p.kind === 'trip_start' || p.kind === 'trip_stop').map(p => p.label))
      .toEqual(['Trip started', 'Trip ended']);
  });

  it('a geofence pin carries the place the machine was at that time', () => {
    const readings = [
      reading(0, { lat: 25.2, lng: 55.3 }),
      reading(min(4), { lat: 25.9, lng: 55.9 }),
      reading(min(9), { lat: 26.1, lng: 56.1 }),
    ];
    const pins = pin({
      readings,
      geofenceEvents: [{ atMs: T0 + min(6), type: 'exit', geofenceName: 'Yard' }],
    });
    const fence = of(pins, 'geofence_exit')[0];
    expect(fence.label).toBe('Left Yard');
    expect(fence.lat).toBe(25.9);
    expect(fence.lng).toBe(55.9);
  });

  it('geofence events inside the window become pins; those outside do not', () => {
    const pins = pin({
      readings: [],
      geofenceEvents: [
        { atMs: T0 + min(5), type: 'enter', geofenceName: 'Gate' },
        { atMs: T0 + min(6), type: 'exit', geofenceName: 'Gate' },
        { atMs: T0 + min(600), type: 'enter', geofenceName: 'Later' },
      ],
    });
    expect(pins.map(p => [p.kind, p.label])).toEqual([
      ['geofence_enter', 'Entered Gate'],
      ['geofence_exit', 'Left Gate'],
    ]);
  });

  it('readings outside the window are ignored, and pins come back in time order', () => {
    const readings = [reading(-min(30), { speedKmh: 120 }), reading(min(2), { speedKmh: 110 })];
    const pins = pin({
      readings,
      geofenceEvents: [{ atMs: T0 + min(1), type: 'enter', geofenceName: 'Gate' }],
    });
    expect(of(pins, 'geofence_enter').map(p => p.kind)).toEqual(['geofence_enter']);
    expect(of(pins, 'overspeed').map(p => p.kind)).toEqual(['overspeed']);
    expect(pins.findIndex(p => p.kind === 'geofence_enter')).toBeLessThan(pins.findIndex(p => p.kind === 'overspeed'));
  });

  it('no readings and no events give no pins', () => {
    expect(pin({ readings: [] })).toEqual([]);
  });

  it('pins close in time are stacked into rows instead of covering each other', () => {
    const pins: PlaybackPin[] = [
      { atMs: T0, kind: 'trip_start', label: 'Trip started' },
      { atMs: T0 + 30_000, kind: 'overspeed', label: 'Over speed 104 km/h' },
      { atMs: T0 + 6 * 3_600_000, kind: 'refuel', label: 'Refuelled 40 points' },
    ];
    const rows = pinRows(pins, T0 - min(5), T0 + min(24 * 60));
    // Half a minute apart is under the row gap: the second pin moves to its own row.
    expect(rows.map(r => r.row)).toEqual([0, 1, 0]);
    expect(rows.map(r => r.pin.atMs)).toEqual(pins.map(p => p.atMs));
    expect(rows[0].row).toBe(0);
  });

  it('a row never holds two pins that would overlap on the scrubber', () => {
    const pins: PlaybackPin[] = Array.from({ length: 40 }, (_, i) => ({
      atMs: T0 + i * 20_000,
      kind: 'trip_start' as const,
      label: 'Trip started',
    }));
    const fromMs = T0 - min(5);
    const toMs = T0 + min(20);
    const rows = pinRows(pins, fromMs, toMs);
    expect(rows).toHaveLength(40);
    const total = toMs - fromMs;
    const byRow = new Map<number, number[]>();
    for (const { pin: p, row } of rows) {
      const xs = byRow.get(row) ?? [];
      xs.push(((p.atMs - fromMs) / total) * 100);
      byRow.set(row, xs);
    }
    // They cannot all share one row: pins 20 seconds apart over 25 minutes sit closer
    // together than the gap, so the layout alternates rows.
    expect(byRow.size).toBeGreaterThan(1);
    for (const xs of byRow.values()) {
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(PIN_ROW_GAP_PCT);
      }
    }
  });
});

describe('pin marker HTML', () => {
  it('escapes a user-typed geofence name, so it stays text', () => {
    const html = pinMarkerHtml('#0ca678', 'Entered "><img src=x onerror=alert(1)> · 09:12');
    expect(html).not.toContain('<img');
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
    expect(html.match(/<span/g)).toHaveLength(1);
  });

  it('only accepts a hex colour', () => {
    expect(pinMarkerHtml('red;background:url(x)', 't')).toContain('background:#888888');
  });
});
