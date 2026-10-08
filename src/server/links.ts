// Public tracking link resolver.
// Architecture rule 8: returns only the allowed public shape.
// No index, no referrer on the page that calls it.

import { seed } from '@/server/seed/data';
import { getReadingForAsset } from '@/server/telemetry/simulator';
import * as clock from '@/lib/clock';
import { averageMovingSpeed, calcEta, type EtaState } from '@/domain/eta';

/**
 * Public link resolver.
 * Returns the allowed shape, or null when the link is inactive / not found.
 */
export function resolveTrackingLink(token: string): {
  assetName: string;
  lat: number;
  lng: number;
  at: string;
  eta?: { destinationName: string; etaAt: number; state: EtaState };
} | null {
  const link = seed.trackingLinks.find(l => l.token === token);
  if (!link) return null;

  const asset = seed.assets.find(a => a.id === link.assetId);
  if (!asset) return null;

  const now = clock.now();

  const isExpired = typeof link.expiresAt === 'number' && now > link.expiresAt;
  const isRevoked = !!link.revokedAt;
  const booking = link.bookingId ? seed.bookings.find(b => b.id === link.bookingId) : null;
  const isCancelled = booking ? booking.status === 'cancelled' : false;
  const isJobClosed = booking ? booking.status === 'closed' : false;
  const accessEnded = booking && typeof booking.closedAt === 'number' ? now > booking.closedAt : false;

  if (isExpired || isRevoked || isCancelled || isJobClosed || accessEnded) return null;

  const reading = getReadingForAsset(asset);
  if (!reading) return null;

  const at = typeof reading.deviceTime === 'string'
    ? reading.deviceTime
    : new Date(reading.deviceTime).toISOString();

  const base: ReturnType<typeof resolveTrackingLink> = {
    assetName: asset.name,
    lat: reading.lat,
    lng: reading.lng,
    at,
  };

  // ETA only when the link was created with showEta on and the booking has a destination.
  if (link.showEta && booking?.destination) {
    const windowMs = 15 * 60 * 1000;
    // Use the current reading's speed as the only data point we have for this asset.
    // averageMovingSpeed falls back to defaultKmh (40) when given an empty array.
    const speed = averageMovingSpeed([], windowMs, 40, 25, 80);
    // If the current reading has a meaningful speed, prefer it over the default.
    const effectiveSpeed = reading.speedKmh > 0 ? reading.speedKmh : speed;
    const eta = calcEta({ lat: reading.lat, lng: reading.lng }, booking.destination, effectiveSpeed);
    base.eta = {
      destinationName: booking.destination.name,
      etaAt: eta.etaAt,
      state: eta.state,
    };
  }

  return base;
}
