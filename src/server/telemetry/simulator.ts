// Telemetry simulator — generates readings on demand per tracker per day and caches them.
// Never pre-generates everything. Caches per tracker per day.
// Architecture rule 9: all time from clock.ts (here Date.now() is allowed as it IS the clock module).

import type { Reading, Asset } from '@/domain/types';
import { seed, ANCHOR_MS } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { OFFLINE_AFTER_SEC, STALE_AFTER_SEC } from '@/config/thresholds';

// ── Cache ─────────────────────────────────────────────────────────────────────

const cache = new Map<string, Map<number, Reading[]>>(); // trackerId → dayMs → readings[]

function cacheKey(trackerId: string, dayMs: number): string {
  return `${trackerId}:${dayMs}`;
}

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
    // Check speed and ignition for live vs idle
    if (lastReading.speedKmh < 3 && lastReading.ignition) return 'idle';
    return 'live';
  }
  return 'no_tracker';
}

function currentTrackerFor(asset: Asset): typeof seed.trackers[0] | null {
  // Find the current pairing (explicit swap tracking)
  const currentPairing = seed.pairings.find(p => p.assetId === asset.id && p.to === null);
  if (currentPairing) return seed.trackers.find(t => t.id === currentPairing.trackerId) ?? null;
  // Fallback: use the tracker's assetId field (implicit pairing from seed)
  return seed.trackers.find(t => t.assetId === asset.id && t.stockStatus === 'paired') ?? null;
}

// How far back to look for a reading: a stale or offline asset can be days
// behind, and the status rules need its last reading, not "no data".
const LOOKBACK_DAYS = 40;

/** The newest day that has a reading for this asset, or null when it never reported. */
function newestReadingsDay(asset: Asset): Reading[] | null {
  const tracker = currentTrackerFor(asset);
  if (!tracker) return null;
  const now = clock.now();
  const anchorDayStart = Math.floor(now / 86400000) * 86400000;
  for (let d = 0; d <= LOOKBACK_DAYS; d++) {
    const dayMs = anchorDayStart - d * 86400000;
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
  const adapter = seed.adapters.find(a => a.assetId === asset.id);
  if (!adapter) return false;
  const fittingAt = adapter.fittedAt ? new Date(adapter.fittedAt).getTime() : 0;
  return deviceTimeMs >= fittingAt;
}

// ── Reading generation ─────────────────────────────────────────────────────────

export function getReadingsForAsset(asset: Asset, startMs: number, endMs: number): Reading[] {
  const tracker = currentTrackerFor(asset);
  if (!tracker) return [];

  const results: Reading[] = [];
  const dayStart = Math.floor(startMs / 86400000) * 86400000;

  for (let dayMs = dayStart; dayMs <= endMs; dayMs += 86400000) {
    const dayReadings = getReadingsForDay(asset, tracker, dayMs);
    for (const r of dayReadings) {
      const t = new Date(r.deviceTime).getTime();
      if (t >= startMs && t <= endMs) results.push(r);
    }
  }

  return results;
}

function getReadingsForDay(asset: Asset, tracker: typeof seed.trackers[0], dayMs: number): Reading[] {
  const _key = cacheKey(tracker.id, dayMs);
  const dayMap = cache.get(tracker.id);
  if (dayMap?.has(dayMs)) {
    return Array.from(dayMap.get(dayMs)!);
  }

  const readings = makeDayReadings(asset, dayMs);
  if (!dayMap) {
    const m = new Map<number, Reading[]>();
    m.set(dayMs, readings);
    cache.set(tracker.id, m);
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
// rules in thresholds.ts give the status the asset table documents. Idle assets
// keep an idling tail (ignition on, speed 0) so they read "Idle", not "Live".

type AnchorTail = { ageMin: number; ignition?: boolean; via?: 'plant' | 'lifting' } | 'none';

const IDLE_AT_ANCHOR: AnchorTail = { ageMin: 0, ignition: true };

const ANCHOR_TAILS: Record<string, AnchorTail> = {
  // Idle at a site
  'LB-05': IDLE_AT_ANCHOR,
  'WL-03': IDLE_AT_ANCHOR,
  'GR-01': IDLE_AT_ANCHOR,
  'CR-02': IDLE_AT_ANCHOR,
  'FL-10': IDLE_AT_ANCHOR,
  'PU-52': IDLE_AT_ANCHOR,
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

function generateForBehaviour(asset: Asset, dayMs: number, endMs: number, prng: () => number): Reading[] {
  const behaviour = asset.behaviour;
  if (behaviour === 'parked') return generateParkedReadings(asset, dayMs, endMs, prng);
  if (behaviour === 'stationary_24h') return generateGeneratorReadings(asset, dayMs, endMs, prng, false);
  if (behaviour === 'light_vehicle_day') return generateLightVehicleReadings(asset, dayMs, endMs, prng);
  if (behaviour === 'works_at_site' || behaviour === 'drives_between_sites') {
    return generateMovingReadings(asset, dayMs, endMs, prng);
  }
  return generateParkedReadings(asset, dayMs, endMs, prng);
}

function tailReadings(asset: Asset, tail: { via?: 'plant' | 'lifting' }, dayMs: number, endMs: number, prng: () => number): Reading[] {
  if (tail.via === 'plant') return generatePlantReadings(asset, dayMs, endMs, prng, false);
  if (tail.via === 'lifting') return generateLiftingReadings(asset, dayMs, endMs, prng, false);
  return generateForBehaviour(asset, dayMs, endMs, prng);
}

/** Idling tail: engine running, not moving, every 10 minutes up to the clock. */
function generateIdleTail(asset: Asset, fromMs: number, toMs: number, prng: () => number): Reading[] {
  const readings: Reading[] = [];
  const site = seed.sites.find(s => s.id === asset.homeSiteId);
  if (!site) return readings;
  const tracker = currentTrackerFor(asset);
  const trackerId = tracker?.id ?? 'unknown';
  const odometer = rand(prng, 100, 5000) + asset.code.charCodeAt(0);
  const start = Math.max(fromMs, toMs - 40 * 60000);
  for (let t = start; t <= toMs; t += 10 * 60000) {
    readings.push(baseReading(t, trackerId, site.center.lat, site.center.lng, 0, 0, true, false,
      rand(prng, 12.6, 13.4), rand(prng, 3.9, 4.1), randInt(prng, 2, 4), randInt(prng, 6, 12), odometer, prng));
  }
  return readings;
}

function makeDayReadings(asset: Asset, dayMs: number): Reading[] {
  const prng = mulberry32(assetSeed(asset) + Math.floor(dayMs / 86400000));
  const dayEndDubai = dayMs + 86400000;
  const now = clock.now();
  const isOutsideAnchor = dayMs > now;

  // Scenario: TP-23 — power cut 2 h ago, then offline 40 min ago
  if (asset.code === 'TP-23' && Math.floor(now / 86400000) === Math.floor(dayMs / 86400000)) {
    const powerCutAt = now - 2 * 3600000;
    const offlineAt = now - 40 * 60000;
    return [
      ...generateTruckReadings(asset, dayMs, powerCutAt, prng),
      ...generateBatteryReadings(asset, powerCutAt, offlineAt, prng),
    ];
  }

  const tail = ANCHOR_TAILS[asset.code];
  if (tail === 'none') return [];
  if (tail) {
    const cutoff = now - tail.ageMin * 60000;
    if (dayMs > cutoff) return []; // this day comes after the last reading
    if (isOutsideAnchor) return [];
    const end = Math.min(dayEndDubai, cutoff, now);
    const before = tailReadings(asset, tail, dayMs, end, prng);
    const idling = tail.ignition && dayMs + 86400000 > cutoff ? generateIdleTail(asset, cutoff, now, prng) : [];
    return [...before, ...idling];
  }

  // Future days — no readings yet
  if (isOutsideAnchor) return [];
  return generateForBehaviour(asset, dayMs, Math.min(dayEndDubai, now), prng);
}

// ── Generators ─────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function rand(prng: () => number, min: number, max: number) { return min + prng() * (max - min); }
function randInt(prng: () => number, min: number, max: number) { return Math.floor(rand(prng, min, max + 1)); }

function baseReading(deviceTimeMs: number, trackerId: string, lat: number, lng: number, speedKmh: number, heading: number, ignition: boolean, moving: boolean, extVoltage: number, intBattery: number, gsm: number, satellites: number, gnssOdometerKm: number, prng: () => number): Reading {
  const receivedAt = deviceTimeMs + rand(prng, 2, 8) * 1000;
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

function nowMs(): number { return clock.now(); }

function generateParkedReadings(asset: Asset, dayMs: number, dayEnd: number, prng: () => number): Reading[] {
  const readings: Reading[] = [];
  const site = seed.sites.find(s => s.id === asset.homeSiteId);
  if (!site) return readings;
  const interval = 10 * 60 * 1000; // parked: every 10 min
  const odometer = rand(prng, 0, 1000) + asset.code.charCodeAt(0);
  const tracker = currentTrackerFor(asset);
  const trackerId = tracker?.id ?? 'unknown';

  for (let t = dayMs; t < dayEnd && t < nowMs(); t += interval) {
    const r = baseReading(t, trackerId, site.center.lat + rand(prng, -0.001, 0.001), site.center.lng + rand(prng, -0.001, 0.001), 0, rand(prng, 0, 360), false, false, rand(prng, 12.4, 13.2), rand(prng, 3.9, 4.1), randInt(prng, 2, 4), randInt(prng, 6, 12), odometer, prng);
    readings.push(r);
  }
  return readings;
}

function generatePlantReadings(asset: Asset, dayMs: number, endMs: number, prng: () => number, isMoving: boolean): Reading[] {
  const readings: Reading[] = [];
  const site = seed.sites.find(s => s.id === asset.homeSiteId);
  if (!site) return readings;
  const interval = isMoving ? 30 * 1000 : 10 * 60 * 1000;
  let azimuth = 0;
  let odometer = rand(prng, 100, 5000) + asset.code.charCodeAt(0);
  const tracker = currentTrackerFor(asset);
  const trackerId = tracker?.id ?? 'unknown';
  const shiftStart = dayMs + 7 * 3600000;
  const shiftEnd = dayMs + 18 * 3600000;

  for (let t = dayMs; t < endMs && t < nowMs(); t += interval) {
    const inShift = t >= shiftStart && t <= shiftEnd;
    const ignition = inShift;
    const moving = isMoving && inShift && prng() > 0.3;
    const speed = moving ? rand(prng, 5, 30) : 0;
    const heading = azimuth;
    const lat = site.center.lat + rand(prng, -0.002, 0.002) + (moving ? rand(prng, -0.0005, 0.0005) : 0);
    const lng = site.center.lng + rand(prng, -0.002, 0.002) + (moving ? rand(prng, -0.0005, 0.0005) : 0);
    azimuth = (azimuth + rand(prng, -20, 20)) % 360;

    const r = baseReading(t, trackerId, lat, lng, speed, heading, ignition, moving,
      rand(prng, 24.0, 28.4), rand(prng, 3.9, 4.1), randInt(prng, 2, 5), randInt(prng, 7, 14), odometer + (moving ? rand(prng, 0.01, 0.05) : 0), prng);

    readings.push(r);
    odometer = r.gnssOdometerKm;
  }
  return readings;
}

function generateTruckReadings(asset: Asset, dayMs: number, endMs: number, prng: () => number): Reading[] {
  const readings: Reading[] = [];
  const site = seed.sites.find(s => s.id === asset.homeSiteId);
  if (!site) return readings;
  const interval = 30 * 1000;
  let lat = site.center.lat;
  let lng = site.center.lng;
  let odometer = rand(prng, 5000, 50000) + asset.code.charCodeAt(0);
  const tracker = currentTrackerFor(asset);
  const trackerId = tracker?.id ?? 'unknown';
  const shiftStart = dayMs + 6 * 3600000;
  const shiftEnd = dayMs + 21 * 3600000;

  for (let t = dayMs; t < endMs && t < nowMs(); t += interval) {
    const inShift = t >= shiftStart && t <= shiftEnd;
    const ignition = inShift && prng() > 0.2;
    const moving = ignition && prng() > 0.4;
    const speed = moving ? rand(prng, 20, 90) : 0;
    const heading = (t / 10000) % 360;
    const dt = interval / 3600000;
    const dist = (speed * dt * 1000) / 3600;
    lat += rand(prng, -0.0001, 0.0001) + (moving ? Math.cos(heading * Math.PI / 180) * dist / 111000 : 0);
    lng += rand(prng, -0.0001, 0.0001) + (moving ? Math.sin(heading * Math.PI / 180) * dist / (111000 * Math.cos(lat * Math.PI / 180)) : 0);

    const r = baseReading(t, trackerId, lat, lng, speed, heading, ignition, moving,
      rand(prng, 24.8, 28.0), rand(prng, 3.9, 4.1), randInt(prng, 2, 5), randInt(prng, 7, 14), odometer + dist, prng);

    readings.push(r);
    odometer = r.gnssOdometerKm;
  }
  return readings;
}

function generateBatteryReadings(asset: Asset, startMs: number, endMs: number, prng: () => number): Reading[] {
  const readings: Reading[] = [];
  const site = seed.sites.find(s => s.id === asset.homeSiteId);
  if (!site) return readings;
  const tracker = currentTrackerAndAsset(asset);
  if (!tracker) return readings;
  const interval = 5 * 60 * 1000;
  const trackerId = tracker.id;

  for (let t = startMs; t < endMs; t += interval) {
    const r = baseReading(t, trackerId, site.center.lat, site.center.lng, 0, 0, true, false,
      rand(prng, 0, 0.1), rand(prng, 3.5, 3.8), randInt(prng, 0, 2), randInt(prng, 3, 6), 0, prng);
    readings.push(r);
  }
  return readings;
}

function generateGeneratorReadings(asset: Asset, dayMs: number, endMs: number, prng: () => number, lowBattery: boolean): Reading[] {
  const readings: Reading[] = [];
  const site = seed.sites.find(s => s.id === asset.homeSiteId);
  if (!site) return readings;
  const tracker = currentTrackerAndAsset(asset);
  if (!tracker) return readings;
  const trackerId = tracker.id;
  const interval = lowBattery ? 60 * 60 * 1000 : 30 * 1000;
  const odometer = rand(prng, 100, 500);

  for (let t = dayMs; t < endMs && t < nowMs(); t += interval) {
    const r = baseReading(t, trackerId, site.center.lat + rand(prng, -0.0005, 0.0005), site.center.lng + rand(prng, -0.0005, 0.0005), 0, 0, true, false,
      lowBattery ? rand(prng, 3.5, 3.7) : rand(prng, 12.5, 13.5), lowBattery ? rand(prng, 3.5, 3.8) : rand(prng, 3.9, 4.1),
      randInt(prng, 1, 3), randInt(prng, 6, 10), odometer + rand(prng, 0, 0.01), prng);
    readings.push(r);
  }
  return readings;
}

function generateLightVehicleReadings(asset: Asset, dayMs: number, endMs: number, prng: () => number): Reading[] {
  const readings: Reading[] = [];
  const site = seed.sites.find(s => s.id === asset.homeSiteId);
  if (!site) return readings;
  const tracker = currentTrackerAndAsset(asset);
  if (!tracker) return readings;
  const trackerId = tracker.id;
  const interval = 30 * 1000;
  const shiftStart = dayMs + 7 * 3600000;
  const shiftEnd = dayMs + 19 * 3600000;
  let lat = site.center.lat;
  let lng = site.center.lng;

  for (let t = dayMs; t < endMs && t < nowMs(); t += interval) {
    const inShift = t >= shiftStart && t <= shiftEnd;
    const ignition = inShift && prng() > 0.3;
    const moving = ignition && prng() > 0.5;
    const speed = moving ? rand(prng, 20, 70) : 0;
    const heading = (t * 0.01) % 360;
    const dt = interval / 3600000;
    const dist = (speed * dt * 1000) / 3600 * (moving ? 1 : 0);

    lat += rand(prng, -0.00005, 0.00005) + (moving ? Math.cos(heading * Math.PI / 180) * dist / 111000 : 0);
    lng += rand(prng, -0.00005, 0.00005) + (moving ? Math.sin(heading * Math.PI / 180) * dist / (111000 * Math.cos(lat * Math.PI / 180)) : 0);

    const extV = ignition ? rand(prng, 12.4, 14.2) : rand(prng, 12.2, 13.0);

    const r = baseReading(t, trackerId, lat, lng, speed, heading, ignition, moving,
      extV, rand(prng, 3.9, 4.1), randInt(prng, 2, 5), randInt(prng, 7, 14), dist, prng);

    readings.push(r);
  }
  return readings;
}

function generateMovingReadings(asset: Asset, dayMs: number, endMs: number, prng: () => number): Reading[] {
  const readings: Reading[] = [];
  const site = seed.sites.find(s => s.id === asset.homeSiteId);
  if (!site) return readings;
  const tracker = currentTrackerAndAsset(asset);
  if (!tracker) return readings;
  const trackerId = tracker.id;
  const interval = 30 * 1000;
  const shiftStart = dayMs + 7 * 3600000;
  const shiftEnd = dayMs + 18 * 3600000;
  let lat = site.center.lat;
  let lng = site.center.lng;

  for (let t = dayMs; t < endMs && t < nowMs(); t += interval) {
    const inShift = t >= shiftStart && t <= shiftEnd;
    const working = inShift;
    const ignition = working;
    const moving = working && prng() > 0.3;
    const speed = moving ? rand(prng, 5, 25) : 0;
    const heading = (t * 0.005) % 360;
    const dt = interval / 3600000;
    const dist = (speed * dt * 1000) / 3600 * (moving ? 1 : 0);

    lat += rand(prng, -0.0001, 0.0001) + (moving ? Math.cos(heading * Math.PI / 180) * dist / 111000 : 0);
    lng += rand(prng, -0.0001, 0.0001) + (moving ? Math.sin(heading * Math.PI / 180) * dist / (111000 * Math.cos(lat * Math.PI / 180)) : 0);

    const r = baseReading(t, trackerId, lat, lng, speed, heading, ignition, moving,
      rand(prng, 24.0, 28.0), rand(prng, 3.9, 4.1), randInt(prng, 2, 5), randInt(prng, 7, 14), dist, prng);

    readings.push(r);
  }
  return readings;
}

function generateLiftingReadings(asset: Asset, dayMs: number, endMs: number, prng: () => number, isMoving: boolean): Reading[] {
  const readings: Reading[] = [];
  const site = seed.sites.find(s => s.id === asset.homeSiteId);
  if (!site) return readings;
  const tracker = currentTrackerAndAsset(asset);
  if (!tracker) return readings;
  const trackerId = tracker.id;
  const interval = 30 * 1000;
  const shiftStart = dayMs + 7 * 3600000;
  const shiftEnd = dayMs + 17 * 3600000;
  let lat = site.center.lat;
  let lng = site.center.lng;

  for (let t = dayMs; t < endMs && t < nowMs(); t += interval) {
    const inShift = t >= shiftStart && t <= shiftEnd;
    const ignition = inShift;
    const moving = isMoving && inShift && prng() > 0.5;
    const speed = moving ? rand(prng, 5, 15) : 0;

    lat += rand(prng, -0.0002, 0.0002) + (moving ? rand(prng, -0.0003, 0.0003) : 0);
    lng += rand(prng, -0.0002, 0.0002) + (moving ? rand(prng, -0.0003, 0.0003) : 0);

    const r = baseReading(t, trackerId, lat, lng, speed, rand(prng, 0, 360), ignition, moving,
      rand(prng, 12.4, 13.2), rand(prng, 3.9, 4.1), randInt(prng, 2, 5), randInt(prng, 7, 12), 0, prng);

    readings.push(r);
  }
  return readings;
}

function currentTrackerAndAsset(asset: Asset): typeof seed.trackers[0] | null {
  // Find the current pairing (explicit swap tracking)
  const currentPairing = seed.pairings.find(p => p.assetId === asset.id && p.to === null);
  if (currentPairing) return seed.trackers.find(t => t.id === currentPairing.trackerId) ?? null;
  // Fallback: use the tracker's assetId field (implicit pairing from seed)
  return seed.trackers.find(t => t.assetId === asset.id && t.stockStatus === 'paired') ?? null;
}

// ── FB-12 scripted movement (drives to destination) ────────────────────────────

export function getFB12Readings(startMs: number, endMs: number): Reading[] {
  const readings: Reading[] = [];
  const start = { lat: 25.0118, lng: 55.1132 };
  const dest = { lat: 25.1130, lng: 55.2000 };
  const startAt = ANCHOR_MS;
  const arriveAt = ANCHOR_MS + 90 * 60000;
  const now = clock.now();
  const actualEnd = Math.min(endMs, Math.max(arriveAt, now));

  // Linear movement with jitter
  const duration = arriveAt - startAt;
  const steps = Math.floor((actualEnd - startAt) / 30000);
  const tracker = seed.trackers.find(t => t.id === 'tr-fb12')!;

  for (let i = 0; i <= steps; i++) {
    const t = startAt + (i / steps) * duration;
    if (t > now) break;
    const frac = (t - startAt) / duration;
    const jitter = mulberry32(ANCHOR_MS + i);
    const lat = start.lat + (dest.lat - start.lat) * frac + (jitter() - 0.5) * 0.001;
    const lng = start.lng + (dest.lng - start.lng) * frac + (jitter() - 0.5) * 0.001;
    const dist = frac * 35; // ~35 km total
    const speed = Math.min(90, 60 + Math.sin(frac * Math.PI) * 25);

    const r: Reading = {
      trackerId: tracker.id,
      deviceTime: new Date(t).toISOString(),
      receivedAt: new Date(t + 5000).toISOString(),
      lat, lng, speedKmh: speed, heading: 60, satellites: 10, ignition: true, moving: true,
      extVoltage: 26.5, intBattery: 4.0, gsm: 4, gnssOdometerKm: dist,
      fuelLevelPct: undefined, fuelUsedL: undefined, fuelRateLph: undefined,
      rpm: undefined, canOdometerKm: undefined, coolantC: undefined,
      engineLoadPct: undefined, engineHours: undefined, activeDtcs: undefined, adBluePct: undefined,
    };
    readings.push(r);
  }

  return readings;
}

// ── GN-01 scripted fuel drop ────────────────────────────────────────────────────

export function injectGNFuelDrop(readings: Reading[]): Reading[] {
  const dropReading: Reading = {
    trackerId: 'tr-gn01',
    deviceTime: new Date(ANCHOR_MS - 1 * 24 * 3600000 + 2 * 3600000 + 10 * 60000).toISOString(),
    receivedAt: new Date(ANCHOR_MS - 1 * 24 * 3600000 + 2 * 3600000 + 10 * 60000 + 5000).toISOString(),
    lat: 25.1366, lng: 55.2311, speedKmh: 0, heading: 0, satellites: 8,
    ignition: false, moving: false,
    extVoltage: 12.6, intBattery: 3.5, gsm: 3, gnssOdometerKm: 100,
    fuelLevelPct: 32,
    fuelUsedL: 50, fuelRateLph: 0,
    rpm: undefined, canOdometerKm: undefined, coolantC: 40,
    engineLoadPct: 0, engineHours: 2400.5, activeDtcs: undefined, adBluePct: undefined,
    event: 'power_cut' as const,
  };
  return [...readings, dropReading];
}

// ── Replay batch for FB-14 (20 readings, tracker time 6h before anchor) ────────

export function getFB14ReplayBatch(): Reading[] {
  const readings: Reading[] = [];
  const tracker = seed.trackers.find(t => t.id === 'tr-fb14')!;
  const deviceTimeMs = ANCHOR_MS - 6 * 3600000;
  const baseLat = 25.0118;
  const baseLng = 55.1132;

  for (let i = 0; i < 20; i++) {
    const t = deviceTimeMs + i * 1800000; // every 30 min
    const r: Reading = {
      trackerId: tracker.id,
      deviceTime: new Date(t).toISOString(),
      receivedAt: new Date(ANCHOR_MS - 2 * 3600000 + i * 30000).toISOString(),
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
