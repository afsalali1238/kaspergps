// Public tracking-link resolver tests — spec 11.6 / 11.14 / 11.7 and the P12
// acceptance check "resolver key-set test with ETA".
import { describe, it, expect, afterEach } from 'vitest';
import {
  resolveTrackingLink,
  trackingLinkEndReason,
  isTrackingLinkLive,
  etaForLink,
  findTrackingLink,
  readingsSinceLinkStart,
} from '@/server/links';
import * as clock from '@/lib/clock';

const FB12_TOKEN = 'k7Qm2Xc9TpLw4ZaN8rVb3Ye5'; // FB-12, ETA on, destination set
const TP22_TOKEN = 'dB8rXp2kN9wQ4mY7hT6vZ1AaCs'; // TP-22, no booking, ETA off
const LB02_TOKEN = 'fH3jKp7wR9xT2nY4qM6vZ1AbCs'; // revoked (job closed)
const CR02_TOKEN = 'rT4kWp8nN3yU7mZ2hF5vX1AcDe'; // revoked manually, then cancelled

afterEach(() => {
  clock.resetOffset();
});

describe('link life cycle', () => {
  it('is live for a valid, unexpired link', () => {
    expect(isTrackingLinkLive(FB12_TOKEN)).toBe(true);
    expect(trackingLinkEndReason(FB12_TOKEN)).toBeNull();
  });

  it('reports an unknown token as not_found', () => {
    expect(trackingLinkEndReason('not-a-real-token')).toBe('not_found');
    expect(resolveTrackingLink('not-a-real-token')).toBeNull();
  });

  it('ends a revoked link', () => {
    expect(trackingLinkEndReason(LB02_TOKEN)).toBe('revoked');
    expect(resolveTrackingLink(LB02_TOKEN)).toBeNull();
  });

  it('ends a link whose booking was cancelled', () => {
    expect(trackingLinkEndReason(CR02_TOKEN)).toBe('revoked'); // revoked before the cancellation
  });

  it('ends an expired link', () => {
    clock.jumpForwardHours(20); // FB-12's link expires 14 h after the anchor
    expect(trackingLinkEndReason(FB12_TOKEN)).toBe('expired');
    expect(resolveTrackingLink(FB12_TOKEN)).toBeNull();
  });
});

describe('resolver shape (architecture rule 8)', () => {
  it('returns exactly { assetName, lat, lng, at } with ETA on', () => {
    const resolved = resolveTrackingLink(FB12_TOKEN);
    expect(resolved).not.toBeNull();
    expect(Object.keys(resolved!).sort()).toEqual(['assetName', 'at', 'eta', 'lat', 'lng']);
    expect(Object.keys(resolved!.eta!).sort()).toEqual(['destinationName', 'etaAt', 'state']);
  });

  it('returns exactly { assetName, lat, lng, at } without ETA', () => {
    const resolved = resolveTrackingLink(TP22_TOKEN);
    expect(resolved).not.toBeNull();
    expect(Object.keys(resolved!).sort()).toEqual(['assetName', 'at', 'lat', 'lng']);
  });

  it('never leaks coordinates of the destination, a booking or a tenant', () => {
    const resolved = resolveTrackingLink(FB12_TOKEN)!;
    const json = JSON.stringify(resolved);
    expect(json).not.toContain('25.113');
    expect(json).not.toContain('55.2');
    expect(json).not.toContain('b-1011');
    expect(json).not.toContain('t-alnoor');
    expect(json).not.toContain('u-omar');
    expect(resolved.assetName).toContain('FB-12');
  });

  it('reports a live position and time for the asset', () => {
    const resolved = resolveTrackingLink(FB12_TOKEN)!;
    expect(resolved.lat).toBeGreaterThan(24);
    expect(resolved.lng).toBeGreaterThan(54);
    expect(new Date(resolved.at).getTime()).toBeLessThanOrEqual(clock.now());
  });
});

describe('ETA on the public link (spec 11.14)', () => {
  it('is en route with the destination name before the asset arrives', () => {
    const eta = etaForLink(findTrackingLink(FB12_TOKEN)!)!;
    expect(eta.state).toBe('en_route');
    expect(eta.destinationName).toBe('Al Habtoor site, Al Barsha');
    expect(eta.etaAt).not.toBeNull();
    expect(eta.etaAt! % 60000).toBe(0); // rounded to the minute
  });

  it('is arrived after the asset reaches the destination', () => {
    clock.jumpForwardHours(2); // FB-12 arrives ~90 min after the anchor
    const eta = etaForLink(findTrackingLink(FB12_TOKEN)!)!;
    expect(eta.state).toBe('arrived');
    expect(eta.etaAt).not.toBeNull();
    const resolved = resolveTrackingLink(FB12_TOKEN)!;
    expect(resolved.eta!.state).toBe('arrived');
  });

  it('is unavailable when the tracker has not reported since the link started', () => {
    const link = { ...findTrackingLink(TP22_TOKEN)!, createdAt: clock.now() + 60 * 60 * 1000 };
    const readings = readingsSinceLinkStart(link, clock.now());
    expect(readings).toHaveLength(0);
  });

  it('does not compute an ETA when the owner turned it off', () => {
    const link = findTrackingLink(TP22_TOKEN)!;
    expect(link.showEta).toBe(false);
    expect(etaForLink(link)).toBeUndefined();
  });
});
