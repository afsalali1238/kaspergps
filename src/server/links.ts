// Public tracking-link resolver (architecture rule 8).
//
// The resolver returns exactly:
//   { assetName, lat, lng, at }                    — 4 keys
//   { assetName, lat, lng, at, eta }               — 5 keys when ETA is on
// and null when the token is unknown or the link is no longer active.
//
// ETA comes from the booking's destination + spec 11.14 maths in src/domain/eta.ts.

import type { TrackingLink } from '@/domain/types';
import { seed } from '@/server/seed/data';
import { getReadingForAsset, getReadingsForAsset } from '@/server/telemetry/simulator';
import { averageMovingSpeedKmh, etaSpeedKmh, computeEta, distanceToDestinationM } from '@/domain/eta';
import type { EtaState } from '@/domain/eta';
import { STALE_AFTER_SEC } from '@/config/thresholds';
import * as clock from '@/lib/clock';

export interface ResolvedEta {
  destinationName: string;
  etaAt: number;
  state: EtaState;
}

export interface ResolvedTrackingLink {
  assetName: string;
  lat: number;
  lng: number;
  at: string;
  eta?: ResolvedEta;
}

export type LinkState =
  | 'active'
  | 'expired'
  | 'revoked'
  | 'booking_cancelled'
  | 'job_closed'
  | 'access_ended'
  | 'not_found';

function toMs(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const t = typeof v === 'number' ? v : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

export function getTrackingLinkState(token: string, nowMs: number = clock.now()): LinkState {
  const link = seed.trackingLinks.find(l => l.token === token);
  if (!link) return 'not_found';
  if (link.revokedAt) return 'revoked';
  if (toMs(link.expiresAt) !== null && nowMs > toMs(link.expiresAt)!) return 'expired';
  const booking = link.bookingId ? seed.bookings.find(b => b.id === link.bookingId) : null;
  if (booking) {
    if (booking.status === 'cancelled') return 'booking_cancelled';
    if (booking.status === 'closed') return 'job_closed';
    const closedAt = toMs(booking.closedAt);
    if (closedAt !== null && nowMs > closedAt) return 'access_ended';
    const override = seed.grantOverrides.find(o => o.bookingId === booking.id);
    const endedAt = override ? toMs(override.endedAt) : null;
    if (endedAt !== null && nowMs > endedAt) return 'access_ended';
    if (nowMs < toMs(booking.start)!) return 'active';
  }
  return 'active';
}

function isLinkActive(link: TrackingLink, nowMs: number): boolean {
  return getTrackingLinkState(link.token, nowMs) === 'active';
}

/**
 * Resolve a public token. Returns null for unknown tokens and for links that are
 * no longer active (expired, revoked, booking cancelled, job closed, access ended).
 */
export function resolveTrackingLink(token: string, nowMs: number = clock.now()): ResolvedTrackingLink | null {
  const link = seed.trackingLinks.find(l => l.token === token);
  if (!link) return null;
  if (!isLinkActive(link, nowMs)) return null;

  const asset = seed.assets.find(a => a.id === link.assetId);
  if (!asset) return null;

  const reading = getReadingForAsset(asset);
  if (!reading) return null;

  const resolved: ResolvedTrackingLink = {
    assetName: asset.name,
    lat: reading.lat,
    lng: reading.lng,
    at: reading.deviceTime,
  };

  const booking = link.bookingId ? seed.bookings.find(b => b.id === link.bookingId) : null;
  const destination = booking?.destination;
  if (destination && link.showEta) {
    resolved.eta = resolveEtaForLink(link, asset, reading, destination.name, { lat: destination.lat, lng: destination.lng }, nowMs);
  }

  return resolved;
}

/** ETA row for a link (spec 11.14) — also used by the owner's link list. */
export function resolveEtaForLink(
  link: TrackingLink,
  asset: (typeof seed.assets)[number],
  reading: { lat: number; lng: number; deviceTime: string } | null,
  destinationName: string,
  destination: { lat: number; lng: number },
  nowMs: number = clock.now()
): ResolvedEta {
  const unavailable: ResolvedEta = { destinationName, etaAt: nowMs, state: 'unavailable' };
  if (!reading) return unavailable;

  const readingMs = toMs(reading.deviceTime);
  if (readingMs === null) return unavailable;
  // Last reading older than STALE, or no reading after the link was created.
  if (nowMs - readingMs > STALE_AFTER_SEC * 1000) return unavailable;
  const linkStart = toMs(link.createdAt);
  if (linkStart !== null && readingMs < linkStart) return unavailable;

  const history = getReadingsForAsset(asset, nowMs - 15 * 60 * 1000, nowMs);
  const speed = etaSpeedKmh(averageMovingSpeedKmh(history, nowMs));
  const eta = computeEta({ lat: reading.lat, lng: reading.lng }, destination, nowMs, speed);
  return { destinationName, etaAt: eta.etaAt, state: eta.state };
}

/** Distance helper used by the asset page ("382 km from the destination"). */
export function distanceToDestination(reading: { lat: number; lng: number }, destination: { lat: number; lng: number }): number {
  return distanceToDestinationM(reading, destination);
}
