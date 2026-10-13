// Trip playback maths (spec 11.15). Pure functions: callers pass readings and
// times; nothing here reads the clock or the store.
//
// Rules enforced here:
//  - a gap longer than the stale window is "no data": never drawn, never
//    interpolated, and playback jumps across it;
//  - a position is interpolated only between two readings that both had
//    ignition on and are less than PLAYBACK_INTERPOLATE_MAX_SEC apart;
//  - the trail is capped at PLAYBACK_DOWNSAMPLE_MAX points and is split
//    wherever a gap sits.

import type { Reading } from '@/domain/types';
import { groupTrips, readingTime } from '@/domain/trips';
import {
  FUEL_DROP_PCT,
  FUEL_REFUEL_RISE_PCT,
  IDLE_SPEED_KMH,
  PLAYBACK_DOWNSAMPLE_MAX,
  PLAYBACK_INTERPOLATE_MAX_SEC,
  POWER_CUT_V,
  POWER_OK_V,
  STALE_AFTER_SEC,
} from '@/config/thresholds';

export type PlaybackState = 'moving' | 'stationary_on' | 'off' | 'no_data';

export interface Span {
  fromMs: number;
  toMs: number;
  state: PlaybackState;
}

export const PLAYBACK_SPEEDS = [1, 10, 60, 300] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

/** Each step with reduced motion moves the playhead this far. */
export const REDUCED_MOTION_STEP_MS = 5 * 60_000;

/** A silence longer than this is a data gap (same window as the status rules). */
export const PLAYBACK_GAP_MS = STALE_AFTER_SEC * 1000;

export function readingMs(r: Reading): number {
  return Date.parse(r.deviceTime);
}

export function stateOf(r: Reading): PlaybackState {
  if (!r.ignition) return 'off';
  return r.speedKmh > IDLE_SPEED_KMH ? 'moving' : 'stationary_on';
}

/** Readings sorted by time. Returns a copy; the input is untouched. */
export function sortReadings(readings: Reading[]): Reading[] {
  return [...readings].sort((a, b) => readingMs(a) - readingMs(b));
}

/**
 * Colour spans across [fromMs, toMs]. Each reading holds its state until the
 * next reading, but for at most PLAYBACK_GAP_MS; after that the time is
 * "no_data" until the next reading. Adjacent spans with the same state merge.
 */
export function buildSpans(readings: Reading[], fromMs: number, toMs: number): Span[] {
  const sorted = sortReadings(readings).filter(r => {
    const t = readingMs(r);
    return t >= fromMs && t <= toMs;
  });
  const spans: Span[] = [];
  const push = (from: number, to: number, state: PlaybackState) => {
    if (to <= from) return;
    const last = spans[spans.length - 1];
    if (last && last.state === state && last.toMs === from) {
      last.toMs = to;
    } else {
      spans.push({ fromMs: from, toMs: to, state });
    }
  };

  if (sorted.length === 0) {
    push(fromMs, toMs, 'no_data');
    return spans;
  }

  const first = readingMs(sorted[0]);
  push(fromMs, first, 'no_data');

  for (let i = 0; i < sorted.length; i++) {
    const t = readingMs(sorted[i]);
    const end = i + 1 < sorted.length ? readingMs(sorted[i + 1]) : toMs;
    const state = stateOf(sorted[i]);
    if (end - t > PLAYBACK_GAP_MS) {
      push(t, t + PLAYBACK_GAP_MS, state);
      push(t + PLAYBACK_GAP_MS, end, 'no_data');
    } else {
      push(t, end, state);
    }
  }
  return spans;
}

/** The no_data span containing tMs, if any. */
export function gapAt(spans: Span[], tMs: number): Span | null {
  for (const s of spans) {
    if (s.state === 'no_data' && tMs >= s.fromMs && tMs < s.toMs) return s;
  }
  return null;
}

/**
 * Move the playhead forward by wall-clock time × speed. If the move would
 * enter a no_data span, the playhead lands on the span's end instead and the
 * span is reported so the UI can show the gap banner. Never past endMs.
 */
export function advancePlayhead(
  tMs: number,
  wallElapsedMs: number,
  speed: PlaybackSpeed,
  endMs: number,
  spans: Span[],
): { timeMs: number; jumped: Span | null } {
  return moveTo(tMs, Math.min(endMs, tMs + wallElapsedMs * speed), endMs, spans);
}

/** One reduced-motion step: move forward by REDUCED_MOTION_STEP_MS, jumping gaps. */
export function stepPlayhead(tMs: number, endMs: number, spans: Span[]): { timeMs: number; jumped: Span | null } {
  return moveTo(tMs, Math.min(endMs, tMs + REDUCED_MOTION_STEP_MS), endMs, spans);
}

/** Move from tMs to next; if the move passes into a gap, land on the gap's end. */
function moveTo(tMs: number, next: number, endMs: number, spans: Span[]): { timeMs: number; jumped: Span | null } {
  for (const s of spans) {
    if (s.state === 'no_data' && s.fromMs > tMs && s.fromMs <= next) {
      return { timeMs: Math.min(endMs, s.toMs), jumped: s };
    }
  }
  return { timeMs: next, jumped: null };
}

export interface Fix {
  lat: number;
  lng: number;
  heading: number;
  state: PlaybackState;
  interpolated: boolean;
  reading: Reading;
}

/**
 * Where the vehicle is at tMs. Returns null before the first reading, and
 * no_data when the last reading is older than the gap window. Interpolates
 * only inside a single trip (ignition on at both ends) and under 2 minutes.
 */
export function positionAt(sorted: Reading[], tMs: number): Fix | { kind: 'no_data' } | null {
  let lo = 0;
  let hi = sorted.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (readingMs(sorted[mid]) <= tMs) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx < 0) return null;

  const a = sorted[idx];
  const ta = readingMs(a);
  if (tMs - ta > PLAYBACK_GAP_MS) return { kind: 'no_data' };

  const b = sorted[idx + 1];
  if (b) {
    const tb = readingMs(b);
    const gap = tb - ta;
    const bothOn = a.ignition && b.ignition;
    if (bothOn && gap < PLAYBACK_INTERPOLATE_MAX_SEC * 1000 && tMs > ta) {
      const f = (tMs - ta) / gap;
      return {
        lat: a.lat + (b.lat - a.lat) * f,
        lng: a.lng + (b.lng - a.lng) * f,
        heading: a.heading,
        state: stateOf(a),
        interpolated: true,
        reading: a,
      };
    }
  }

  return {
    lat: a.lat,
    lng: a.lng,
    heading: a.heading,
    state: stateOf(a),
    interpolated: false,
    reading: a,
  };
}

export interface TrailPoint {
  lat: number;
  lng: number;
  ms: number;
}

/** Great-circle distance in km between two points. */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distance along the trail lines only. Gaps are never bridged. */
export function trailDistanceKm(lines: TrailPoint[][]): number {
  let total = 0;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) total += distanceKm(line[i - 1], line[i]);
  }
  return total;
}

/**
 * The trail up to tMs (from fromMs), as polylines split at gaps, with at most
 * maxPoints points in total. Thinning keeps the first and last point of each
 * line, so the trail still reaches the current position.
 */
export function trailUntil(
  sorted: Reading[],
  fromMs: number,
  tMs: number,
  maxPoints: number = PLAYBACK_DOWNSAMPLE_MAX,
): TrailPoint[][] {
  const lines: TrailPoint[][] = [];
  let current: TrailPoint[] = [];
  let prevMs = -Infinity;
  for (const r of sorted) {
    const t = readingMs(r);
    if (t < fromMs) continue;
    if (t > tMs) break;
    if (current.length > 0 && t - prevMs > PLAYBACK_GAP_MS) {
      lines.push(current);
      current = [];
    }
    current.push({ lat: r.lat, lng: r.lng, ms: t });
    prevMs = t;
  }
  if (current.length > 0) lines.push(current);

  const total = lines.reduce((n, l) => n + l.length, 0);
  if (total <= maxPoints) return lines;

  // Each line can keep one extra point from rounding and one for its last point.
  const budget = Math.max(1, maxPoints - lines.length * 2);
  const stride = Math.ceil(total / budget);
  return lines.map(line => {
    const kept = line.filter((_, i) => i % stride === 0);
    const last = line[line.length - 1];
    if (kept[kept.length - 1] !== last) kept.push(last);
    return kept;
  });
}

// ── Event pins (spec 11.15) ───────────────────────────────────────────────────

/** A reading at or above this speed is an over-speed. The planned WT-07 event runs at 104 km/h. */
export const OVERSPEED_KMH = 100;

export type PinKind =
  | 'trip_start'
  | 'trip_stop'
  | 'harsh'
  | 'overspeed'
  | 'fuel_drop'
  | 'refuel'
  | 'power_cut'
  | 'towing'
  | 'geofence_enter'
  | 'geofence_exit';

export interface PlaybackPin {
  atMs: number;
  kind: PinKind;
  label: string;
  /** Where it happened, when the readings can say: the player draws these on the map. */
  lat?: number;
  lng?: number;
}

/** The accelerometer events in the readings (§8.7), in words (§11.4). */
export const HARSH_WORDS = {
  harsh_brake: 'Harsh braking',
  harsh_accel: 'Harsh acceleration',
  harsh_corner: 'Harsh cornering',
} as const;

/**
 * Pins stacked into rows for the scrubber: two events close in time would otherwise sit
 * on the same spot and one would cover the other (a 7-day window can hold a trip's end
 * and an over-speed two minutes apart). Greedy: a pin goes into the first row whose last
 * pin is at least PIN_ROW_GAP_PCT to the left, so a row never overlaps itself.
 */
/**
 * The map marker for a pin, as HTML for a Leaflet divIcon. The title can hold a
 * geofence name, which users type, so it is escaped: a fence named
 * `"><img src=x onerror=…>` must stay text, never markup.
 */
export function pinMarkerHtml(colour: string, title: string): string {
  const safe = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const safeColour = /^#[0-9a-fA-F]{3,8}$/.test(colour) ? colour : '#888888';
  return `<span title="${safe}" style="display:block;width:12px;height:12px;border-radius:50%;background:${safeColour};border:2px solid #fff;box-shadow:0 0 2px rgba(0,0,0,.5)"></span>`;
}

export const PIN_ROW_GAP_PCT = 1.8; // about 12 px on a 700 px scrubber

export function pinRows(pins: PlaybackPin[], fromMs: number, toMs: number): { pin: PlaybackPin; row: number }[] {
  const total = Math.max(1, toMs - fromMs);
  const rowEnds: number[] = [];
  return pins.map(pin => {
    const x = ((pin.atMs - fromMs) / total) * 100;
    let row = rowEnds.findIndex(last => x - last >= PIN_ROW_GAP_PCT);
    if (row < 0) {
      row = rowEnds.length;
      rowEnds.push(x);
    } else {
      rowEnds[row] = x;
    }
    return { pin, row };
  });
}

export interface PinGeofenceEvent {
  atMs: number;
  type: 'enter' | 'exit';
  geofenceName: string;
}

/**
 * Where a pin sits, when the readings can say: the position of the reading in force at
 * atMs (the last one at or before it, else the first one after it). Named apart from
 * positionAt(), which answers a different question about the playhead.
 */
function pinPosition(sorted: Reading[], atMs: number): { lat: number; lng: number } | undefined {
  let found: Reading | undefined;
  for (const r of sorted) {
    if (readingTime(r) <= atMs) found = r;
    else {
      found = found ?? r;
      break;
    }
  }
  return found ? { lat: found.lat, lng: found.lng } : undefined;
}

/**
 * Trip boundaries get pins only in a window with this many trips or fewer. Since C1 a
 * machine working on one site shuffles at walking pace (not a trip) and trams to the work
 * face once a shift, so a week of an excavator is about 7 trips and a week of a truck
 * 15 to 20: their boundary pins are useful there. A month window (30+ trips) would carry
 * dozens of identical pins that say nothing the coloured state track does not already
 * show, so they stay off. The Trips tab list itself is never filtered.
 */
export const PIN_TRIP_MAX = 20;

/**
 * Pins for one playback window (spec 11.15): where trips start and end (when the window
 * is short enough for them to mean something, see PIN_TRIP_MAX), harsh events, over-speed,
 * refuels and fuel drops (Tier 2/3 only), power cuts, towing and the viewer's own geofence
 * events. Every pin carries its position when the readings can place it, so the player can
 * draw it on the map too. Pins are sorted by time.
 *
 * All of them come from the readings (or, for geofences, from the caller's already
 * permission-checked events): the same source the screens and the alerts use.
 */
export function buildPins(args: {
  readings: Reading[];
  tier: 1 | 2 | 3;
  fromMs: number;
  toMs: number;
  geofenceEvents: PinGeofenceEvent[];
}): PlaybackPin[] {
  const { tier, fromMs, toMs, geofenceEvents } = args;
  const sorted = sortReadings(args.readings).filter(r => {
    const t = readingTime(r);
    return t >= fromMs && t <= toMs;
  });
  const pins: PlaybackPin[] = [];
  const where = (atMs: number) => pinPosition(sorted, atMs);

  // Trip start and stop, from the same rule the Trips tab uses.
  const trips = groupTrips(sorted);
  if (trips.length <= PIN_TRIP_MAX) {
    for (const trip of trips) {
      pins.push({ atMs: trip.startMs, kind: 'trip_start', label: 'Trip started', ...where(trip.startMs) });
      pins.push({ atMs: trip.endMs, kind: 'trip_stop', label: 'Trip ended', ...where(trip.endMs) });
    }
  }

  // Harsh events, as the reading carries them.
  for (const r of sorted) {
    const event = r.event;
    if (event !== 'harsh_brake' && event !== 'harsh_accel' && event !== 'harsh_corner') continue;
    pins.push({ atMs: readingTime(r), kind: 'harsh', label: HARSH_WORDS[event], lat: r.lat, lng: r.lng });
  }

  // Over-speed, one pin per run, at its first reading, labelled with the run's top speed.
  let run: Reading[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const top = Math.max(...run.map(r => r.speedKmh));
    const first = run[0];
    pins.push({
      atMs: readingTime(first),
      kind: 'overspeed',
      label: `Over speed ${Math.round(top)} km/h`,
      lat: first.lat,
      lng: first.lng,
    });
    run = [];
  };
  for (const r of sorted) {
    const broken = run.length > 0 && readingTime(r) - readingTime(run[run.length - 1]) > PLAYBACK_GAP_MS;
    if (broken) flush();
    if (r.speedKmh >= OVERSPEED_KMH) run.push(r);
    else flush();
  }
  flush();

  // Towing: rolling (above the idle speed) with the ignition off.
  let tow: Reading[] = [];
  const flushTow = () => {
    if (tow.length === 0) return;
    const first = tow[0];
    pins.push({
      atMs: readingTime(first),
      kind: 'towing',
      label: 'Moved with ignition off',
      lat: first.lat,
      lng: first.lng,
    });
    tow = [];
  };
  for (const r of sorted) {
    const broken = tow.length > 0 && readingTime(r) - readingTime(tow[tow.length - 1]) > PLAYBACK_GAP_MS;
    if (broken) flushTow();
    if (!r.ignition && r.speedKmh > IDLE_SPEED_KMH) tow.push(r);
    else flushTow();
  }
  flushTow();

  // Power cut: the vehicle feed goes dead while the tracker keeps reporting. A single
  // low reading is not enough — like a geofence crossing, the drop has to hold for the
  // next reading (or be the last one), so a flapping feed does not look like a cut every
  // time it dips.
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const r = sorted[i];
    if (prev.extVoltage <= POWER_OK_V || r.extVoltage >= POWER_CUT_V) continue;
    if (readingTime(r) - readingTime(prev) > PLAYBACK_GAP_MS) continue;
    const next = sorted[i + 1];
    const holds = !next || next.extVoltage < POWER_CUT_V;
    if (!holds) continue;
    pins.push({
      atMs: readingTime(r),
      kind: 'power_cut',
      label: 'Power cut — on tracker battery',
      lat: r.lat,
      lng: r.lng,
    });
  }

  // Fuel: refills and thefts/drops. Only Tier 2/3 have a gauge, and a change spread
  // across a data gap is not measured, so it gives no pin.
  if (tier >= 2) {
    let fuelPrev: Reading | null = null;
    for (const r of sorted) {
      if (r.fuelLevelPct === undefined) continue;
      if (fuelPrev && fuelPrev.fuelLevelPct !== undefined && readingTime(r) - readingTime(fuelPrev) <= PLAYBACK_GAP_MS) {
        const delta = r.fuelLevelPct - fuelPrev.fuelLevelPct;
        if (delta >= FUEL_REFUEL_RISE_PCT) {
          pins.push({
            atMs: readingTime(r),
            kind: 'refuel',
            label: `Refuelled ${Math.round(delta)} points`,
            lat: r.lat,
            lng: r.lng,
          });
        }
        if (delta <= -FUEL_DROP_PCT) {
          pins.push({
            atMs: readingTime(r),
            kind: 'fuel_drop',
            label: `Fuel fell ${Math.round(-delta)} points`,
            lat: r.lat,
            lng: r.lng,
          });
        }
      }
      fuelPrev = r;
    }
  }

  for (const e of geofenceEvents) {
    if (e.atMs < fromMs || e.atMs > toMs) continue;
    pins.push({
      atMs: e.atMs,
      kind: e.type === 'enter' ? 'geofence_enter' : 'geofence_exit',
      label: `${e.type === 'enter' ? 'Entered' : 'Left'} ${e.geofenceName}`,
      ...where(e.atMs),
    });
  }

  return pins.sort((a, b) => a.atMs - b.atMs);
}
