// Movement planning for the telemetry simulator (spec §9). Pure planning:
// where an asset is and what it is doing, as segments of time. The simulator
// turns segments into readings (src/server/telemetry/simulator.ts).
//
// Times are UTC milliseconds. Shifts are Dubai local time (UTC+4, no DST), so
// "07:00" means `dayMs + 7h` where `dayMs` is the Dubai midnight from clock.ts.

import type { Asset, Site } from '@/domain/types';
import { db } from '@/server/db';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** A reading gap while a machine is carried between its yard and a rental site (spec §9: no interpolation across gaps). */
export const TRANSPORT_GAP_MS = 40 * MIN;

export interface Point { lat: number; lng: number }

/**
 * What the asset does in a stretch of time.
 * - `off`: ignition off, parked at `from`.
 * - `idle`: ignition on, not moving.
 * - `work`: ignition on, machine working at its site (plant, lifting, generators).
 * - `drive`: moving from `from` to `to` at `cruiseKmh` (clamped to 20–90 unless `clamp` is false).
 */
export interface Segment {
  mode: 'off' | 'idle' | 'work' | 'drive';
  fromMs: number;
  toMs: number;
  from: Point;
  to: Point;
  /** Position jitter in degrees (about 0.0001° ≈ 11 m). */
  jitter: number;
  cruiseKmh?: number;
  clamp?: boolean;
  /** Set by an anchor tail (spec §8.2) or a scripted event (spec §8.7) that must hold even where the asset is rented. */
  forced?: 'idle' | 'off';
  /** Plant moves within this radius of its site, in short moves (spec §9), in degrees. */
  moveRadius?: number;
}

export function haversineKm(a: Point, b: Point): number {
  const R = 6371;
  const t = Math.PI / 180;
  const dLat = (b.lat - a.lat) * t;
  const dLng = (b.lng - a.lng) * t;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingDeg(a: Point, b: Point): number {
  const t = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * t) * Math.cos(b.lat * t);
  const x = Math.cos(a.lat * t) * Math.sin(b.lat * t) - Math.sin(a.lat * t) * Math.cos(b.lat * t) * Math.cos((b.lng - a.lng) * t);
  return (Math.atan2(y, x) / t + 360) % 360;
}

export function siteById(id: string): Site | undefined {
  return db.getState().sites.find(s => s.id === id);
}

// ── Rentals: where a machine works while it is on rent ────────────────────────

export interface Stay {
  siteId: string;
  fromMs: number;
  toMs: number;
}

function ms(v: string | number): number {
  return typeof v === 'number' ? v : new Date(v).getTime();
}

/** When the rental ends: the cancel/close time, an early-end override, or the booked end. */
function rentalEndMs(bookingId: string, closedAt: string | number | undefined, end: string | number): number {
  if (closedAt !== undefined) return ms(closedAt);
  const override = db.getState().grantOverrides.find(o => o.bookingId === bookingId);
  if (override) return ms(override.endedAt);
  return ms(end);
}

/** Renter-site stays for an asset, from its bookings. Cancelled bookings never count. */
export function stayWindows(asset: Asset): Stay[] {
  return db.getState().bookings
    .filter(b => b.assetId === asset.id && b.renterSiteId && b.status !== 'cancelled')
    .map(b => ({
      siteId: b.renterSiteId as string,
      fromMs: ms(b.start),
      toMs: rentalEndMs(b.id, b.closedAt, b.end),
    }))
    .sort((a, b) => a.fromMs - b.fromMs);
}

/**
 * Where a rented machine is at `t`: the renter's site during the rental, the
 * transport gap around each boundary, or `null` when it is at its home site.
 */
export function stayAt(stays: Stay[], t: number): Stay | 'transit' | null {
  for (const s of stays) {
    if (t >= s.fromMs && t < s.toMs) return s;
    if (t >= s.fromMs - TRANSPORT_GAP_MS && t < s.fromMs) return 'transit';
    if (t >= s.toMs && t < s.toMs + TRANSPORT_GAP_MS) return 'transit';
  }
  return null;
}

// ── Day plans ─────────────────────────────────────────────────────────────────

const off = (at: Point, fromMs: number, toMs: number, jitter = 0.001): Segment =>
  ({ mode: 'off', fromMs, toMs, from: at, to: at, jitter });

/**
 * Plant on its site: shift time working, with short moves inside `moveRadius`
 * (about 0.0025° ≈ 280 m for plant, 0.001° ≈ 110 m for lifting).
 */
export function plantDay(home: Point, dayMs: number, jitter: number, moveRadius: number): Segment[] {
  return [
    off(home, dayMs, dayMs + 7 * HOUR, jitter),
    { mode: 'work', fromMs: dayMs + 7 * HOUR, toMs: dayMs + 18 * HOUR, from: home, to: home, jitter, moveRadius },
    off(home, dayMs + 18 * HOUR, dayMs + DAY, jitter),
  ];
}

/** Generator: stationary and running all day. GN-01 is switched off 02:00–02:30 on the anchor night (its fuel drop is at 02:10). */
export function generatorDay(home: Point, dayMs: number, jitter: number, offWindow?: { fromMs: number; toMs: number }): Segment[] {
  if (!offWindow) return [{ mode: 'work', fromMs: dayMs, toMs: dayMs + DAY, from: home, to: home, jitter }];
  return [
    { mode: 'work', fromMs: dayMs, toMs: offWindow.fromMs, from: home, to: home, jitter },
    { ...off(home, offWindow.fromMs, offWindow.toMs, jitter), forced: 'off' },
    { mode: 'work', fromMs: offWindow.toMs, toMs: dayMs + DAY, from: home, to: home, jitter },
  ];
}

/**
 * Road vehicle shift: a run out from the yard to one or two sites, a dwell at
 * each, then back to the yard. Speeds come from `cruise` and are clamped to 20–90 km/h.
 */
export function legsDay(
  home: Site,
  dayMs: number,
  shift: { startH: number; endH: number },
  cruise: [number, number],
  candidates: Site[],
  prng: () => number,
): Segment[] {
  const segs: Segment[] = [];
  let t = dayMs + shift.startH * HOUR + rand(prng, 0, 30) * MIN;
  const shiftEnd = dayMs + shift.endH * HOUR;
  let cur: Point = home.center;
  segs.push(off(home.center, dayMs, t));
  const others = candidates.filter(s => s.id !== home.id);
  const legs = others.length === 0 ? 0 : randInt(prng, 1, 2);
  for (let leg = 0; leg < legs && t < shiftEnd - 90 * MIN; leg++) {
    const dest = others[Math.floor(prng() * others.length)];
    const k = rand(prng, cruise[0], cruise[1]);
    const dur = legDuration(cur, dest.center, k);
    segs.push({ mode: 'drive', fromMs: t, toMs: t + dur, from: cur, to: dest.center, jitter: 0.00015, cruiseKmh: k, clamp: true });
    t += dur;
    const dwell = rand(prng, 30, 50) * MIN;
    segs.push({ mode: 'idle', fromMs: t, toMs: t + dwell, from: dest.center, to: dest.center, jitter: 0.0003 });
    t += dwell;
    cur = dest.center;
  }
  if (cur !== home.center) {
    const k = rand(prng, cruise[0], cruise[1]);
    const dur = legDuration(cur, home.center, k);
    segs.push({ mode: 'drive', fromMs: t, toMs: t + dur, from: cur, to: home.center, jitter: 0.00015, cruiseKmh: k, clamp: true });
    t += dur;
  }
  segs.push(off(home.center, t, dayMs + DAY));
  return segs;
}

function legDuration(a: Point, b: Point, kmh: number): number {
  return Math.max(10 * MIN, (haversineKm(a, b) / kmh) * HOUR);
}

/** The segment covering `t`, or the last one that ends before it, so a missing gap still has a position. */
export function segmentAt(segments: Segment[], t: number): Segment | null {
  for (const s of segments) if (t >= s.fromMs && t < s.toMs) return s;
  return null;
}

// ── Seeded helpers (local so this module has no simulator dependency) ─────────

function rand(prng: () => number, min: number, max: number): number {
  return min + prng() * (max - min);
}

function randInt(prng: () => number, min: number, max: number): number {
  return Math.floor(rand(prng, min, max + 1));
}

export { DAY, HOUR, MIN };
