// ETA calculation — straight-line estimate, no routing.
// Architecture rule 9: all time from clock.ts.

import { ETA_ROAD_FACTOR, ETA_ARRIVED_M } from '@/config/thresholds';
import * as clock from '@/lib/clock';
import type { LatLng } from '@/domain/types';

/**
 * Straight-line distance in km between two points (haversine).
 */
function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const x = sinDLat * sinDLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Average moving speed over the last `window` readings, clamped to [minKmh, maxKmh].
 * Defaults to `defaultKmh` when there aren't enough moving readings.
 */
export function averageMovingSpeed(
  readings: { speedKmh: number; ignition: boolean; deviceTime: string | number }[],
  windowMs: number,
  defaultKmh = 40,
  minKmh = 25,
  maxKmh = 80,
): number {
  const now = clock.now();
  const cutoff = now - windowMs;
  const moving = readings
    .filter(r => {
      const t = typeof r.deviceTime === 'number' ? r.deviceTime : new Date(r.deviceTime).getTime();
      return t >= cutoff;
    })
    .filter(r => r.ignition && r.speedKmh > 0)
    .sort((a, b) => {
      const ta = typeof a.deviceTime === 'number' ? a.deviceTime : new Date(a.deviceTime).getTime();
      const tb = typeof b.deviceTime === 'number' ? b.deviceTime : new Date(b.deviceTime).getTime();
      return tb - ta;
    })
    .slice(0, 30);

  if (moving.length === 0) return defaultKmh;
  const avg = moving.reduce((s, r) => s + r.speedKmh, 0) / moving.length;
  return Math.max(minKmh, Math.min(maxKmh, avg));
}

/**
 * ETA result: 'en_route' when distance remains, 'arrived' when within 200 m,
 * 'unavailable' when there isn't enough data to compute.
 */
export type EtaState = 'en_route' | 'arrived' | 'unavailable';

export interface EtaResult {
  etaAt: number;
  state: EtaState;
}

/**
 * Compute ETA to a destination from a current position and speed.
 * Returns 'unavailable' when position == destination (zero distance) or speed is 0.
 */
export function calcEta(
  position: LatLng,
  destination: LatLng,
  avgSpeedKmh: number,
): EtaResult {
  const distKm = haversineKm(position, destination);
  if (avgSpeedKmh <= 0) return { etaAt: 0, state: 'unavailable' };
  const roadDistKm = distKm * ETA_ROAD_FACTOR;
  if (roadDistKm === 0) return { etaAt: 0, state: 'unavailable' };
  const etaMs = (roadDistKm / avgSpeedKmh) * 3600 * 1000;
  const etaAt = clock.now() + etaMs;
  const state = distKm * 1000 < ETA_ARRIVED_M ? 'arrived' : 'en_route';
  return { etaAt, state };
}
