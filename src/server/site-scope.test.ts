// H2.2 — a Site User with no site sees nothing; an empty site list never means
// "all sites". Site Users must always have at least one site.
import { describe, it, expect } from 'vitest';
import { db } from '@/server/db';
import * as access from './access';
import { createUser, updateUserRole, updateUserSites } from './team';
import type { Session } from '@/domain/types';

function sessionFor(userId: string, siteIds?: string[]): Session {
  const user = db.getState().users.find(u => u.id === userId)!;
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: siteIds ?? user.siteIds,
    role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

describe('site scope — visibility', () => {
  it('a Site User with no sites sees none of their company\'s assets', () => {
    const owned = db.getState().assets.filter(a => a.ownerTenantId === 't-gulflift');
    expect(owned.length).toBeGreaterThan(0);
    const s = sessionFor('u-mark', []);
    for (const asset of owned) expect(access.isAssetVisible(s, asset.id)).toBe(false);
  });

  it('a Tenant Admin with no sites still sees all their company\'s assets', () => {
    const owned = db.getState().assets.filter(a => a.ownerTenantId === 't-gulflift');
    const s = sessionFor('u-priya');
    for (const asset of owned) expect(access.isAssetVisible(s, asset.id)).toBe(true);
  });

  it('a Site User sees only assets at their own site', () => {
    const s = sessionFor('u-mark');
    const owned = db.getState().assets.filter(a => a.ownerTenantId === 't-gulflift');
    for (const asset of owned) {
      expect(access.isAssetVisible(s, asset.id)).toBe(s.siteIds.includes(asset.homeSiteId));
    }
  });
});

describe('site scope — a Site User needs at least one site', () => {
  it('createUser refuses a Site User with no site', () => {
    const r = createUser(sessionFor('u-priya'), {
      tenantId: 't-gulflift', name: 'No Site', email: 'nosite@gulflift.ae', role: 'site_user', siteIds: [],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Pick at least one site.');
  });

  it('createUser accepts a Site User with a site', () => {
    const r = createUser(sessionFor('u-priya'), {
      tenantId: 't-gulflift', name: 'Has Site', email: 'hassite@gulflift.ae', role: 'site_user', siteIds: ['s-gulflift-aq'],
    });
    expect(r.ok).toBe(true);
  });

  it('updateUserSites refuses to leave a Site User with no site', () => {
    const r = updateUserSites(sessionFor('u-priya'), 'u-mark', []);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Pick at least one site.');
  });

  it('updateUserRole refuses to make a Site User who has no site', () => {
    const priya = sessionFor('u-priya');
    // A second active admin, so the last-admin rule doesn't answer first.
    const second = createUser(priya, {
      tenantId: 't-gulflift', name: 'Second Admin', email: 'second@gulflift.ae', role: 'tenant_admin',
    }).data!;
    const r = updateUserRole(priya, second.id, 'site_user');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Pick at least one site.');
  });
});
