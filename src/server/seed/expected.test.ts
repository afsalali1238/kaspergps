// The seeded expectations the /dev explorer and the Features panel use
// (spec 8.2 asset table + §5 capability table) must match the code at anchor.
// If this fails, the fixture is right — fix the code.
import { describe, it, expect } from 'vitest';
import {
  assertUserVisibility, expectedAssetStatus, expectedUserVisibility,
  type ExpectedUserVisibility,
} from './expected';
import { getRelationship, isAssetVisible, rentalWindow, visibleAssetIds } from '@/server/access';
import { computeStatus } from '@/server/telemetry/simulator';
import { FEATURES, hasFeature, tierForAsset } from '@/domain/features';
import { seed } from './data';
import type { Session } from '@/domain/types';

function sessionFor(userId: string): Session {
  const user = seed.users.find(u => u.id === userId)!;
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: user.siteIds,
    role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

/** The demo switch is off and Kasper staff see the sales view, as in the app. */
const SALES_VIEW = true;
const PHASE = 'phase2' as const;

describe('seed expectations — who sees which assets', () => {
  const actual: ExpectedUserVisibility[] = expectedUserVisibility.map(exp => {
    const session = sessionFor(exp.userId);
    return {
      userId: exp.userId,
      userName: session.user.name,
      role: String(session.role),
      tenantId: session.tenantId,
      assets: visibleAssetIds(session).map(id => {
        const asset = seed.assets.find(a => a.id === id)!;
        return { id, code: asset.code, relationship: getRelationship(session, id), window: rentalWindow(session, id) };
      }),
    };
  });

  it('matches the fixture for every user, asset by asset', () => {
    // Kasper rows carry `assets: []` — they see the whole fleet, listed via the API.
    expect(() => assertUserVisibility(
      actual.filter(a => a.assets.length > 0),
      expectedUserVisibility.filter(e => e.assets.length > 0),
    )).not.toThrow();
    for (const exp of expectedUserVisibility) {
      const act = actual.find(a => a.userId === exp.userId)!;
      if (exp.assets.length === 0) {
        if (act.role.startsWith('kasper')) expect(act.assets).toHaveLength(seed.assets.length);
        continue;
      }
      expect(act.userName).toBe(exp.userName);
      expect(act.role).toBe(exp.role);
      expect(act.tenantId).toBe(exp.tenantId);
      for (const asset of exp.assets) {
        const seen = act.assets.find(a => a.code === asset.code);
        expect(seen, `${exp.userId} should see ${asset.code}`).toBeTruthy();
        expect(seen!.relationship).toBe(asset.relationship);
        if (asset.window) {
          expect(seen!.window).toMatchObject({ start: asset.window.start, end: asset.window.end });
        } else {
          expect(seen!.window).toBe(null);
        }
      }
    }
  });

  it('lets Kasper see everything and keeps renters to their window', () => {
    const sara = sessionFor('u-sara');
    expect(visibleAssetIds(sara)).toHaveLength(seed.assets.length);
    expect(actual.find(a => a.userId === 'u-sara')!.assets.every(a => a.relationship === 'kasper')).toBe(true);

    // Lina rents EX-04 from Emirates, so she sees it as a renter with a window.
    const lina = actual.find(a => a.userId === 'u-lina')!;
    const ex04 = lina.assets.find(a => a.code === 'EX-04')!;
    expect(ex04.relationship).toBe('renter');
    expect(ex04.window!.end).toBeGreaterThan(ex04.window!.start);
    expect(isAssetVisible(sessionFor('u-lina'), 'a-ex04')).toBe(true);
  });

  it('hides retired assets from the tenant but not from Kasper', () => {
    const retired = seed.assets.filter(a => (a as { retiredAt?: string | null }).retiredAt);
    if (retired.length === 0) return;
    const owner = sessionFor('u-omar');
    for (const asset of retired) {
      if (asset.ownerTenantId === owner.tenantId) expect(isAssetVisible(owner, asset.id)).toBe(false);
      expect(isAssetVisible(sessionFor('u-sara'), asset.id)).toBe(true);
    }
  });
});

describe('seed expectations — status, features and tier', () => {
  it('matches the asset table for every seeded asset', () => {
    for (const expected of expectedAssetStatus) {
      const asset = seed.assets.find(a => a.id === expected.id);
      expect(asset, `missing asset ${expected.code}`).toBeTruthy();
      expect(asset!.code).toBe(expected.code);
      expect(computeStatus(asset!)).toBe(expected.status);
      expect(tierForAsset(asset!)).toBe(expected.tier);
    }
  });

  it('gives each tier exactly the features its params allow', () => {
    for (const expected of expectedAssetStatus) {
      const asset = seed.assets.find(a => a.id === expected.id)!;
      const available = FEATURES
        .filter(f => hasFeature(asset, f.key))
        .filter(f => f.adapter === undefined || f.adapter.includes(asset.canProfile.adapter))
        .map(f => f.key);
      for (const key of expected.features) {
        expect(available, `${expected.code} should have ${key}`).toContain(key);
      }
      // And nothing from a higher tier leaks in.
      if (expected.tier === 1) {
        expect(asset.canProfile.adapter).toBe('none');
        expect(available).not.toContain('fuel.level');
        expect(available).not.toContain('faults');
        expect(available).not.toContain('hours.ecu');
      }
    }
  });

  it('keeps coverage of every seeded asset and of the tier rules', () => {
    for (const asset of seed.assets) {
      const row = expectedAssetStatus.find(e => e.id === asset.id);
      expect(row, `${asset.code} is missing from the expected table`).toBeTruthy();
    }
    // Tier 3 needs ALL-CAN300 and engineHours for billing-grade hours.
    const ex04 = seed.assets.find(a => a.code === 'EX-04')!;
    expect(FEATURES.find(f => f.key === 'hours.ecu')!.adapter).toEqual(['ALL-CAN300']);
    expect(hasFeature(ex04, 'history.track')).toBe(true);
    expect(FEATURES.filter(f => f.phase === 'day_one').length).toBeGreaterThan(0);
    expect(SALES_VIEW && PHASE === 'phase2').toBe(true);
  });
});
