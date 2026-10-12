// Telemetry simulator — generates readings on demand per tracker per day and caches them.
// Never pre-generates everything. Caches per tracker per day.
//
// Spec §9. Each day becomes a list of segments (where the asset is and what it is
// doing: movement.ts), and the segments are sampled into readings here: every 30 s
// while the engine is on, every 10 min while parked. Fuel comes from fuel.ts and
// CAN values only for the parameters the asset's adapter supports.
// Architecture rule 9: all time from clock.ts (here Date.now() is allowed as it IS the clock module).

import type { Reading, Asset } from '@/domain/types';
import { db, type DbRow } from '@/server/db';
import { ANCHOR_MS, dubaiAt } from '@/server/seed/data';
import { ecuHoursAt } from '@/server/telemetry/ecu';
import {
  bearingDeg, haversineKm, plantDay, generatorDay, legsDay, segmentAt, stayAt, stayWindows,
  siteById, type Segment, type Point, type Stay,
} from '@/server/telemetry/movement';
import {
  fuelStateAt, instantRateLph, GN01_DROP_AT, GN01_OFF_FROM, GN01_OFF_TO,
} from '@/server/telemetry/fuel';
import * as clock from '@/lib/clock';
import { OFFLINE_AFTER_SEC, STALE_AFTER_SEC, WORKING_LOAD_PCT } from '@/config/thresholds';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const DUBAI_OFFSET_MS = 4 * HOUR;
const ENGINE_ON_STEP_MS = 30 * 1000;
const PARKED_STEP_MS = 10 * MIN;

type Mode = 'off' | 'idle' | 'work' | 'drive';

// ── Cache ─────────────────────────────────────────────────────────────────────

// (asset, tracker) → dayMs → readings[]. Keyed by asset too, so a tracker moved
// to another asset never serves the old asset's readings.
const cache = new Map<string, Map<number, Reading[]>>();

/** The machine's operating mode for each raw reading, read when CAN values are added. */
const modeOf = new WeakMap<Reading, Mode>();

// ── Status computation ─────────────────────────────────────────────────────────

export function computeStatus(asset: Asset, sessionMs: number = clock.now()): 'live' | 'idle' | 'stale' | 'offline' | 'unknown' | 'no_tracker' {
  const tracker = currentTrackerFor(asset);
  if (!tracker) return 'no_tracker';
  if (tracker.stockStatus === 'paired') {
    // Check if any reading exists
    const hasReading = hasAnyReading(asset);
    if (!hasReading) return 'unknown';
    const lastReading = lastReadingFor(asset);
    if (!lastReading) return 'unknown';
    const ageSec = (sessionMs - new Date(lastReading.deviceTime).getTime()) / 1000;
    if (ageSec > OFFLINE_AFTER_SEC) return 'offline';
    if (ageSec > STALE_AFTER_SEC) return 'stale';
    // Idle: engine on and not moving. A machine under load (spec §12, WORKING_LOAD_PCT)
    // is working, not idle, even when it stands still.
    const working = lastReading.engineLoadPct !== undefined && lastReading.engineLoadPct >= WORKING_LOAD_PCT;
    if (lastReading.speedKmh < 3 && lastReading.ignition && !working) return 'idle';
    return 'live';
  }
  return 'no_tracker';
}

function currentTrackerFor(asset: Asset): DbRow<'trackers'> | null {
  // Find the current pairing (explicit swap tracking)
  const currentPairing = db.getState().pairings.find(p => p.assetId === asset.id && p.to === null);
  if (currentPairing) return db.getState().trackers.find(t => t.id === currentPairing.trackerId) ?? null;
  // Fallback: use the tracker's assetId field (implicit pairing from seed)
  return db.getState().trackers.find(t => t.assetId === asset.id && t.stockStatus === 'paired') ?? null;
}

// How far back to look for a reading: a stale or offline asset can be days
// behind, and the status rules need its last reading, not "no data".
const LOOKBACK_DAYS = 40;

/** The newest day that has a reading for this asset, or null when it never reported. */
function newestReadingsDay(asset: Asset): Reading[] | null {
  const tracker = currentTrackerFor(asset);
  if (!tracker) return null;
  const now = clock.now();
  const anchorDayStart = clock.startOfDubaiDay(now);
  for (let d = 0; d <= LOOKBACK_DAYS; d++) {
    const dayMs = anchorDayStart - d * DAY;
    const readings = getReadingsForDay(asset, tracker, dayMs)
      .filter(r => new Date(r.deviceTime).getTime() <= now);
    if (readings.length > 0) return readings;
  }
  return null;
}

function hasAnyReading(asset: Asset): boolean {
  return newestReadingsDay(asset) !== null;
}

function lastReadingFor(asset: Asset): Reading | null {
  const readings = newestReadingsDay(asset);
  if (!readings) return null;
  return readings.reduce((latest, r) =>
    new Date(r.deviceTime).getTime() > new Date(latest.deviceTime).getTime() ? r : latest);
}

// ── Antenna fitting check ──────────────────────────────────────────────────────

export function isCanReadingAvailable(asset: Asset, deviceTimeMs: number): boolean {
  const adapter = db.getState().adapters.find(a => a.assetId === asset.id);
  if (!adapter) return false;
  const fittingAt = adapter.fittedAt ? new Date(adapter.fittedAt).getTime() : 0;
  return deviceTimeMs >= fittingAt;
}

// ── Reading generation ─────────────────────────────────────────────────────────

export function getReadingsForAsset(asset: Asset, startMs: number, endMs: number): Reading[] {
  const tracker = currentTrackerFor(asset);
  if (!tracker) return [];

  const results: Reading[] = [];
  const dayStart = clock.startOfDubaiDay(startMs);

  for (let dayMs = dayStart; dayMs <= endMs; dayMs += DAY) {
    const dayReadings = getReadingsForDay(asset, tracker, dayMs);
    for (const r of dayReadings) {
      const t = new Date(r.deviceTime).getTime();
      if (t >= startMs && t <= endMs) results.push(r);
    }
  }

  return results;
}

/** The demo clock the cached days were made for. */
let cacheMadeAt: number | null = null;

function getReadingsForDay(asset: Asset, tracker: DbRow<'trackers'>, dayMs: number): Reading[] {
  // A day is generated up to the demo clock's "now", and scenario readings are
  // placed relative to it. When the clock moves, cached days are stale (a machine
  // would stop at its last cached reading and go Offline), so start again.
  const now = clock.now();
  if (cacheMadeAt !== now) {
    cache.clear();
    cacheMadeAt = now;
  }
  const cacheOwner = `${asset.id}|${tracker.id}`;
  const dayMap = cache.get(cacheOwner);
  if (dayMap?.has(dayMs)) {
    return Array.from(dayMap.get(dayMs)!);
  }

  const readings = makeDayReadings(asset, dayMs);
  if (!dayMap) {
    const m = new Map<number, Reading[]>();
    m.set(dayMs, readings);
    cache.set(cacheOwner, m);
  } else {
    dayMap.set(dayMs, readings);
  }
  return readings;
}

// ── Deterministic per-asset simulator ──────────────────────────────────────────

function assetSeed(asset: Asset): number {
  // Deterministic seed from tracker IMEI
  const tracker = currentTrackerFor(asset);
  if (!tracker) return 0;
  const digits = tracker.imei.slice(-6);
  let s = 0;
  for (const c of digits) s = s * 10 + parseInt(c, 10);
  return s % 2147483647;
}

// ── Anchor scenarios (spec 8.2) ───────────────────────────────────────────────
// Where each asset's readings end relative to the clock at anchor, so the status
// rules in thresholds.ts give the status the asset table documents.

interface AnchorTail {
  /** Readings stop this many minutes before the anchor (0: they run up to the clock). */
  ageMin: number;
  /** Ignition on for the last 40 minutes at the yard: an idle tail. */
  ignition?: boolean;
  /** Override the asset's normal day plan on the anchor day. */
  via?: 'plant' | 'lifting' | 'parked';
  /** Apply the tail to the anchor day only; earlier days follow the asset's normal plan. */
  todayOnly?: boolean;
}

const IDLE_AT_ANCHOR: AnchorTail = { ageMin: 0, ignition: true };

const ANCHOR_TAILS: Record<string, AnchorTail | 'none'> = {
  // Idle at a site
  'LB-05': IDLE_AT_ANCHOR,
  'WL-03': IDLE_AT_ANCHOR,
  'GR-01': IDLE_AT_ANCHOR,
  'CR-02': IDLE_AT_ANCHOR,
  'FL-10': IDLE_AT_ANCHOR,
  'PU-52': IDLE_AT_ANCHOR,
  // Parked on the anchor day (spec §8.2: "Live, parked")
  'FB-14': { ageMin: 0, via: 'parked', todayOnly: true },
  // Stale: last reading 10-30 min old. §13: +1 h turns WT-08 Offline.
  'WT-08': { ageMin: 12 },
  'GN-02': { ageMin: 15 },
  'CR-05': { ageMin: 20, via: 'plant' },
  // Offline: older than 30 min
  'EX-07': { ageMin: 190, via: 'plant' },
  'SL-02': { ageMin: 2880, via: 'lifting' },
  // Paired but never reported
  'FL-09': 'none',
  'LD-09': 'none',
  'MW-01': 'none',
};

/** Live (moving) at the anchor (§8.2). The last two minutes are forced to move so the status matches whatever the draw. */
const MOVING_AT_ANCHOR = new Set(['TP-21', 'BH-05', 'TH-04', 'PU-51', 'CP-03']);
/** Working at the anchor (§1, §8.2): engine under load, so the status is Live. */
const WORKING_AT_ANCHOR = new Set(['EX-04', 'WL-06', 'TH-01', 'GN-01', 'BD-02']);

/** Which plan the asset follows on a day: its behaviour, unless a tail overrides it. */
function planFor(asset: Asset, dayMs: number, via?: AnchorTail['via'], prng?: () => number): Segment[] {
  const home = siteById(asset.homeSiteId);
  if (!home) return [];
  const rng = prng ?? (() => 0.5);
  const kind = via ?? kindOf(asset);
  if (kind === 'parked') return [{ mode: 'off', fromMs: dayMs, toMs: dayMs + DAY, from: home.center, to: home.center, jitter: 0.001 }];
  if (kind === 'lifting') return plantDay(home.center, dayMs, 0.0003, 0.0006);
  if (kind === 'plant') return plantDay(home.center, dayMs, 0.002, 0.0015);
  if (kind === 'generator') {
    const onAnchorNight = asset.code === 'GN-01' && dayMs === clock.startOfDubaiDay(GN01_DROP_AT);
    return generatorDay(home.center, dayMs, 0.0005, onAnchorNight ? { fromMs: GN01_OFF_FROM, toMs: GN01_OFF_TO } : undefined);
  }
  if (kind === 'light') {
    // Trips around the owner's area: every site within 25 km of the yard.
    const near = db.getState().sites.filter(s => haversineKm(s.center, home.center) <= 25);
    return legsDay(home, dayMs, { startH: 7, endH: 19 }, [25, 60], near, rng);
  }
  // Trucks: a run out to job sites across the emirate, 06:00–21:00.
  return legsDay(home, dayMs, { startH: 6, endH: 21 }, [40, 75], db.getState().sites, rng);
}

function kindOf(asset: Asset): 'parked' | 'plant' | 'lifting' | 'generator' | 'light' | 'truck' {
  switch (asset.behaviour) {
    case 'parked': return 'parked';
    case 'stationary_24h': return 'generator';
    case 'works_at_site': return asset.assetClass === 'lifting' ? 'lifting' : 'plant';
    case 'light_vehicle_day': return 'light';
    default: return 'truck';
  }
}

/** Idle tail: the machine stands at its yard, engine on, from `fromMs` to `toMs`. */
function withIdleTail(segs: Segment[], home: Point, fromMs: number, toMs: number): Segment[] {
  const kept = segs.flatMap<Segment>(s => {
    if (s.toMs <= fromMs) return [s];
    if (s.fromMs < fromMs) return [{ ...s, toMs: fromMs }];
    return [];
  });
  return [...kept, { mode: 'idle', fromMs, toMs, from: home, to: home, jitter: 0.0003, forced: 'idle' }];
}

/** FB-12 (spec §9): drives from Jebel Ali to the Al Habtoor site, arriving 90 min after the anchor. */
function fb12Route(asset: Asset, dayMs: number): Segment[] {
  const home = siteById(asset.homeSiteId);
  const booking = db.getState().bookings.find(b => b.assetId === asset.id && b.destination);
  if (!home || !booking?.destination) return planFor(asset, dayMs);
  const dep = ANCHOR_MS - 5 * MIN;
  const arrive = ANCHOR_MS + 90 * MIN;
  const dest: Point = { lat: booking.destination.lat, lng: booking.destination.lng };
  const kmh = haversineKm(home.center, dest) / ((arrive - dep) / HOUR);
  return [
    { mode: 'off', fromMs: dayMs, toMs: dep, from: home.center, to: home.center, jitter: 0.001 },
    { mode: 'drive', fromMs: dep, toMs: arrive, from: home.center, to: dest, jitter: 0.00015, cruiseKmh: kmh, clamp: false },
    // Arrived: it stays at the hirer's site for the rest of the day, engine off.
    { mode: 'off', fromMs: arrive, toMs: dayMs + DAY, from: dest, to: dest, jitter: 0.0003 },
  ];
}

const MOVE_BUCKET_MS = 60 * MIN;
const MOVE_WINDOW_MS = 90 * 1000;
const bucketOffsets = new WeakMap<Segment, Map<number, Point>>();
const fixedOffsets = new WeakMap<Segment, Point>();

/** A plant or parked machine's fixed offset from its site, drawn once per segment. */
function fixedOffset(seg: Segment, prng: () => number): Point {
  let off = fixedOffsets.get(seg);
  if (!off) {
    off = { lat: (prng() - 0.5) * seg.jitter * 2, lng: (prng() - 0.5) * seg.jitter * 2 };
    fixedOffsets.set(seg, off);
  }
  return off;
}

/** Where a plant machine stands in 20-minute bucket `b` of a segment, drawn once per bucket within `moveRadius`. */
function bucketOffset(seg: Segment, b: number, prng: () => number): Point {
  if (b < 0) return { lat: 0, lng: 0 };
  let byBucket = bucketOffsets.get(seg);
  if (!byBucket) {
    byBucket = new Map<number, Point>();
    bucketOffsets.set(seg, byBucket);
  }
  let off = byBucket.get(b);
  if (!off) {
    const r = seg.moveRadius ?? 0;
    off = { lat: (prng() - 0.5) * 2 * r, lng: (prng() - 0.5) * 2 * r };
    byBucket.set(b, off);
  }
  return off;
}

/** True while a plant machine is making its short move at the start of a 20-minute bucket. */
function inMoveWindow(seg: Segment, t: number): boolean {
  if (!seg.moveRadius) return false;
  return (t - seg.fromMs) % MOVE_BUCKET_MS < MOVE_WINDOW_MS;
}

/**
 * Position offset from the site at `t`: a fixed offset for parked and generator
 * segments, and for plant a short move in each 20-minute bucket. Returns the speed of that move.
 */
function placeAt(seg: Segment, t: number, prng: () => number): { dLat: number; dLng: number; speedKmh: number } {
  if (!seg.moveRadius) {
    const o = fixedOffset(seg, prng);
    return { dLat: o.lat, dLng: o.lng, speedKmh: 0 };
  }
  const b = Math.floor((t - seg.fromMs) / MOVE_BUCKET_MS);
  const end = bucketOffset(seg, b, prng);
  if (!inMoveWindow(seg, t)) return { dLat: end.lat, dLng: end.lng, speedKmh: 0 };
  const start = bucketOffset(seg, b - 1, prng);
  const frac = ((t - seg.fromMs) % MOVE_BUCKET_MS) / MOVE_WINDOW_MS;
  const degKm = Math.hypot(end.lat - start.lat, (end.lng - start.lng) * Math.cos(seg.from.lat * Math.PI / 180)) * 111;
  return {
    dLat: start.lat + (end.lat - start.lat) * frac,
    dLng: start.lng + (end.lng - start.lng) * frac,
    speedKmh: degKm / (MOVE_WINDOW_MS / HOUR),
  };
}

/** Turns segments into readings from `fromMs` to `endMs` (never past the clock). */
function sampleSegments(asset: Asset, trackerId: string, segs: Segment[], fromMs: number, endMs: number, prng: () => number): Reading[] {
  const now = clock.now();
  const stays = stayWindows(asset);
  const out: Reading[] = [];
  const heavy = asset.assetClass !== 'light_vehicle';
  let odo = 500 + prng() * 20000 + asset.code.charCodeAt(0);
  let heading = 0;
  let prev: Point | null = null;
  let t = fromMs;
  const last = Math.min(endMs, now);

  while (t < last) {
    const stay = stayAt(stays, t);
    if (stay === 'transit') { prev = null; t += PARKED_STEP_MS; continue; }

    let mode: Mode = 'off';
    let speed = 0;
    let lat: number;
    let lng: number;
    if (stay) {
      // Rented: works at the renter's site, shift times as plant (generators run 24 h).
      // An idle tail (spec §8.2) keeps the machine idling there rather than working.
      const stayed = stayedSegment(asset, stay, stayMoveRadius(asset));
      // A scripted engine-off window (GN-01, spec §8.7) holds even where the machine is rented.
      const planned = segmentAt(segs, t);
      const c: { mode: Mode; speed: number } = planned?.forced === 'idle'
        ? { mode: 'idle', speed: 0 }
        : planned?.forced === 'off' ? { mode: 'off', speed: 0 } : stayMode(asset, t, prng);
      mode = c.mode; speed = c.speed;
      const place = placeAt(stayed, t, prng);
      const wob = mode === 'work' && place.speedKmh > 0 ? (prng() - 0.5) * stayed.jitter * 0.01 : 0;
      lat = stayed.from.lat + place.dLat + wob;
      lng = stayed.from.lng + place.dLng + wob;
      if (mode === 'work' && place.speedKmh > 0) speed = place.speedKmh;
    } else {
      const seg = segmentAt(segs, t) ?? segs[0];
      if (!seg) break;
      const jit = seg.jitter;
      if (seg.mode === 'drive') {
        mode = 'drive';
        const frac = Math.min(1, Math.max(0, (t - seg.fromMs) / (seg.toMs - seg.fromMs)));
        const k = seg.cruiseKmh ?? 40;
        speed = seg.clamp === false ? k * (0.9 + 0.2 * prng()) : Math.min(90, Math.max(20, k * (0.85 + 0.3 * prng())));
        lat = seg.from.lat + (seg.to.lat - seg.from.lat) * frac + (prng() - 0.5) * jit * 2;
        lng = seg.from.lng + (seg.to.lng - seg.from.lng) * frac + (prng() - 0.5) * jit * 2;
        heading = (bearingDeg(seg.from, seg.to) + (prng() - 0.5) * 6 + 360) % 360;
      } else {
        mode = seg.mode;
        if (seg.mode === 'work') {
          // Plant mostly works. A short move (spec §9) is always working, never idle.
          mode = inMoveWindow(seg, t) ? 'work' : prng() < 0.85 ? 'work' : 'idle';
        }
        const place = placeAt(seg, t, prng);
        // GPS wobble only while moving: a stopped machine must not drift on the odometer.
        const wob = speed > 0 ? (prng() - 0.5) * jit * 0.01 : 0;
        lat = seg.from.lat + place.dLat + wob;
        lng = seg.from.lng + place.dLng + wob;
        speed = place.speedKmh;
      }
    }

    // Scripted excursion (spec §8.7): overrides where and how the machine is for its legs.
    const excursion = excursionAt(asset, t);
    if (excursion) { lat = excursion.lat; lng = excursion.lng; mode = excursion.mode; speed = excursion.speed; }

    // Anchor forcing (spec §8.2, §1): only the last two minutes before the clock.
    if (t >= now - 2 * MIN) {
      if (MOVING_AT_ANCHOR.has(asset.code)) { mode = 'drive'; speed = 12 + prng() * 13; }
      if (WORKING_AT_ANCHOR.has(asset.code)) { mode = 'work'; speed = 0; }
    }

    const ignition = mode !== 'off';
    const moving = speed >= 3 && ignition;
    // Stopped machines keep the heading they had (spec §9: the heading does not spin while parked).
    const running = heavy ? 24.0 + prng() * 4.4 : 12.4 + prng() * 1.8;
    const extVoltage = ignition ? running : running - 0.5;
    // GN-02's tracker battery has been low since three days before the anchor (spec §8.7, LOW_BATTERY_V 3.6).
    const lowBattery = asset.code === 'GN-02' && t >= ANCHOR_MS - 3 * DAY;
    const intBattery = lowBattery ? 3.45 + prng() * 0.05 : 3.9 + prng() * 0.2;
    const gsm = Math.floor(2 + prng() * 4) as 0 | 1 | 2 | 3 | 4 | 5;
    const satellites = Math.floor(7 + prng() * 8);
    // The odometer adds the distance actually covered since the last reading, so the
    // trip distance and the map agree (a jump between sites is never counted as driving).
    const here: Point = { lat, lng };
    if (prev) odo += haversineKm(prev, here);
    prev = here;
    const r = baseReading(t, trackerId, lat, lng, speed, heading, ignition, moving, extVoltage, intBattery, gsm, satellites, odo, prng);
    modeOf.set(r, mode);
    out.push(r);

    // 30 s while the engine is on or in the last 12 minutes before the clock; 10 min parked.
    const step = ignition || moving || t >= now - 12 * MIN ? ENGINE_ON_STEP_MS : PARKED_STEP_MS;
    let next = t + step;
    // Never step over the start of the next segment: its first reading must be taken at its start.
    const boundary = segs.find(sg => sg.fromMs > t && sg.fromMs < next);
    if (boundary && !stay) next = boundary.fromMs;
    t = next;
  }
  return out;
}

// Keyed by value: stayWindows() returns new objects on every call.
const stayedSegments = new Map<string, Segment>();

/** A rental stay as a segment at the renter's site, so a rented machine is placed the same way as at home. */
function stayedSegment(asset: Asset, stay: Stay, moveRadius: number | undefined): Segment {
  const key = `${asset.id}|${stay.siteId}|${stay.fromMs}|${stay.toMs}`;
  let seg = stayedSegments.get(key);
  if (!seg) {
    const site = siteById(stay.siteId)!.center;
    seg = { mode: 'work', fromMs: stay.fromMs, toMs: stay.toMs, from: site, to: site, jitter: 0.002, moveRadius };
    stayedSegments.set(key, seg);
  }
  return seg;
}

/** Plant and lifting make short moves on a site (spec §9); trucks and generators do not. */
function stayMoveRadius(asset: Asset): number | undefined {
  if (asset.behaviour !== 'works_at_site') return undefined;
  return asset.assetClass === 'lifting' ? 0.0006 : 0.0015;
}

/** Shift working for a rented machine, or the 24 h generator profile. */
function stayMode(asset: Asset, t: number, prng: () => number): { mode: Mode; speed: number } {
  if (asset.behaviour === 'stationary_24h') return { mode: 'work', speed: 0 };
  const h = ((t + DUBAI_OFFSET_MS) % DAY) / HOUR;
  if (h < 7 || h >= 18) return { mode: 'off', speed: 0 };
  return { mode: prng() < 0.85 ? 'work' : 'idle', speed: 0 };
}

function makeDayReadings(asset: Asset, dayMs: number): Reading[] {
  const readings = withCanValues(asset, makeDayReadingsRaw(asset, dayMs));
  // Scenario: WT-07 — a planned over-speed event yesterday, at 104 km/h (spec §8, S27).
  // The day before the anchor, like its alert (al-wt07-speed); not "yesterday" of a moved clock.
  const yesterday = clock.startOfDubaiDay(ANCHOR_MS) - DAY;
  if (asset.code === 'WT-07' && dayMs === yesterday) return plannedOverspeed(readings, 104, 6);
  // FB-12: 96 km/h on the Al Noor road two days before the anchor, like its alert (al-fb12-speed).
  if (asset.code === 'FB-12' && dayMs === yesterday - DAY) return plannedOverspeed(readings, 96, 6);
  // TP-21: three harsh-driving events over the two days before the anchor (al-tp21-harsh).
  if (asset.code === 'TP-21') return plannedHarshEvents(readings, TP21_HARSH_TIMES);
  // EX-11: the power cut its alert reports — the vehicle feed is dead while it is open
  // (al-ex11-power, 03:30–04:15 on the anchor day, after the early return from Palm).
  if (asset.code === 'EX-11') return withPowerCut(readings, EX11_CUT_FROM, EX11_CUT_TO);
  return readings;
}

/**
 * TP-21's harsh-driving events (al-tp21-harsh, spec §8.7). The alert says "3 events in
 * last 2 days" and opened two days before the anchor, so all three sit inside that
 * window: two on its morning run the day before, one on the anchor day's run.
 */
const TP21_HARSH_TIMES = [dubaiAt(1, 6, 20), dubaiAt(1, 7, 0), dubaiAt(0, 7, 10)];
const HARSH_EVENTS: NonNullable<Reading['event']>[] = ['harsh_brake', 'harsh_accel', 'harsh_corner'];

/**
 * Tags the first moving reading at or after each time — and inside that time's own
 * Dubai day, so an event can never land on the wrong day or twice on one reading
 * (the truck only drives in the morning, so the next day's run must not be tagged).
 */
function plannedHarshEvents(readings: Reading[], times: number[]): Reading[] {
  const out = [...readings];
  times.forEach((at, i) => {
    const dayEnd = clock.startOfDubaiDay(at) + DAY;
    const index = out.findIndex(r => {
      const t = new Date(r.deviceTime).getTime();
      return t >= at && t < dayEnd && r.moving && r.ignition && !r.event;
    });
    if (index >= 0) out[index] = { ...out[index], event: HARSH_EVENTS[i % HARSH_EVENTS.length] };
  });
  return out;
}

/** EX-11's power cut window: 03:30–04:15 Dubai on the anchor day (al-ex11-power). */
const EX11_CUT_FROM = dubaiAt(0, 3, 30);
const EX11_CUT_TO = dubaiAt(0, 4, 15);

/**
 * External power lost (spec §8.7, the TP-23 pattern): inside the window the tracker
 * runs on its own battery, so the vehicle feed reads zero and the GSM/GNSS quality
 * drops. Position and ignition are left alone — the machine did not move.
 */
function withPowerCut(readings: Reading[], fromMs: number, toMs: number): Reading[] {
  const prng = mulberry32(0x5e11);
  return readings.map(r => {
    const t = new Date(r.deviceTime).getTime();
    if (t < fromMs || t >= toMs) return r;
    return {
      ...r,
      extVoltage: Math.round(prng() * 0.1 * 10) / 10,
      intBattery: Math.round((3.5 + prng() * 0.3) * 100) / 100,
      gsm: Math.floor(prng() * 3) as 0 | 1 | 2 | 3 | 4 | 5,
      satellites: Math.floor(3 + prng() * 4),
    };
  });
}

/**
 * Sets `count` consecutive moving readings, nearest the middle of the day, to `kmh`.
 * The run must be contiguous in time order: a stationary reading inside it would
 * end the run and split the event into two.
 */
function plannedOverspeed(readings: Reading[], kmh: number, count: number): Reading[] {
  const ok = (r: Reading) => r.moving && r.speedKmh >= 10;
  const mid = Math.floor(readings.length / 2);
  for (let d = 0; d < readings.length; d++) {
    for (const i of [mid + d, mid - d]) {
      if (i < 0 || i + count > readings.length) continue;
      if (readings.slice(i, i + count).every(ok)) {
        return readings.map((r, j) => (j >= i && j < i + count ? { ...r, speedKmh: kmh } : r));
      }
    }
  }
  return readings;
}

function makeDayReadingsRaw(asset: Asset, dayMs: number): Reading[] {
  const now = clock.now();
  if (dayMs > now) return [];
  const tracker = currentTrackerFor(asset);
  if (!tracker) return [];
  const prng = mulberry32(assetSeed(asset) + Math.floor(dayMs / DAY));
  const isToday = dayMs === clock.startOfDubaiDay(now);
  const dayEnd = dayMs + DAY;

  // Scenario: TP-23 — power cut 2 h before the anchor (external power lost, tracker on
  // battery), then offline 40 min before it. Fixed to the anchor like its alerts, so moving
  // the clock ages it; the days after it stay silent (the tracker is still offline).
  const anchorDay = clock.startOfDubaiDay(ANCHOR_MS);
  if (asset.code === 'TP-23' && dayMs > anchorDay) return [];
  if (asset.code === 'TP-23' && dayMs === anchorDay) {
    const powerCutAt = ANCHOR_MS - 2 * HOUR;
    const offlineAt = ANCHOR_MS - 40 * MIN;
    const home = siteById(asset.homeSiteId);
    const trucks = sampleSegments(asset, tracker.id, planFor(asset, dayMs, undefined, prng), dayMs, Math.min(powerCutAt, now), prng);
    if (now <= powerCutAt) return trucks;
    const lastTruck = trucks.at(-1);
    const battery = generateBatteryReadings(asset, tracker.id, powerCutAt, Math.min(offlineAt, now), prng, lastTruck, home?.center);
    return [...trucks, ...battery];
  }

  const tail = ANCHOR_TAILS[asset.code];
  if (tail === 'none') return [];
  let end = Math.min(dayEnd, now);
  let via: AnchorTail['via'];
  if (tail && (!tail.todayOnly || isToday)) {
    // A tracker that stopped reporting stopped at a fixed time before the anchor, so a
    // later clock ages it (§13: +1 h turns WT-08 Offline). Idle and parked tails (age 0)
    // keep reporting up to the clock.
    const cutoff = tail.ageMin > 0 ? Math.min(now, ANCHOR_MS - tail.ageMin * MIN) : now;
    if (dayMs > cutoff) return []; // this day comes after the last reading
    end = Math.min(end, cutoff);
    via = tail.via;
  }

  let segs = isToday && asset.code === 'FB-12' ? fb12Route(asset, dayMs) : planFor(asset, dayMs, via, prng);
  const home = siteById(asset.homeSiteId);
  if (tail && tail.ignition && isToday && home) {
    segs = withIdleTail(segs, home.center, now - 40 * MIN, now);
  }
  return sampleSegments(asset, tracker.id, segs, dayMs, end, prng);
}

// ── Scripted excursions (spec §8.7, §9) ───────────────────────────────────────
// Events the spec puts in readings that the normal plan does not produce: LB-05 moved
// 400 m with its ignition off, WL-06 left its works (Palm Crescent) and came back, PU-51
// idled for 2.5 h at Dubai Hills, and GR-01 left the Al Quoz Yard after hours. Each
// excursion overrides the position, mode and speed for its legs only.

interface ExcursionLeg { t0: number; t1: number; from: Point; to: Point; mode: Mode; speed: number }

function centroidOf(points: Point[]): Point {
  return {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length,
  };
}

function excursionLegs(asset: Asset): ExcursionLeg[] {
  if (asset.code === 'LB-05') {
    // Tow: out 400 m north from its yard, with the engine off, 23:40–23:50 yesterday.
    const yard = siteById(asset.homeSiteId)?.center;
    if (!yard) return [];
    const moved = { lat: yard.lat + 0.0036, lng: yard.lng };
    return [
      { t0: dubaiAt(1, 23, 40), t1: dubaiAt(1, 23, 50), from: yard, to: moved, mode: 'off', speed: 4 },
      { t0: dubaiAt(1, 23, 50), t1: dubaiAt(0, 0, 0), from: moved, to: moved, mode: 'off', speed: 0 },
    ];
  }
  if (asset.code === 'PU-51') {
    // The long idle its alert reports (al-pu51-idle): 2.5 hours with the engine on at the
    // Dubai Hills site, 21:00–23:30 the day before the anchor.
    const site = siteById(asset.homeSiteId)?.center;
    if (!site) return [];
    return [
      { t0: dubaiAt(1, 21, 0), t1: dubaiAt(1, 23, 30), from: site, to: site, mode: 'idle', speed: 0 },
    ];
  }
  if (asset.code === 'GR-01') {
    // After hours (al-gr01-afterhours): the grader leaves the Al Quoz Yard fence at 23:40
    // for a short job on the neighbouring plot and is back inside by 23:55 (ge-003/ge-005).
    const yard = siteById(asset.homeSiteId)?.center;
    if (!yard) return [];
    const away = { lat: yard.lat + 0.0054, lng: yard.lng + 0.0029 };
    return [
      { t0: dubaiAt(1, 23, 40), t1: dubaiAt(1, 23, 43), from: yard, to: away, mode: 'drive', speed: 18 },
      { t0: dubaiAt(1, 23, 43), t1: dubaiAt(1, 23, 52), from: away, to: away, mode: 'idle', speed: 0 },
      { t0: dubaiAt(1, 23, 52), t1: dubaiAt(1, 23, 55), from: away, to: yard, mode: 'drive', speed: 18 },
    ];
  }
  if (asset.code === 'WL-06') {
    // Leaves the Palm Crescent works at 19:10, stops outside, and is back inside by 19:55.
    const fence = db.getState().geofences.find(g => g.id === 'g-palm-crescent');
    if (!fence || fence.shape.type !== 'polygon') return [];
    const works = centroidOf(fence.shape.points);
    const outside = { lat: works.lat + 0.0060, lng: works.lng };
    return [
      { t0: dubaiAt(1, 19, 10), t1: dubaiAt(1, 19, 20), from: works, to: outside, mode: 'drive', speed: 30 },
      { t0: dubaiAt(1, 19, 20), t1: dubaiAt(1, 19, 45), from: outside, to: outside, mode: 'idle', speed: 0 },
      { t0: dubaiAt(1, 19, 45), t1: dubaiAt(1, 19, 55), from: outside, to: works, mode: 'drive', speed: 30 },
    ];
  }
  return [];
}

/** The excursion leg that holds at time t for this asset, sampled at t, or null. */
function excursionAt(asset: Asset, t: number): { lat: number; lng: number; mode: Mode; speed: number } | null {
  const leg = excursionLegs(asset).find(l => t >= l.t0 && t < l.t1);
  if (!leg) return null;
  const f = (t - leg.t0) / (leg.t1 - leg.t0);
  return {
    lat: leg.from.lat + (leg.to.lat - leg.from.lat) * f,
    lng: leg.from.lng + (leg.to.lng - leg.from.lng) * f,
    mode: leg.mode,
    speed: leg.speed,
  };
}

function mulberry32(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function baseReading(deviceTimeMs: number, trackerId: string, lat: number, lng: number, speedKmh: number, heading: number, ignition: boolean, moving: boolean, extVoltage: number, intBattery: number, gsm: number, satellites: number, gnssOdometerKm: number, prng: () => number): Reading {
  const receivedAt = deviceTimeMs + (2 + prng() * 6) * 1000;
  return {
    trackerId,
    deviceTime: new Date(deviceTimeMs).toISOString(),
    receivedAt: new Date(receivedAt).toISOString(),
    lat, lng, speedKmh, heading, satellites, ignition, moving,
    extVoltage, intBattery, gsm: gsm as 0|1|2|3|4|5,
    gnssOdometerKm,
    fuelLevelPct: undefined, fuelUsedL: undefined, fuelRateLph: undefined,
    rpm: undefined, canOdometerKm: undefined, coolantC: undefined,
    engineLoadPct: undefined, engineHours: undefined, activeDtcs: undefined, adBluePct: undefined,
  };
}

const CAN_PARAMS = ['rpm', 'engineLoad', 'fuelLevel', 'fuelUsed', 'fuelRate', 'canOdometer', 'coolantTemp', 'engineHours', 'faultCodes', 'adBlue'];

/**
 * Fills the CAN fields a tracker reads from the engine bus, but only for the
 * parameters the asset's adapter supports (spec §6.2), and only after the
 * adapter was fitted. Everything else stays undefined.
 */
function withCanValues(asset: Asset, readings: Reading[]): Reading[] {
  const supported = new Set<string>(asset.canProfile.supported);
  if (!CAN_PARAMS.some(p => supported.has(p))) return readings;
  const salt = assetSeed(asset);
  const today = clock.startOfDubaiDay(clock.now());
  const faultFrom = today + 5 * HOUR + 40 * MIN; // BD-02's fault code is set from 05:40 Dubai today (spec §9)
  return readings.map(r => {
    const t = new Date(r.deviceTime).getTime();
    if (!isCanReadingAvailable(asset, t)) return r;
    const u = mulberry32(t + salt)();
    const mode: Mode = modeOf.get(r) ?? (r.ignition ? (r.moving ? 'drive' : 'idle') : 'off');
    const on = mode !== 'off';
    const faulted = asset.code === 'BD-02' && t >= faultFrom;
    const out: Reading = { ...r };
    if (supported.has('rpm')) {
      out.rpm = mode === 'off' ? 0 : mode === 'idle' ? 650 + 100 * u : mode === 'work' ? 1200 + 900 * u : 1400 + 700 * u;
    }
    if (supported.has('engineLoad')) {
      out.engineLoadPct = mode === 'off' ? 0 : mode === 'idle' ? 10 + 10 * u : mode === 'work' ? 35 + 50 * u : 40 + 40 * u;
    }
    if (supported.has('fuelLevel') || supported.has('fuelUsed') || supported.has('fuelRate')) {
      const fuel = fuelStateAt(asset, t);
      if (supported.has('fuelLevel')) out.fuelLevelPct = fuel.levelPct;
      if (supported.has('fuelUsed')) out.fuelUsedL = fuel.usedL;
      if (supported.has('fuelRate')) out.fuelRateLph = instantRateLph(asset, mode, u);
    }
    if (supported.has('canOdometer')) out.canOdometerKm = Math.round(r.gnssOdometerKm * (1 + (u - 0.5) * 0.04) * 10) / 10;
    if (supported.has('coolantTemp')) {
      out.coolantC = !on ? 28 + 4 * u : faulted ? 100 + 8 * u : 82 + 8 * u;
    }
    if (supported.has('engineHours')) out.engineHours = ecuHoursAt(asset, t);
    if (supported.has('faultCodes')) out.activeDtcs = faulted ? ['SPN 110 FMI 0'] : [];
    if (supported.has('adBlue')) out.adBluePct = Math.round((60 + 10 * u) * 10) / 10;
    return out;
  });
}

// ── Battery-only readings (TP-23, power cut) ──────────────────────────────────

function generateBatteryReadings(asset: Asset, trackerId: string, startMs: number, endMs: number, prng: () => number, last?: Reading, fallback?: Point): Reading[] {
  const readings: Reading[] = [];
  const at: Point | undefined = last ? { lat: last.lat, lng: last.lng } : fallback;
  if (!at) return readings;
  const interval = 5 * MIN;
  // Keep the odometer where the truck left it, so the trip does not go backwards.
  const odometer = last?.gnssOdometerKm ?? 0;
  for (let t = startMs; t < endMs; t += interval) {
    const r = baseReading(t, trackerId, at.lat, at.lng, 0, 0, true, false,
      prng() * 0.1, 3.5 + prng() * 0.3, Math.floor(prng() * 3), Math.floor(3 + prng() * 4), odometer, prng);
    readings.push(r);
  }
  return readings;
}

// ── Public reading API ─────────────────────────────────────────────────────────

export function getReadingForAsset(asset: Asset): Reading | null {
  const tracker = currentTrackerFor(asset);
  if (!tracker) return null;
  return lastReadingFor(asset);
}

export function getLastPosition(asset: Asset): { lat: number; lng: number; at: string } | null {
  const reading = getReadingForAsset(asset);
  if (!reading) return null;
  return { lat: reading.lat, lng: reading.lng, at: reading.deviceTime };
}

// Kept for the replay-batch scenario (spec §9, FB-14). Not wired to the day plan yet.
export function getFB14ReplayBatch(): Reading[] {
  const readings: Reading[] = [];
  const tracker = db.getState().trackers.find(t => t.id === 'tr-fb14')!;
  const deviceTimeMs = ANCHOR_MS - 6 * HOUR;
  const baseLat = 25.0118;
  const baseLng = 55.1132;

  for (let i = 0; i < 20; i++) {
    const t = deviceTimeMs + i * 30 * MIN; // every 30 min
    const r: Reading = {
      trackerId: tracker.id,
      deviceTime: new Date(t).toISOString(),
      receivedAt: new Date(ANCHOR_MS - 2 * HOUR + i * 30000).toISOString(),
      lat: baseLat + (i % 5) * 0.0005,
      lng: baseLng + (i % 3) * 0.0005,
      speedKmh: 0,
      heading: (i * 10) % 360,
      satellites: 9,
      ignition: false,
      moving: false,
      extVoltage: 25.5,
      intBattery: 4.0,
      gsm: 3,
      gnssOdometerKm: 8000 + i * 0.01,
    };
    readings.push(r);
  }
  return readings;
}
