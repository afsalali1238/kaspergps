import type { Geofence, GeofenceEvent, LatLng, Reading } from '@/domain/types';

export const CUSTOMER_GEOFENCES_STORAGE_KEY = 'kasper.customer-geofences.v1';

export interface GeofenceVisit {
  geofenceId: string;
  assetId: string;
  enteredAt: number;
  exitedAt: number | null;
  dwellMs: number | null;
}

function isLatLng(value: unknown): value is LatLng {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<LatLng>;
  return typeof point.lat === 'number' && Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90
    && typeof point.lng === 'number' && Number.isFinite(point.lng) && point.lng >= -180 && point.lng <= 180;
}

export function isStoredGeofence(value: unknown): value is Geofence {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Geofence>;
  if (typeof candidate.id !== 'string' || typeof candidate.tenantId !== 'string'
    || typeof candidate.name !== 'string' || typeof candidate.createdBy !== 'string'
    || !(typeof candidate.createdAt === 'string' || typeof candidate.createdAt === 'number')
    || typeof candidate.alertOnEnter !== 'boolean' || typeof candidate.alertOnExit !== 'boolean'
    || !candidate.kind || !['site', 'job', 'yard', 'restricted'].includes(candidate.kind)
    || (candidate.siteId !== undefined && typeof candidate.siteId !== 'string')
    || !(candidate.assetIds === 'all' || (Array.isArray(candidate.assetIds) && candidate.assetIds.every(id => typeof id === 'string')))) return false;
  if (candidate.afterHoursOnly !== undefined) {
    const hours = candidate.afterHoursOnly;
    const validTime = (value: unknown) => typeof value === 'string'
      ? /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
      : typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 24;
    if (!hours || typeof hours !== 'object' || !validTime(hours.from) || !validTime(hours.to)) return false;
  }
  if (!candidate.shape || typeof candidate.shape !== 'object') return false;
  if (candidate.shape.type === 'circle') {
    return isLatLng(candidate.shape.center) && typeof candidate.shape.radiusM === 'number'
      && Number.isFinite(candidate.shape.radiusM) && candidate.shape.radiusM >= 50 && candidate.shape.radiusM <= 5000;
  }
  if (candidate.shape.type === 'polygon') {
    return Array.isArray(candidate.shape.points) && candidate.shape.points.length >= 3
      && candidate.shape.points.length <= 30 && candidate.shape.points.every(isLatLng);
  }
  return false;
}

export function parseStoredGeofences(serialized: string | null, fallback: Geofence[]): Geofence[] {
  if (!serialized) return fallback;
  try {
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed) ? parsed.filter(isStoredGeofence) : fallback;
  } catch {
    return fallback;
  }
}

export function timestampMs(value: string | number | Date): number {
  const parsed = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function distanceMeters(a: LatLng, b: LatLng): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusM = 6371000;
  const latDelta = toRadians(b.lat - a.lat);
  const lngDelta = toRadians(b.lng - a.lng);
  const latA = toRadians(a.lat);
  const latB = toRadians(b.lat);
  const haversine = Math.sin(latDelta / 2) ** 2
    + Math.cos(latA) * Math.cos(latB) * Math.sin(lngDelta / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function pointOnSegment(point: LatLng, start: LatLng, end: LatLng): boolean {
  const cross = (point.lng - start.lng) * (end.lat - start.lat) - (point.lat - start.lat) * (end.lng - start.lng);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (point.lng - start.lng) * (end.lng - start.lng) + (point.lat - start.lat) * (end.lat - start.lat);
  if (dot < 0) return false;
  const lengthSquared = (end.lng - start.lng) ** 2 + (end.lat - start.lat) ** 2;
  return dot <= lengthSquared;
}

export function pointInsideGeofence(geofence: Geofence, point: LatLng): boolean {
  if (geofence.shape.type === 'circle') {
    return distanceMeters(geofence.shape.center, point) <= geofence.shape.radiusM;
  }
  const points = geofence.shape.points;
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const current = points[i];
    const previous = points[j];
    if (pointOnSegment(point, previous, current)) return true;
    const crosses = (current.lat > point.lat) !== (previous.lat > point.lat)
      && point.lng < (previous.lng - current.lng) * (point.lat - current.lat) / (previous.lat - current.lat) + current.lng;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Turn a position history into confirmed boundary events. A side change is only
 * recorded after two consecutive readings on the new side; samples separated by
 * a gap larger than maxGapMs start a fresh baseline and never create an event.
 * These are history events only: callers must not turn replayed readings into alerts.
 */
export function deriveGeofenceEvents(
  geofence: Geofence,
  assetId: string,
  readings: Reading[],
  maxGapMs: number,
): GeofenceEvent[] {
  const ordered = [...readings]
    .filter(reading => Number.isFinite(timestampMs(reading.deviceTime)))
    .sort((a, b) => timestampMs(a.deviceTime) - timestampMs(b.deviceTime));
  const unique = ordered.filter((reading, index) => index === 0
    || timestampMs(reading.deviceTime) !== timestampMs(ordered[index - 1].deviceTime));
  const events: GeofenceEvent[] = [];
  let previousMs: number | null = null;
  let stableSide: boolean | null = null;
  let pendingSide: boolean | null = null;

  for (const reading of unique) {
    const at = timestampMs(reading.deviceTime);
    const side = pointInsideGeofence(geofence, { lat: reading.lat, lng: reading.lng });
    if (previousMs !== null && at - previousMs > maxGapMs) {
      stableSide = side;
      pendingSide = null;
      previousMs = at;
      continue;
    }
    if (stableSide === null) {
      stableSide = side;
      previousMs = at;
      continue;
    }
    if (side === stableSide) {
      pendingSide = null;
      previousMs = at;
      continue;
    }
    if (pendingSide === side) {
      events.push({
        id: `reading-${geofence.id}-${assetId}-${side ? 'enter' : 'exit'}-${at}`,
        geofenceId: geofence.id,
        assetId,
        type: side ? 'enter' : 'exit',
        at,
        source: 'reading_history',
      });
      stableSide = side;
      pendingSide = null;
    } else {
      pendingSide = side;
    }
    previousMs = at;
  }
  return events;
}

export function visitsFromGeofenceEvents(events: GeofenceEvent[], rangeEndMs: number): GeofenceVisit[] {
  const ordered = [...events].sort((a, b) => timestampMs(a.at) - timestampMs(b.at));
  const openEntries = new Map<string, GeofenceEvent>();
  const visits: GeofenceVisit[] = [];
  for (const event of ordered) {
    const key = `${event.geofenceId}:${event.assetId}`;
    if (event.type === 'enter') {
      openEntries.set(key, event);
    } else {
      const entry = openEntries.get(key);
      if (!entry) continue;
      const enteredAt = timestampMs(entry.at);
      const exitedAt = timestampMs(event.at);
      if (exitedAt >= enteredAt) {
        visits.push({ geofenceId: event.geofenceId, assetId: event.assetId, enteredAt, exitedAt, dwellMs: exitedAt - enteredAt });
      }
      openEntries.delete(key);
    }
  }
  for (const [key, entry] of openEntries) {
    const [geofenceId, assetId] = key.split(':');
    const enteredAt = timestampMs(entry.at);
    visits.push({ geofenceId, assetId, enteredAt, exitedAt: null, dwellMs: Math.max(0, rangeEndMs - enteredAt) });
  }
  return visits;
}
