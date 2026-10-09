import { isSiteScoped } from '@/server/capabilities';
// Access data — who is related to which asset, and when.
// Permission decisions live in capabilities.ts: `can(session, cap, assetId?)`.
// This module only answers "is this asset visible", "what is the relationship",
// and "what rental windows does this session hold". It imports no capability maps,
// so capabilities.ts can depend on it without a cycle.

import type { Session, Booking } from '@/domain/types';
import { db } from '@/server/db';
import { hasFeature } from '@/domain/features';
import * as clock from '@/lib/clock';

// ── Asset visibility ───────────────────────────────────────────────────────────

export function isAssetVisible(session: Session, assetId: string): boolean {
  const asset = db.getState().assets.find(a => a.id === assetId);
  if (!asset) return false;

  if (session.isKasper) return true;
  if (asset.ownerTenantId === session.tenantId) {
    // Same-tenant assets: tenant admins (no sites) see all;
    // site users see only assets at their sites.
    if (!isSiteScoped(session)) return true;
    return session.siteIds.includes(asset.homeSiteId);
  }

  // Active rental grant — must also match a site the session can see
  const booking = findActiveGrantFor(session, assetId);
  if (booking) {
    const now = clock.now();
    if (!(new Date(booking.start).getTime() <= now && now <= getGrantEnd(booking))) return false;
    // Tenant admins with no site restriction see all sites; site users must match a site
    if (!isSiteScoped(session)) return true;
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

/** True when the asset has a booking that is scheduled or active right now. */
export function hasLiveBooking(assetId: string): boolean {
  return db.getState().bookings.some(b =>
    b.assetId === assetId && (b.status === 'active' || b.status === 'scheduled')
  );
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

/**
 * The renter's rental of this asset whose window has ended, or null. "Ended"
 * is the grant window (getGrantEnd), so a rental still marked active after its
 * end time counts as past. A Site User sees it only when it was booked to one
 * of their sites; a Tenant Admin of the renter sees every rental of the company.
 */
export function pastRentalFor(session: Session, assetId: string): Booking | null {
  if (!session.tenantId) return null;
  const now = clock.now();
  const booking = db.getState().bookings.find(b =>
    b.assetId === assetId &&
    b.renterTenantId === session.tenantId &&
    getGrantEnd(b) <= now &&
    (!isSiteScoped(session) || session.siteIds.includes(b.renterSiteId ?? ''))
  );
  return booking ?? null;
}

export function isRenterWindowPast(session: Session, assetId: string): { start: number; end: number } | null {
  // Past rental windows for reports
  const booking = pastRentalFor(session, assetId);
  if (!booking) return null;
  return {
    start: new Date(booking.start).getTime(),
    end: booking.closedAt ? new Date(booking.closedAt).getTime() : new Date(booking.end).getTime(),
  };
}

// ── Fleet-level feature visibility ─────────────────────────────────────────────

export function anyAssetHasFeature(session: Session, featureKey: string): boolean {
  const visible = visibleAssetIds(session);
  return visible.some(id => {
    const asset = db.getState().assets.find(a => a.id === id);
    return asset && hasFeature(asset, featureKey);
  });
}
