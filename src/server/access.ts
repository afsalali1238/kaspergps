// Access layer — all permission checks go through here.
// Architecture rule 1: every API function checks access in this module first.

import type { Session, Booking } from '@/domain/types';
import { db } from '@/server/db';
import { hasFeature, featurePhase } from '@/domain/features';
import { hasRoleCapability } from '@/server/capabilities';
import type { Capability } from '@/server/capabilities';
import * as clock from '@/lib/clock';

// ── Capabilities (role-only, no asset context) ────────────────────────────────

export function hasCapability(session: Session, capability: Capability): boolean {
  return hasRoleCapability(session.role, capability);
}

// ── Asset visibility ───────────────────────────────────────────────────────────

export function isAssetVisible(session: Session, assetId: string): boolean {
  const asset = db.getState().assets.find(a => a.id === assetId);
  if (!asset) return false;

  if (session.isKasper) return true;
  if (asset.ownerTenantId === session.tenantId) {
    // Same-tenant assets: tenant admins (no sites) see all;
    // site users see only assets at their sites.
    if (session.siteIds.length === 0) return true;
    return session.siteIds.includes(asset.homeSiteId);
  }

  // Check for active rental grant — must also match a site the session can see
  const booking = findActiveGrantFor(session, assetId);
  if (booking) {
    const now = clock.now();
    if (!(new Date(booking.start).getTime() <= now && now <= getGrantEnd(booking))) return false;
    // Tenant admins with no site restriction see all sites; site users must match a site
    if (session.siteIds.length === 0) return true;
    return session.siteIds.includes(booking.renterSiteId!);
  }

  return false;
}

export function findActiveGrantFor(session: Session, assetId: string): Booking | null {
  if (!session.tenantId) return null;
  const booking = db.getState().bookings.find(b =>
    b.assetId === assetId &&
    b.renterTenantId === session.tenantId &&
    (b.status === 'active' || b.status === 'scheduled')
  );
  if (!booking) return null;

  const now = clock.now();
  // Access starts at booking start
  if (now < new Date(booking.start).getTime()) return null;
  return booking;
}

/**
 * Who can cut a rental short: Kasper, or the asset's own Tenant Admin.
 * The renter never can — it is their rental (spec 5, grant.endEarly).
 */
export function canEndAccess(session: Session, assetId: string): boolean {
  if (!hasCapability(session, 'grant.endEarly')) return false;
  const asset = db.getState().assets.find(a => a.id === assetId);
  if (!asset) return false;
  if (session.isKasper) return true;
  return session.tenantId !== null && asset.ownerTenantId === session.tenantId;
}

export function getGrantEnd(booking: Booking): number {
  const end = new Date(booking.end).getTime();
  if (booking.cancelledAt) return new Date(booking.cancelledAt).getTime();
  if (booking.closedAt) return new Date(booking.closedAt).getTime();
  // Check for early override
  const override = db.getState().grantOverrides.find(o => o.bookingId === booking.id);
  if (override) return new Date(override.endedAt).getTime();
  return end;
}

export function getRelationship(session: Session, assetId: string): 'kasper' | 'owner' | 'renter' | 'none' {
  if (session.isKasper) return 'kasper';
  const asset = db.getState().assets.find(a => a.id === assetId);
  if (!asset) return 'none';
  if (asset.ownerTenantId === session.tenantId) return 'owner';
  if (findActiveGrantFor(session, assetId)) return 'renter';
  return 'none';
}

export function isAssetEditable(session: Session, assetId: string): boolean {
  const rel = getRelationship(session, assetId);
  if (session.isKasper) return rel !== 'none';
  // Owners' Tenant Admins hold asset.edit (see capabilities matrix);
  // Site Users and renters never do.
  return hasCapability(session, 'asset.edit') && rel === 'owner';
}

// ── Feature visibility ─────────────────────────────────────────────────────────

export function isFeatureVisible(session: Session, assetId: string, featureKey: string, phase: string, _salesView: boolean): boolean {
  const asset = db.getState().assets.find(a => a.id === assetId);
  if (!asset) return false;
  const phaseMap: Record<string, 'day_one' | 'phase2' | 'later'> = {
    day_one: 'day_one',
    phase2: 'phase2',
    later: 'later',
  };
  const p = phaseMap[phase] ?? 'later';

  if (!isAssetVisible(session, assetId)) return false;

  const cap = featureCapability(featureKey);
  if (cap && !hasCapability(session, cap as Capability)) return false;

  return hasFeature(asset, featureKey) && featurePhase(featureKey) !== undefined && (featurePhase(featureKey) === 'day_one' || featurePhase(featureKey) === p || p === 'later');
}

function featureCapability(key: string): string | null {
  const map: Record<string, string> = {
    'fuel.level': 'asset.viewTelemetry',
    'fuel.used': 'asset.viewTelemetry',
    'engine.live': 'asset.viewTelemetry',
    'hours.ecu': 'asset.viewTelemetry',
    'faults': 'asset.viewTelemetry',
    'adblue': 'asset.viewTelemetry',
    'muc': 'muc.view',
    'billing.hours': 'billing.view',
    'cost.fuel': 'cost.view',
    'cost.idle': 'cost.view',
    'maintenance.hours': 'maintenance.view',
    'maintenance.km': 'maintenance.view',
    'maintenance.faults': 'maintenance.view',
    'labels': 'label.view',
    'geofence.events': 'geofence.view',
    'playback': 'playback.view',
    'eta': 'link.create',
    'report.geofence': 'report.run',
  };
  return map[key] ?? null;
}

// ── Fleet-level feature visibility ─────────────────────────────────────────────

export function anyAssetHasFeature(session: Session, featureKey: string): boolean {
  const visible = visibleAssetIds(session);
  return visible.some(id => {
    const asset = db.getState().assets.find(a => a.id === id);
    return asset && hasFeature(asset, featureKey);
  });
}

export function visibleAssetIds(session: Session): string[] {
  return db.getState().assets
    .filter(a => isAssetVisible(session, a.id))
    .map(a => a.id);
}

export function visibleAssetCodes(session: Session): string[] {
  return visibleAssetIds(session).map(id => db.getState().assets.find(a => a.id === id)!.code);
}

// ── Relationship helpers ────────────────────────────────────────────────────────

export function isRenter(session: Session, assetId: string): boolean {
  return getRelationship(session, assetId) === 'renter';
}

export function rentalWindow(session: Session, assetId: string): { start: number; end: number } | null {
  const booking = findActiveGrantFor(session, assetId);
  if (!booking) return null;
  return {
    start: new Date(booking.start).getTime(),
    end: getGrantEnd(booking),
  };
}

export function isRenterWindowPast(session: Session, assetId: string): { start: number; end: number } | null {
  // Past rental windows for reports
  if (!session.tenantId) return null;
  const booking = db.getState().bookings.find(b =>
    b.assetId === assetId &&
    b.renterTenantId === session.tenantId &&
    (b.status === 'closed' || b.status === 'cancelled')
  );
  if (!booking) return null;
  return {
    start: new Date(booking.start).getTime(),
    end: booking.closedAt ? new Date(booking.closedAt).getTime() : new Date(booking.end).getTime(),
  };
}
