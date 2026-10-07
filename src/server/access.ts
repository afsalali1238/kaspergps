// Access layer — all permission checks go through here.
// Architecture rule 1: every API function checks access in this module first.

import type { Session, Booking } from '@/domain/types';
import { seed } from '@/server/seed/data';
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
  const asset = seed.assets.find(a => a.id === assetId);
  if (!asset) return false;

  if (session.isKasper) return true;
  if (asset.ownerTenantId === session.tenantId) {
    // Same-tenant assets: tenant admins see all; site users see only at their sites
    if (session.role === 'tenant_admin') return true;
    return session.siteIds.includes(asset.homeSiteId);
  }

  // Check for active rental grant — must also match a site the session can see
  const booking = findActiveGrantFor(session, assetId);
  if (booking) {
    const now = clock.now();
    if (!(new Date(booking.start).getTime() <= now && now <= getGrantEnd(booking))) return false;
    // Tenant admins with no site restriction see all sites; site users must match a site
    if (session.role === 'tenant_admin' && session.siteIds.length === 0) return true;
    return session.siteIds.includes(booking.renterSiteId!);
  }

  return false;
}

export function findActiveGrantFor(session: Session, assetId: string): Booking | null {
  if (!session.tenantId) return null;
  const booking = seed.bookings.find(b =>
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

export function getGrantEnd(booking: Booking): number {
  const end = new Date(booking.end).getTime();
  if (booking.cancelledAt) return new Date(booking.cancelledAt).getTime();
  if (booking.closedAt) return new Date(booking.closedAt).getTime();
  // Check for early override
  const override = seed.grantOverrides.find(o => o.bookingId === booking.id);
  if (override) return new Date(override.endedAt).getTime();
  return end;
}

export function getRelationship(session: Session, assetId: string): 'kasper' | 'owner' | 'renter' | 'none' {
  if (session.isKasper) return 'kasper';
  const asset = seed.assets.find(a => a.id === assetId);
  if (!asset) return 'none';
  if (asset.ownerTenantId === session.tenantId) return 'owner';
  if (findActiveGrantFor(session, assetId)) return 'renter';
  return 'none';
}

export function isAssetEditable(session: Session, assetId: string): boolean {
  const rel = getRelationship(session, assetId);
  if (session.isKasper) return rel !== 'none';
  if (session.role === 'tenant_admin' && rel === 'owner') return true;
  return false;
}

// ── Feature visibility ─────────────────────────────────────────────────────────

export function isFeatureVisible(session: Session, assetId: string, featureKey: string, phase: string, _salesView: boolean): boolean {
  const asset = seed.assets.find(a => a.id === assetId);
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
    const asset = seed.assets.find(a => a.id === id);
    return asset && hasFeature(asset, featureKey);
  });
}

export function visibleAssetIds(session: Session): string[] {
  return seed.assets
    .filter(a => isAssetVisible(session, a.id))
    .map(a => a.id);
}

export function visibleAssetCodes(session: Session): string[] {
  return visibleAssetIds(session).map(id => seed.assets.find(a => a.id === id)!.code);
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
  const booking = seed.bookings.find(b =>
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
