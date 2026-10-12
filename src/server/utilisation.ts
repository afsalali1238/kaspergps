// Utilisation from the tracker's ignition line — what a Tier 1 or Tier 2 asset
// shows when it has no ECU meter to seal a Monthly Utilisation Certificate from
// (spec 11.3 "Utilisation", spec 4 "never present an estimate as a measure").
//
// The accumulation rule is the one buildEcuBreakdown uses in muc.ts, so both
// meters are computed the same way and can be compared honestly: hours are the
// elapsed time between two consecutive readings, attributed to the Dubai day the
// time actually falls in (an interval that crosses midnight is split, never
// double counted). A stretch longer than GAP_MINUTES with no reading is a gap —
// it is disclosed in gapMinutes and counted as neither state.
//
// Everything here is labelled `Estimated` and never billing-grade: a Tier 1/2
// hour figure must never be used to raise an invoice without the customer's
// agreement (spec 11.17), which billing enforces separately.

import type { Asset, Reading } from '@/domain/types';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { hasFeature } from '@/domain/features';
import { distanceKm } from '@/server/trips';
import { burnRateLph, engineHoursIn } from '@/server/cost';
import * as clock from '@/lib/clock';
import { FUEL_DROP_PCT } from '@/config/thresholds';

const DAY_MS = 86_400_000;
const GAP_MINUTES = 90;

const n1 = (v: number) => Number(v.toFixed(1));

function readingMs(r: Reading): number {
  return new Date(r.deviceTime).getTime();
}

// ── Where the hours come from ─────────────────────────────────────────────────

/** The words the UI shows next to an hours figure, per the asset's hardware. */
export type HoursSource = 'ECU' | 'ECU · partial' | 'Estimated' | 'Not measured';

export function hoursSourceFor(asset: Asset): HoursSource {
  if (hasFeature(asset, 'hours.ecu')) return 'ECU';
  if (hasFeature(asset, 'hours.ecuPartial')) return 'ECU · partial';
  if (hasFeature(asset, 'hours.ignition')) return 'Estimated';
  return 'Not measured';
}

/** Can this asset's utilisation be shown at all (i.e. does it report ignition)? */
export function showsUtilisation(asset: Asset): boolean {
  return hasFeature(asset, 'utilisation');
}

// ── Last-7-days ignition breakdown ────────────────────────────────────────────

export interface IgnitionDayBucket {
  /** Machine key, YYYY-MM-DD in Dubai. */
  key: string;
  /** Display date. */
  date: string;
  /** Ignition on and moving. */
  movingHours: number;
  /** Ignition on, standing still — the "idling" of a plant asset. */
  stationaryHours: number;
  /** Ignition off. */
  offHours: number;
  /** Minutes of missing data inside this day, disclosed not attributed. */
  gapMinutes: number;
}

export interface IgnitionBreakdown {
  days: IgnitionDayBucket[];
  /** Total minutes with no reading in the window (longer than the gap rule). */
  gapMinutes: number;
  /** Always `Estimated` — this meter is derived from the ignition line. */
  source: Extract<HoursSource, 'Estimated'>;
}

function emptyBucket(ms: number): IgnitionDayBucket {
  return {
    key: clock.dubaiDateKey(ms),
    date: clock.formatDubaiDate(ms),
    movingHours: 0,
    stationaryHours: 0,
    offHours: 0,
    gapMinutes: 0,
  };
}

/**
 * Per-day Moving / Ignition-on-stationary / Off hours between two instants.
 * One bucket per Dubai calendar day in the window, so a quiet day shows zeros
 * instead of disappearing off the chart.
 */
export function buildIgnitionBreakdown(asset: Asset, fromMs: number, toMs: number): IgnitionBreakdown {
  const readings = getReadingsForAsset(asset, fromMs, toMs)
    .slice()
    .sort((a, b) => readingMs(a) - readingMs(b));

  const days = new Map<string, IgnitionDayBucket>();
  for (let t = clock.startOfDubaiDay(fromMs); t <= toMs; t += DAY_MS) {
    const bucket = emptyBucket(t);
    days.set(bucket.key, bucket);
  }

  const addHours = (ms: number, field: 'movingHours' | 'stationaryHours' | 'offHours', hours: number) => {
    const bucket = days.get(clock.dubaiDateKey(ms));
    if (bucket && hours > 0) bucket[field] += hours;
  };

  let gapMinutes = 0;
  let prevMs: number | null = null;

  for (const r of readings) {
    const t = readingMs(r);
    const prev = prevMs;

    if (prev !== null && t > prev) {
      const minutes = (t - prev) / 60_000;
      if (minutes > GAP_MINUTES) {
        // A gap: no state claim, but the customer must see it.
        gapMinutes += Math.round(minutes);
        const bucket = days.get(clock.dubaiDateKey(t));
        if (bucket) bucket.gapMinutes += Math.round(minutes);
      } else {
        const field = !r.ignition ? 'offHours' : r.moving ? 'movingHours' : 'stationaryHours';
        const midnight = clock.startOfDubaiDay(t);
        if (prev >= midnight) {
          addHours(t, field, (t - prev) / 3_600_000);
        } else {
          // The interval straddles Dubai midnight — split it, never double count.
          addHours(prev, field, (midnight - prev) / 3_600_000);
          addHours(t, field, (t - midnight) / 3_600_000);
        }
      }
    }

    if (prev === null || t > prev) prevMs = t;
  }

  const ordered = [...days.values()]
    .map(d => ({
      ...d,
      movingHours: n1(d.movingHours),
      stationaryHours: n1(d.stationaryHours),
      offHours: n1(d.offHours),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return { days: ordered, gapMinutes, source: 'Estimated' };
}

/** The last seven Dubai days, ending at `nowMs`. */
export function last7DaysIgnition(asset: Asset, nowMs: number = clock.now()): IgnitionBreakdown {
  return buildIgnitionBreakdown(asset, clock.startOfDubaiDay(nowMs) - 6 * DAY_MS, nowMs);
}

// ── Today, for the map KPI strip and the asset header ─────────────────────────

export interface TodayView {
  /** Kilometres driven since Dubai midnight, from the trip rule (never interpolated). */
  distanceKm: number;
  /** Ignition-on hours since Dubai midnight — always derived from the ignition line. */
  ignitionHours: number;
  /** Always `Estimated`: this tile is ignition-on time, never ECU engine hours (J5.3). */
  source: Extract<HoursSource, 'Estimated'>;
}

/** Today's distance and ignition-on time for one asset (spec 11.3 Overview). */
export function todayFor(asset: Asset, nowMs: number = clock.now()): TodayView | null {
  const dayStart = clock.startOfDubaiDay(nowMs);
  const breakdown = buildIgnitionBreakdown(asset, dayStart, nowMs);
  const day = breakdown.days[breakdown.days.length - 1];
  if (!day) return null;
  return {
    distanceKm: n1(distanceKm(asset, dayStart, nowMs)),
    ignitionHours: n1(day.movingHours + day.stationaryHours),
    source: 'Estimated',
  };
}

/**
 * Engine hours the ECU metered since Dubai midnight, or null when the asset has
 * no ECU meter at all. Both the billing-grade and the partial adapter count
 * here; the tile says "ECU" and the source label on the asset page says which.
 */
export function engineHoursToday(asset: Asset, nowMs: number = clock.now()): number | null {
  const source = hoursSourceFor(asset);
  if (source !== 'ECU' && source !== 'ECU · partial') return null;
  return n1(Math.max(0, engineHoursIn(asset, clock.startOfDubaiDay(nowMs), nowMs)));
}

export interface FuelToday {
  litres: number;
  /** `ECU` only when the fuel counter is actually reporting; otherwise the
   *  class-average burn rate from cost.ts, which is a dummy rate. */
  source: 'ECU' | 'Estimated';
}

/**
 * Litres since Dubai midnight. Measured from the ECU's total-fuel counter when
 * the asset reports one; otherwise modelled from the same hours × dummy-rate
 * product the Cost & ROI screen uses, and labelled so the difference is visible.
 */
export function fuelToday(asset: Asset, nowMs: number = clock.now()): FuelToday | null {
  if (!hasFeature(asset, 'fuel.used')) return null;

  const dayStart = clock.startOfDubaiDay(nowMs);
  const readings = getReadingsForAsset(asset, dayStart, nowMs)
    .filter(r => r.fuelUsedL !== undefined)
    .sort((a, b) => readingMs(a) - readingMs(b));
  if (readings.length >= 2) {
    const first = readings[0].fuelUsedL ?? 0;
    const last = readings[readings.length - 1].fuelUsedL ?? 0;
    return { litres: n1(Math.max(0, last - first)), source: 'ECU' };
  }

  const hours = Math.max(0, engineHoursIn(asset, dayStart, nowMs));
  return { litres: n1(hours * burnRateLph(asset)), source: 'Estimated' };
}

/** A refuel shows as a step up in the level gauge: 5 points is far more than burn. */
export const REFUEL_RISE_PCT = 5;

export interface FuelWeekDay {
  /** Dubai date key, YYYY-MM-DD. */
  key: string;
  /** Display date, "5 Oct". */
  date: string;
  /** Last level-gauge reading of the day, or null when nothing was measured. */
  levelPct: number | null;
  /** Litres used in the day: the ECU counter when it reports, else the level gauge. */
  usedL: number | null;
  usedSource: 'ECU' | 'Estimated';
  /** The gauge stepped up: a refuel. */
  refuel: boolean;
  /** The gauge fell by FUEL_DROP_PCT or more with the engine off: a possible theft. */
  drop: boolean;
}

export interface FuelWeek {
  /** Seven Dubai days, oldest first, ending with today. */
  days: FuelWeekDay[];
  /** Does this asset have a level gauge at all? */
  hasLevel: boolean;
  /** Is the litres figure measured (fuel used counter) or modelled (gauge)? */
  hasUsedCounter: boolean;
}

/**
 * The Engine & fuel tab's seven-day series (spec 11.3): the level gauge per day,
 * litres used per day, and a refuel ▲ / drop ▼ marker wherever the readings show
 * one. Both markers come from the readings themselves — a rise of REFUEL_RISE_PCT
 * or more between two readings is a refill, and a fall of FUEL_DROP_PCT or more
 * inside 15 minutes with the engine off is the theft pattern of §12 — so the chart
 * and the alert tell the same story.
 */
export function fuelWeekFor(asset: Asset, nowMs: number = clock.now()): FuelWeek | null {
  const hasLevel = hasFeature(asset, 'fuel.level');
  const hasUsedCounter = hasFeature(asset, 'fuel.used');
  if (!hasLevel && !hasUsedCounter) return null;

  const dayStart = clock.startOfDubaiDay(nowMs);
  const fromMs = dayStart - 6 * DAY_MS;
  const readings = getReadingsForAsset(asset, fromMs, nowMs)
    .slice()
    .sort((a, b) => readingMs(a) - readingMs(b));

  const tank = asset.tankLitres ?? 300;
  const days = new Map<string, FuelWeekDay>();
  for (let t = fromMs; t <= nowMs; t += DAY_MS) {
    const key = clock.dubaiDateKey(t);
    if (days.has(key)) continue;
    days.set(key, {
      key,
      date: clock.formatDubaiDate(t),
      levelPct: null,
      usedL: null,
      usedSource: hasUsedCounter ? 'ECU' : 'Estimated',
      refuel: false,
      drop: false,
    });
  }

  let prev: Reading | null = null;
  for (const r of readings) {
    const day = days.get(clock.dubaiDateKey(readingMs(r)));
    if (!day) { prev = r; continue; }
    if (r.fuelLevelPct !== undefined) day.levelPct = n1(r.fuelLevelPct);

    const prevLevel = prev?.fuelLevelPct;
    if (prev && prevLevel !== undefined && r.fuelLevelPct !== undefined) {
      const gapMs = readingMs(r) - readingMs(prev);
      const delta = r.fuelLevelPct - prevLevel;
      if (delta >= REFUEL_RISE_PCT) day.refuel = true;
      if (delta <= -FUEL_DROP_PCT && gapMs <= 15 * 60_000 && !r.ignition) day.drop = true;
    }
    prev = r;
  }

  // Litres per day. The counter is measured; without one the gauge's falls are
  // converted with the tank size and the day is labelled Estimated.
  const byDay = new Map<string, Reading[]>();
  for (const r of readings) {
    const key = clock.dubaiDateKey(readingMs(r));
    const list = byDay.get(key);
    if (list) list.push(r); else byDay.set(key, [r]);
  }
  for (const [key, list] of byDay) {
    const day = days.get(key);
    if (!day) continue;
    if (hasUsedCounter) {
      const counted = list.filter(r => r.fuelUsedL !== undefined);
      if (counted.length >= 2) {
        day.usedL = n1(Math.max(0, (counted[counted.length - 1].fuelUsedL ?? 0) - (counted[0].fuelUsedL ?? 0)));
      }
    } else {
      let litres = 0;
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1].fuelLevelPct;
        const b = list[i].fuelLevelPct;
        if (a !== undefined && b !== undefined && b < a) litres += ((a - b) / 100) * tank;
      }
      day.usedL = n1(litres);
    }
  }

  return { days: Array.from(days.values()), hasLevel, hasUsedCounter };
}

export interface FleetTodayTotals {
  /** Sum of today's ECU engine hours over the assets that meter them. */
  engineHours: number;
  engineAssets: number;
  /** Sum of today's litres over the assets that report fuel use. */
  fuelLitres: number;
  fuelAssets: number;
  /** How many of those litres came from the class-average rate, not the ECU. */
  fuelEstimatedAssets: number;
}

/**
 * Fleet totals for the map's KPI strip (spec 11.2). An asset that can't produce
 * a number contributes nothing and is not counted — the strip never back-fills
 * a gap with zero, and the caller hides a tile whose asset count is 0.
 */
export function fleetTodayTotals(assets: Asset[], nowMs: number = clock.now()): FleetTodayTotals {
  const totals: FleetTodayTotals = {
    engineHours: 0, engineAssets: 0, fuelLitres: 0, fuelAssets: 0, fuelEstimatedAssets: 0,
  };
  for (const asset of assets) {
    const hours = engineHoursToday(asset, nowMs);
    if (hours !== null) {
      totals.engineHours = n1(totals.engineHours + hours);
      totals.engineAssets += 1;
    }
    const fuel = fuelToday(asset, nowMs);
    if (fuel !== null) {
      totals.fuelLitres = n1(totals.fuelLitres + fuel.litres);
      totals.fuelAssets += 1;
      if (fuel.source === 'Estimated') totals.fuelEstimatedAssets += 1;
    }
  }
  return totals;
}
