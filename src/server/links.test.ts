import { beforeEach, describe, expect, it } from 'vitest';
import { ANCHOR_MS } from './seed/data';
import * as clock from '../lib/clock';
import { resolveTrackingLink } from './links';

const etaToken = 'k7Qm2Xc9TpLw4ZaN8rVb3Ye5';
const noEtaToken = 'dB8rXp2kN9wQ4mY7hT6vZ1AaCs';

beforeEach(() => {
  clock.setAnchor(ANCHOR_MS);
});

describe('resolveTrackingLink', () => {
  it('returns only the four public fields when ETA is disabled', () => {
    const resolved = resolveTrackingLink(noEtaToken);
    expect(resolved).not.toBeNull();
    expect(Object.keys(resolved!).sort()).toEqual(['assetName', 'at', 'lat', 'lng']);
  });

  it('adds only the ETA object when the link allows it and has a destination', () => {
    const resolved = resolveTrackingLink(etaToken);
    expect(resolved).not.toBeNull();
    expect(Object.keys(resolved!).sort()).toEqual(['assetName', 'at', 'eta', 'lat', 'lng']);
    expect(Object.keys(resolved!.eta!).sort()).toEqual(['destinationName', 'etaAt', 'state']);
    expect(resolved!.eta?.state).toBe('en_route');
  });
});
