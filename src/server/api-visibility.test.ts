// Read visibility through the API (spec §5): an owner sees its own assets, a renter
// sees a rented-in asset only inside the rental window (judged by the simulated
// clock), Kasper sees every company, and an asset another company owns, with no
// rental, reads as "Asset not found".

import { describe, it, expect, beforeEach } from 'vitest';
import type { Session, User } from '@/domain/types';
import { db, resetDb } from '@/server/db';
import { isKasperStaff } from '@/server/capabilities';
import { getAsset, getVisibleAssets } from '@/server/api';
import * as clock from '@/lib/clock';
import { ANCHOR_MS } from '@/server/seed/data';

function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId) as User;
  return { userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role: user.role, isKasper: isKasperStaff(user.role) };
}

const codes = (rows: { code: string }[]) => rows.map(r => r.code).sort();

beforeEach(() => {
  resetDb();
  // Restore the seed anchor: a window test moves the clock, and that must not leak.
  clock.setAnchor(ANCHOR_MS);
});

describe('visible assets', () => {
  it('an owner’s admin sees its own company’s assets and not another company’s', async () => {
    const r = await getVisibleAssets(sessionFor('u-omar'));
    expect(r.success).toBe(true);
    const ownerIds = new Set(db.getState().assets.filter(a => a.ownerTenantId === 't-alnoor').map(a => a.id));
    expect(r.data!.every(a => ownerIds.has(a.id))).toBe(true);
    expect(r.data!.length).toBe(ownerIds.size);
  });

  it('Kasper staff see every company’s assets', async () => {
    const r = await getVisibleAssets(sessionFor('u-sara'));
    expect(r.data!.length).toBe(db.getState().assets.length);
  });

  it('a renter sees a rented-in asset only inside the rental window', async () => {
    const lina = sessionFor('u-lina');
    const booking = db.getState().bookings.find(b => b.assetId === 'a-ex04' && (b.status === 'active' || b.status === 'scheduled'))!;
    expect(booking).toBeTruthy();

    // Inside the window: the rented-in asset is there.
    clock.setAnchor(new Date(booking.start).getTime() + 60 * 60 * 1000);
    const during = await getVisibleAssets(lina);
    expect(codes(during.data!)).toContain('EX-04');

    // After the window ends: it is gone from her list.
    clock.setAnchor(new Date(booking.end).getTime() + 24 * 60 * 60 * 1000);
    const after = await getVisibleAssets(lina);
    expect(codes(after.data!)).not.toContain('EX-04');
  });

  it('a renter sees its own assets plus exactly the rented-in assets whose hire is running now', async () => {
    const r = await getVisibleAssets(sessionFor('u-lina'));
    // At the anchor Marina holds EX-04 (BK-1001) and CR-02 (BK-1002). EX-07 starts
    // tomorrow and CR-05 was cancelled, so neither is visible yet.
    const foreign = r.data!.filter(a => a.ownerTenantId !== 't-marina').map(a => a.code).sort();
    expect(foreign).toEqual(['CR-02', 'EX-04']);
  });
});

describe('getAsset reads (§5, S12)', () => {
  it('another company’s asset with no rental reads as not found, not as forbidden', async () => {
    const r = await getAsset(sessionFor('u-omar'), 'a-cp03');
    expect(r).toEqual({ success: false, error: 'Asset not found' });
  });

  it('a missing asset reads exactly like a forbidden one', async () => {
    const missing = await getAsset(sessionFor('u-omar'), 'a-does-not-exist');
    const forbidden = await getAsset(sessionFor('u-omar'), 'a-cp03');
    expect(missing).toEqual(forbidden);
  });

  it('the owner reads its own asset', async () => {
    const own = db.getState().assets.find(a => a.ownerTenantId === 't-alnoor')!;
    const r = await getAsset(sessionFor('u-omar'), own.id);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ id: own.id });
  });
});
