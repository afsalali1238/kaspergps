// One number, one source (UI-UPGRADE §9.2, C2). Each quantity below appears on
// more than one screen; every screen reads it through the server function named
// here, so this test pins that they agree.
//
// - maintenance remaining: the alert text (Alerts screen, bell), the plan
//   snapshot (Maintenance board) and the asset page (which renders planSnapshot);
// - engine hours: the asset page (ecuHoursAt), the maintenance card
//   (currentMeter) and a certificate (MUC closing hours);
// - fleet engine hours today: the map KPI vs the sum of the per-asset values;
// - fuel level: the map row and the asset page (both the latest reading) vs the
//   fuel model and the Engine & fuel week;
// - GN-01 is working at the anchor, so its engine hours today are above 0.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Session, User } from '@/domain/types';
import { db } from '@/server/db';
import * as clock from '@/lib/clock';
import { isKasperStaff } from '@/server/capabilities';
import { visibleAlerts } from '@/server/alerts';
import { currentMeter, maintenanceAlertText, planSnapshot, plansForAsset } from '@/server/maintenance';
import { buildEcuBreakdown, ecuHoursAt, issueMuc } from '@/server/muc';
import { engineHoursToday, fleetTodayTotals, fuelWeekFor } from '@/server/utilisation';
import { computeStatus, getReadingForAsset } from '@/server/telemetry/simulator';
import { fuelStateAt } from '@/server/telemetry/fuel';
import { hasFeature } from '@/domain/features';

function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId) as User;
  return {
    userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role: user.role,
    isKasper: isKasperStaff(user.role),
  };
}

const assetOf = (code: string) => db.getState().assets.find(a => a.code === code)!;
const HOURS_IN_TEXT = /\((\d[\d,]*) (h|km|days?) (left|overdue)\)/;

beforeEach(() => clock.setOffsetMs(0));
afterEach(() => clock.setOffsetMs(0));

describe('one source: maintenance remaining', () => {
  it('the alert text, the plan and the asset page give the same remaining', () => {
    const plans = db.getState().maintenancePlans;
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      const asset = db.getState().assets.find(a => a.id === plan.assetId)!;
      const snap = planSnapshot(plan, asset);
      const text = maintenanceAlertText(asset.id);
      expect(text, plan.id).not.toBeNull();
      const m = HOURS_IN_TEXT.exec(text!);
      expect(m, `${plan.id}: ${text}`).not.toBeNull();
      expect(Number(m![1].replace(/,/g, '')), `${plan.id}: ${text}`).toBe(Math.round(Math.abs(snap.remaining)));
      // The board's headline carries the same figure.
      if (snap.unit === 'h') expect(snap.headline).toContain(`${Math.abs(snap.remaining).toLocaleString('en-US', { maximumFractionDigits: 1 })} h`);
    }
  });

  it('the Alerts screen shows the plan’s figure, not the seeded text', () => {
    const khalid = sessionFor('u-khalid');
    const alerts = visibleAlerts(khalid).filter(a => a.type === 'maintenance_due' || a.type === 'maintenance_overdue');
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(alert.typeWords).toBe(maintenanceAlertText(alert.assetId));
      // …and the asset page reads the same plan for the owner.
      const plan = plansForAsset(khalid, alert.assetId)[0];
      expect(plan).toBeDefined();
      const asset = db.getState().assets.find(a => a.id === alert.assetId)!;
      const snap = planSnapshot(plan, asset);
      expect(alert.typeWords).toContain(`${Math.round(Math.abs(snap.remaining)).toLocaleString('en-US')} `);
    }
  });

  it('still agrees after the clock moves on a day', () => {
    clock.setOffsetMs(86400000);
    for (const plan of db.getState().maintenancePlans) {
      const asset = db.getState().assets.find(a => a.id === plan.assetId)!;
      const m = HOURS_IN_TEXT.exec(maintenanceAlertText(asset.id)!);
      expect(Number(m![1].replace(/,/g, ''))).toBe(Math.round(Math.abs(planSnapshot(plan, asset).remaining)));
    }
  });
});

describe('one source: engine hours', () => {
  const ecuPlans = () => db.getState().maintenancePlans.filter(p => p.basis === 'engine_hours' && p.hoursSource === 'ecu');

  it('the asset page and the maintenance card read the same ECU meter', () => {
    expect(ecuPlans().length).toBeGreaterThan(0);
    for (const plan of ecuPlans()) {
      const asset = db.getState().assets.find(a => a.id === plan.assetId)!;
      expect(currentMeter(plan, asset).value).toBe(ecuHoursAt(asset, clock.now()));
    }
    // Spec §8.2's anchor values hold.
    expect(ecuHoursAt(assetOf('EX-04'), clock.now())).toBe(8420);
    expect(ecuHoursAt(assetOf('BD-02'), clock.now())).toBe(14980);
  });

  it('a certificate closes on the meter the asset page shows', async () => {
    const khalid = sessionFor('u-khalid');
    for (const code of ['EX-04', 'WL-06', 'BD-02']) {
      const asset = assetOf(code);
      const fromMs = new Date('2026-10-01T00:00:00+04:00').getTime();
      const toMs = clock.now();
      const result = await issueMuc(khalid, { assetId: asset.id, periodFrom: fromMs, periodTo: toMs });
      expect(result.ok, `${code}: ${result.error}`).toBe(true);
      const payload = result.data!.payload;
      expect(payload.openingHoursEcu).toBe(ecuHoursAt(asset, fromMs));
      // Working at the anchor, so its last reading is now: the closing reading is the asset page's meter.
      expect(Math.abs(payload.closingHoursEcu - ecuHoursAt(asset, toMs)), code).toBeLessThanOrEqual(0.2);
      // The days and gap hours add up to the billable hours.
      const breakdown = buildEcuBreakdown(asset, fromMs, toMs);
      const sum = breakdown.days.reduce((s, d) => s + d.engineHours, 0) + breakdown.gapHours;
      expect(Math.abs(sum - payload.billableHours), code).toBeLessThanOrEqual(0.1 * (breakdown.days.length + 1));
    }
  });

  it('the map’s fleet engine hours today are the sum of the per-asset values', () => {
    const assets = db.getState().assets.filter(a => !a.retiredAt);
    const totals = fleetTodayTotals(assets);
    const perAsset = assets.map(a => engineHoursToday(a)).filter((h): h is number => h !== null);
    expect(totals.engineAssets).toBe(perAsset.length);
    expect(totals.engineHours).toBeCloseTo(perAsset.reduce((s, h) => s + h, 0), 1);
    expect(totals.engineHours).toBeGreaterThan(0);
  });

  it('GN-01 is working at the anchor, so its engine hours today are above 0', () => {
    const gn01 = assetOf('GN-01');
    expect(computeStatus(gn01)).toBe('live');
    expect(getReadingForAsset(gn01)!.ignition).toBe(true);
    expect(engineHoursToday(gn01)!).toBeGreaterThan(0);
  });
});

describe('one source: fuel level', () => {
  it('the map row, the asset page, the fuel model and the fuel week agree', () => {
    const withLevel = db.getState().assets.filter(a => !a.retiredAt && hasFeature(a, 'fuel.level'));
    expect(withLevel.length).toBeGreaterThan(0);
    let checked = 0;
    for (const asset of withLevel) {
      const reading = getReadingForAsset(asset);
      if (!reading || reading.fuelLevelPct === undefined) continue;
      checked++;
      // The map row rounds the latest reading; the asset page prints it with no decimals.
      const mapRow = Math.round(reading.fuelLevelPct);
      const assetPage = Number(reading.fuelLevelPct.toFixed(0));
      expect(assetPage, asset.code).toBe(mapRow);
      // That reading is the fuel model's level at the reading's time.
      const model = fuelStateAt(asset, new Date(reading.deviceTime).getTime()).levelPct;
      expect(Math.abs(model - reading.fuelLevelPct), asset.code).toBeLessThanOrEqual(0.5);
      // The Engine & fuel week ends on the same level today.
      const week = fuelWeekFor(asset)!;
      const today = week.days[week.days.length - 1];
      expect(today.levelPct, asset.code).not.toBeNull();
      expect(Math.round(today.levelPct!), asset.code).toBe(mapRow);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
