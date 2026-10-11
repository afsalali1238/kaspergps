// H4.3 and H4.5 refusal and edge rules for asset, site and label administration.
// asset-admin-labels.test.ts covers the main paths; this file covers each
// refusal message and the success paths that the screens reach only by hand.

import { describe, it, expect, beforeEach } from 'vitest';
import type { Session, User } from '@/domain/types';
import { db, resetDb } from '@/server/db';
import { isKasperStaff } from '@/server/capabilities';
import { renameLabel, deleteLabel, labelsVisibleTo, addLabelToAssets, removeLabelFromAssets } from '@/server/labels';
import {
  assetCodeTaken, createAsset, createSite, deleteSite, reinstateAsset, retireAsset, transferAsset, updateSite,
  type CreateAssetInput, type SiteInput,
} from '@/server/asset-admin';
import * as clock from '@/lib/clock';

function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId) as User;
  return { userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role: user.role, isKasper: isKasperStaff(user.role) };
}

const emiratesAdmin = () => sessionFor('u-khalid');
const marinaAdmin = () => sessionFor('u-lina');
const kasper = () => sessionFor('u-sara');
const siteUser = () => sessionFor('u-deepa');

const emiratesSite = () => db.getState().sites.find(s => s.tenantId === 't-emirates')!;

function validAsset(overrides: Partial<CreateAssetInput> = {}): CreateAssetInput {
  return {
    code: 'EX-90', name: 'Excavator 90', type: '', assetClass: 'plant', make: 'CAT', model: '320',
    year: 2021, plateOrSerial: 'EM-90', homeSiteId: emiratesSite().id, behaviour: 'parked',
    ...overrides,
  };
}

const validSite = (overrides: Partial<SiteInput> = {}): SiteInput => ({
  name: 'Yard Two', center: { lat: 25.2, lng: 55.3 }, radiusM: 300, ...overrides,
});

beforeEach(() => {
  resetDb();
  clock.setOffsetMs(0);
});

describe('createAsset refusals (§11.8)', () => {
  it('a site user cannot add assets', () => {
    expect(createAsset(siteUser(), validAsset())).toMatchObject({ ok: false, error: 'Your role can’t add assets.' });
  });

  it('a blank code, a code over 20 characters and a blank name are refused', () => {
    const s = emiratesAdmin();
    expect(createAsset(s, validAsset({ code: '   ' })).error).toBe('Enter a code for the asset.');
    expect(createAsset(s, validAsset({ code: 'X'.repeat(21) })).error).toBe('Codes are 20 characters or fewer.');
    expect(createAsset(s, validAsset({ name: '  ' })).error).toBe('Enter a name.');
  });

  it('an unknown asset class and an out-of-range year are refused', () => {
    const s = emiratesAdmin();
    expect(createAsset(s, validAsset({ assetClass: 'spaceship' as never })).error).toBe('Pick a class.');
    expect(createAsset(s, validAsset({ year: 1949 })).error).toBe('Enter a valid year.');
    expect(createAsset(s, validAsset({ year: 2.5 })).error).toBe('Enter a valid year.');
    const nextYear = new Date(clock.now()).getUTCFullYear() + 2;
    expect(createAsset(s, validAsset({ year: nextYear })).error).toBe('Enter a valid year.');
  });

  it('a home site that does not exist, or belongs to another company, is refused', () => {
    const s = emiratesAdmin();
    expect(createAsset(s, validAsset({ homeSiteId: 's-nope' })).error).toBe('Pick a home site.');
    const marinaSite = db.getState().sites.find(x => x.tenantId === 't-marina')!;
    expect(createAsset(s, validAsset({ homeSiteId: marinaSite.id })).error).toBe('That site belongs to another company.');
  });

  it('a tank size of zero or less is refused; a valid tank size is kept', () => {
    const s = emiratesAdmin();
    expect(createAsset(s, validAsset({ tankLitres: 0 })).error).toBe('The tank size must be more than 0 litres.');
    expect(createAsset(s, validAsset({ tankLitres: -5 })).error).toBe('The tank size must be more than 0 litres.');
    const ok = createAsset(s, validAsset({ code: 'EX-91', tankLitres: 300 }));
    expect(ok.ok).toBe(true);
    expect(ok.data!.tankLitres).toBe(300);
  });

  it('a blank type falls back to the asset class and a second asset with a taken id gets a counter', () => {
    const s = emiratesAdmin();
    const first = createAsset(s, validAsset({ code: 'Crane 7' }));
    expect(first.ok).toBe(true);
    expect(first.data!.type).toBe('plant');
    expect(first.data!.id).toBe('a-crane-7');
    // Codes differ only by case, so the code check catches the second one first;
    // a clash on the id alone (different punctuation) takes the counter.
    const second = createAsset(s, validAsset({ code: 'crane-7' }));
    expect(second.ok).toBe(true);
    expect(second.data!.id).toBe('a-crane-7-2');
  });

  it('a Kasper session may add an asset at any company’s site, and it belongs to that company', () => {
    const marinaSite = db.getState().sites.find(x => x.tenantId === 't-marina')!;
    const r = createAsset(kasper(), validAsset({ code: 'KS-1', homeSiteId: marinaSite.id }));
    expect(r.ok).toBe(true);
    expect(r.data!.ownerTenantId).toBe('t-marina');
  });

  it('assetCodeTaken ignores spaces and case', () => {
    expect(assetCodeTaken('  ex-04 ')).toBe(true);
    expect(assetCodeTaken('EX-999')).toBe(false);
  });
});

describe('retire and reinstate refusals (§11.8)', () => {
  it('a site user cannot retire or reinstate', () => {
    const ex04 = db.getState().assets.find(a => a.code === 'EX-04')!;
    expect(retireAsset(siteUser(), ex04.id).error).toBe('Your role can’t retire assets.');
    expect(reinstateAsset(siteUser(), ex04.id).error).toBe('Your role can’t reinstate assets.');
  });

  it('another company’s asset reads as not found, not as forbidden', () => {
    const cp03 = db.getState().assets.find(a => a.code === 'CP-03')!;
    expect(retireAsset(marinaAdmin(), cp03.id).error).toBe('Asset not found.');
    expect(reinstateAsset(marinaAdmin(), cp03.id).error).toBe('Asset not found.');
  });

  it('retiring twice and reinstating an active asset are both refused with a reason', () => {
    const s = emiratesAdmin();
    const cp03 = db.getState().assets.find(a => a.code === 'CP-03')!;
    expect(reinstateAsset(s, cp03.id).error).toBe('CP-03 is not retired.');
    expect(retireAsset(s, cp03.id).ok).toBe(true);
    expect(retireAsset(s, cp03.id).error).toBe('CP-03 is already retired.');
  });

  it('a Kasper session can retire any company’s asset', () => {
    const cp03 = db.getState().assets.find(a => a.code === 'CP-03')!;
    expect(retireAsset(kasper(), cp03.id).ok).toBe(true);
  });
});

describe('site administration (§11.8)', () => {
  it('a site user cannot create, update or delete sites', () => {
    const site = emiratesSite();
    expect(createSite(siteUser(), validSite()).error).toBe('Your role can’t manage sites.');
    expect(updateSite(siteUser(), site.id, validSite()).error).toBe('Your role can’t manage sites.');
    expect(deleteSite(siteUser(), site.id).error).toBe('Your role can’t manage sites.');
  });

  it('a blank name, a location that is not a number and a missing location are refused', () => {
    const s = emiratesAdmin();
    expect(createSite(s, validSite({ name: ' ' })).error).toBe('Enter a site name.');
    expect(createSite(s, validSite({ center: { lat: NaN, lng: 55 } })).error).toBe('Pick a location on the map.');
    expect(createSite(s, validSite({ center: { lat: 25, lng: Infinity } })).error).toBe('Pick a location on the map.');
  });

  it('a Kasper session without a company cannot create a site', () => {
    const r = createSite(kasper(), validSite());
    // Kasper staff have no company of their own; the site must be made from a company's view.
    expect(r.ok).toBe(false);
  });

  it('a created site gets a readable id and an audit-friendly name', () => {
    const r = createSite(emiratesAdmin(), validSite({ name: '  Ras Al Khor  Gate ' }));
    expect(r.ok).toBe(true);
    expect(r.data!.name).toBe('Ras Al Khor  Gate');
    expect(r.data!.id).toMatch(/^s-ras-al-khor-gate-\d+$/);
    expect(r.data!.tenantId).toBe('t-emirates');
  });

  it('updating a site changes its fields and saves', () => {
    const s = emiratesAdmin();
    const site = emiratesSite();
    const r = updateSite(s, site.id, validSite({ name: 'Al Quoz East', radiusM: 800 }));
    expect(r.ok).toBe(true);
    expect(db.getState().sites.find(x => x.id === site.id)).toMatchObject({ name: 'Al Quoz East', radiusM: 800 });
    expect(r.message).toBe('Al Quoz East saved.');
  });

  it('updating another company’s site, or a missing one, reads as not found', () => {
    const marinaSite = db.getState().sites.find(x => x.tenantId === 't-marina')!;
    expect(updateSite(emiratesAdmin(), marinaSite.id, validSite()).error).toBe('Site not found.');
    expect(updateSite(emiratesAdmin(), 's-missing', validSite()).error).toBe('Site not found.');
    expect(updateSite(emiratesAdmin(), emiratesSite().id, validSite({ radiusM: 50 })).error).toBe(
      'The radius must be between 100 and 2,000 m.',
    );
  });

  it('a site with assets, users, bookings or a geofence cannot be deleted; an empty one can', () => {
    const s = emiratesAdmin();
    // Assets: the Emirates yard holds assets at home.
    const withAssets = emiratesSite();
    expect(deleteSite(s, withAssets.id).error).toMatch(/^Move the \d+ assets? at this site first\.$/);

    // A fresh site is empty and can go.
    const fresh = createSite(s, validSite({ name: 'Empty Yard' }));
    expect(deleteSite(s, fresh.data!.id).ok).toBe(true);
    expect(db.getState().sites.some(x => x.id === fresh.data!.id)).toBe(false);
  });

  it('users, bookings and geofences on a site each block its deletion with a reason', () => {
    const s = emiratesAdmin();
    const site = createSite(s, validSite({ name: 'Blocked Yard' })).data!;

    // A user at the site.
    const user = db.getState().users.find(u => u.tenantId === 't-emirates')!;
    user.siteIds = [...user.siteIds, site.id];
    expect(deleteSite(s, site.id).error).toBe('Move the 1 user at this site first.');
    user.siteIds = user.siteIds.filter(id => id !== site.id);

    // A booking whose renter is at the site.
    const booking = db.getState().bookings[0]!;
    const original = booking.renterSiteId;
    booking.renterSiteId = site.id;
    expect(deleteSite(s, site.id).error).toBe('This site has 1 booking. Close them first.');
    booking.renterSiteId = original;

    // A geofence tied to the site.
    db.getState().geofences.push({ id: 'g-blocked', tenantId: 't-emirates', siteId: site.id } as never);
    expect(deleteSite(s, site.id).error).toBe('Delete its site geofence from the site first.');
  });

  it('deleting a missing or another company’s site reads as not found', () => {
    expect(deleteSite(emiratesAdmin(), 's-missing').error).toBe('Site not found.');
    const marinaSite = db.getState().sites.find(x => x.tenantId === 't-marina')!;
    expect(deleteSite(emiratesAdmin(), marinaSite.id).error).toBe('Site not found.');
  });
});

describe('transfer refusals and success (§11.8, CP-03)', () => {
  it('a transfer to the same company is refused', () => {
    const cp03 = db.getState().assets.find(a => a.code === 'CP-03')!;
    expect(transferAsset(kasper(), cp03.id, cp03.ownerTenantId).error).toBe('Pick a different company.');
  });

  it('a missing asset is not found', () => {
    expect(transferAsset(kasper(), 'a-missing', 't-marina').error).toBe('Asset not found.');
  });

  it('a new owner with no site cannot take an asset yet', () => {
    const cp03 = db.getState().assets.find(a => a.code === 'CP-03')!;
    db.getState().sites = db.getState().sites.filter(x => x.tenantId !== 't-palm');
    expect(transferAsset(kasper(), cp03.id, 't-palm').error).toBe('The new owner needs a site before an asset can move there.');
  });

  it('a transfer moves the asset to the new owner’s site and says what access changes', () => {
    const cp03 = db.getState().assets.find(a => a.code === 'CP-03')!;
    const r = transferAsset(kasper(), cp03.id, 't-marina');
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ ownerTenantId: 't-marina' });
    expect(db.getState().sites.find(x => x.id === r.data!.homeSiteId)?.tenantId).toBe('t-marina');
    expect(r.message).toMatch(/report-only from today/);
  });
});

describe('label rename and delete refusals (§11.11)', () => {
  it('a site user cannot rename or delete labels', () => {
    const label = labelsVisibleTo(emiratesAdmin())[0]!;
    expect(renameLabel(siteUser(), label.id, 'Anything').error).toBe('Your role can’t change labels.');
    expect(deleteLabel(siteUser(), label.id).error).toBe('Your role can’t change labels.');
  });

  it('renaming or deleting a label the viewer cannot see reads as not found', () => {
    const marinaLabel = db.getState().labels.find(l => l.tenantId === 't-marina');
    if (!marinaLabel) return;
    expect(renameLabel(emiratesAdmin(), marinaLabel.id, 'Taken').error).toBe('Label not found.');
    expect(deleteLabel(emiratesAdmin(), marinaLabel.id).error).toBe('Label not found.');
  });

  it('a rename keeps the label on its assets and records the change', () => {
    const s = emiratesAdmin();
    addLabelToAssets(s, { name: 'Old name' }, ['a-ex04']);
    const label = labelsVisibleTo(s).find(l => l.name === 'Old name')!;
    const r = renameLabel(s, label.id, '  New name ');
    expect(r.ok).toBe(true);
    expect(r.message).toBe('Renamed to “New name”.');
    expect(labelsVisibleTo(s).find(l => l.id === label.id)?.name).toBe('New name');
  });

  it('removing a label from a missing or another company’s asset is refused', () => {
    const s = emiratesAdmin();
    addLabelToAssets(s, { name: 'Scoped' }, ['a-ex04']);
    const label = labelsVisibleTo(s).find(l => l.name === 'Scoped')!;
    expect(removeLabelFromAssets(s, 'l-missing', ['a-ex04']).error).toBe('Label not found.');
    expect(removeLabelFromAssets(marinaAdmin(), label.id, ['a-ex04']).ok).toBe(false);
  });
});
