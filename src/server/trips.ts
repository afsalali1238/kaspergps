// Trip detection from readings (spec §11.5 trip rule).
//
// A trip starts at ignition on and speed > 3 km/h; it ends after 5 minutes
// stopped or when ignition turns off. A data gap longer than the stale window
// ends the trip and is reported as a gap — distance is never interpolated
// across a gap.

import type { Asset, Reading } from '@/domain/types';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { TRIP_GAP_MS, groupTrips, readingTime, sortByTime } from '@/domain/trips';

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

const readingMs = readingTime;

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
 * Detect trips in [fromMs, toMs]. The trip rule itself lives in src/domain/trips.ts
 * (the playback pins need the same rule); this function adds what the Trips tab
 * shows: id, start and end places, distance and top speed.
 */
export function detectTrips(asset: Asset, fromMs: number, toMs: number): Trip[] {
  const readings = sortByTime(getReadingsForAsset(asset, fromMs, toMs));
  const trips: Trip[] = [];

  groupTrips(readings).forEach((window, index) => {
    const rs = window.readings;
    const first = rs[0];
    const last = rs[rs.length - 1];
    let distance = 0;
    let maxSpeedKmh = 0;
    for (let i = 0; i < rs.length; i++) {
      maxSpeedKmh = Math.max(maxSpeedKmh, rs[i].speedKmh);
      if (i > 0 && readingMs(rs[i]) - readingMs(rs[i - 1]) <= TRIP_GAP_MS) {
        distance += haversineKm(rs[i - 1], rs[i]);
      }
    }
    trips.push({
      id: `trip-${asset.id}-${index + 1}`,
      assetId: asset.id,
      startMs: window.startMs,
      endMs: window.endMs,
      startLat: first.lat,
      startLng: first.lng,
      endLat: last.lat,
      endLng: last.lng,
      distanceKm: Math.round(distance * 100) / 100,
      maxSpeedKmh: Math.round(maxSpeedKmh),
      durationMin: Math.max(1, Math.round((window.endMs - window.startMs) / 60_000)),
    });
  });

  return trips;
}

/** Total GPS distance over the period, never across gaps. */
export function distanceKm(asset: Asset, fromMs: number, toMs: number): number {
  return detectTrips(asset, fromMs, toMs).reduce((sum, t) => sum + t.distanceKm, 0);
}
