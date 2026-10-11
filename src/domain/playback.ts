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
import {
  IDLE_SPEED_KMH,
  PLAYBACK_DOWNSAMPLE_MAX,
  PLAYBACK_INTERPOLATE_MAX_SEC,
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
