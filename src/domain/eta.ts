// ETA maths for the public tracking page — spec 11.14.
//
// Pure functions, no React and no server imports, so every surface computes the
// same number: the public page, the owner's link row and (later) a server-side
// link resolver. Unit-tested in src/domain/eta.test.ts.
//
// Rules, exactly as specified:
//   • distance = straight-line distance to the destination × road factor 1.3
//   • speed    = average moving speed over the last 15 min, clamped to 25–80 km/h,
//                defaulting to 40 km/h when nothing moved
//   • ETA      = now + distance ÷ speed, rounded to the minute
//   • arrived  = a reading inside 200 m of the destination (stays arrived afterwards)
//   • unavailable = last reading older than S (the stale threshold), or no reading
//                   at all after the link started

import type { LatLng } from '@/domain/types';
import {
  ETA_ROAD_FACTOR,
  ETA_ARRIVED_M,
  ETA_SPEED_WINDOW_MIN,
  ETA_SPEED_MIN_KMH,
  ETA_SPEED_MAX_KMH,
  ETA_SPEED_DEFAULT_KMH,
  STALE_AFTER_SEC,
} from '@/config/thresholds';

export type EtaState = 'en_route' | 'arrived' | 'unavailable';

/**
 * The only ETA shape the public resolver is allowed to expose (architecture rule 8).
 * `etaAt` is the arrival time in ms; for `arrived` it is the time the asset arrived,
 * and it is null when the ETA is unavailable.
 */
export interface Eta {
  destinationName: string;
  etaAt: number | null;
  state: EtaState;
}

/** A reading reduced to what the ETA needs. */
export interface EtaReading extends LatLng {
  atMs: number;
  speedKmh: number;
  moving: boolean;
}

export interface EtaInput {
  destination: { name: string } & LatLng;
  /** Readings after the link was created, oldest first. */
  readings: EtaReading[];
  nowMs: number;
}

const EARTH_RADIUS_KM = 6371;

/** Straight-line (great-circle) distance in km. */
export function straightLineKm(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Straight-line distance × the 1.3 road factor. */
export function roadDistanceKm(from: LatLng, to: LatLng): number {
  return straightLineKm(from, to) * ETA_ROAD_FACTOR;
}

export function isArrivedAt(from: LatLng, destination: LatLng): boolean {
  return straightLineKm(from, destination) <= ETA_ARRIVED_M / 1000;
}

/**
 * Average moving speed over the last 15 minutes, clamped to 25–80 km/h.
 * Readings that are not moving are ignored; with none moving, 40 km/h is used.
 */
export function averageMovingSpeedKmh(readings: EtaReading[], nowMs: number): number {
  const windowStart = nowMs - ETA_SPEED_WINDOW_MIN * 60 * 1000;
  const moving = readings.filter(r => r.atMs >= windowStart && r.atMs <= nowMs && r.moving && r.speedKmh > 0);
  if (moving.length === 0) return ETA_SPEED_DEFAULT_KMH;
  const avg = moving.reduce((sum, r) => sum + r.speedKmh, 0) / moving.length;
  return Math.min(ETA_SPEED_MAX_KMH, Math.max(ETA_SPEED_MIN_KMH, avg));
}

/** Round a timestamp to the minute. */
export function roundToMinute(ms: number): number {
  return Math.round(ms / 60000) * 60000;
}

/** True when the last reading is too old to base an ETA on ("older than S"). */
export function isReadingTooOld(lastReadingAtMs: number, nowMs: number): boolean {
  return nowMs - lastReadingAtMs > STALE_AFTER_SEC * 1000;
}

/**
 * The ETA, or the reason there isn't one.
 * Returns the exact resolver shape: { destinationName, etaAt, state }.
 */
export function computeEta({ destination, readings, nowMs }: EtaInput): Eta {
  const destinationName = destination.name;
  const sorted = [...readings].sort((a, b) => a.atMs - b.atMs);
  const last = sorted[sorted.length - 1];

  if (!last) return { destinationName, etaAt: null, state: 'unavailable' };

  // Arrived — once a reading is inside 200 m it stays arrived, even if the asset
  // leaves later or stops reporting. A fact already observed doesn't expire.
  const arrival = sorted.find(r => isArrivedAt(r, destination));
  if (arrival) return { destinationName, etaAt: arrival.atMs, state: 'arrived' };

  // Unavailable — the last reading is older than S, so there is nothing to project from.
  if (isReadingTooOld(last.atMs, nowMs)) {
    return { destinationName, etaAt: null, state: 'unavailable' };
  }

  const speedKmh = averageMovingSpeedKmh(sorted, nowMs);
  const distanceKm = roadDistanceKm(last, destination);
  const travelMs = (distanceKm / speedKmh) * 3600 * 1000;

  return { destinationName, etaAt: roundToMinute(nowMs + travelMs), state: 'en_route' };
}

/** Whole minutes until the ETA (never negative). */
export function minutesAway(etaAt: number, nowMs: number): number {
  return Math.max(0, Math.round((etaAt - nowMs) / 60000));
}

/** HH:MM in Dubai time — codes, numbers and times always use Latin digits. */
export function formatDubaiClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Dubai',
  });
}

/**
 * The one line the hirer and the owner both see (spec 11.7):
 * "Arriving about 14:52 (in 18 min)" / "Arrived 14:50" / "ETA unavailable — waiting for update".
 * The destination name is shown separately — coordinates are never exposed.
 */
export function formatEtaLine(eta: Eta, nowMs: number): string {
  if (eta.state === 'unavailable' || eta.etaAt === null) return 'ETA unavailable — waiting for update';
  if (eta.state === 'arrived') return `Arrived ${formatDubaiClock(eta.etaAt)}`;
  return `Arriving about ${formatDubaiClock(eta.etaAt)} (in ${minutesAway(eta.etaAt, nowMs)} min)`;
}
