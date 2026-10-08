// Bookings (spec 11.7). A booking is a rental window: it grants the renter a
// tracked view of the asset for exactly [start, end] and ties tracking links to
// that window. Every create/change/cancel/close is audited, and the grant
// window is derived from the booking (see access.ts), so it can never drift.

import type { Asset, Booking, Session } from '@/domain/types';
import { db, append, nextNumber, touch } from '@/server/db';
import * as clock from '@/lib/clock';
import { fail, ok, type OpResult } from '@/server/result';
import { canEndAccess, hasCapability } from '@/server/access';
import { hasRole } from '@/server/capabilities';
import { recordAuditForSession } from '@/server/audit';
import { revokeLinksForBooking } from '@/server/tracking-links';

// Seed ids run b-1001..b-1012, so runtime ids start well clear of them.
function toMs(v: string | number): number {
  return typeof v === 'number' ? v : new Date(v).getTime();
}

export function bookingById(bookingId: string): Booking | null {
  return db.getState().bookings.find(b => b.id === bookingId) ?? null;
}

/** BK-#### continues past the highest number in the seed. */
export function nextBookingReference(): string {
  const highest = db.getState().bookings.reduce((max, b) => {
    const n = Number(b.reference.replace(/\D/g, ''));
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 1000);
  return `BK-${highest + 1}`;
}

/** Bookings that still hold the asset: scheduled or active, not closed/cancelled. */
export function openBookingsForAsset(assetId: string): Booking[] {
  return db.getState().bookings.filter(
    b => b.assetId === assetId && (b.status === 'scheduled' || b.status === 'active')
  );
}

export function overlappingBooking(assetId: string, startMs: number, endMs: number, ignoreBookingId?: string): Booking | null {
  return openBookingsForAsset(assetId).find(b => {
    if (ignoreBookingId && b.id === ignoreBookingId) return false;
    const s = toMs(b.start);
    const e = b.closedAt ? toMs(b.closedAt) : toMs(b.end);
    return startMs < e && s < endMs;
  }) ?? null;
}

/**
 * Who can put a booking on an asset: Kasper (console.bookings.manage) or the
 * asset's own Tenant Admin. Renters never create their own bookings.
 */
export function canManageBookings(session: Session, asset: Asset): boolean {
  if (hasCapability(session, 'console.bookings.manage')) return true;
  return hasRole(session, 'tenant_admin') && session.tenantId === asset.ownerTenantId;
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateBookingInput {
  assetId: string;
  /** Renter tenant, or null for an outside hirer (tracking link only). */
  renterTenantId: string | null;
  renterSiteId?: string | null;
  start: string | number;
  end: string | number;
  rateType?: Booking['rateType'];
  rateAed?: number;
  destination?: { name: string; lat: number; lng: number };
}

export function createBooking(session: Session, input: CreateBookingInput): OpResult<Booking> {
  const asset = db.getState().assets.find(a => a.id === input.assetId);
  if (!asset) return fail('Asset not found.');
  if (!canManageBookings(session, asset)) {
    return fail('Only Kasper or the asset owner can create a booking.');
  }
  if (asset.retiredAt) {
    return fail(`${asset.code} is retired and can't be booked.`);
  }

  const startMs = toMs(input.start);
  const endMs = toMs(input.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return fail('Pick a start and an end.');
  if (endMs <= startMs) return fail('The end must be after the start.');

  const renter = input.renterTenantId
    ? db.getState().tenants.find(t => t.id === input.renterTenantId) ?? null
    : null;
  if (input.renterTenantId && !renter) return fail('Renter not found.');
  if (renter && renter.id === asset.ownerTenantId) {
    return fail(`A company can't rent its own asset — ${asset.code} belongs to ${renter.name}.`);
  }
  if (renter && renter.status === 'suspended') {
    return fail(`${renter.name} is suspended.`);
  }

  // The renter site must belong to the renter, so the grant narrows to it.
  if (renter && input.renterSiteId) {
    const site = db.getState().sites.find(s => s.id === input.renterSiteId);
    if (!site) return fail('Site not found.');
    if (site.tenantId !== renter.id) {
      return fail(`${site.name} belongs to another company.`);
    }
  }

  const clash = overlappingBooking(asset.id, startMs, endMs);
  if (clash) {
    const clashRenter = db.getState().tenants.find(t => t.id === clash.renterTenantId)?.name ?? 'an outside hirer';
    return fail(`${asset.code} is already booked ${clock.formatDubaiDate(toMs(clash.start))} – ${clock.formatDubaiDate(toMs(clash.end))} (${clash.reference}, ${clashRenter}).`);
  }

  const nowMs = clock.now();
  const booking: Booking = {
    id: `b-${nextNumber('b-', db.getState().bookings, 2000)}`,
    reference: nextBookingReference(),
    assetId: asset.id,
    ownerTenantId: asset.ownerTenantId,
    renterTenantId: renter?.id ?? null,
    renterSiteId: renter ? input.renterSiteId ?? null : null,
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    status: startMs <= nowMs && nowMs <= endMs ? 'active' : 'scheduled',
    rateType: input.rateType ?? 'daily',
    rateAed: input.rateAed ?? 0,
    destination: input.destination,
  };
  append('bookings', booking);

  recordAuditForSession(session, {
    action: 'booking.create',
    assetId: asset.id,
    tenantId: asset.ownerTenantId,
    bookingId: booking.id,
    detail: `${booking.reference} created: ${asset.code} to ${renter?.name ?? 'an outside hirer'} ${clock.formatDubaiDate(startMs)} – ${clock.formatDubaiDate(endMs)}`,
  });
  return ok(booking, `${booking.reference} created.`);
}

// ── Change ────────────────────────────────────────────────────────────────────

function changeWindow(session: Session, bookingId: string, newEnd: string | number, action: 'extend' | 'shorten'): OpResult<Booking> {
  const booking = bookingById(bookingId);
  if (!booking) return fail('Booking not found.');
  const asset = db.getState().assets.find(a => a.id === booking.assetId);
  if (!asset) return fail('Asset not found.');
  if (!canManageBookings(session, asset)) return fail('Only Kasper or the asset owner can change a booking.');
  if (booking.status === 'closed' || booking.status === 'cancelled') {
    return fail('This booking has ended.');
  }

  const endMs = toMs(newEnd);
  const startMs = toMs(booking.start);
  if (!Number.isFinite(endMs)) return fail('Pick an end date.');
  if (endMs <= startMs) return fail('The end must be after the start.');

  if (action === 'extend') {
    const clash = overlappingBooking(asset.id, toMs(booking.end), endMs, booking.id);
    if (clash) {
      return fail(`Another booking starts ${clock.formatDubaiDate(toMs(clash.start))} (${clash.reference}).`);
    }
  }

  const old = booking.end;
  booking.end = new Date(endMs).toISOString();
  if (booking.status === 'scheduled' && startMs <= clock.now() && clock.now() <= endMs) {
    booking.status = 'active';
  }
  touch('bookings');

  recordAuditForSession(session, {
    action: action === 'extend' ? 'booking.extend' : 'booking.shorten',
    assetId: asset.id,
    tenantId: asset.ownerTenantId,
    bookingId: booking.id,
    detail: `${booking.reference} ${action === 'extend' ? 'extended' : 'shortened'} to ${clock.formatDubaiDate(endMs)}`,
    reason: `was ${clock.formatDubaiDate(toMs(old))}`,
  });
  return ok(booking, `${booking.reference} ${action === 'extend' ? 'extended' : 'shortened'} to ${clock.formatDubaiDate(endMs)}.`);
}

export function extendBooking(session: Session, bookingId: string, newEnd: string | number): OpResult<Booking> {
  return changeWindow(session, bookingId, newEnd, 'extend');
}

export function shortenBooking(session: Session, bookingId: string, newEnd: string | number): OpResult<Booking> {
  return changeWindow(session, bookingId, newEnd, 'shorten');
}

export function cancelBooking(session: Session, bookingId: string, reason = ''): OpResult<Booking> {
  const booking = bookingById(bookingId);
  if (!booking) return fail('Booking not found.');
  const asset = db.getState().assets.find(a => a.id === booking.assetId);
  if (!asset) return fail('Asset not found.');
  if (!canManageBookings(session, asset)) return fail('Only Kasper or the asset owner can cancel a booking.');
  if (booking.status === 'cancelled') return fail('This booking is already cancelled.');
  if (booking.status === 'closed') return fail('This booking has already ended.');

  booking.status = 'cancelled';
  booking.cancelledAt = new Date(clock.now()).toISOString();
  touch('bookings');
  const revokedOnCancel = revokeLinksForBooking(booking.id, 'booking_cancelled', session.userId);

  recordAuditForSession(session, {
    action: 'booking.cancel',
    assetId: asset.id,
    tenantId: asset.ownerTenantId,
    bookingId: booking.id,
    detail: `${booking.reference} cancelled`,
    reason: reason.trim() || undefined,
  });
  return ok(
    booking,
    `${booking.reference} cancelled — the renter's access ends now${revokedOnCancel ? ` · ${revokedOnCancel} tracking ${revokedOnCancel === 1 ? 'link' : 'links'} revoked` : ''}.`
  );
}

export function closeBooking(session: Session, bookingId: string, reason = ''): OpResult<Booking> {
  const booking = bookingById(bookingId);
  if (!booking) return fail('Booking not found.');
  const asset = db.getState().assets.find(a => a.id === booking.assetId);
  if (!asset) return fail('Asset not found.');
  if (!canManageBookings(session, asset)) return fail('Only Kasper or the asset owner can close a booking.');
  if (booking.status === 'closed') return fail('This booking is already closed.');
  if (booking.status === 'cancelled') return fail('This booking was cancelled.');

  booking.status = 'closed';
  booking.closedAt = new Date(clock.now()).toISOString();
  touch('bookings');
  const revokedOnClose = revokeLinksForBooking(booking.id, 'job_closed', session.userId);

  recordAuditForSession(session, {
    action: 'booking.close',
    assetId: asset.id,
    tenantId: asset.ownerTenantId,
    bookingId: booking.id,
    detail: `${booking.reference} job closed`,
    reason: reason.trim() || undefined,
  });
  return ok(
    booking,
    `${booking.reference} closed — the renter's access ends now${revokedOnClose ? ` · ${revokedOnClose} tracking ${revokedOnClose === 1 ? 'link' : 'links'} revoked` : ''}.`
  );
}

/**
 * Cut a rental short before its end (capability `grant.endEarly`).
 * The reason is required and shows as a "cut short" note on the grant.
 */
export function endEarly(session: Session, bookingId: string, reason: string): OpResult<Booking> {
  const booking = bookingById(bookingId);
  if (!booking) return fail('Booking not found.');
  const asset = db.getState().assets.find(a => a.id === booking.assetId);
  if (!asset) return fail('Asset not found.');
  if (!canEndAccess(session, asset.id)) {
    return fail('Only the owner or Kasper can end this rental early.');
  }
  if (booking.status === 'closed' || booking.status === 'cancelled') return fail('This booking has already ended.');
  if (reason.trim().length < 10) return fail('Give a reason of at least 10 characters.');

  const nowMs = clock.now();
  booking.status = 'closed';
  booking.closedAt = new Date(nowMs).toISOString();
  touch('bookings');

  const revokedOnCut = revokeLinksForBooking(booking.id, 'access_ended', session.userId);

  // The renter keeps the window they had up to now; the override is audited.
  append('grantOverrides', {
    bookingId: booking.id,
    endedAt: new Date(nowMs).toISOString(),
    endedBy: session.userId,
    reason: reason.trim(),
  });

  recordAuditForSession(session, {
    action: 'grant.endEarly',
    assetId: asset.id,
    tenantId: asset.ownerTenantId,
    bookingId: booking.id,
    detail: `${asset.code} rental ended early by ${session.user.name}`,
    reason: reason.trim(),
  });
  const renterName = db.getState().tenants.find(t => t.id === booking.renterTenantId)?.name ?? 'the hirer';
  return ok(
    booking,
    `${renterName} no longer has access to ${asset.code}${revokedOnCut ? ` · ${revokedOnCut} tracking ${revokedOnCut === 1 ? 'link' : 'links'} revoked` : ''}.`
  );
}
