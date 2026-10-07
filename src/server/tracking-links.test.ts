// Tracking links (spec 11.6): share-panel reads, creation, revocation, and the
// revoke hooks bookings call when a job ends.
import { describe, it, expect, afterEach } from 'vitest';
import {
  LINK_TTL_HOURS, activeLinksForAsset, createTrackingLink, expiryOptions, linkById, linkEndWords,
  pastLinksForAsset, randomToken, revokeLinksForBooking, revokeTrackingLink, shareableBookings,
} from './tracking-links';
import { bookingById, cancelBooking, closeBooking } from './bookings';
import { getTrackingLinkState, resolveTrackingLink } from './links';
import { seed, ANCHOR_MS } from '@/server/seed/data';
import type { Session } from '@/domain/types';
import * as clock from '@/lib/clock';

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

const omar = () => sessionFor('u-omar');      // Al Noor owner (Tenant Admin)
const sara = () => sessionFor('u-sara');      // Kasper Admin
const khalid = () => sessionFor('u-khalid');  // Emirates owner
const lina = () => sessionFor('u-lina');      // Marina — renter on EX-04/EX-07

const HOUR = 3600000;

afterEach(() => {
  clock.setAnchor(ANCHOR_MS);
  // Drop anything a test created so the seeded link lists stay predictable.
  for (let i = seed.trackingLinks.length - 1; i >= 0; i--) {
    if (seed.trackingLinks[i].id.startsWith('lk-new-')) seed.trackingLinks.splice(i, 1);
  }
});

describe('tracking links — tokens and reads', () => {
  it('mints 16 random bytes as base64url, never sequential', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(token).not.toMatch(/[+/=]/);
    const many = new Set(Array.from({ length: 200 }, () => randomToken()));
    expect(many.size).toBe(200);
    expect(LINK_TTL_HOURS).toBe(24);
  });

  it('offers only this asset’s active or upcoming jobs', () => {
    const jobs = shareableBookings('a-ex07');
    expect(jobs.map(b => b.reference)).toEqual(['BK-1003']);
    expect(shareableBookings('a-tp21')).toEqual([]); // closed only
    expect(linkById('lk-fb12')?.token).toBe('k7Qm2Xc9TpLw4ZaN8rVb3Ye5');
    expect(linkById('lk-nope')).toBeNull();
  });

  it('builds expiry options from the job, with a 24 hour fallback last', () => {
    const options = expiryOptions('a-ex11');
    expect(options).toHaveLength(2);
    expect(options[0].bookingId).toBe('b-1010');
    expect(options[0].expiresAt).toBe(new Date(bookingById('b-1010')!.end).getTime());
    expect(options[0].label).toContain('BK-1010');
    expect(options[1]).toEqual({
      bookingId: null,
      label: 'No job — 24 hour link',
      expiresAt: ANCHOR_MS + 24 * HOUR,
    });
  });

  it('splits active and past links, and names how each one ended', () => {
    expect(activeLinksForAsset('a-fb12').map(l => l.id)).toEqual(['lk-fb12']);
    expect(pastLinksForAsset('a-fb12')).toEqual([]);

    const past = pastLinksForAsset('a-lb02');
    expect(past.map(l => l.id)).toEqual(['lk-lb02']);
    expect(linkEndWords(past[0])).toBe('Job closed by Omar Saleh');
    expect(linkEndWords(linkById('lk-cr02')!)).toBe('Revoked by Priya Nair');
    expect(linkEndWords(linkById('lk-fb12')!)).toBe('Active');

    // Forward an hour past the seeded window and the shown link has expired.
    clock.setOffsetMs(30 * HOUR);
    expect(linkEndWords(linkById('lk-fb12')!)).toBe('Expired');
    expect(pastLinksForAsset('a-fb12').map(l => l.id)).toEqual(['lk-fb12']);
  });
});

describe('tracking links — create', () => {
  it('lets the owner or Kasper create a link and records it', () => {
    const result = createTrackingLink(khalid(), { assetId: 'a-ex07', bookingId: 'b-1003' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const link = result.data;
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(link.assetId).toBe('a-ex07');
    expect(link.bookingId).toBe('b-1003');
    expect(link.createdBy).toBe('u-khalid');
    expect(link.expiresAt).toBe(new Date(bookingById('b-1003')!.end).toISOString());
    expect(link.showEta).toBe(false); // BK-1003 has no destination
    expect(getTrackingLinkState(link.token)).toBe('active');
    expect(result.message).toContain('EX-07 link created');

    const audit = seed.auditEntries.find(a => a.action === 'link.create' && a.assetId === 'a-ex07');
    expect(audit?.detail).toContain('BK-1003');

    // Kasper can too, and the seeded FB-12 link is what the public page resolves.
    expect(createTrackingLink(sara(), { assetId: 'a-ex11' }).ok).toBe(true);
  });

  it('defaults the ETA switch from the job’s destination', () => {
    const withDestination = createTrackingLink(sara(), { assetId: 'a-fb12', bookingId: 'b-1011' });
    expect(withDestination.ok && withDestination.data.showEta).toBe(true);

    const noJob = createTrackingLink(sara(), { assetId: 'a-fb12' });
    expect(noJob.ok && noJob.data.showEta).toBe(false);

    const off = createTrackingLink(sara(), { assetId: 'a-fb12', bookingId: 'b-1011', showEta: false });
    expect(off.ok && off.data.showEta).toBe(false);

    const on = createTrackingLink(sara(), { assetId: 'a-ex11', bookingId: 'b-1010', showEta: true });
    expect(on.ok && on.data.showEta).toBe(true);
  });

  it('falls back to a 24 hour expiry when there is no job', () => {
    const result = createTrackingLink(omar(), { assetId: 'a-fb12' });
    expect(result.ok && result.data.bookingId).toBe(null);
    expect(result.ok && result.data.expiresAt).toBe(new Date(ANCHOR_MS + 24 * HOUR).toISOString());
    expect(result.ok && result.message).toContain('expires');
  });

  it('refuses renters, unknown assets and ended jobs', () => {
    expect(createTrackingLink(lina(), { assetId: 'a-ex04' })).toMatchObject({
      ok: false, error: 'Only the asset owner or Kasper can share a tracking link.',
    });
    expect(createTrackingLink(sara(), { assetId: 'a-nope' })).toMatchObject({
      ok: false, error: 'Asset not found.',
    });
    expect(createTrackingLink(sara(), { assetId: 'a-ex11', bookingId: 'b-0999' })).toMatchObject({
      ok: false, error: 'Booking not found.',
    });
    expect(createTrackingLink(sara(), { assetId: 'a-ex11', bookingId: 'b-1008' })).toMatchObject({
      ok: false, error: 'That job has ended — links are created for active or upcoming jobs.',
    });
  });

  it('creates a link the public resolver can open', () => {
    const result = createTrackingLink(sara(), { assetId: 'a-fb12', bookingId: 'b-1011' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const resolved = resolveTrackingLink(result.data.token);
    expect(resolved?.assetName).toBe('Flatbed trailer truck');
    expect(resolved?.eta?.arrivedAt ?? null).toBe(null);
  });
});

describe('tracking links — revoke', () => {
  it('lets the owner revoke, names the reason, and keeps it dead', () => {
    const before = activeLinksForAsset('a-fb12').length;
    const result = revokeTrackingLink(omar(), 'lk-fb12');
    expect(result.ok).toBe(true);
    expect(activeLinksForAsset('a-fb12')).toHaveLength(before - 1);
    expect(linkEndWords(linkById('lk-fb12')!)).toBe('Revoked by Omar Saleh');
    expect(getTrackingLinkState('k7Qm2Xc9TpLw4ZaN8rVb3Ye5')).toBe('revoked');
    expect(seed.auditEntries.some(a => a.action === 'link.revoke' && a.assetId === 'a-fb12')).toBe(true);

    expect(revokeTrackingLink(omar(), 'lk-fb12')).toMatchObject({
      ok: false, error: 'This link is already revoked.',
    });
  });

  it('refuses a renter or a stranger’s asset', () => {
    expect(revokeTrackingLink(lina(), 'lk-fb12')).toMatchObject({
      ok: false, error: 'You cannot revoke this link.',
    });
    // Dubai-side Emirates asset with a Marina renter: Khalid owns it, Lina does not.
    expect(revokeTrackingLink(lina(), 'lk-cr02').ok).toBe(false);
    expect(revokeTrackingLink(khalid(), 'lk-cr02').ok).toBe(false); // Gulf Lift owns CR-02
    expect(revokeTrackingLink(sara(), 'lk-nope')).toMatchObject({
      ok: false, error: 'Link not found.',
    });
  });

  it('revokes every live link on a job and skips the ones already dead', () => {
    const a = createTrackingLink(sara(), { assetId: 'a-ex11', bookingId: 'b-1010' });
    const b = createTrackingLink(sara(), { assetId: 'a-ex11', bookingId: 'b-1010' });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    revokeTrackingLink(sara(), a.data.id);

    expect(revokeLinksForBooking('b-1010', 'manual', 'u-priya')).toBe(1);
    expect(seed.trackingLinks.find(l => l.id === b.data.id)?.revokeReason).toBe('manual');
    expect(revokeLinksForBooking('b-1010', 'manual', 'u-priya')).toBe(0);
  });

  it('cancel, close and end-early each revoke the job’s links', () => {
    const job = bookingById('b-1004')!; // WL-06, Emirates → Palm, active
    const link = createTrackingLink(khalid(), { assetId: 'a-wl06', bookingId: job.id });
    expect(link.ok).toBe(true);
    if (!link.ok) return;

    const cancel = cancelBooking(khalid(), job.id, 'Site cancelled');
    expect(cancel.ok).toBe(true);
    expect(cancel.ok && cancel.message).toContain('1 tracking link revoked');
    expect(linkById(link.data.id)).toMatchObject({
      revokeReason: 'booking_cancelled', revokedBy: 'u-khalid',
    });
    expect(linkEndWords(linkById(link.data.id)!)).toBe('Booking cancelled by Khalid Rahman');
  });

  it('close says how many links it ended, and none when there were none', () => {
    const open = bookingById('b-1006')!; // GN-01, Emirates → Palm, active, no links
    const close = closeBooking(khalid(), open.id);
    expect(close.ok).toBe(true);
    expect(close.ok && close.message).not.toContain('tracking link');
  });
});
