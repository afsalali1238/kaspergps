// Trip detection and playback track building — spec 11.15.
//
// Pure functions only (no React, no server imports) so the player, the Trips tab
// and the unit tests all share one implementation.
//
// Rules:
//   • a trip starts at ignition on + speed > 3 km/h, and ends after 5 min stopped
//     or when the ignition goes off;
//   • a gap longer than TRIP_GAP_MIN ends the trip and is shown as "No data";
//   • distance is never interpolated across a gap;
//   • the trail is downsampled to ≤ 5,000 points; the marker interpolates between
//     consecutive readings only inside one trip and less than 2 min apart.

import type { Reading, Alert, Geofence, GeofenceEvent } from '@/domain/types';
import {
  IDLE_SPEED_KMH,
  OVERSPEED_KMH,
  FUEL_DROP_PCT,
  FUEL_REFUEL_PCT,
  TRIP_STOP_MIN,
  TRIP_GAP_MIN,
  TRACK_BREAK_MIN,
  PLAYBACK_DOWNSAMPLE_MAX,
  PLAYBACK_INTERPOLATE_MAX_SEC,
} from '@/config/thresholds';
import { straightLineKm } from '@/domain/eta';

export type PlaybackState = 'moving' | 'stationary' | 'off' | 'nodata';

export interface TrackPoint {
  t: number;
  lat: number;
  lng: number;
  speedKmh: number;
  heading: number;
  ignition: boolean;
  moving: boolean;
  state: Exclude<PlaybackState, 'nodata'>;
  /** Cumulative GPS distance since the start of the period, never across a gap. */
  gpsDistanceKm: number;
  /** Index of the trip this point belongs to, or null (before/between trips). */
  tripIndex: number | null;
  fuelLevelPct?: number;
  rpm?: number;
  coolantC?: number;
  engineLoadPct?: number;
  engineHours?: number;
  adBluePct?: number;
  /** The reading's own event flag, when the tracker reported one. */
  event?: Reading['event'];
}

export interface TrackGap {
  from: number;
  to: number;
  minutes: number;
}

export interface Trip {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  distanceKm: number;
  durationMin: number;
  movingMin: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  gaps: TrackGap[];
}

export type PlaybackEventKind =
  | 'trip_start'
  | 'trip_stop'
  | 'harsh_brake'
  | 'harsh_accel'
  | 'harsh_corner'
  | 'harsh_driving'
  | 'overspeed'
  | 'geofence_enter'
  | 'geofence_exit'
  | 'refuel'
  | 'fuel_drop'
  | 'power_cut'
  | 'towing';

export interface PlaybackEvent {
  id: string;
  kind: PlaybackEventKind;
  atMs: number;
  lat: number;
  lng: number;
  label: string;
  detail?: string;
  tripId?: string;
}

export interface PlaybackData {
  /** Downsampled track for drawing (≤ 5,000 points). */
  points: TrackPoint[];
  /** Full-resolution track for the marker, the readout and trip maths. */
  track: TrackPoint[];
  trips: Trip[];
  gaps: TrackGap[];
  events: PlaybackEvent[];
  fromMs: number;
  toMs: number;
  totalDistanceKm: number;
}

export interface BuildPlaybackOptions {
  fromMs?: number;
  toMs?: number;
  maxPoints?: number;
  alerts?: Alert[];
  geofences?: Geofence[];
  geofenceEvents?: GeofenceEvent[];
  assetId?: string;
  /** 1, 2 or 3 — fuel pins only exist for Tier 2/3 with a fuel level. */
  tier?: 1 | 2 | 3;
  /** How many CAN/fuel values the asset supports (fuel level gates fuel pins). */
  canSupported?: string[];
}

// ── Basics ────────────────────────────────────────────────────────────────────

export function readingTimeMs(r: Reading): number {
  return new Date(r.deviceTime).getTime();
}

export function stateOfReading(r: Reading): Exclude<PlaybackState, 'nodata'> {
  if (!r.ignition) return 'off';
  if (r.moving || r.speedKmh >= IDLE_SPEED_KMH) return 'moving';
  return 'stationary';
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Dubai',
  });
}

export function gapLabel(gap: TrackGap): string {
  return `No data ${formatClock(gap.from)} – ${formatClock(gap.to)}`;
}

/** Gaps between consecutive readings that are at least `minMinutes` long. */
export function detectGaps(times: number[], minMinutes: number = TRACK_BREAK_MIN): TrackGap[] {
  const gaps: TrackGap[] = [];
  for (let i = 1; i < times.length; i++) {
    const deltaMin = (times[i] - times[i - 1]) / 60000;
    if (deltaMin >= minMinutes) {
      gaps.push({ from: times[i - 1], to: times[i], minutes: Math.round(deltaMin) });
    }
  }
  return gaps;
}

/** The gap covering a moment, if any. */
export function gapAt(gaps: TrackGap[], ms: number): TrackGap | null {
  return gaps.find(g => ms > g.from && ms < g.to) ?? null;
}

function toTrackPoint(r: Reading, gpsDistanceKm: number, tripIndex: number | null): TrackPoint {
  return {
    t: readingTimeMs(r),
    lat: r.lat,
    lng: r.lng,
    speedKmh: r.speedKmh,
    heading: r.heading,
    ignition: r.ignition,
    moving: r.moving,
    state: stateOfReading(r),
    gpsDistanceKm,
    tripIndex,
    fuelLevelPct: r.fuelLevelPct,
    rpm: r.rpm,
    coolantC: r.coolantC,
    engineLoadPct: r.engineLoadPct,
    engineHours: r.engineHours,
    adBluePct: r.adBluePct,
    event: r.event,
  };
}

/** Full-resolution track for a period: cumulative distance, gaps and states. */
export function buildTrack(readings: Reading[], fromMs?: number, toMs?: number): { track: TrackPoint[]; gaps: TrackGap[] } {
  const sorted = readings
    .filter(r => {
      const t = readingTimeMs(r);
      return (fromMs === undefined || t >= fromMs) && (toMs === undefined || t <= toMs);
    })
    .sort((a, b) => readingTimeMs(a) - readingTimeMs(b));

  const track: TrackPoint[] = [];
  let distance = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prev = sorted[i - 1];
      const deltaMin = (readingTimeMs(sorted[i]) - readingTimeMs(prev)) / 60000;
      // Never add distance across a gap.
      if (deltaMin < TRACK_BREAK_MIN) {
        distance += straightLineKm(prev, sorted[i]);
      }
    }
    track.push(toTrackPoint(sorted[i], distance, null));
  }

  const gaps = detectGaps(track.map(p => p.t), TRACK_BREAK_MIN);
  return { track, gaps };
}

// ── Trips ─────────────────────────────────────────────────────────────────────

export function detectTrips(track: TrackPoint[], gaps: TrackGap[]): Trip[] {
  const stopMs = TRIP_STOP_MIN * 60 * 1000;
  const gapMinMs = TRIP_GAP_MIN * 60 * 1000;

  const trips: Trip[] = [];
  let current: TrackPoint[] = [];
  let stoppedSince: number | null = null;

  const close = () => {
    if (current.length >= 2) trips.push(makeTrip(trips.length, current, gaps));
    current = [];
    stoppedSince = null;
  };

  for (let i = 0; i < track.length; i++) {
    const p = track[i];
    const prev = i > 0 ? track[i - 1] : null;
    const gapBefore = prev ? p.t - prev.t : 0;

    // A long gap ends the trip; nothing is interpolated across it.
    if (current.length > 0 && gapBefore >= gapMinMs) close();

    const driving = p.ignition && (p.moving || p.speedKmh >= IDLE_SPEED_KMH);

    if (driving) {
      current.push(p);
      stoppedSince = null;
      continue;
    }

    if (current.length === 0) continue;

    current.push(p);
    if (!p.ignition) {
      close();
    } else {
      if (stoppedSince === null) stoppedSince = p.t;
      if (p.t - stoppedSince >= stopMs) close();
    }
  }
  close();

  // Number the points so the marker can tell whether two readings share a trip.
  trips.forEach((trip, index) => {
    for (let i = 0; i < track.length; i++) {
      if (track[i].t >= trip.startMs && track[i].t <= trip.endMs) track[i].tripIndex = index;
    }
  });

  return trips;
}

function makeTrip(index: number, points: TrackPoint[], allGaps: TrackGap[]): Trip {
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;

  let distanceKm = 0;
  let movingMs = 0;
  let maxSpeedKmh = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    maxSpeedKmh = Math.max(maxSpeedKmh, p.speedKmh);
    if (p.state === 'moving') movingMs += i + 1 < points.length ? points[i + 1].t - p.t : 30000;
    if (i > 0) {
      const deltaMin = (p.t - points[i - 1].t) / 60000;
      if (deltaMin < TRACK_BREAK_MIN) distanceKm += straightLineKm(points[i - 1], p);
    }
  }
  const durationMin = Math.round((t1 - t0) / 60000);

  return {
    id: `trip-${index + 1}`,
    index,
    startMs: t0,
    endMs: t1,
    start: { lat: points[0].lat, lng: points[0].lng },
    end: { lat: points[points.length - 1].lat, lng: points[points.length - 1].lng },
    distanceKm,
    durationMin,
    movingMin: Math.round(movingMs / 60000),
    maxSpeedKmh,
    avgSpeedKmh: durationMin > 0 ? (distanceKm / durationMin) * 60 : 0,
    gaps: allGaps.filter(g => g.from >= t0 && g.to <= t1),
  };
}

/** Trips that overlap a period. */
export function tripsInPeriod(trips: Trip[], fromMs: number, toMs: number): Trip[] {
  return trips.filter(t => t.endMs >= fromMs && t.startMs <= toMs);
}

// ── Downsampling ──────────────────────────────────────────────────────────────

/**
 * Downsample to ≤ maxPoints for drawing. Always keeps the first and last point,
 * trip boundaries, gap edges, state changes and the points closest to `keepTimes`
 * (used for event pins).
 */
export function downsampleTrack(points: TrackPoint[], maxPoints: number = PLAYBACK_DOWNSAMPLE_MAX, keepTimes: number[] = []): TrackPoint[] {
  if (points.length <= maxPoints) return points;

  const keep = new Set<number>();
  keep.add(0);
  keep.add(points.length - 1);

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const p = points[i];
    if (p.state !== prev.state) keep.add(i);
    if (p.tripIndex !== prev.tripIndex) keep.add(i);
    if ((p.t - prev.t) / 60000 >= TRACK_BREAK_MIN) {
      keep.add(i - 1);
      keep.add(i);
    }
  }

  for (const t of keepTimes) {
    keep.add(nearestIndex(points, t));
  }

  const remaining = maxPoints - keep.size;
  if (remaining > 0) {
    const stride = points.length / (remaining + 1);
    for (let k = 1; k <= remaining; k++) {
      keep.add(Math.min(points.length - 1, Math.round(k * stride)));
    }
  }

  return Array.from(keep)
    .sort((a, b) => a - b)
    .map(i => points[i]);
}

export function nearestIndex(points: TrackPoint[], t: number): number {
  if (points.length === 0) return -1;
  let best = 0;
  let bestDelta = Math.abs(points[0].t - t);
  for (let i = 1; i < points.length; i++) {
    const delta = Math.abs(points[i].t - t);
    if (delta < bestDelta) {
      best = i;
      bestDelta = delta;
    }
  }
  return best;
}

/**
 * Index of the last point at or before `ms` (binary search).
 * Used by the player so the drawn trail only changes when it crosses a reading.
 */
export function indexAtOrBefore(points: TrackPoint[], ms: number): number {
  if (points.length === 0) return -1;
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** The reading closest to a moment (used to place pins on the map). */
export function pointAt(points: TrackPoint[], t: number): TrackPoint | null {
  const i = nearestIndex(points, t);
  return i >= 0 ? points[i] : null;
}

// ── Marker interpolation ──────────────────────────────────────────────────────

const GAP_MIN_MS = TRACK_BREAK_MIN * 60 * 1000;
const INTERPOLATE_MAX_MS = PLAYBACK_INTERPOLATE_MAX_SEC * 1000;

export interface MarkerPosition {
  lat: number;
  lng: number;
  heading: number;
  speedKmh: number;
  atMs: number;
  /** True when the marker is showing an interpolated position. */
  interpolated: boolean;
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

function lerpHeading(a: number, b: number, f: number): number {
  const delta = ((b - a + 540) % 360) - 180;
  return (a + delta * f + 360) % 360;
}

/**
 * Marker position at `ms`.
 * Interpolates between consecutive readings only when both sides are inside the
 * same trip and less than 2 minutes apart; otherwise it snaps to the last reading.
 */
export function interpolatePosition(track: TrackPoint[], ms: number): MarkerPosition | null {
  if (track.length === 0) return null;
  if (ms <= track[0].t) {
    return snap(track[0], false);
  }
  const last = track[track.length - 1];
  if (ms >= last.t) return snap(last, false);

  let i = 0;
  let lo = 0;
  let hi = track.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (track[mid].t <= ms) {
      i = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const a = track[i];
  const b = track[i + 1];
  if (!b) return snap(a, false);

  const delta = b.t - a.t;
  const sameTrip = a.tripIndex !== null && a.tripIndex === b.tripIndex;
  const close = delta < GAP_MIN_MS;
  const worthInterpolating = delta > 0 && delta <= INTERPOLATE_MAX_MS;

  if (!sameTrip || !close || !worthInterpolating) return snap(a, false);

  const f = (ms - a.t) / delta;
  return {
    lat: lerp(a.lat, b.lat, f),
    lng: lerp(a.lng, b.lng, f),
    heading: lerpHeading(a.heading, b.heading, f),
    speedKmh: lerp(a.speedKmh, b.speedKmh, f),
    atMs: ms,
    interpolated: true,
  };
}

function snap(p: TrackPoint, interpolated: boolean): MarkerPosition {
  return { lat: p.lat, lng: p.lng, heading: p.heading, speedKmh: p.speedKmh, atMs: p.t, interpolated };
}

// ── Events ────────────────────────────────────────────────────────────────────

const HARSH_KINDS: Record<string, PlaybackEventKind> = {
  harsh_brake: 'harsh_brake',
  harsh_accel: 'harsh_accel',
  harsh_corner: 'harsh_corner',
};

const HARSH_LABELS: Record<string, string> = {
  harsh_brake: 'Harsh braking',
  harsh_accel: 'Harsh acceleration',
  harsh_corner: 'Harsh cornering',
};

const EVENT_LABELS: Partial<Record<PlaybackEventKind, string>> = {
  trip_start: 'Trip start',
  trip_stop: 'Trip stop',
  overspeed: 'Over speed',
  geofence_enter: 'Entered geofence',
  geofence_exit: 'Left geofence',
  refuel: 'Refuel',
  fuel_drop: 'Fuel drop',
  power_cut: 'Power cut',
  towing: 'Towing',
};

/** Fuel level jumps: refuels up, drops down. Tier 2/3 with a fuel level only. */
export function detectFuelEvents(points: TrackPoint[]): { atMs: number; lat: number; lng: number; kind: 'refuel' | 'fuel_drop'; deltaPct: number }[] {
  const events: { atMs: number; lat: number; lng: number; kind: 'refuel' | 'fuel_drop'; deltaPct: number }[] = [];
  const withFuel = points.filter(p => typeof p.fuelLevelPct === 'number');
  for (let i = 1; i < withFuel.length; i++) {
    const prev = withFuel[i - 1];
    const p = withFuel[i];
    const delta = (p.fuelLevelPct ?? 0) - (prev.fuelLevelPct ?? 0);
    if (delta >= FUEL_REFUEL_PCT) {
      events.push({ atMs: p.t, lat: p.lat, lng: p.lng, kind: 'refuel', deltaPct: Math.round(delta) });
    } else if (-delta >= FUEL_DROP_PCT && !p.ignition && (p.t - prev.t) / 60000 <= 15) {
      // A sudden drop with the engine off is a theft/leak, not consumption.
      events.push({ atMs: p.t, lat: p.lat, lng: p.lng, kind: 'fuel_drop', deltaPct: Math.round(delta) });
    }
  }
  return events;
}

export function buildEvents(data: {
  track: TrackPoint[];
  trips: Trip[];
  gaps: TrackGap[];
  alerts?: Alert[];
  geofences?: Geofence[];
  geofenceEvents?: GeofenceEvent[];
  assetId?: string;
  tier?: 1 | 2 | 3;
  canSupported?: string[];
}): PlaybackEvent[] {
  const { track, trips, alerts = [], geofences = [], geofenceEvents = [], assetId, tier = 1, canSupported = [] } = data;
  const events: PlaybackEvent[] = [];
  const place = (t: number) => pointAt(track, t) ?? null;
  const push = (e: Omit<PlaybackEvent, 'lat' | 'lng' | 'atMs'> & { lat?: number; lng?: number }, atMs: number) => {
    const p = e.lat !== undefined && e.lng !== undefined ? null : place(atMs);
    events.push({
      ...e,
      atMs,
      lat: e.lat ?? p?.lat ?? 0,
      lng: e.lng ?? p?.lng ?? 0,
    });
  };

  // Trip boundaries
  for (const trip of trips) {
    push({ id: `${trip.id}-start`, kind: 'trip_start', label: EVENT_LABELS.trip_start!, tripId: trip.id }, trip.startMs);
    push({ id: `${trip.id}-stop`, kind: 'trip_stop', label: EVENT_LABELS.trip_stop!, tripId: trip.id }, trip.endMs);
  }

  // Events the tracker itself reported, then over-speed from plain speed
  for (const p of track) {
    const reported = p.event;
    if (reported) {
      const harsh = HARSH_KINDS[reported];
      if (harsh) push({ id: `${reported}-${p.t}`, kind: harsh, label: HARSH_LABELS[reported] }, p.t);
      else if (reported === 'power_cut') push({ id: `power_cut-${p.t}`, kind: 'power_cut', label: EVENT_LABELS.power_cut! }, p.t);
      else if (reported === 'towing') push({ id: `towing-${p.t}`, kind: 'towing', label: EVENT_LABELS.towing! }, p.t);
    }
    if (p.speedKmh > OVERSPEED_KMH) {
      push({ id: `os-${p.t}`, kind: 'overspeed', label: EVENT_LABELS.overspeed!, detail: `${Math.round(p.speedKmh)} km/h` }, p.t);
    }
  }

  // Fuel pins (Tier 2/3 with a fuel level only)
  if (tier >= 2 && canSupported.includes('fuelLevel')) {
    for (const f of detectFuelEvents(track)) {
      push(
        {
          id: `${f.kind}-${f.atMs}`,
          kind: f.kind,
          label: f.kind === 'refuel' ? `${EVENT_LABELS.refuel} +${f.deltaPct}%` : `${EVENT_LABELS.fuel_drop} ${f.deltaPct}%`,
        },
        f.atMs,
      );
    }
  }

  // From alerts (harsh events, power cut, towing, over-speed, fuel drop, geofence).
  // An alert that describes a reading we already pinned is not pinned twice.
  const alreadyPinned = (kind: PlaybackEventKind, atMs: number) =>
    events.some(e => e.kind === kind && Math.abs(e.atMs - atMs) <= 30 * 60 * 1000);

  for (const alert of alerts) {
    if (alert.assetId !== assetId) continue;
    const atMs = typeof alert.openedAt === 'number' ? alert.openedAt : new Date(alert.openedAt).getTime();
    switch (alert.type) {
      case 'overspeed':
        if (!alreadyPinned('overspeed', atMs)) {
          push({ id: alert.id, kind: 'overspeed', label: EVENT_LABELS.overspeed!, detail: alert.detail }, atMs);
        }
        break;
      case 'harsh_driving':
        push({ id: alert.id, kind: 'harsh_driving', label: 'Harsh driving', detail: alert.detail }, atMs);
        break;
      case 'power_cut':
        push({ id: alert.id, kind: 'power_cut', label: EVENT_LABELS.power_cut!, detail: alert.detail }, atMs);
        break;
      case 'towing':
        push({ id: alert.id, kind: 'towing', label: EVENT_LABELS.towing!, detail: alert.detail }, atMs);
        break;
      case 'fuel_drop':
        if (tier >= 2 && canSupported.includes('fuelLevel')) {
          push({ id: alert.id, kind: 'fuel_drop', label: EVENT_LABELS.fuel_drop!, detail: alert.detail }, atMs);
        }
        break;
      default:
        break;
    }
  }

  // Geofence enter/exit — the viewer's own fences only
  const ownFenceIds = new Set(geofences.map(g => g.id));
  for (const ev of geofenceEvents) {
    if (!ownFenceIds.has(ev.geofenceId)) continue;
    if (assetId && ev.assetId !== assetId) continue;
    const fence = geofences.find(g => g.id === ev.geofenceId)!;
    const atMs = typeof ev.at === 'number' ? ev.at : new Date(ev.at).getTime();
    push(
      {
        id: ev.id,
        kind: ev.type === 'enter' ? 'geofence_enter' : 'geofence_exit',
        label: ev.type === 'enter' ? `${EVENT_LABELS.geofence_enter} ${fence.name}` : `${EVENT_LABELS.geofence_exit} ${fence.name}`,
      },
      atMs,
    );
  }

  return events
    .filter(e => track.length === 0 || (e.atMs >= track[0].t && e.atMs <= track[track.length - 1].t))
    .sort((a, b) => a.atMs - b.atMs);
}

// ── Top-level build ───────────────────────────────────────────────────────────

export function buildPlaybackData(readings: Reading[], options: BuildPlaybackOptions = {}): PlaybackData {
  const { track, gaps } = buildTrack(readings, options.fromMs, options.toMs);
  const trips = detectTrips(track, gaps);
  const events = buildEvents({
    track,
    trips,
    gaps,
    alerts: options.alerts,
    geofences: options.geofences,
    geofenceEvents: options.geofenceEvents,
    assetId: options.assetId,
    tier: options.tier,
    canSupported: options.canSupported,
  });
  const points = downsampleTrack(track, options.maxPoints ?? PLAYBACK_DOWNSAMPLE_MAX, events.map(e => e.atMs));

  return {
    points,
    track,
    trips,
    gaps,
    events,
    fromMs: track.length ? track[0].t : (options.fromMs ?? 0),
    toMs: track.length ? track[track.length - 1].t : (options.toMs ?? 0),
    totalDistanceKm: track.length ? track[track.length - 1].gpsDistanceKm : 0,
  };
}

/**
 * Clip a period to a rental window. Renters can never look before their window
 * start, and the scrubber starts wherever this returns.
 */
export function clippedPeriod(
  fromMs: number,
  toMs: number,
  window?: { start: number; end: number } | null,
): { fromMs: number; toMs: number } {
  if (!window) return { fromMs, toMs };
  const clippedFrom = Math.max(fromMs, window.start);
  const clippedTo = Math.min(toMs, window.end);
  return { fromMs: Math.min(clippedFrom, clippedTo), toMs: clippedTo };
}

/** Total GPS distance inside a period (used by the readout and History totals). */
export function distanceKm(track: TrackPoint[]): number {
  return track.length ? track[track.length - 1].gpsDistanceKm : 0;
}

/** Split a track into drawable polylines, breaking at gaps and optionally at a cut time. */
export function trackSegments(points: TrackPoint[], gapMinMs: number = TRACK_BREAK_MIN * 60000): TrackPoint[][] {
  const segments: TrackPoint[][] = [];
  let current: TrackPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      current = [points[i]];
      continue;
    }
    if (points[i].t - points[i - 1].t >= gapMinMs) {
      if (current.length > 1) segments.push(current);
      current = [points[i]];
    } else {
      current.push(points[i]);
    }
  }
  if (current.length > 1) segments.push(current);
  return segments;
}
