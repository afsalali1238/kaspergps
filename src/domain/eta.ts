// ETA maths for the public tracking page (spec 11.14).
// Pure functions — no store, no seed, no clock. Callers pass `nowMs`.
//
//   distance = straight-line distance to the destination × road factor 1.3
//   speed    = average moving speed over the last 15 min, clamped to 25–80 km/h,
//              defaulting to 40 km/h
//   ETA      = now + distance ÷ speed, rounded to the minute

import type { LatLng, Reading } from '@/domain/types';
import { ETA_ROAD_FACTOR, ETA_ARRIVED_M, IDLE_SPEED_KMH } from '@/config/thresholds';

export type EtaState = 'en_route' | 'arrived' | 'unavailable';

export const ETA_SPEED_WINDOW_MIN = 15;
export const ETA_SPEED_MIN_KMH = 25;
export const ETA_SPEED_MAX_KMH = 80;
export const ETA_SPEED_DEFAULT_KMH = 40;

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Average speed of moving readings inside the window ending at `nowMs`.
 * Returns null when there are no moving readings (caller falls back to the default).
 */
export function averageMovingSpeedKmh(readings: Reading[], nowMs: number, windowMin = ETA_SPEED_WINDOW_MIN): number | null {
  const from = nowMs - windowMin * 60 * 1000;
  let sum = 0;
  let n = 0;
  for (const r of readings) {
    const t = Date.parse(r.deviceTime);
    if (Number.isFinite(t) && t >= from && t <= nowMs && r.speedKmh > IDLE_SPEED_KMH) {
      sum += r.speedKmh;
      n++;
    }
  }
  return n === 0 ? null : sum / n;
}

/** Clamp the measured average to 25–80 km/h; default 40 km/h when nothing is moving. */
export function etaSpeedKmh(avgMovingSpeed: number | null): number {
  if (avgMovingSpeed === null || !Number.isFinite(avgMovingSpeed)) return ETA_SPEED_DEFAULT_KMH;
  return Math.min(ETA_SPEED_MAX_KMH, Math.max(ETA_SPEED_MIN_KMH, avgMovingSpeed));
}

export interface EtaResult {
  etaAt: number;
  state: EtaState;
}

/**
 * ETA for a vehicle at `from` heading to `destination`.
 * `arrivedAt` (optional) keeps the arrival sticky once reached.
 */
export function computeEta(
  from: LatLng,
  destination: LatLng,
  nowMs: number,
  speedKmh = ETA_SPEED_DEFAULT_KMH,
  arrivedAt?: number | null
): EtaResult {
  if (arrivedAt != null) return { etaAt: arrivedAt, state: 'arrived' };
  const straightKm = haversineKm(from, destination);
  if (straightKm * 1000 <= ETA_ARRIVED_M) {
    return { etaAt: nowMs, state: 'arrived' };
  }
  const roadKm = straightKm * ETA_ROAD_FACTOR;
  const ms = (roadKm / speedKmh) * 3600 * 1000;
  // Round to the minute.
  const etaAt = Math.round((nowMs + ms) / 60000) * 60000;
  return { etaAt, state: 'en_route' };
}

/** Distance in metres from a point to the destination. */
export function distanceToDestinationM(point: LatLng, destination: LatLng): number {
  return haversineKm(point, destination) * 1000;
}
