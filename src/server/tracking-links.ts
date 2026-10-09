// Tracking-link writes (spec 11.6): the Share panel on asset detail.
// Reads/resolution live in links.ts — this module only creates and revokes.

import type { Booking, LinkRevokeReason, Session, TrackingLink } from '@/domain/types';
import { db, append, nextNumber, touch } from '@/server/db';
import * as clock from '@/lib/clock';
import { fail, ok, type OpResult } from '@/server/result';
import { recordAuditForSession } from '@/server/audit';
import { getTrackingLinkState } from '@/server/links';
import { can } from '@/server/capabilities';

export const LINK_TTL_HOURS = 24;

/** 16 random bytes, base64url — never sequential. */
export function randomToken(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toMs(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : new Date(v).getTime();
}

function canShare(session: Session, assetId: string): boolean {
  return can(session, 'link.create', assetId);
}

/** Jobs the Share panel can attach a link to: this asset's active/upcoming bookings. */
export function shareableBookings(assetId: string): Booking[] {
  return db.getState().bookings
    .filter(b => b.assetId === assetId && (b.status === 'active' || b.status === 'scheduled'))
    .sort((a, b) => toMs(a.start) - toMs(b.start));
}

export interface ExpiryOption {
  bookingId: string | null;
  label: string;
  expiresAt: number;
}

/** What the Share panel offers: each open job (expiry = end of the job) or a 24-hour link. */
export function expiryOptions(assetId: string, nowMs: number = clock.now()): ExpiryOption[] {
  const options: ExpiryOption[] = shareableBookings(assetId).map(b => ({
    bookingId: b.id,
    label: `${b.reference} — until ${clock.formatDubaiDate(toMs(b.end))} ${clock.formatDubaiTime(toMs(b.end))}`,
    expiresAt: toMs(b.end),
  }));
  options.push({
    bookingId: null,
    label: `No job — ${LINK_TTL_HOURS} hour link`,
    expiresAt: nowMs + LINK_TTL_HOURS * 3600000,
  });
  return options;
}

export function linkById(linkId: string): TrackingLink | null {
  return db.getState().trackingLinks.find(l => l.id === linkId) ?? null;
}

export function activeLinksForAsset(assetId: string, nowMs: number = clock.now()): TrackingLink[] {
  return db.getState().trackingLinks
    .filter(l => l.assetId === assetId && getTrackingLinkState(l.token, nowMs) === 'active')
    .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
}

export function pastLinksForAsset(assetId: string, nowMs: number = clock.now()): TrackingLink[] {
  return db.getState().trackingLinks
    .filter(l => l.assetId === assetId && getTrackingLinkState(l.token, nowMs) !== 'active')
    .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
}

/** "Revoked by Priya Nair", "Job closed", "Access ended" … */
export function linkEndWords(link: TrackingLink, nowMs: number = clock.now()): string {
  const state = getTrackingLinkState(link.token, nowMs);
  switch (state) {
    case 'revoked': {
      const by = db.getState().users.find(u => u.id === link.revokedBy)?.name ?? 'Kasper';
      const why = link.revokeReason === 'job_closed' ? 'Job closed' :
        link.revokeReason === 'booking_cancelled' ? 'Booking cancelled' :
        link.revokeReason === 'access_ended' ? 'Access ended' : 'Revoked';
      return `${why} by ${by}`;
    }
    case 'expired': return 'Expired';
    case 'booking_cancelled': return 'Booking cancelled';
    case 'job_closed': return 'Job closed';
    case 'access_ended': return 'Access ended';
    default: return 'Active';
  }
}

export interface CreateLinkInput {
  assetId: string;
  bookingId?: string | null;
  expiresAt?: string | number;
  showEta?: boolean;
}

export function createTrackingLink(session: Session, input: CreateLinkInput): OpResult<TrackingLink> {
  const asset = db.getState().assets.find(a => a.id === input.assetId);
  if (!asset) return fail('Asset not found.');
  if (!canShare(session, asset.id)) {
    return fail('Only the asset owner or Kasper can share a tracking link.');
  }

  const booking = input.bookingId ? db.getState().bookings.find(b => b.id === input.bookingId) ?? null : null;
  if (input.bookingId && !booking) return fail('Booking not found.');
  if (booking && booking.status !== 'active' && booking.status !== 'scheduled') {
    return fail('That job has ended — links are created for active or upcoming jobs.');
  }

  const showEta = input.showEta ?? Boolean(booking?.destination);

  const expiresAt = input.expiresAt !== undefined
    ? toMs(input.expiresAt)
    : booking
      ? toMs(booking.end)
      : clock.now() + LINK_TTL_HOURS * 3600000;

  const link: TrackingLink = {
    id: `lk-new-${nextNumber('lk-new-', db.getState().trackingLinks)}`,
    token: randomToken(),
    assetId: asset.id,
    bookingId: booking?.id ?? null,
    createdBy: session.userId,
    createdAt: new Date(clock.now()).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    showEta,
  };
  append('trackingLinks', link);

  recordAuditForSession(session, {
    action: 'link.create',
    assetId: asset.id,
    bookingId: booking?.id,
    tenantId: asset.ownerTenantId,
    detail: `Tracking link created for ${asset.code}${booking ? ` (${booking.reference}${showEta ? ', with ETA' : ''})` : ' (no job)'}`,
  });
  return ok(link, `${asset.code} link created — expires ${clock.formatDubaiDate(expiresAt)} ${clock.formatDubaiTime(expiresAt)}.`);
}

export function revokeTrackingLink(session: Session, linkId: string, reason: LinkRevokeReason = 'manual'): OpResult<TrackingLink> {
  const link = linkById(linkId);
  if (!link) return fail('Link not found.');
  const asset = db.getState().assets.find(a => a.id === link.assetId);
  if (!asset) return fail('Asset not found.');
  if (!can(session, 'link.revoke', asset.id)) {
    return fail('You cannot revoke this link.');
  }
  if (link.revokedAt) return fail('This link is already revoked.');

  link.revokedAt = new Date(clock.now()).toISOString();
  link.revokedBy = session.userId;
  link.revokeReason = reason;
  touch('trackingLinks');

  recordAuditForSession(session, {
    action: 'link.revoke',
    assetId: asset.id,
    bookingId: link.bookingId ?? undefined,
    tenantId: asset.ownerTenantId,
    detail: `Tracking link revoked for ${asset.code} — ${reason === 'manual' ? 'manual' : reason.replace(/_/g, ' ')}`,
    reason: reason === 'manual' ? undefined : reason.replace(/_/g, ' '),
  });
  return ok(link, `${asset.code} link revoked.`);
}

/** End every link that belongs to a job — used by cancel / close / end access early. */
export function revokeLinksForBooking(bookingId: string, reason: LinkRevokeReason, byUserId: string): number {
  let revoked = 0;
  for (const link of db.getState().trackingLinks) {
    if (link.bookingId !== bookingId || link.revokedAt) continue;
    link.revokedAt = new Date(clock.now()).toISOString();
    link.revokedBy = byUserId;
    link.revokeReason = reason;
    revoked += 1;
  }
  if (revoked > 0) touch('trackingLinks');
  return revoked;
}
