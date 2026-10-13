// ECU engine hours: the machine's own hour count, not the tracker's. Lives in its
// own module so the telemetry simulator and the MUC code can both use it without
// an import cycle.
//
// C2 (UI-UPGRADE §9.1): the hours put on a machine vary from day to day. Each
// asset has its own working level, and each Dubai day its own factor (a Friday is
// mostly a day off on site), so last month's engine hours, idle, fuel and
// utilisation differ per asset instead of repeating one flat figure. The
// day factors are deterministic (seeded by asset code and day), so the same
// asset always gives the same meter, and the meter stays monotonic.

import type { Asset } from '@/domain/types';
import { ANCHOR_MS } from '@/server/seed/data';

const DAY_MS = 86400000;
const DUBAI_OFFSET_MS = 4 * 3600000;

/** Mean engine hours per day the simulator puts on each kind of asset. */
export const BEHAVIOUR_HOURS_PER_DAY: Record<Asset['behaviour'], number> = {
  parked: 1,
  works_at_site: 9,
  drives_between_sites: 6,
  stationary_24h: 20, // a generator runs most of the day and night
  light_vehicle_day: 4,
};

/** Spec §8.2: ECU engine hours shown today for the Tier 3 assets. */
const ECU_HOURS_AT_ANCHOR: Record<string, number> = {
  'EX-04': 8420,
  'BD-02': 14980,
  // Oil change logged at 2,000 h on 1 Oct; about 20 h a day since (§8.10: plan Ok).
  'GN-01': 2100,
};

const n1 = (v: number) => Math.round(v * 10) / 10;

/** Hours on the machine's ECU at the seed anchor. Assets not listed get a stable value from their code. */
export function ecuHoursAtAnchor(asset: Asset): number {
  const override = ECU_HOURS_AT_ANCHOR[asset.code];
  if (override !== undefined) return override;
  let h = 0;
  for (const ch of asset.code) h = (h * 31 + ch.charCodeAt(0)) % 9000;
  return 500 + h;
}

// ── Day-to-day variation ──────────────────────────────────────────────────────

/** A stable 0–1 value from a string (FNV-1a, then a mix). */
function unit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Dubai day number (days since 1970-01-01 in Dubai). */
function dubaiDayIndex(ms: number): number {
  return Math.floor((ms + DUBAI_OFFSET_MS) / DAY_MS);
}

/** Start of a Dubai day number, in UTC ms. */
function dubaiDayStartMs(day: number): number {
  return day * DAY_MS - DUBAI_OFFSET_MS;
}

/** The asset's own working level: some machines are busier than others (0.8–1.1). */
function assetLevel(asset: Asset): number {
  return 0.8 + unit(`${asset.code}|level`) * 0.3;
}

/** 1970-01-01 was a Thursday; Friday is the site day off in Dubai. */
function isFriday(day: number): boolean {
  return ((day % 7) + 7) % 7 === 1;
}

/**
 * Engine hours on one Dubai day. The mean over a month stays close to
 * BEHAVIOUR_HOURS_PER_DAY; a generator runs every day, site plant mostly rests on
 * a Friday, and a parked machine only runs now and then (a start-up check).
 */
export function engineHoursOnDay(asset: Asset, day: number): number {
  const mean = BEHAVIOUR_HOURS_PER_DAY[asset.behaviour] ?? 4;
  const u = unit(`day:${day}:${asset.code}`);
  const level = assetLevel(asset);
  switch (asset.behaviour) {
    case 'parked':
      // About one day in six, 3–9 h (a short job or a check); otherwise off.
      return u < 1 / 6 ? n1((3 + unit(`hours:${day}:${asset.code}`) * 6) * level) : 0;
    case 'stationary_24h':
      return n1(Math.min(24, mean * (0.85 + u * 0.3)));
    case 'works_at_site':
    case 'light_vehicle_day':
      if (isFriday(day)) return u < 0.3 ? n1(mean * 0.5 * level) : 0;
      return n1(mean * level * (0.8 + u * 0.55));
    default:
      return n1(mean * level * (0.6 + u * 0.8));
  }
}

// Cumulative hours, per asset, over a window of days around the anchor.
const WINDOW_DAYS = 800;
const ANCHOR_DAY = dubaiDayIndex(ANCHOR_MS);
const FIRST_DAY = ANCHOR_DAY - WINDOW_DAYS;
const LAST_DAY = ANCHOR_DAY + WINDOW_DAYS;
const prefixCache = new Map<string, Float64Array>();

/** prefix[i] = hours on the days FIRST_DAY … FIRST_DAY + i − 1. */
function prefixFor(asset: Asset): Float64Array {
  const key = `${asset.code}|${asset.behaviour}`;
  let p = prefixCache.get(key);
  if (!p) {
    p = new Float64Array(LAST_DAY - FIRST_DAY + 2);
    for (let d = FIRST_DAY; d <= LAST_DAY; d++) {
      p[d - FIRST_DAY + 1] = p[d - FIRST_DAY] + engineHoursOnDay(asset, d);
    }
    prefixCache.set(key, p);
  }
  return p;
}

/**
 * Hours the asset ran from the start of the window to `atMs`. Inside a day the
 * hours accrue evenly over the 24 h (the prototype's rule since J2).
 */
function cumulativeHours(asset: Asset, atMs: number): number {
  const mean = BEHAVIOUR_HOURS_PER_DAY[asset.behaviour] ?? 4;
  const p = prefixFor(asset);
  const day = dubaiDayIndex(atMs);
  if (day < FIRST_DAY) return (atMs - dubaiDayStartMs(FIRST_DAY)) / DAY_MS * mean;
  if (day > LAST_DAY) return p[p.length - 1] + (atMs - dubaiDayStartMs(LAST_DAY + 1)) / DAY_MS * mean;
  const within = (atMs - dubaiDayStartMs(day)) / DAY_MS;
  return p[day - FIRST_DAY] + within * engineHoursOnDay(asset, day);
}

/** Engine hours the asset ran between two moments (never negative). */
export function engineHoursBetween(asset: Asset, fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0;
  return Math.max(0, cumulativeHours(asset, toMs) - cumulativeHours(asset, fromMs));
}

/** ECU engine hours at a moment: the anchor value, moved by the hours run since. Monotonic. */
export function ecuHoursAt(asset: Asset, atMs: number): number {
  const delta = cumulativeHours(asset, atMs) - cumulativeHours(asset, ANCHOR_MS);
  return n1(Math.max(0, ecuHoursAtAnchor(asset) + delta));
}

/** How much of an average day this Dubai day ran (1 = the behaviour's mean). For the fuel model. */
export function dayLoadFactor(asset: Asset, atMs: number): number {
  const mean = BEHAVIOUR_HOURS_PER_DAY[asset.behaviour] ?? 4;
  return mean > 0 ? engineHoursOnDay(asset, dubaiDayIndex(atMs)) / mean : 0;
}
