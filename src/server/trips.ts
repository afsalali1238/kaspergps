// Trip detection from readings (spec §11.5 trip rule).
//
// A trip starts at ignition on and speed > 3 km/h; it ends after 5 minutes
// stopped or when ignition turns off. A data gap longer than the stale window
// ends the trip and is reported as a gap — distance is never interpolated
// across a gap.

import type { Asset, Reading } from '@/domain/types';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { IDLE_SPEED_KMH, STALE_AFTER_SEC } from '@/config/thresholds';

export interface Trip {
  id: string;
  assetId: string;
  startMs: number;
  endMs: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  distanceKm: number;
  maxSpeedKmh: number;
  durationMin: number;
}

export interface DataGap {
  from: number;
  to: number;
}

const TRIP_GAP_MS = STALE_AFTER_SEC * 1000;
const STOP_END_MS = 5 * 60_000;

function readingMs(r: Reading): number {
  return new Date(r.deviceTime).getTime();
}

function haversineKm(a: Reading, b: Reading): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Gaps between readings: holes longer than the stale window, inside [fromMs, toMs]. */
export function findGaps(readings: Reading[], fromMs: number, toMs: number): DataGap[] {
  const gaps: DataGap[] = [];
  const sorted = [...readings].sort((a, b) => readingMs(a) - readingMs(b));
  let cursor = fromMs;
  for (const r of sorted) {
    const t = readingMs(r);
    if (t - cursor > TRIP_GAP_MS) gaps.push({ from: cursor, to: t });
    if (t > cursor) cursor = t;
  }
  if (toMs - cursor > TRIP_GAP_MS) gaps.push({ from: cursor, to: toMs });
  return gaps;
}

/**
 * Detect trips in [fromMs, toMs]. Gaps longer than the stale window split
 * trips; distance is summed only between consecutive in-trip readings less
 * than the gap window apart.
 */
export function detectTrips(asset: Asset, fromMs: number, toMs: number): Trip[] {
  const readings = getReadingsForAsset(asset, fromMs, toMs)
    .slice()
    .sort((a, b) => readingMs(a) - readingMs(b));
  const trips: Trip[] = [];
  let current: {
    readings: Reading[];
    startMs: number;
    lastMs: number;
    distanceKm: number;
    maxSpeedKmh: number;
  } | null = null;
  let seq = 0;

  const close = () => {
    if (!current) return;
    const rs = current.readings;
    const first = rs[0];
    const last = rs[rs.length - 1];
    trips.push({
      id: `trip-${asset.id}-${++seq}`,
      assetId: asset.id,
      startMs: current.startMs,
      endMs: current.lastMs,
      startLat: first.lat,
      startLng: first.lng,
      endLat: last.lat,
      endLng: last.lng,
      distanceKm: Math.round(current.distanceKm * 100) / 100,
      maxSpeedKmh: Math.round(current.maxSpeedKmh),
      durationMin: Math.max(1, Math.round((current.lastMs - current.startMs) / 60_000)),
    });
    current = null;
  };

  for (const r of readings) {
    const t = readingMs(r);
    const moving = r.ignition && r.speedKmh > IDLE_SPEED_KMH;

    if (current) {
      const sinceLast = t - current.lastMs;
      const stoppedLong = !moving && t - current.lastMs >= STOP_END_MS;
      if (sinceLast > TRIP_GAP_MS || stoppedLong || !r.ignition) {
        close();
      } else {
        if (sinceLast <= TRIP_GAP_MS) {
          current.distanceKm += haversineKm(current.readings[current.readings.length - 1], r);
        }
        current.maxSpeedKmh = Math.max(current.maxSpeedKmh, r.speedKmh);
        current.lastMs = t;
        current.readings.push(r);
        continue;
      }
    }

    if (moving) {
      current = {
        readings: [r],
        startMs: t,
        lastMs: t,
        distanceKm: 0,
        maxSpeedKmh: r.speedKmh,
      };
    }
  }
  close();
  return trips;
}

/** Total GPS distance over the period, never across gaps. */
export function distanceKm(asset: Asset, fromMs: number, toMs: number): number {
  return detectTrips(asset, fromMs, toMs).reduce((sum, t) => sum + t.distanceKm, 0);
}
