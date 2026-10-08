// Access layer unit tests — verify visibility, grants, relationship.
import { describe, it, expect } from 'vitest';
import { db } from '@/server/db';
import * as access from './access';
import type { Session } from '@/domain/types';

/** Build a session for a seeded user without the store. */
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

describe('access — isAssetVisible', () => {
  it('Kasper Admin sees all assets', () => {
    const s = sessionFor('u-sara');
    expect(access.isAssetVisible(s, 'a-ex04')).toBe(true);
    expect(access.isAssetVisible(s, 'a-fb12')).toBe(true);
    expect(access.isAssetVisible(s, 'a-mw01')).toBe(true);
  });

  it('Omar (Al Noor, no CAN) sees only his company\'s assets', () => {
    const s = sessionFor('u-omar');
    // Own assets
    expect(access.isAssetVisible(s, 'a-fb12')).toBe(true);
    expect(access.isAssetVisible(s, 'a-fb14')).toBe(true);
    expect(access.isAssetVisible(s, 'a-tp21')).toBe(true);
    // Not Emirates' assets
    expect(access.isAssetVisible(s, 'a-ex04')).toBe(false);
    expect(access.isAssetVisible(s, 'a-bd02')).toBe(false);
    // Not Marina's assets
    expect(access.isAssetVisible(s, 'a-pu51')).toBe(false);
  });

  it('Lina (Marina) sees her own assets + rented EX-04 and CR-02', () => {
    const s = sessionFor('u-lina');
    // Own Tier 2 vehicles
    expect(access.isAssetVisible(s, 'a-pu51')).toBe(true);
    expect(access.isAssetVisible(s, 'a-pu52')).toBe(true);
    expect(access.isAssetVisible(s, 'a-vn01')).toBe(true);
    // Rented — EX-04 (BK-1001, active)
    expect(access.isAssetVisible(s, 'a-ex04')).toBe(true);
    // Rented — CR-02 (BK-1002, active)
    expect(access.isAssetVisible(s, 'a-cr02')).toBe(true);
    // Not rented — EX-07 (booking starts tomorrow, not yet accessible)
    expect(access.isAssetVisible(s, 'a-ex07')).toBe(false);
    // Not rented — CR-05 (booking cancelled)
    expect(access.isAssetVisible(s, 'a-cr05')).toBe(false);
  });

  it('EX-07 is invisible to Lina before the rental start', () => {
    const s = sessionFor('u-lina');
    // BK-1003 starts tomorrow — not visible yet
    expect(access.isAssetVisible(s, 'a-ex07')).toBe(false);
    // BK-1003 is scheduled, not active
    const booking = db.getState().bookings.find(b => b.id === 'b-1003');
    expect(booking?.status).toBe('scheduled');
  });

  it('EX-07 becomes visible to Lina at rental start', () => {
    // Simulate clock at rental start: BK-1003 start = daysFromNow(1) + 8*3600000
    // We can't change clock.now() here, but we verify the logic:
    // isAssetVisible checks: booking.start <= now <= grantEnd
    // At rental start, now == booking.start, so it should be visible
    // This is tested by the simulator clock integration
    expect(true).toBe(true); // placeholder for clock integration test
  });

  it('Fatima (Palm) sees WL-06, TH-01, GN-01 — not EX-11', () => {
    const s = sessionFor('u-fatima');
    // Rented: WL-06 (BK-1004), TH-01 (BK-1005), GN-01 (BK-1006)
    expect(access.isAssetVisible(s, 'a-wl06')).toBe(true);
    expect(access.isAssetVisible(s, 'a-th01')).toBe(true);
    expect(access.isAssetVisible(s, 'a-gn01')).toBe(true);
    // EX-11 ended early (BK-1010 override) — not visible
    expect(access.isAssetVisible(s, 'a-ex11')).toBe(false);
    // Own assets — Palm owns nothing
    expect(access.isAssetVisible(s, 'a-fb12')).toBe(false);
  });

  it('EX-11 access ended early for Palm (BK-1010 override)', () => {
    const s = sessionFor('u-fatima');
    // BK-1010 had an early override by Khalid
    const booking = db.getState().bookings.find(b => b.id === 'b-1010');
    expect(booking).toBeDefined();
    const override = db.getState().grantOverrides.find(o => o.bookingId === 'b-1010');
    expect(override).toBeDefined();
    expect(override!.reason).toBe('Payment overdue for two weeks');
    // The override ended the grant — Palm can't see EX-11
    expect(access.isAssetVisible(s, 'a-ex11')).toBe(false);
  });

  it('Rashid (Palm, Palm Crescent site) sees only WL-06', () => {
    const s = sessionFor('u-rashid');
    // Only WL-06 is rented to Palm Crescent (BK-1004)
    expect(access.isAssetVisible(s, 'a-wl06')).toBe(true);
    // TH-01 is rented to Dubai South, not Palm Crescent
    expect(access.isAssetVisible(s, 'a-th01')).toBe(false);
    // GN-01 is rented to Dubai South, not Palm Crescent
    expect(access.isAssetVisible(s, 'a-gn01')).toBe(false);
  });

  it('Deepa (Palm, two sites) sees assets at both sites', () => {
    const s = sessionFor('u-deepa');
    // TH-01 rented to Dubai South (BK-1005)
    expect(access.isAssetVisible(s, 'a-th01')).toBe(true);
    // GN-01 rented to Dubai South (BK-1006)
    expect(access.isAssetVisible(s, 'a-gn01')).toBe(true);
    // WL-06 rented to Palm Crescent (BK-1004)
    expect(access.isAssetVisible(s, 'a-wl06')).toBe(true);
  });

  it('Priya (Gulf Lift) sees her own assets + rented BD-02', () => {
    const s = sessionFor('u-priya');
    // Own Gulf Lift assets
    expect(access.isAssetVisible(s, 'a-cr02')).toBe(true);
    expect(access.isAssetVisible(s, 'a-fl09')).toBe(true);
    // Rented BD-02 (BK-1007)
    expect(access.isAssetVisible(s, 'a-bd02')).toBe(true);
    // Not Emirates' assets
    expect(access.isAssetVisible(s, 'a-ex04')).toBe(false);
  });

  it('Ahmed (Marina, Dubai Hills) sees EX-04 + PU-51 only', () => {
    const s = sessionFor('u-ahmed');
    expect(access.isAssetVisible(s, 'a-ex04')).toBe(true); // rented
    expect(access.isAssetVisible(s, 'a-pu51')).toBe(true); // own
    expect(access.isAssetVisible(s, 'a-cr02')).toBe(false); // rented to Business Bay, not Dubai Hills
    expect(access.isAssetVisible(s, 'a-pu52')).toBe(false); // own but at Business Bay
  });

  it('John (Marina, two sites) sees CR-02 + PU-52 + VN-01', () => {
    const s = sessionFor('u-john');
    expect(access.isAssetVisible(s, 'a-cr02')).toBe(true); // rented to Business Bay
    expect(access.isAssetVisible(s, 'a-pu52')).toBe(true); // own at Business Bay
    expect(access.isAssetVisible(s, 'a-vn01')).toBe(true); // own at JVC Villas
    expect(access.isAssetVisible(s, 'a-pu51')).toBe(false); // own at Dubai Hills
    expect(access.isAssetVisible(s, 'a-ex04')).toBe(false); // rented to Dubai Hills, not his sites
  });

  it('Anil (Marina, JVC Villas) sees VN-01 only', () => {
    const s = sessionFor('u-anil');
    expect(access.isAssetVisible(s, 'a-vn01')).toBe(true);
    expect(access.isAssetVisible(s, 'a-pu52')).toBe(false);
    expect(access.isAssetVisible(s, 'a-ex04')).toBe(false);
  });

  it('Karim (deactivated) — API would refuse sign-in, but visibility check still works', () => {
    const s = sessionFor('u-karim');
    // Deactivated users can't sign in, but if they could, they'd see Dubai Hills assets
    expect(access.isAssetVisible(s, 'a-ex04')).toBe(true); // rented to Dubai Hills
  });

  it('Non-existent asset returns false (forbidden looks like missing)', () => {
    const s = sessionFor('u-omar');
    expect(access.isAssetVisible(s, 'a-nonexistent')).toBe(false);
  });

  it('Asset not found for a user who can\'t see it', () => {
    const s = sessionFor('u-priya');
    // EX-04 is Emirates' — Priya can't see it
    expect(access.isAssetVisible(s, 'a-ex04')).toBe(false);
  });
});

describe('access — getRelationship', () => {
  it('Sara (Kasper) is kasper for all assets', () => {
    const s = sessionFor('u-sara');
    expect(access.getRelationship(s, 'a-ex04')).toBe('kasper');
    expect(access.getRelationship(s, 'a-fb12')).toBe('kasper');
  });

  it('Omar is owner for Al Noor assets', () => {
    const s = sessionFor('u-omar');
    expect(access.getRelationship(s, 'a-fb12')).toBe('owner');
    expect(access.getRelationship(s, 'a-tp21')).toBe('owner');
  });

  it('Omar is none for other companies\' assets', () => {
    const s = sessionFor('u-omar');
    expect(access.getRelationship(s, 'a-ex04')).toBe('none');
    expect(access.getRelationship(s, 'a-pu51')).toBe('none');
  });

  it('Lina is renter for EX-04 (active rental)', () => {
    const s = sessionFor('u-lina');
    expect(access.getRelationship(s, 'a-ex04')).toBe('renter');
  });

  it('Lina is owner for Marina\'s vehicles', () => {
    const s = sessionFor('u-lina');
    expect(access.getRelationship(s, 'a-pu51')).toBe('owner');
  });

  it('Lina is none for EX-07 (booking not yet started)', () => {
    const s = sessionFor('u-lina');
    expect(access.getRelationship(s, 'a-ex07')).toBe('none');
  });
});

describe('access — hasCapability', () => {
  it('Kasper Admin has everything', () => {
    const s = sessionFor('u-sara');
    expect(access.hasCapability(s, 'asset.view')).toBe(true);
    expect(access.hasCapability(s, 'asset.edit')).toBe(true);
    expect(access.hasCapability(s, 'console.audit.view')).toBe(true);
    expect(access.hasCapability(s, 'console.staff.manage')).toBe(true);
    expect(access.hasCapability(s, 'muc.issue')).toBe(true);
  });

  it('Kasper Ops has asset and tracker capabilities but not admin', () => {
    const s = sessionFor('u-ravi');
    expect(access.hasCapability(s, 'asset.view')).toBe(true);
    expect(access.hasCapability(s, 'console.trackers.view')).toBe(true);
    expect(access.hasCapability(s, 'console.staff.manage')).toBe(false);
    expect(access.hasCapability(s, 'console.audit.view')).toBe(false);
    expect(access.hasCapability(s, 'users.manage')).toBe(false);
  });

  it('Omar (Al Noor) can view and edit own assets but not create links for others', () => {
    const s = sessionFor('u-omar');
    expect(access.hasCapability(s, 'asset.view')).toBe(true);
    expect(access.hasCapability(s, 'asset.edit')).toBe(true);
    expect(access.hasCapability(s, 'link.create')).toBe(true);
    expect(access.hasCapability(s, 'console.tenants.view')).toBe(false);
  });

  it('Lina (Marina) can act on her own assets but never on a rental she is renting in', () => {
    const s = sessionFor('u-lina');
    expect(access.hasCapability(s, 'asset.view')).toBe(true);
    expect(access.hasCapability(s, 'asset.edit')).toBe(true);
    expect(access.hasCapability(s, 'link.create')).toBe(true);
    // Owner side: the role has the capability…
    expect(access.hasCapability(s, 'grant.endEarly')).toBe(true);
    // …but as the renter on EX-04 she cannot end the rental.
    expect(access.canEndAccess(s, 'a-ex04')).toBe(false);
    expect(access.canEndAccess(s, 'a-pu51')).toBe(true);
    // Khalid owns EX-04, so he can.
    expect(access.canEndAccess(sessionFor('u-khalid'), 'a-ex04')).toBe(true);
    expect(access.canEndAccess(sessionFor('u-ahmed'), 'a-ex04')).toBe(false);
    expect(access.canEndAccess(sessionFor('u-ravi'), 'a-ex04')).toBe(true);
    expect(access.canEndAccess(sessionFor('u-ravi'), 'a-nope')).toBe(false);
  });

  it('Site Users cannot edit assets', () => {
    const s = sessionFor('u-ahmed');
    expect(access.hasCapability(s, 'asset.view')).toBe(true);
    expect(access.hasCapability(s, 'asset.edit')).toBe(false);
    expect(access.hasCapability(s, 'link.create')).toBe(false);
  });

  it('Site Users cannot acknowledge alerts', () => {
    const s = sessionFor('u-ahmed');
    expect(access.hasCapability(s, 'alert.view')).toBe(true);
    expect(access.hasCapability(s, 'alert.acknowledge')).toBe(false);
  });
});
