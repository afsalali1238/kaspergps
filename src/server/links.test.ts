import { describe, it, expect } from 'vitest';
import { seed } from './seed/data';
import { resolveTrackingLink } from './links';

describe('resolveTrackingLink', () => {
  it('returns null for an unknown token', () => {
    expect(resolveTrackingLink('not-a-real-token')).toBeNull();
  });

  it('returns exactly the 4-key shape for an active link, plus optional eta', () => {
    const result = resolveTrackingLink('k7Qm2Xc9TpLw4ZaN8rVb3Ye5');
    expect(result).not.toBeNull();
    // The 4 required keys
    expect(result).toHaveProperty('assetName');
    expect(result).toHaveProperty('lat');
    expect(result).toHaveProperty('lng');
    expect(result).toHaveProperty('at');
    // No extra keys at the top level
    expect(Object.keys(result!).length).toBe(result!.eta ? 5 : 4);
    if (result!.eta) {
      expect(result!.eta).toHaveProperty('destinationName');
      expect(result!.eta).toHaveProperty('etaAt');
      expect(result!.eta).toHaveProperty('state');
      expect(['en_route', 'arrived', 'unavailable']).toContain(result!.eta.state);
    }
  });

  it('returns null for a revoked link', () => {
    const revokedLink = seed.trackingLinks.find(l => l.revokedAt);
    expect(revokedLink).toBeDefined();
    if (revokedLink) {
      const result = resolveTrackingLink(revokedLink.token);
      expect(result).toBeNull();
    }
  });

  it('returns null for a non-existent token', () => {
    expect(resolveTrackingLink('')).toBeNull();
    expect(resolveTrackingLink('x'.repeat(22))).toBeNull();
  });
});
