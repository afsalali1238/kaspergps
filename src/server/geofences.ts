// Geofences (spec §12.2, S31): real seeded geofences + events, scoped to the
// tenant (or all for Kasper), with create/delete behind geofence.manage.

import type { Asset, Geofence, GeofenceEvent, LatLng, Session } from '@/domain/types';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { db, append, removeWhere } from '@/server/db';
import { fail, ok, type OpResult } from '@/server/result';
import { isAssetVisible } from '@/server/access';
import { recordAuditForSession } from '@/server/audit';
import * as clock from '@/lib/clock';
import { can } from '@/server/capabilities';

export interface GeofenceEventView {
  id: string;
  type: 'enter' | 'exit';
  at: number;
  assetCode: string;
  assetName: string;
  geofenceName: string;
}

export interface GeofenceView {
  id: string;
  name: string;
  kind: 'site' | 'job' | 'yard' | 'restricted';
  shape: 'circle' | 'polygon';
  center?: { lat: number; lng: number };
  radiusM?: number;
  points?: { lat: number; lng: number }[];
  alertOnEnter: boolean;
  alertOnExit: boolean;
  assetIds: string[] | 'all';
  siteName?: string;
  ownerTenantId: string;
  events: GeofenceEventView[];
  eventsLast7Days: number;
}

function toMs(v: string | number): number {
  return typeof v === 'number' ? v : new Date(v).getTime();
}

function eventView(ev: GeofenceEvent): GeofenceEventView {
  const asset = db.getState().assets.find(a => a.id === ev.assetId);
  const geofence = db.getState().geofences.find(g => g.id === ev.geofenceId);
  return {
    id: ev.id,
    type: ev.type,
    at: toMs(ev.at),
    assetCode: asset?.code ?? '—',
    assetName: asset?.name ?? '',
    geofenceName: geofence?.name ?? '',
  };
}

function geofenceView(g: Geofence, allEvents: GeofenceEvent[]): GeofenceView {
  const events = allEvents
    .filter(e => e.geofenceId === g.id)
    .map(eventView)
    .sort((a, b) => b.at - a.at);
  const weekAgo = clock.now() - 7 * 86_400_000;
  return {
    id: g.id,
    name: g.name,
    kind: g.kind,
    shape: g.shape.type,
    center: g.shape.type === 'circle' ? g.shape.center : undefined,
    radiusM: g.shape.type === 'circle' ? g.shape.radiusM : undefined,
    points: g.shape.type === 'polygon' ? g.shape.points : undefined,
    alertOnEnter: g.alertOnEnter,
    alertOnExit: g.alertOnExit,
    assetIds: g.assetIds,
    siteName: g.siteId ? db.getState().sites.find(s => s.id === g.siteId)?.name : undefined,
    ownerTenantId: g.tenantId,
    events,
    eventsLast7Days: events.filter(e => e.at >= weekAgo).length,
  };
}

function geofenceVisible(session: Session, g: Geofence): boolean {
  if (session.isKasper) return true;
  return g.tenantId === session.tenantId;
}

export function visibleGeofences(session: Session): GeofenceView[] {
  return db.getState().geofences
    .filter(g => geofenceVisible(session, g))
    .map(g => geofenceView(g, db.getState().geofenceEvents));
}

export function geofenceById(session: Session, id: string): GeofenceView | null {
  const g = db.getState().geofences.find(x => x.id === id);
  if (!g || !geofenceVisible(session, g)) return null;
  return geofenceView(g, db.getState().geofenceEvents);
}

/** Events the user may see: at their geofences, on assets they can see. */
export function visibleGeofenceEvents(session: Session): GeofenceEventView[] {
  const ids = new Set(visibleGeofences(session).map(g => g.id));
  return db.getState().geofenceEvents
    .filter(e => ids.has(e.geofenceId) && isAssetVisible(session, e.assetId))
    .map(eventView)
    .sort((a, b) => b.at - a.at);
}

export type GeofenceShape = { type: 'circle'; center: LatLng; radiusM: number } | { type: 'polygon'; points: LatLng[] };

export interface CreateGeofenceInput {
  name: string;
  kind: 'site' | 'job' | 'yard' | 'restricted';
  /** A circle at `center`, unless `shape` is given. */
  center?: { lat: number; lng: number };
  radiusM?: number;
  shape?: GeofenceShape;
  alertOnEnter: boolean;
  alertOnExit: boolean;
  assetIds: string[] | 'all';
}

export const GEOFENCE_RADIUS_MIN_M = 50;
export const GEOFENCE_RADIUS_MAX_M = 5000;
export const GEOFENCE_POINTS_MIN = 3;
export const GEOFENCE_POINTS_MAX = 30;
const WEEK_MS = 7 * 86_400_000;

/** Metres between two points (haversine). */
function metresBetween(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whether a point is inside a circle or polygon (ray casting for polygons). */
export function insideShape(shape: GeofenceShape, p: LatLng): boolean {
  if (shape.type === 'circle') return metresBetween(shape.center, p) <= shape.radiusM;
  let inside = false;
  const pts = shape.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].lng, yi = pts[i].lat, xj = pts[j].lng, yj = pts[j].lat;
    const cross = (yi > p.lat) !== (yj > p.lat) && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (cross) inside = !inside;
  }
  return inside;
}

/**
 * Enter and exit events for one asset from its readings (spec 11.12). A change of
 * side counts only when the next reading agrees, and it is timed at the reading
 * that changed. A gap creates no event; the reading after a gap does, at its time.
 */
export function eventsFromReadings(shape: GeofenceShape, readings: { lat: number; lng: number; deviceTime: string }[]): { type: 'enter' | 'exit'; at: number }[] {
  const sorted = [...readings].sort((a, b) => new Date(a.deviceTime).getTime() - new Date(b.deviceTime).getTime());
  if (sorted.length === 0) return [];
  const out: { type: 'enter' | 'exit'; at: number }[] = [];
  let state = insideShape(shape, sorted[0]);
  for (let i = 1; i < sorted.length; i++) {
    const side = insideShape(shape, sorted[i]);
    if (side === state) continue;
    const confirmed = i + 1 >= sorted.length || insideShape(shape, sorted[i + 1]) === side;
    if (!confirmed) continue;
    out.push({ type: side ? 'enter' : 'exit', at: new Date(sorted[i].deviceTime).getTime() });
    state = side;
  }
  return out;
}

function validShape(shape: GeofenceShape): string | null {
  if (shape.type === 'circle') {
    if (!(shape.radiusM >= GEOFENCE_RADIUS_MIN_M && shape.radiusM <= GEOFENCE_RADIUS_MAX_M)) {
      return `The radius must be between ${GEOFENCE_RADIUS_MIN_M} and ${GEOFENCE_RADIUS_MAX_M.toLocaleString('en-US')} m.`;
    }
    return null;
  }
  if (shape.points.length < GEOFENCE_POINTS_MIN) return `A shape needs at least ${GEOFENCE_POINTS_MIN} points.`;
  if (shape.points.length > GEOFENCE_POINTS_MAX) return `A shape can have at most ${GEOFENCE_POINTS_MAX} points.`;
  return null;
}

/** Create a circle or polygon: Kasper or the tenant admin (geofence.manage). */
export function createGeofence(session: Session, input: CreateGeofenceInput): OpResult<GeofenceView> {
  if (!can(session, 'geofence.manage')) {
    return fail('You can’t create geofences.');
  }
  const name = input.name.trim();
  if (!name) return fail('Give the geofence a name.');
  const shape: GeofenceShape = input.shape
    ?? { type: 'circle', center: input.center ?? { lat: 0, lng: 0 }, radiusM: input.radiusM ?? 0 };
  const problem = validShape(shape);
  if (problem) return fail(problem);

  const now = clock.now();
  const id = `g-${db.getState().geofences.length + 1}-${now.toString(36)}`;
  const geofence: Geofence = {
    id,
    tenantId: session.tenantId ?? 'kasper',
    name,
    kind: input.kind,
    shape,
    siteId: undefined,
    alertOnEnter: input.alertOnEnter,
    alertOnExit: input.alertOnExit,
    assetIds: input.assetIds,
    createdBy: session.userId,
    createdAt: new Date(now).toISOString(),
  };
  append('geofences', geofence);

  // Events for the last 7 days, from the readings of the covered assets this tenant can see.
  const covered: Asset[] = db.getState().assets.filter(a =>
    (input.assetIds === 'all' || input.assetIds.includes(a.id)) && isAssetVisible(session, a.id),
  );
  for (const asset of covered) {
    const readings = getReadingsForAsset(asset, now - WEEK_MS, now);
    for (const ev of eventsFromReadings(shape, readings)) {
      append('geofenceEvents', { id: `ge-${id}-${asset.id}-${ev.at}`, geofenceId: id, assetId: asset.id, type: ev.type, at: new Date(ev.at).toISOString() });
    }
  }

  const shapeText = shape.type === 'circle' ? `${shape.radiusM} m circle` : `${shape.points.length}-point polygon`;
  recordAuditForSession(session, { action: 'geofence.create', tenantId: geofence.tenantId, detail: `Geofence ${name} created (${shapeText})` });
  return ok(geofenceView(geofence, db.getState().geofenceEvents), 'Geofence created');
}

/** Delete: Kasper or the owner tenant admin. */
export function deleteGeofence(session: Session, id: string): OpResult<null> {
  if (!can(session, 'geofence.manage')) {
    return fail('You can’t delete geofences.');
  }
  const idx = db.getState().geofences.findIndex(g => g.id === id && geofenceVisible(session, g));
  if (idx < 0) return fail('Geofence not found.');
  const removed = db.getState().geofences[idx];
  removeWhere('geofences', g => g.id === removed.id);
  recordAuditForSession(session, {
    action: 'geofence.delete',
    tenantId: removed.tenantId,
    detail: `Geofence ${removed.name} deleted`,
  });
  return ok(null, 'Geofence deleted');
}
