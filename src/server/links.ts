// Public tracking-link resolver — spec 11.6 / 11.7, architecture rule 8.
//
// The only shape the public page may see is { assetName, lat, lng, at } plus an
// optional `eta` of { destinationName, etaAt, state }. No booking, tenant, user or
// coordinate-of-destination ever leaks through here. Unit-tested in links.test.ts.
//
// ETA maths lives in src/domain/eta.ts so the owner's link row shows exactly what
// the hirer sees.

import type { Booking, TrackingLink } from '@/domain/types';
import { seed } from '@/server/seed/data';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { computeEta, type Eta, type EtaReading } from '@/domain/eta';
import * as clock from '@/lib/clock';

export type LinkEndReason = 'not_found' | 'expired' | 'revoked' | 'booking_cancelled' | 'job_closed' | 'access_ended';

export interface ResolvedTrackingLink {
  assetName: string;
  lat: number;
  lng: number;
  /** Device time of the reading, ISO. */
  at: string;
  eta?: Eta;
}

export function findTrackingLink(token: string): TrackingLink | null {
  return seed.trackingLinks.find(l => l.token === token) ?? null;
}

export function bookingForLink(link: TrackingLink): Booking | null {
  return link.bookingId ? seed.bookings.find(b => b.id === link.bookingId) ?? null : null;
}

/**
 * Why the link is no longer active, or null when it is live.
 * Every way a link ends: revoked, expired, booking cancelled, job closed,
 * access ended early, or the token never existed.
 */
export function trackingLinkEndReason(token: string, nowMs: number = clock.now()): LinkEndReason | null {
  const link = findTrackingLink(token);
  if (!link) return 'not_found';
  if (link.revokedAt) return 'revoked';
  if (typeof link.expiresAt === 'number' && nowMs > link.expiresAt) return 'expired';

  const booking = bookingForLink(link);
  if (booking) {
    if (booking.status === 'cancelled') return 'booking_cancelled';
    if (booking.status === 'closed') return 'job_closed';
    if (typeof booking.closedAt === 'number' && nowMs > booking.closedAt) return 'access_ended';
  }
  return null;
}

export function isTrackingLinkLive(token: string, nowMs: number = clock.now()): boolean {
  return trackingLinkEndReason(token, nowMs) === null;
}

/**
 * Readings since the link started. "No reading after the link's start" makes the
 * ETA unavailable, so anything older than the link's creation is ignored.
 */
export function readingsSinceLinkStart(link: TrackingLink, nowMs: number = clock.now()): EtaReading[] {
  const asset = seed.assets.find(a => a.id === link.assetId);
  if (!asset) return [];
  const fromMs = typeof link.createdAt === 'number' ? link.createdAt : new Date(link.createdAt).getTime();
  return getReadingsForAsset(asset, fromMs, nowMs)
    .map(r => ({
      lat: r.lat,
      lng: r.lng,
      atMs: new Date(r.deviceTime).getTime(),
      speedKmh: r.speedKmh,
      moving: r.moving,
    }))
    .sort((a, b) => a.atMs - b.atMs);
}

/**
 * The ETA for a link, or undefined when the link has no destination or the owner
 * turned "Show arrival time" off. Used by the public page and the owner's link row.
 */
export function etaForLink(link: TrackingLink, nowMs: number = clock.now()): Eta | undefined {
  if (!link.showEta) return undefined;
  const booking = bookingForLink(link);
  if (!booking?.destination) return undefined;
  return computeEta({
    destination: booking.destination,
    readings: readingsSinceLinkStart(link, nowMs),
    nowMs,
  });
}

/**
 * What the public page may render. Returns null when the link is not live or the
 * tracker has not reported since the link was created (the page then shows
 * "Waiting for update").
 */
export function resolveTrackingLink(token: string, nowMs: number = clock.now()): ResolvedTrackingLink | null {
  if (trackingLinkEndReason(token, nowMs) !== null) return null;

  const link = findTrackingLink(token)!;
  const asset = seed.assets.find(a => a.id === link.assetId);
  if (!asset) return null;

  const readings = readingsSinceLinkStart(link, nowMs);
  const last = readings[readings.length - 1];
  if (!last) return null;

  const resolved: ResolvedTrackingLink = {
    assetName: `${asset.code} — ${asset.name}`,
    lat: last.lat,
    lng: last.lng,
    at: new Date(last.atMs).toISOString(),
  };

  const eta = etaForLink(link, nowMs);
  if (eta) resolved.eta = eta;

  return resolved;
}
