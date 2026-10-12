// Trip windows from readings (spec §11.5 trip rule). Pure maths: the caller passes
// readings, nothing here reads the clock or the store.
//
// The rule, in one place because two things need it: the Trips tab (src/server/trips.ts
// turns these windows into trips with distance and top speed) and the playback event
// pins (§11.15 wants a pin where a trip starts and where it ends).
//
// A trip starts at ignition on and speed > IDLE_SPEED_KMH. It ends after the machine
// has stood still for TRIP_STOP_END_MS, when ignition turns off, or at a data gap
// longer than the stale window. Distance is never interpolated across a gap.

import type { Reading } from '@/domain/types';
import { IDLE_SPEED_KMH, STALE_AFTER_SEC } from '@/config/thresholds';

export interface TripWindow {
  startMs: number;
  endMs: number;
  /** The readings inside the trip, in time order; never empty. */
  readings: Reading[];
}

/** A silence longer than this ends a trip (same window as the status rules). */
export const TRIP_GAP_MS = STALE_AFTER_SEC * 1000;
/** A trip ends after this long stopped. */
export const TRIP_STOP_END_MS = 5 * 60_000;

export function readingTime(r: Reading): number {
  return Date.parse(r.deviceTime);
}

/** Readings in time order. Returns a copy; the input is untouched. */
export function sortByTime(readings: Reading[]): Reading[] {
  return [...readings].sort((a, b) => readingTime(a) - readingTime(b));
}

/** Ignition on and actually rolling. */
export function isDriving(r: Reading): boolean {
  return r.ignition && r.speedKmh > IDLE_SPEED_KMH;
}

/**
 * Split readings into trips, using the spec's trip rule.
 *
 * "Five minutes stopped" is measured from the first reading that shows the machine
 * standing, not from the previous reading: a machine that keeps reporting every 30
 * seconds while it idles must still end its trip five minutes later, and a trip's end
 * is the last reading that was part of the driving.
 */
export function groupTrips(readings: Reading[]): TripWindow[] {
  const windows: TripWindow[] = [];
  let current: TripWindow | null = null;
  /** When the machine was first seen standing still, inside the open trip. */
  let stoodSince: number | null = null;

  const close = () => {
    if (current) windows.push(current);
    current = null;
    stoodSince = null;
  };

  for (const r of sortByTime(readings)) {
    const t = readingTime(r);
    const driving = isDriving(r);

    if (current) {
      const sinceLast = t - current.endMs;
      if (sinceLast > TRIP_GAP_MS || !r.ignition) {
        close();
      } else if (driving) {
        stoodSince = null;
        current.readings.push(r);
        current.endMs = t;
        continue;
      } else {
        // Standing with the engine on: the trip is still open until the stop is long
        // enough to count, but a stopped machine adds no distance and no top speed.
        if (stoodSince === null) stoodSince = t;
        if (t - stoodSince >= TRIP_STOP_END_MS) close();
        continue;
      }
    }

    if (driving) current = { startMs: t, endMs: t, readings: [r] };
  }
  close();
  return windows;
}
