// J4.4: a renter knows a rented asset only by the site on their own rental, never
// the owner's yard — in asset views, alert lines and search.

import { describe, it, expect, beforeEach } from 'vitest';
import type { Session, User } from '@/domain/types';
import { db, resetDb } from '@/server/db';
import { visibleAssetIds, getRelationship, viewerSiteId, viewerSiteName } from '@/server/access';
import { visibleAlerts } from '@/server/alerts';
import { searchAssets } from '@/server/search';
import { isKasperStaff } from '@/server/capabilities';
import * as clock from '@/lib/clock';

function sessionFor(user: User): Session {
  return { userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role: user.role, isKasper: isKasperStaff(user.role) };
}

const customers = () => db.getState().users.filter(u => !isKasperStaff(u.role) && u.status === 'active');
const siteName = (id: string) => db.getState().sites.find(s => s.id === id)!.name;

beforeEach(() => {
  resetDb();
  clock.setOffsetMs(0);
});

describe('renter locations (J4.4)', () => {
  it('every rented asset is known by a site of the renter, not the owner', () => {
    let checked = 0;
    for (const user of customers()) {
      const session = sessionFor(user);
      for (const id of visibleAssetIds(session)) {
        if (getRelationship(session, id) !== 'renter') continue;
        const siteId = viewerSiteId(session, id);
        expect(siteId, `${user.name} ${id}`).not.toBeNull();
        expect(db.getState().sites.find(s => s.id === siteId)!.tenantId, `${user.name} ${id}`).toBe(user.tenantId);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('Deepa never sees an owner yard in alerts or search', () => {
    const deepa = sessionFor(db.getState().users.find(u => u.id === 'u-deepa')!);
    const yards = ['s-emirates-rak', 's-emirates-alq', 's-gulflift-aq']
      .filter(id => db.getState().sites.some(s => s.id === id))
      .map(siteName);
    const seen = [
      ...visibleAlerts(deepa).map(a => a.siteName),
      ...searchAssets(deepa, '', 100).map(h => h.siteName),
      ...visibleAssetIds(deepa).map(id => viewerSiteName(deepa, id)),
    ];
    for (const name of seen) {
      expect(name).not.toMatch(/Yard/);
      expect(yards).not.toContain(name);
    }
    for (const name of seen.filter(Boolean)) {
      expect(deepa.siteIds.map(siteName)).toContain(name);
    }
  });

  it('the owner still sees the home site', () => {
    const khalid = sessionFor(db.getState().users.find(u => u.id === 'u-khalid')!);
    const ex11 = db.getState().assets.find(a => a.id === 'a-ex11')!;
    expect(viewerSiteId(khalid, 'a-ex11')).toBe(ex11.homeSiteId);
  });
});
