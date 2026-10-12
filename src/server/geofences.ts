// Geofences (spec §12.2, S31): real seeded geofences + events, scoped to the
// tenant (or all for Kasper), with create/delete behind geofence.manage.

import type { Asset, Geofence, GeofenceEvent, LatLng, Session } from '@/domain/types';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { db, append, removeWhere, touch } from '@/server/db';
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
  /** Set for a site's own geofence (spec §11.12). */
  siteId?: string;
}

export const GEOFENCE_RADIUS_MIN_M = 50;
export const GEOFENCE_RADIUS_MAX_M = 5000;
export const GEOFENCE_POINTS_MIN = 3;
export const GEOFENCE_POINTS_MAX = 30;
const WEEK_MS = 7 * 86_400_000;
const DAY_MS = 86_400_000;

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

/** Events for the last 7 days, from the readings of the covered assets this viewer can see. */
function recordGeofenceEvents(session: Session, id: string, shape: GeofenceShape, assetIds: Geofence['assetIds'], now: number): void {
  const covered: Asset[] = db.getState().assets.filter(a =>
    (assetIds === 'all' || assetIds.includes(a.id)) && isAssetVisible(session, a.id),
  );
  for (const asset of covered) {
    const readings = getReadingsForAsset(asset, now - WEEK_MS, now);
    for (const ev of eventsFromReadings(shape, readings)) {
      append('geofenceEvents', { id: `ge-${id}-${asset.id}-${ev.at}`, geofenceId: id, assetId: asset.id, type: ev.type, at: new Date(ev.at).toISOString() });
    }
  }
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
    siteId: input.siteId,
    alertOnEnter: input.alertOnEnter,
    alertOnExit: input.alertOnExit,
    assetIds: input.assetIds,
    createdBy: session.userId,
    createdAt: new Date(now).toISOString(),
  };
  append('geofences', geofence);
  recordGeofenceEvents(session, id, shape, input.assetIds, now);

  const shapeText = shape.type === 'circle' ? `${shape.radiusM} m circle` : `${shape.points.length}-point polygon`;
  recordAuditForSession(session, { action: 'geofence.create', tenantId: geofence.tenantId, detail: `Geofence ${name} created (${shapeText})` });
  return ok(geofenceView(geofence, db.getState().geofenceEvents), 'Geofence created');
}

/**
 * A site's own geofence: a circle at the site's centre with the site's radius. One
 * per site. Only the company that owns the site can make it.
 */
export function createSiteGeofence(session: Session, siteId: string): OpResult<GeofenceView> {
  if (!can(session, 'geofence.manage')) return fail('You can’t create geofences.');
  const site = db.getState().sites.find(x => x.id === siteId);
  if (!site || site.tenantId !== session.tenantId) return fail('Site not found.');
  if (db.getState().geofences.some(g => g.siteId === siteId)) return fail(`${site.name} already has a site geofence.`);
  return createGeofence(session, {
    name: `${site.name} site`,
    kind: 'site',
    center: site.center,
    radiusM: site.radiusM,
    alertOnEnter: false,
    alertOnExit: false,
    assetIds: 'all',
    siteId,
  });
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

export interface UpdateGeofenceInput {
  name?: string;
  shape?: GeofenceShape;
  alertOnEnter?: boolean;
  alertOnExit?: boolean;
}

/**
 * Edit a fence's name, shape or alert switches (spec §11.12). A new shape replaces the
 * old one and its events are worked out again over the last 7 days, so events of the
 * old shape do not linger. A site's own geofence follows its site, so its shape is
 * changed by changing the site, not here.
 */
export function updateGeofence(session: Session, id: string, input: UpdateGeofenceInput): OpResult<GeofenceView> {
  if (!can(session, 'geofence.manage')) return fail('You can’t edit geofences.');
  const geofence = db.getState().geofences.find(g => g.id === id && geofenceVisible(session, g));
  if (!geofence) return fail('Geofence not found.');

  const name = input.name !== undefined ? input.name.trim() : geofence.name;
  if (!name) return fail('Give the geofence a name.');
  if (input.shape && geofence.siteId) return fail('A site geofence follows its site. Change the site instead.');
  if (input.shape) {
    const problem = validShape(input.shape);
    if (problem) return fail(problem);
  }
  const nextShape = input.shape ?? geofence.shape;
  const shapeChanged = JSON.stringify(nextShape) !== JSON.stringify(geofence.shape);
  const alertsChanged = (input.alertOnEnter ?? geofence.alertOnEnter) !== geofence.alertOnEnter
    || (input.alertOnExit ?? geofence.alertOnExit) !== geofence.alertOnExit;
  const nameChanged = name !== geofence.name;

  geofence.name = name;
  geofence.alertOnEnter = input.alertOnEnter ?? geofence.alertOnEnter;
  geofence.alertOnExit = input.alertOnExit ?? geofence.alertOnExit;
  if (shapeChanged) {
    geofence.shape = nextShape;
    removeWhere('geofenceEvents', e => e.geofenceId === id);
    recordGeofenceEvents(session, id, nextShape, geofence.assetIds, clock.now());
  }
  touch('geofences');

  const changed = [nameChanged ? 'name' : '', shapeChanged ? 'shape' : '', alertsChanged ? 'alerts' : ''].filter(Boolean);
  recordAuditForSession(session, {
    action: 'geofence.edit',
    tenantId: geofence.tenantId,
    detail: `Geofence ${name} edited${changed.length ? ` (${changed.join(', ')})` : ''}`,
  });
  return ok(geofenceView(geofence, db.getState().geofenceEvents), 'Geofence saved');
}

/**
 * Where an asset is against the viewer's geofences (spec §11.12): the fences that
 * cover it and contain its last known position. Only the owning company sees this;
 * renters and Kasper staff get null, as does an asset with no reading in the last day.
 */
export function assetGeofenceStatus(session: Session, assetId: string): { inside: string[] } | null {
  if (!can(session, 'asset.view', assetId)) return null;
  const asset = db.getState().assets.find(a => a.id === assetId);
  if (!asset || session.isKasper || asset.ownerTenantId !== session.tenantId) return null;
  const now = clock.now();
  const readings = getReadingsForAsset(asset, now - DAY_MS, now)
    .sort((a, b) => new Date(a.deviceTime).getTime() - new Date(b.deviceTime).getTime());
  const last = readings[readings.length - 1];
  if (!last) return null;
  const point = { lat: last.lat, lng: last.lng };
  const inside = db.getState().geofences
    .filter(g => g.tenantId === session.tenantId && (g.assetIds === 'all' || g.assetIds.includes(asset.id)))
    .filter(g => insideShape(g.shape, point))
    .map(g => g.name);
  return { inside };
}
