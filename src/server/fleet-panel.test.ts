// Agent E: the fleet map's panel, KPI strip and event tabs are role-scoped
// (UI-UPGRADE §6 tests; scorecard A16).

import { beforeEach, describe, expect, it } from 'vitest';
import type { Session, User } from '@/domain/types';
import { db, resetDb } from '@/server/db';
import { getRelationship, historyFloor, visibleAssetIds } from '@/server/access';
import { isKasperStaff } from '@/server/capabilities';
import { alertSeverity, fleetEvents, fleetKpis, fleetPanelFor, rentalLineFor } from '@/server/fleet-panel';
import * as clock from '@/lib/clock';

function sessionFor(id: string): Session {
  const user = db.getState().users.find(u => u.id === id) as User;
  return { userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role: user.role, isKasper: isKasperStaff(user.role) };
}
const assetsOf = (s: Session) => visibleAssetIds(s).map(id => db.getState().assets.find(a => a.id === id)!);

beforeEach(() => {
  resetDb();
  clock.setOffsetMs(0);
});

describe('fleetPanelFor', () => {
  it('returns nothing for an asset the session cannot see', () => {
    const mark = sessionFor('u-mark');
    const hidden = db.getState().assets.find(a => !visibleAssetIds(mark).includes(a.id))!;
    expect(fleetPanelFor(mark, hidden.id)).toBeNull();
  });

  it("Mark (Site User) gets panels only for his site's assets", () => {
    const mark = sessionFor('u-mark');
    const ids = visibleAssetIds(mark);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const panel = fleetPanelFor(mark, id)!;
      expect(panel).not.toBeNull();
      expect(mark.siteIds.map(s => db.getState().sites.find(x => x.id === s)!.name)).toContain(panel.siteName);
    }
  });

  it('Omar (Tier 1 fleet) gets no fuel UI and the Tier 1 metric set', () => {
    const omar = sessionFor('u-omar');
    for (const id of visibleAssetIds(omar)) {
      const panel = fleetPanelFor(omar, id)!;
      expect(panel.fuel, panel.code).toBeNull();
      if (panel.tier === 1) expect(panel.metrics.map(m => m.key)).toEqual(['speed', 'ignition', 'distance_today', 'last_update']);
    }
    expect(fleetKpis(omar, assetsOf(omar)).fuelUsedTodayL).toBeNull();
    expect(fleetEvents(omar, assetsOf(omar)).fuel).toEqual([]);
  });

  it('Lina (renter) sees her own and rented assets; a rental names the owner, and no owner maintenance', () => {
    const lina = sessionFor('u-lina');
    const ids = visibleAssetIds(lina);
    const rented = ids.filter(id => getRelationship(lina, id) === 'renter');
    expect(rented.length).toBeGreaterThan(0);
    for (const id of rented) {
      const panel = fleetPanelFor(lina, id)!;
      expect(panel.relationship).toBe('renter');
      expect(panel.nextService).toBeNull();
      expect(panel.rental?.kind).toBe('rented_in');
      const owner = db.getState().tenants.find(t => t.id === db.getState().assets.find(a => a.id === id)!.ownerTenantId)!;
      expect(panel.rental?.counterparty).toBe(owner.name);
    }
    for (const id of ids) {
      const rel = getRelationship(lina, id);
      expect(['owner', 'renter']).toContain(rel);
    }
  });

  it("an owner sees the renter on its own asset's live hire", () => {
    const khalid = sessionFor('u-khalid');
    const onHire = visibleAssetIds(khalid)
      .map(id => db.getState().assets.find(a => a.id === id)!)
      .map(a => rentalLineFor(khalid, a))
      .filter(Boolean);
    expect(onHire.length).toBeGreaterThan(0);
    for (const line of onHire) {
      expect(line!.kind).toBe('on_hire');
      expect(line!.counterparty.length).toBeGreaterThan(0);
    }
  });

  it('a Tier 3 panel carries ECU engine hours with a source, and a fuel tank within its capacity', () => {
    const khalid = sessionFor('u-khalid');
    const panel = fleetPanelFor(khalid, 'a-ex04')!;
    expect(panel.tier).toBe(3);
    const hours = panel.metrics.find(m => m.key === 'engine_hours')!;
    expect(hours.value).toBeGreaterThan(0);
    expect(hours.source).toBe('ECU');
    expect(panel.fuel).not.toBeNull();
    expect(panel.fuel!.litresLeft).toBeLessThanOrEqual(panel.fuel!.tankL);
    expect(panel.fuel!.week).toHaveLength(7);
  });
});

describe('history floor', () => {
  it("Lina never sees fuel events from before her rental started", () => {
    const lina = sessionFor('u-lina');
    const assets = assetsOf(lina);
    for (const e of fleetEvents(lina, assets).fuel) {
      const floor = historyFloor(lina, e.assetId);
      if (floor !== null) expect(e.at + 86400000, `${e.assetCode} ${clock.formatDubaiDate(e.at)}`).toBeGreaterThan(floor);
    }
    for (const a of assets) {
      const floor = historyFloor(lina, a.id);
      const panel = fleetPanelFor(lina, a.id)!;
      if (floor === null || !panel.fuel) continue;
      const startDay = clock.startOfDubaiDay(floor);
      const hidden = Math.round((clock.startOfDubaiDay(clock.now()) - startDay) / 86400000);
      // Days strictly before the rental's first day are blank.
      panel.fuel.week.slice(0, Math.max(0, 6 - hidden)).forEach(v => expect(v).toBeNull());
    }
  });
});

describe('fleetKpis and fleetEvents', () => {
  it('count only the assets passed in, and alerts only on those assets', () => {
    const khalid = sessionFor('u-khalid');
    const all = assetsOf(khalid);
    const k = fleetKpis(khalid, all);
    expect(k.live + k.idle + k.offline).toBeLessThanOrEqual(all.length);
    const ev = fleetEvents(khalid, all);
    const ids = new Set(all.map(a => a.id));
    for (const e of [...ev.alerts, ...ev.log, ...ev.fuel]) expect(ids.has(e.assetId)).toBe(true);
    expect(ev.alerts.every(e => e.status === 'open')).toBe(true);
    expect(k.alertsCritical + k.alertsWarning).toBe(ev.alerts.length);
    // Critical rows come first.
    const firstWarning = ev.alerts.findIndex(e => e.severity === 'warning');
    if (firstWarning >= 0) expect(ev.alerts.slice(firstWarning).every(e => e.severity === 'warning')).toBe(true);

    const none = fleetKpis(khalid, []);
    expect(none).toMatchObject({ live: 0, idle: 0, offline: 0, engineHoursToday: null, fuelUsedTodayL: null, alertsCritical: 0, alertsWarning: 0 });
  });

  it('Deepa and Fatima see no other company in the panel', () => {
    for (const id of ['u-deepa', 'u-fatima']) {
      const s = sessionFor(id);
      for (const assetId of visibleAssetIds(s)) {
        const panel = fleetPanelFor(s, assetId)!;
        if (panel.relationship === 'renter') expect(panel.rental === null || panel.rental.kind === 'rented_in').toBe(true);
        expect(panel.siteName).not.toMatch(/Yard/);
      }
    }
  });

  it('offline, fuel drops and overdue service are critical; idling is not', () => {
    expect(alertSeverity('offline')).toBe('critical');
    expect(alertSeverity('fuel_drop')).toBe('critical');
    expect(alertSeverity('maintenance_overdue')).toBe('critical');
    expect(alertSeverity('maintenance_due')).toBe('warning');
    expect(alertSeverity('overspeed')).toBe('warning');
  });
});
