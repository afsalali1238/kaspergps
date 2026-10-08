// Geofences (spec §12.2, S31): real seeded geofences + events, scoped to the
// tenant (or all for Kasper), with create/delete behind geofence.manage.

import type { Geofence, GeofenceEvent, Session } from '@/domain/types';
import { db, append, removeWhere } from '@/server/db';
import { fail, ok, type OpResult } from '@/server/result';
import { hasCapability, isAssetVisible } from '@/server/access';
import { recordAuditForSession } from '@/server/audit';
import * as clock from '@/lib/clock';

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

export interface CreateGeofenceInput {
  name: string;
  kind: 'site' | 'job' | 'yard' | 'restricted';
  center: { lat: number; lng: number };
  radiusM: number;
  alertOnEnter: boolean;
  alertOnExit: boolean;
  assetIds: string[] | 'all';
}

/** Create (circle): Kasper or the tenant admin (geofence.manage). */
export function createGeofence(session: Session, input: CreateGeofenceInput): OpResult<GeofenceView> {
  if (!hasCapability(session, 'geofence.manage')) {
    return fail('You can’t create geofences.');
  }
  const name = input.name.trim();
  if (!name) return fail('Give the geofence a name.');
  if (!(input.radiusM > 0)) return fail('The radius must be greater than 0.');

  const id = `g-${db.getState().geofences.length + 1}-${clock.now().toString(36)}`;
  const geofence: Geofence = {
    id,
    tenantId: session.tenantId ?? 'kasper',
    name,
    kind: input.kind,
    shape: { type: 'circle', center: input.center, radiusM: input.radiusM },
    siteId: undefined,
    alertOnEnter: input.alertOnEnter,
    alertOnExit: input.alertOnExit,
    assetIds: input.assetIds,
    createdBy: session.userId,
    createdAt: new Date(clock.now()).toISOString(),
  };
  append('geofences', geofence);
  recordAuditForSession(session, {
    action: 'geofence.create',
    tenantId: geofence.tenantId,
    detail: `Geofence ${name} created (${input.radiusM} m)`,
  });
  return ok(geofenceView(geofence, db.getState().geofenceEvents), 'Geofence created');
}

/** Delete: Kasper or the owner tenant admin. */
export function deleteGeofence(session: Session, id: string): OpResult<null> {
  if (!hasCapability(session, 'geofence.manage')) {
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
