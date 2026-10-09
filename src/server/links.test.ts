// Public tracking-link resolver tests (spec 11.14, architecture rule 8).
// The resolver must expose exactly 4 keys, or 5 when the link has ETA enabled.
import { describe, it, expect } from 'vitest';
import { getTrackingLinkState, resolveTrackingLink } from './links';
import { db } from '@/server/db';
import * as clock from '@/lib/clock';

// Fixed demo tokens from the seed (spec 8.5).
const FB12_TOKEN = 'k7Qm2Xc9TpLw4ZaN8rVb3Ye5'; // FB-12, BK-1011, showEta: true
const TP22_TOKEN = 'dB8rXp2kN9wQ4mY7hT6vZ1AaCs'; // TP-22, no booking
const LB02_TOKEN = 'fH3jKp7wR9xT2nY4qM6vZ1AbCs'; // revoked (job closed)
const CR02_TOKEN = 'rT4kWp8nN3yU7mZ2hF5vX1AcDe'; // revoked (manual)

describe('resolveTrackingLink', () => {
  it('returns null for an unknown token', () => {
    expect(resolveTrackingLink('not-a-real-token')).toBeNull();
    expect(resolveTrackingLink('')).toBeNull();
  });

  it('returns null for revoked links', () => {
    expect(resolveTrackingLink(LB02_TOKEN)).toBeNull();
    expect(resolveTrackingLink(CR02_TOKEN)).toBeNull();
  });

  it('returns exactly the four public keys when the link has no ETA', () => {
    const resolved = resolveTrackingLink(TP22_TOKEN);
    expect(resolved).not.toBeNull();
    expect(Object.keys(resolved!).sort()).toEqual(['assetName', 'at', 'lat', 'lng']);
  });

  it('returns exactly five keys — with eta — when the link shows an ETA', () => {
    const resolved = resolveTrackingLink(FB12_TOKEN);
    expect(resolved).not.toBeNull();
    expect(Object.keys(resolved!).sort()).toEqual(['assetName', 'at', 'eta', 'lat', 'lng']);
    expect(Object.keys(resolved!.eta!).sort()).toEqual(['destinationName', 'etaAt', 'state']);
    expect(resolved!.eta!.destinationName).toBe('Al Habtoor site, Al Barsha');
    expect(['en_route', 'arrived', 'unavailable']).toContain(resolved!.eta!.state);
  });

  it('never leaks the token, tracker, IMEI or coordinates of the destination', () => {
    const resolved = resolveTrackingLink(FB12_TOKEN)!;
    const serialised = JSON.stringify(resolved);
    expect(serialised).not.toContain('imei');
    expect(serialised).not.toContain(FB12_TOKEN);
    expect(Object.keys(resolved).some(k => k.includes('imei'))).toBe(false);
  });

  it('reports the asset name from the seed', () => {
    const resolved = resolveTrackingLink(FB12_TOKEN)!;
    const asset = db.getState().assets.find(a => a.id === 'a-fb12')!;
    expect(resolved.assetName).toBe(asset.name);
  });

  it('is unavailable once the booking is cancelled', () => {
    const booking = db.getState().bookings.find(b => b.id === 'b-1011')!;
    const original = booking.status;
    booking.status = 'cancelled';
    try {
      expect(getTrackingLinkState(FB12_TOKEN)).toBe('booking_cancelled');
      expect(resolveTrackingLink(FB12_TOKEN)).toBeNull();
    } finally {
      booking.status = original;
    }
  });

  it('is unavailable once the link expires', () => {
    expect(resolveTrackingLink(TP22_TOKEN, clock.now() + 48 * 3600 * 1000)).toBeNull();
    expect(getTrackingLinkState(TP22_TOKEN, clock.now() + 48 * 3600 * 1000)).toBe('expired');
  });

  it('starts working when a future booking starts (access runs from booking start)', () => {
    const booking = db.getState().bookings.find(b => b.id === 'b-1011')!;
    const originalStart = booking.start;
    booking.start = clock.now() + 3600 * 1000;
    try {
      // A link tied to a future booking is still live — the resolver returns the
      // asset's current position (the page shows "Waiting for update" if there is none).
      expect(getTrackingLinkState(FB12_TOKEN)).toBe('active');
    } finally {
      booking.start = originalStart;
    }
  });
});
