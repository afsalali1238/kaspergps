// H4.4 rules (spec §11.12): a site's own geofence, the asset's "Inside" line, and
// the geofence report, which is listed only to a company that has a geofence.

import { describe, it, expect, beforeEach } from 'vitest';
import type { Asset, Session, User } from '@/domain/types';
import { db, append, resetDb } from '@/server/db';
import { isKasperStaff } from '@/server/capabilities';
import { createGeofence, createSiteGeofence, assetGeofenceStatus, visibleGeofences, updateGeofence, eventsFromReadings } from '@/server/geofences';
import { createAsset, deleteSite, createSite } from '@/server/asset-admin';
import { availableReportTypes, runReport } from '@/server/reports';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { ANCHOR_MS } from '@/server/seed/data';
import * as clock from '@/lib/clock';

function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId) as User;
  return { userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role: user.role, isKasper: isKasperStaff(user.role) };
}

const omar = () => sessionFor('u-omar');
const lina = () => sessionFor('u-lina');
const priya = () => sessionFor('u-priya');
const sara = () => sessionFor('u-sara');

const assetByCode = (code: string): Asset => db.getState().assets.find(a => a.code === code)!;

beforeEach(() => {
  resetDb();
  clock.setAnchor(ANCHOR_MS);
});

describe('site geofence (§11.12)', () => {
  it('creates one circle at the site centre with the site radius, tied to the site', () => {
    const site = db.getState().sites.find(s => s.tenantId === 't-alnoor')!;
    const r = createSiteGeofence(omar(), site.id);
    expect(r.ok).toBe(true);
    const fence = db.getState().geofences.find(g => g.siteId === site.id)!;
    expect(fence.shape).toEqual({ type: 'circle', center: site.center, radiusM: site.radiusM });
    expect(fence.name).toBe(`${site.name} site`);
  });

  it('a second site geofence for the same site is refused', () => {
    const site = db.getState().sites.find(s => s.tenantId === 't-alnoor')!;
    expect(createSiteGeofence(omar(), site.id).ok).toBe(true);
    expect(createSiteGeofence(omar(), site.id).error).toBe(`${site.name} already has a site geofence.`);
  });

  it('another company’s site reads as not found', () => {
    const marinaSite = db.getState().sites.find(s => s.tenantId === 't-marina')!;
    expect(createSiteGeofence(omar(), marinaSite.id).error).toBe('Site not found.');
  });

  it('a site user cannot make a geofence', () => {
    const deepa = sessionFor('u-deepa');
    const site = db.getState().sites.find(s => s.tenantId === deepa.tenantId)!;
    expect(createSiteGeofence(deepa, site.id).error).toBe('You can’t create geofences.');
  });

  it('a site with its geofence cannot be deleted until the geofence goes', () => {
    const made = createSite(omar(), { name: 'Fence Yard', center: { lat: 25.2, lng: 55.3 }, radiusM: 300 });
    expect(createSiteGeofence(omar(), made.data!.id).ok).toBe(true);
    expect(deleteSite(omar(), made.data!.id).error).toBe('Delete its site geofence from the site first.');
  });
});

describe('asset “Inside” line (§11.12)', () => {
  it('names each of the owner’s fences that holds the asset’s last position', () => {
    const asset = assetByCode('FB-12');
    const now = clock.now();
    const readings = getReadingsForAsset(asset, now - 86_400_000, now)
      .sort((a, b) => new Date(a.deviceTime).getTime() - new Date(b.deviceTime).getTime());
    const last = readings[readings.length - 1];
    expect(last, 'FB-12 reports in the last day').toBeTruthy();

    // A 50 m circle on the last position is certain to contain it; a fence 20 km away cannot.
    const here = createGeofence(omar(), {
      name: 'Here', kind: 'yard', center: { lat: last.lat, lng: last.lng }, radiusM: 50,
      alertOnEnter: false, alertOnExit: false, assetIds: 'all',
    });
    const far = createGeofence(omar(), {
      name: 'Far away', kind: 'yard', center: { lat: last.lat + 0.2, lng: last.lng }, radiusM: 50,
      alertOnEnter: false, alertOnExit: false, assetIds: 'all',
    });
    expect(here.ok && far.ok).toBe(true);
    // The seeded Jebel Ali gate may also hold the position; the far fence never does.
    const inside = assetGeofenceStatus(omar(), asset.id)?.inside ?? [];
    expect(inside).toContain('Here');
    expect(inside).not.toContain('Far away');
  });

  it('is null for renters and Kasper staff, who see another company’s asset', () => {
    const cp03 = assetByCode('CP-03');
    expect(assetGeofenceStatus(sara(), cp03.id)).toBeNull();
    expect(assetGeofenceStatus(lina(), 'a-ex04')).toBeNull();
  });

  it('is null for an asset with no tracker, which has no position to test', () => {
    const made = createAsset(omar(), {
      code: 'NT-1', name: 'No tracker yet', type: 'Plant', assetClass: 'plant', make: 'X', model: 'Y', year: 2020,
      plateOrSerial: 'NT', homeSiteId: db.getState().sites.find(s => s.tenantId === 't-alnoor')!.id, behaviour: 'parked',
    });
    expect(made.ok).toBe(true);
    expect(assetGeofenceStatus(omar(), made.data!.id)).toBeNull();
  });

  it('is null for a missing asset', () => {
    expect(assetGeofenceStatus(omar(), 'a-missing')).toBeNull();
  });
});

describe('geofence report (§11.12)', () => {
  it('is offered to a company that has a geofence, and not to one that has none', () => {
    const omarAssets = [assetByCode('FB-12').id];
    expect(availableReportTypes(omar(), omarAssets, 'phase2').map(t => t.id)).toContain('geofence');
    expect(visibleGeofences(priya())).toHaveLength(0);
    expect(availableReportTypes(priya(), ['a-bd02'], 'phase2').map(t => t.id)).not.toContain('geofence');
  });

  it('is hidden on Day one, like the other Phase 2 reports', () => {
    expect(availableReportTypes(omar(), [assetByCode('FB-12').id], 'day_one').map(t => t.id)).not.toContain('geofence');
  });

  it('lists the entries and exits for the chosen asset in the period', () => {
    const asset = assetByCode('FB-12');
    const fence = db.getState().geofences.find(g => g.tenantId === 't-alnoor')!;
    append('geofenceEvents', { id: 'ge-test-in', geofenceId: fence.id, assetId: asset.id, type: 'enter', at: new Date(ANCHOR_MS - 3_600_000).toISOString() });
    append('geofenceEvents', { id: 'ge-test-out', geofenceId: fence.id, assetId: asset.id, type: 'exit', at: new Date(ANCHOR_MS - 1_800_000).toISOString() });

    const r = runReport(omar(), { reportType: 'geofence', assetIds: [asset.id], from: '2026-09-01', to: '2026-10-12', format: 'xlsx' });
    expect(r.ok, r.error).toBe(true);
    const table = r.data!.tables.find(t => t.title === `${asset.code} geofence events`)!;
    expect(table.columns).toEqual(['Time (Dubai)', 'Asset', 'Geofence', 'Event']);
    expect(table.rows.map(row => row[3])).toEqual(['Entered', 'Left']);
    expect(table.rows.every(row => row[2] === fence.name)).toBe(true);
  });

  it('leaves out another company’s fences when it builds the table', () => {
    const asset = assetByCode('FB-12');
    const own = db.getState().geofences.find(g => g.tenantId === 't-alnoor')!;
    const marinaFence = db.getState().geofences.find(g => g.tenantId === 't-marina')!;
    append('geofenceEvents', { id: 'ge-own', geofenceId: own.id, assetId: asset.id, type: 'enter', at: new Date(ANCHOR_MS - 600_000).toISOString() });
    append('geofenceEvents', { id: 'ge-foreign', geofenceId: marinaFence.id, assetId: asset.id, type: 'enter', at: new Date(ANCHOR_MS - 300_000).toISOString() });
    const r = runReport(omar(), { reportType: 'geofence', assetIds: [asset.id], from: '2026-09-01', to: '2026-10-12', format: 'pdf' });
    expect(r.ok, r.error).toBe(true);
    const table = r.data!.tables.find(t => t.title === `${asset.code} geofence events`)!;
    expect(table.rows.map(row => row[2])).toEqual([own.name]);
  });
});

describe('edit a geofence (§11.12)', () => {
  const PORT_GATE = 'g-an-port-gate';
  const fenceNamed = (id: string) => db.getState().geofences.find(g => g.id === id)!;

  it('renames, changes the alert switches and records the edit', () => {
    const r = updateGeofence(omar(), PORT_GATE, { name: 'Port gate north', alertOnExit: false });
    expect(r.ok, r.error).toBe(true);
    const g = fenceNamed(PORT_GATE);
    expect(g.name).toBe('Port gate north');
    expect(g.alertOnExit).toBe(false);
    expect(g.alertOnEnter).toBe(true);
    expect(db.getState().auditEntries.some(e => e.action === 'geofence.edit' && e.detail.includes('Port gate north'))).toBe(true);
  });

  it('a new shape replaces the old one, and its events are worked out again for that shape only', () => {
    const fb12 = assetByCode('FB-12');
    const made = createGeofence(omar(), {
      name: 'Shape test', kind: 'yard', center: { lat: 25.0, lng: 55.0 }, radiusM: 500,
      alertOnEnter: true, alertOnExit: true, assetIds: [fb12.id],
    });
    expect(made.ok).toBe(true);
    const id = made.data!.id;

    const last = getReadingsForAsset(fb12, clock.now() - 86_400_000 * 7, clock.now());
    const shape = { type: 'circle' as const, center: { lat: last[0].lat, lng: last[0].lng }, radiusM: 80 };
    const r = updateGeofence(omar(), id, { shape });
    expect(r.ok, r.error).toBe(true);
    expect(fenceNamed(id).shape).toEqual(shape);

    const expected = eventsFromReadings(shape, last).length;
    expect(db.getState().geofenceEvents.filter(e => e.geofenceId === id)).toHaveLength(expected);
  });

  it('a radius outside 50 to 5,000 m is refused and the fence keeps its shape', () => {
    const before = fenceNamed(PORT_GATE).shape;
    const r = updateGeofence(omar(), PORT_GATE, { shape: { type: 'circle', center: { lat: 25, lng: 55 }, radiusM: 10 } });
    expect(r.error).toBe('The radius must be between 50 and 5,000 m.');
    expect(fenceNamed(PORT_GATE).shape).toEqual(before);
  });

  it('a site geofence keeps its shape, which follows the site; its name can change', () => {
    const site = db.getState().sites.find(s => s.tenantId === 't-alnoor')!;
    const made = createSiteGeofence(omar(), site.id);
    expect(made.ok).toBe(true);
    const id = made.data!.id;

    const refused = updateGeofence(omar(), id, { shape: { type: 'circle', center: site.center, radiusM: 900 } });
    expect(refused.error).toBe('A site geofence follows its site. Change the site instead.');
    expect(updateGeofence(omar(), id, { name: 'Head office site' }).ok).toBe(true);
    expect(fenceNamed(id).name).toBe('Head office site');
  });

  it('a site user cannot edit, and another company’s fence reads as not found', () => {
    expect(updateGeofence(sessionFor('u-deepa'), PORT_GATE, { name: 'x' }).error).toBe('You can’t edit geofences.');
    expect(updateGeofence(lina(), PORT_GATE, { name: 'x' }).error).toBe('Geofence not found.');
  });

  it('a blank name is refused', () => {
    expect(updateGeofence(omar(), PORT_GATE, { name: '   ' }).error).toBe('Give the geofence a name.');
    expect(fenceNamed(PORT_GATE).name).not.toBe('');
  });
});
