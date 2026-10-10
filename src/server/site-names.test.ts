// H2.7 — renters never see the owner's site names. GN-01 is owned by Emirates
// (Al Quoz Yard) and rented to Palm Contracting (Dubai South Hub).
import { describe, it, expect } from 'vitest';
import { db } from '@/server/db';
import { visibleAlerts } from './alerts';
import type { Session } from '@/domain/types';

function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId)!;
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: user.siteIds,
    role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

describe('site names in alerts (H2.7)', () => {
  it('a renter sees the rental site on a rented-in asset\'s alert, not the owner\'s yard', () => {
    const deepa = sessionFor('u-deepa');
    const gn01 = visibleAlerts(deepa, 'later').filter(a => a.assetId === 'a-gn01');
    expect(gn01.length).toBeGreaterThan(0);
    for (const a of gn01) {
      expect(a.siteName).not.toBe('Al Quoz Yard');
      expect(a.siteName).toBe('Dubai South Hub');
    }
  });

  it('the owner still sees the asset\'s home site', () => {
    const khalid = sessionFor('u-khalid');
    const gn01 = visibleAlerts(khalid, 'later').filter(a => a.assetId === 'a-gn01');
    expect(gn01.length).toBeGreaterThan(0);
    for (const a of gn01) expect(a.siteName).toBe('Al Quoz Yard');
  });
});
