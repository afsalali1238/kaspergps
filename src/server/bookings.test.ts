// Bookings (spec 11.7): validations, references, and the effect of each event
// on the renter's grant window.
import { describe, it, expect, afterEach } from 'vitest';
import {
  bookingById, canManageBookings, cancelBooking, closeBooking, createBooking, endEarly,
  extendBooking, nextBookingReference, openBookingsForAsset, overlappingBooking, shortenBooking,
} from './bookings';
import { db } from '@/server/db';
import { ANCHOR_MS } from '@/server/seed/data';
import { findActiveGrantFor, getGrantEnd, isAssetVisible } from './access';
import type { Session } from '@/domain/types';
import * as clock from '@/lib/clock';

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

const ravi = () => sessionFor('u-ravi');       // Kasper Ops
const khalid = () => sessionFor('u-khalid');   // Emirates owner
const lina = () => sessionFor('u-lina');       // Marina (renter side)

const DAY = 86400000;

afterEach(() => {
  clock.setAnchor(ANCHOR_MS);
});

describe('bookings — references and reads', () => {
  it('continues the reference series past the seed', () => {
    expect(nextBookingReference()).toBe('BK-1013');
    expect(openBookingsForAsset('a-ex07').every(b => b.status === 'scheduled' || b.status === 'active')).toBe(true);
    expect(bookingById('b-1001')?.reference).toBe('BK-1001');
    expect(bookingById('b-nope')).toBeNull();
  });

  it('finds the overlapping window, ignoring the booking being changed', () => {
    const existing = openBookingsForAsset('a-ex07')[0];
    const start = new Date(existing.start).getTime();
    expect(overlappingBooking('a-ex07', start + 3600000, start + 7200000)?.id).toBe(existing.id);
    expect(overlappingBooking('a-ex07', start + 3600000, start + 7200000, existing.id)).toBeNull();
  });

  it('lets Kasper and the owner manage bookings, not the renter', () => {
    const asset = db.getState().assets.find(a => a.code === 'EX-07')!;
    expect(canManageBookings(ravi(), asset)).toBe(true);
    expect(canManageBookings(khalid(), asset)).toBe(true);
    expect(canManageBookings(lina(), asset)).toBe(false);
  });
});

describe('bookings — create validations', () => {
  const asset = () => db.getState().assets.find(a => a.code === 'EX-07')!; // Emirates, has a scheduled booking for BK-1010

  it('refuses an end before the start and a rent-your-own-asset', () => {
    const now = clock.now();
    const bad = createBooking(ravi(), {
      assetId: asset().id, renterTenantId: 't-alnoor', start: now + 30 * DAY, end: now + 29 * DAY,
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('end must be after the start');

    const own = createBooking(ravi(), {
      assetId: asset().id, renterTenantId: asset().ownerTenantId, start: now + 30 * DAY, end: now + 31 * DAY,
    });
    expect(own.ok).toBe(false);
    expect(own.error).toContain("can't rent its own asset");
  });

  it('refuses an overlap, a retired asset and a foreign renter site', () => {
    const existing = openBookingsForAsset(asset().id)[0];
    const clash = createBooking(ravi(), {
      assetId: asset().id,
      renterTenantId: 't-alnoor',
      start: new Date(existing.start).getTime() + 3600000,
      end: new Date(existing.end).getTime() + DAY,
    });
    expect(clash.ok).toBe(false);
    expect(clash.error).toContain('already booked');

    const retiredAsset = db.getState().assets.find(a => a.retiredAt)!;
    if (retiredAsset) {
      const retired = createBooking(ravi(), {
        assetId: retiredAsset.id, renterTenantId: 't-alnoor',
        start: clock.now() + 60 * DAY, end: clock.now() + 61 * DAY,
      });
      expect(retired.ok).toBe(false);
      expect(retired.error).toContain('retired');
    }

    const foreignSite = db.getState().sites.find(s => s.tenantId === 't-marina')!;
    const site = createBooking(ravi(), {
      assetId: asset().id, renterTenantId: 't-alnoor', renterSiteId: foreignSite.id,
      start: clock.now() + 90 * DAY, end: clock.now() + 91 * DAY,
    });
    expect(site.ok).toBe(false);
    expect(site.error).toContain('belongs to another company');
  });

  it('creates a booking, keeps the destination and grants the renter access', () => {
    const start = clock.now() + 40 * DAY;
    const end = start + 5 * DAY;
    const result = createBooking(ravi(), {
      assetId: asset().id,
      renterTenantId: 't-alnoor',
      start,
      end,
      rateType: 'hourly',
      rateAed: 90,
      destination: { name: 'Al Habtoor site', lat: 25.1123, lng: 55.2012 },
    });
    expect(result.ok).toBe(true);
    const booking = result.data!;
    expect(booking.reference).toMatch(/^BK-\d{4}$/);
    expect(booking.status).toBe('scheduled');
    expect(booking.destination?.name).toBe('Al Habtoor site');

    // Outside the window the renter sees nothing; inside it the grant is theirs.
    const renter = sessionFor('u-omar');
    expect(isAssetVisible(renter, asset().id)).toBe(false);
    clock.setAnchor(start - 3600000);
    expect(findActiveGrantFor(renter, asset().id)).toBeNull();
    expect(isAssetVisible(renter, asset().id)).toBe(false);
    clock.setAnchor(start + 3600000);
    expect(findActiveGrantFor(renter, asset().id)?.id).toBe(booking.id);
    expect(isAssetVisible(renter, asset().id)).toBe(true);
    clock.setAnchor(end + 3600000);
    expect(isAssetVisible(renter, asset().id)).toBe(false);
  });

  it('only the owner or Kasper can create, never the renter', () => {
    const other = db.getState().assets.find(a => a.code === 'PU-51')!; // Marina's asset
    const denied = createBooking(lina(), {
      assetId: asset().id, renterTenantId: 't-marina',
      start: clock.now() + 120 * DAY, end: clock.now() + 121 * DAY,
    });
    expect(denied.ok).toBe(false);
    const allowed = createBooking(lina(), {
      assetId: other.id, renterTenantId: 't-alnoor',
      start: clock.now() + 120 * DAY, end: clock.now() + 121 * DAY,
    });
    expect(allowed.ok).toBe(true);
  });
});

describe('bookings — changes move the grant window', () => {
  it('extending keeps the renter in and shortening cuts access off', () => {
    const start = clock.now() + 200 * DAY;
    const created = createBooking(ravi(), {
      assetId: db.getState().assets.find(a => a.code === 'EX-04')!.id,
      renterTenantId: 't-marina',
      start,
      end: start + 3 * DAY,
    });
    expect(created.ok).toBe(true);
    const booking = created.data!;

    const extended = extendBooking(ravi(), booking.id, start + 10 * DAY);
    expect(extended.ok).toBe(true);
    expect(getGrantEnd(booking)).toBe(start + 10 * DAY);

    const shortened = shortenBooking(khalid(), booking.id, start + 2 * DAY);
    expect(shortened.ok).toBe(true);
    expect(getGrantEnd(booking)).toBe(start + 2 * DAY);

    // Extending onto the next booking is refused.
    const nextStart = start + 20 * DAY;
    const next = createBooking(ravi(), {
      assetId: booking.assetId, renterTenantId: 't-marina',
      start: nextStart, end: nextStart + 2 * DAY,
    });
    expect(next.ok).toBe(true);
    const clash = extendBooking(ravi(), booking.id, nextStart + DAY);
    expect(clash.ok).toBe(false);
    expect(clash.error).toContain('Another booking starts');
  });

  it('cancelling ends the grant now and hides the asset from the renter', () => {
    const start = clock.now() + 300 * DAY;
    const created = createBooking(ravi(), {
      assetId: db.getState().assets.find(a => a.code === 'WL-03')!.id,
      renterTenantId: 't-marina',
      start,
      end: start + 4 * DAY,
    });
    const booking = created.data!;
    clock.setAnchor(start + DAY);

    const renter = sessionFor('u-lina');
    expect(findActiveGrantFor(renter, booking.assetId)?.id).toBe(booking.id);

    const cancelled = cancelBooking(khalid(), booking.id, 'Job moved to another site');
    expect(cancelled.ok).toBe(true);
    expect(booking.status).toBe('cancelled');
    expect(getGrantEnd(booking)).toBe(clock.now());
    expect(findActiveGrantFor(renter, booking.assetId)).toBeNull();
    expect(cancelBooking(khalid(), booking.id).ok).toBe(false);
    expect(cancelBooking(lina(), booking.id).ok).toBe(false);
  });

  it('closing a job ends it, and ending early needs a reason and a capability', () => {
    const start = clock.now() + 400 * DAY;
    const created = createBooking(ravi(), {
      assetId: db.getState().assets.find(a => a.code === 'BD-02')!.id,
      renterTenantId: 't-marina',
      start,
      end: start + 3 * DAY,
    });
    const booking = created.data!;
    clock.setAnchor(start + DAY);

    const noReason = endEarly(khalid(), booking.id, 'too short');
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.error).toContain('at least 10 characters');

    const renterCannot = endEarly(sessionFor('u-lina'), booking.id, 'Payment overdue for two weeks');
    expect(renterCannot.ok).toBe(false);
    if (!renterCannot.ok) expect(renterCannot.error).toContain('Only the owner or Kasper');
    const opsCan = endEarly(sessionFor('u-ravi'), booking.id, 'Payment overdue for two weeks');
    expect(opsCan.ok).toBe(true);

    expect(booking.status).toBe('closed');
    expect(db.getState().grantOverrides.some(o => o.bookingId === booking.id)).toBe(true);
    expect(endEarly(khalid(), booking.id, 'Again and again')).toEqual({
      ok: false, error: 'This booking has already ended.',
    });

    const start2 = clock.now() + 500 * DAY;
    const next = createBooking(ravi(), {
      assetId: db.getState().assets.find(a => a.code === 'GN-02')!.id,
      renterTenantId: 't-marina',
      start: start2,
      end: start2 + 2 * DAY,
    });
    const closed = closeBooking(khalid(), next.data!.id, 'Job finished');
    expect(closed.ok).toBe(true);
    expect(next.data!.status).toBe('closed');
    expect(closeBooking(khalid(), next.data!.id).ok).toBe(false);
    expect(closeBooking(lina(), next.data!.id).ok).toBe(false);
  });
});
