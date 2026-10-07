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
  const currentPairing = seed.pairings.find(p => p.assetId === asset.id && p.to === null);
  if (currentPairing) return seed.trackers.find(t => t.id === currentPairing.trackerId) ?? null;
  return seed.trackers.find(t => t.assetId === asset.id && t.stockStatus === 'paired') ?? null;
}

function hasAnyReading(asset: Asset): boolean {
  const tracker = currentTrackerFor(asset);
  if (!tracker) return false;
  getReadingsForAsset(asset, clock.now() - 86400000, clock.now() + 86400000);
  const dayMap = cache.get(tracker.id);
  if (!dayMap) return false;
  for (const readings of dayMap.values()) {
    for (const r of readings) {
      if (r.trackerId === tracker.id) return true;
    }
  }
  return false;
}

function lastReadingFor(asset: Asset): Reading | null {
  const tracker = currentTrackerFor(asset);
  if (!tracker) return null;
  getReadingsForAsset(asset, clock.now() - 86400000, clock.now() + 86400000);
  const dayMap = cache.get(tracker.id);
  if (!dayMap) return null;
  let latest: Reading | null = null;
  const latestTime = new Date(clock.now()).getTime();
  for (const readings of dayMap.values()) {
    for (const r of readings) {
      const t = new Date(r.deviceTime).getTime();
      if (t <= latestTime && (!latest || t > new Date(latest.deviceTime).getTime())) {
        latest = r;
      }
    }
  }
  return latest;
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

function makeDayReadings(asset: Asset, dayMs: number): Reading[] {
  const prng = mulberry32(assetSeed(asset) + Math.floor(dayMs / 86400000));
  const dayEndDubai = dayMs + 86400000;
  const now = clock.now();

  // Asset-specific scenarios
  const isWT08 = asset.code === 'WT-08';
  const isTP23 = asset.code === 'TP-23';
  const isGN02 = asset.code === 'GN-02';
  const isSL02 = asset.code === 'SL-02';
  const isFL09 = asset.code === 'FL-09';
  const isMW01 = asset.code === 'MW-01';
  const isLD09 = asset.code === 'LD-09';
  const isEX07 = asset.code === 'EX-07';
  const isCR05 = asset.code === 'CR-05';

  const isOutsideAnchor = dayMs > now;
  const isAnchorDay = Math.floor(now / 86400000) === Math.floor(dayMs / 86400000);

  // Scenario: WT-08 goes offline at 6 Oct (anchor day) 09:00
  if (isWT08 && isAnchorDay) {
    const offlineAt = dayMs + 9 * 3600000;
    const beforeOffline = generatePlantReadings(asset, dayMs, offlineAt, prng, false);
    const afterOffline: Reading[] = [];
    return [...beforeOffline, ...afterOffline];
  }

  // Scenario: TP-23 — power cut 2h ago, then offline 40min ago
  if (isTP23) {
    const powerCutAt = now - 2 * 3600000;
    const offlineAt = now - 40 * 60000;
    // Generate readings up to power cut
    const beforePower = generateTruckReadings(asset, dayMs, powerCutAt, prng);
    // Generate readings from power cut to offline (on battery)
    const duringPower = generateBatteryReadings(asset, powerCutAt, offlineAt, prng);
    return [...beforePower, ...duringPower];
  }

  // Scenario: GN-02 — low battery, stale, power off for days
  if (isGN02) {
    const lastReadingAt = now - 3 * 86400000; // 3 days ago
    return generateGeneratorReadings(asset, dayMs, Math.min(dayEndDubai, lastReadingAt), prng, true);
  }

  // Scenario: SL-02 — offline 2 days
  if (isSL02) {
    const offlineAt = now - 2 * 86400000;
    return generateLiftingReadings(asset, dayMs, Math.min(dayEndDubai, offlineAt), prng, false);
  }

  // Scenario: FL-09 — paired this morning, never reported (Unknown)
  if (isFL09) {
    const pairingAt = now - 0.5 * 3600000;
    if (dayMs + 86400000 <= pairingAt) return [];
    // No readings — unknown until first fix
    return [];
  }

  // Scenario: MW-01 — no tracker
  if (isMW01 || isLD09) {
    return [];
  }

  // Scenario: EX-07 — offline 3 hours (will come online when booking starts tomorrow)
  if (isEX07 && isAnchorDay) {
    const offlineAt = now - 3 * 3600000;
    return generatePlantReadings(asset, dayMs, offlineAt, prng, false);
  }

  // Scenario: CR-05 — stale (booking cancelled)
  if (isCR05) {
    const staleAt = now - 36 * 3600000; // 36 hours ago
    return generatePlantReadings(asset, dayMs, Math.min(dayEndDubai, staleAt), prng, false);
  }

  // Future days — no readings yet
  if (isOutsideAnchor) return [];

  // Generate based on behaviour
  const behaviour = asset.behaviour;
  if (behaviour === 'parked') {
    return generateParkedReadings(asset, dayMs, dayEndDubai, prng);
  }
  if (behaviour === 'stationary_24h') {
    return generateGeneratorReadings(asset, dayMs, dayEndDubai, prng, false);
  }
  if (behaviour === 'light_vehicle_day') {
    return generateLightVehicleReadings(asset, dayMs, dayEndDubai, prng);
  }
  if (behaviour === 'works_at_site' || behaviour === 'drives_between_sites') {
    return generateMovingReadings(asset, dayMs, dayEndDubai, prng);
  }

  return generateParkedReadings(asset, dayMs, dayEndDubai, prng);
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
    const moving = isMoving && inShift && Math.random() > 0.3;
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
    const ignition = inShift && Math.random() > 0.2;
    const moving = ignition && Math.random() > 0.4;
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
    const ignition = inShift && Math.random() > 0.3;
    const moving = ignition && Math.random() > 0.5;
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
    const moving = working && Math.random() > 0.3;
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
    const moving = isMoving && inShift && Math.random() > 0.5;
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
  const currentPairing = seed.pairings.find(p => p.assetId === asset.id && p.to === null);
  if (currentPairing) return seed.trackers.find(t => t.id === currentPairing.trackerId) ?? null;
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
    const lat = start.lat + (dest.lat - start.lat) * frac + (Math.random() - 0.5) * 0.001;
    const lng = start.lng + (dest.lng - start.lng) * frac + (Math.random() - 0.5) * 0.001;
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

// ── Replay batch for FB-14 (20 readings, device time 6h before anchor) ─────────

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
