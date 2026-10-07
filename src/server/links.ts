import type { TrackingLink } from '@/domain/types';
import { ETA_ARRIVED_M, ETA_ROAD_FACTOR, IDLE_SPEED_KMH, OFFLINE_AFTER_SEC } from '@/config/thresholds';
import * as clock from '@/lib/clock';
import { getGrantEnd } from '@/server/access';
import { seed } from '@/server/seed/data';
import { getReadingForAsset, getReadingsForAsset } from '@/server/telemetry/simulator';

export type TrackingEta = {
  destinationName: string;
  etaAt: number | null;
  state: 'en_route' | 'arrived' | 'unavailable';
};

export type TrackingLinkResolution = {
  assetName: string;
  lat: number;
  lng: number;
  at: string;
  eta?: TrackingEta;
};

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function toMillis(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : new Date(value).getTime();
}

function distanceMeters(lat: number, lng: number, destination: { lat: number; lng: number }): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRadians(destination.lat - lat);
  const dLng = toRadians(destination.lng - lng);
  const lat1 = toRadians(lat);
  const lat2 = toRadians(destination.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculatedEta(
  link: TrackingLink,
  readings: ReturnType<typeof getReadingsForAsset>,
  now: number,
): TrackingEta | undefined {
  if (!link.showEta) return undefined;
  const booking = link.bookingId ? seed.bookings.find(item => item.id === link.bookingId) : null;
  const destination = booking?.destination;
  if (!destination) return undefined;

  const destinationName = destination.name;
  const readingsAfterLinkStart = readings.filter(reading => toMillis(reading.deviceTime) >= toMillis(link.createdAt));
  const lastReading = readingsAfterLinkStart[readingsAfterLinkStart.length - 1];
  if (!lastReading) return { destinationName, etaAt: null, state: 'unavailable' };

  const arrival = readingsAfterLinkStart.find(reading =>
    distanceMeters(reading.lat, reading.lng, destination) <= ETA_ARRIVED_M
  );
  if (arrival) {
    return { destinationName, etaAt: toMillis(arrival.deviceTime), state: 'arrived' };
  }

  const lastReadingAt = toMillis(lastReading.deviceTime);
  if (now - lastReadingAt > OFFLINE_AFTER_SEC * 1000) {
    return { destinationName, etaAt: null, state: 'unavailable' };
  }

  const movingSpeeds = readingsAfterLinkStart
    .filter(reading => {
      const at = toMillis(reading.deviceTime);
      return at >= now - FIFTEEN_MINUTES_MS && at <= now && reading.ignition && reading.speedKmh >= IDLE_SPEED_KMH;
    })
    .map(reading => reading.speedKmh);
  const observedAverage = movingSpeeds.length
    ? movingSpeeds.reduce((sum, speed) => sum + speed, 0) / movingSpeeds.length
    : 40;
  const speedKmh = Math.max(25, Math.min(80, observedAverage));
  const roadDistanceKm = distanceMeters(lastReading.lat, lastReading.lng, destination) / 1000 * ETA_ROAD_FACTOR;
  const etaAt = Math.round((now + roadDistanceKm / speedKmh * 60 * 60 * 1000) / 60_000) * 60_000;
  return { destinationName, etaAt, state: 'en_route' };
}

/**
 * Resolve a public tracking token to only the location fields the public page needs.
 * Invalid, expired, revoked, cancelled, closed, or ended links resolve to null.
 */
export function resolveTrackingLink(token: string): TrackingLinkResolution | null {
  if (!token) return null;
  const link = seed.trackingLinks.find(item => item.token === token);
  if (!link || link.revokedAt !== undefined) return null;

  const now = clock.now();
  const expiresAt = toMillis(link.expiresAt);
  if (!Number.isFinite(expiresAt) || now >= expiresAt) return null;

  const asset = seed.assets.find(item => item.id === link.assetId);
  if (!asset || asset.retiredAt) return null;

  const booking = link.bookingId ? seed.bookings.find(item => item.id === link.bookingId) : null;
  if (link.bookingId && !booking) return null;
  if (booking) {
    if (booking.status === 'cancelled' || booking.status === 'closed') return null;
    const startsAt = toMillis(booking.start);
    const endsAt = getGrantEnd(booking);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || now < startsAt || now > endsAt) return null;
  }

  const linkCreatedAt = toMillis(link.createdAt);
  if (!Number.isFinite(linkCreatedAt) || linkCreatedAt > now) return null;
  const readingsSinceLinkStart = getReadingsForAsset(asset, linkCreatedAt, now);
  const reading = getReadingForAsset(asset);
  if (!reading || !Number.isFinite(reading.lat) || !Number.isFinite(reading.lng)) return null;

  const result: TrackingLinkResolution = {
    assetName: asset.name,
    lat: reading.lat,
    lng: reading.lng,
    at: reading.deviceTime,
  };
  const eta = calculatedEta(link, readingsSinceLinkStart, now);
  return eta ? { ...result, eta } : result;
}
