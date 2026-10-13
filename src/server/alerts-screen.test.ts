// Alerts screen (UI-UPGRADE §8, Agent G): severity groups, KPIs, bulk
// acknowledge, the bell matching the page, and the prototype rules panel.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Session, User } from '@/domain/types';
import { acknowledgeAlert, bellAlerts, visibleAlerts } from '@/server/alerts';
import {
  SEVERITY_ORDER, acknowledgeAlerts, alertKpis, alertSeverity, groupAlertsBySeverity, mayAcknowledge,
} from '@/server/alerts-screen';
import { alertRulesFor, canManageAlertRules, saveAlertRule } from '@/server/alert-rules';
import { isKasperStaff } from '@/server/capabilities';
import { getRelationship } from '@/server/access';
import { db, resetDb } from '@/server/db';
import * as clock from '@/lib/clock';

function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId) as User;
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: user.siteIds,
    role: user.role,
    isKasper: isKasperStaff(user.role),
  };
}

const USERS = ['u-sara', 'u-omar', 'u-khalid', 'u-priya', 'u-mark', 'u-lina', 'u-fatima', 'u-deepa'];

function auditCount(action: string): number {
  return db.getState().auditEntries.filter(e => e.action === action).length;
}

beforeEach(() => {
  resetDb();
  clock.setOffsetMs(0);
});

afterEach(() => {
  clock.setOffsetMs(0);
  resetDb();
});

describe('severity (§8)', () => {
  it('offline, power cut, fuel drop and fault are critical', () => {
    for (const type of ['offline', 'power_cut', 'fuel_drop', 'fault_code'] as const) {
      expect(alertSeverity(type)).toBe('critical');
    }
    expect(alertSeverity('overspeed')).toBe('warning');
    expect(alertSeverity('geofence_enter')).toBe('info');
  });

  it('groups Critical, then Warning, then Info, and every alert lands in exactly one group', () => {
    for (const id of USERS) {
      const alerts = visibleAlerts(sessionFor(id));
      const groups = groupAlertsBySeverity(alerts);
      const order = groups.map(g => SEVERITY_ORDER.indexOf(g.severity));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(groups.every(g => g.alerts.length > 0)).toBe(true);
      for (const g of groups) expect(g.alerts.every(a => alertSeverity(a.type) === g.severity)).toBe(true);
      expect(groups.flatMap(g => g.alerts.map(a => a.id)).sort()).toEqual(alerts.map(a => a.id).sort());
    }
  });

  it('Khalid’s fleet has a critical group first (EX-11 power cut)', () => {
    const groups = groupAlertsBySeverity(visibleAlerts(sessionFor('u-khalid')));
    expect(groups[0].severity).toBe('critical');
    expect(groups[0].alerts.some(a => a.id === 'al-ex11-power')).toBe(true);
  });
});

describe('KPI strip', () => {
  it('counts come from the same visible list', () => {
    for (const id of USERS) {
      const session = sessionFor(id);
      const alerts = visibleAlerts(session);
      const k = alertKpis(session);
      const open = alerts.filter(a => a.status === 'open');
      expect(k.critical).toBe(open.filter(a => alertSeverity(a.type) === 'critical').length);
      expect(k.warning).toBe(open.filter(a => alertSeverity(a.type) === 'warning').length);
      expect(k.newToday).toBeLessThanOrEqual(alerts.length);
    }
  });

  it('Acknowledged today rises by one after an acknowledge', () => {
    const khalid = sessionFor('u-khalid');
    const before = alertKpis(khalid);
    const target = visibleAlerts(khalid).find(a => mayAcknowledge(khalid, a));
    expect(target).toBeDefined();
    expect(acknowledgeAlert(khalid, target!.id).ok).toBe(true);
    const after = alertKpis(khalid);
    expect(after.acknowledgedToday).toBe(before.acknowledgedToday + 1);
    const sev = alertSeverity(target!.type);
    if (sev === 'critical') expect(after.critical).toBe(before.critical - 1);
    if (sev === 'warning') expect(after.warning).toBe(before.warning - 1);
  });
});

describe('the bell matches the page', () => {
  it('bell alerts are exactly the page’s Open alerts, for every role', () => {
    for (const id of USERS) {
      const session = sessionFor(id);
      const pageOpen = groupAlertsBySeverity(visibleAlerts(session).filter(a => a.status === 'open'))
        .flatMap(g => g.alerts.map(a => a.id)).sort();
      expect(bellAlerts(session).map(a => a.id).sort()).toEqual(pageOpen);
    }
  });
});

describe('who may acknowledge', () => {
  it('mayAcknowledge agrees with acknowledgeAlert for every visible open alert', () => {
    for (const id of USERS) {
      resetDb();
      const session = sessionFor(id);
      for (const a of visibleAlerts(session).filter(x => x.status === 'open')) {
        const predicted = mayAcknowledge(session, a);
        const result = acknowledgeAlert(session, a.id);
        expect({ user: id, alert: a.id, ok: result.ok }).toEqual({ user: id, alert: a.id, ok: predicted });
      }
    }
  });

  it('Mark (Site User) and Deepa may acknowledge nothing', () => {
    for (const id of ['u-mark', 'u-deepa']) {
      const session = sessionFor(id);
      expect(visibleAlerts(session).some(a => mayAcknowledge(session, a))).toBe(false);
    }
  });
});

describe('Acknowledge all (n)', () => {
  it('Khalid: acknowledges every open alert he may, one audit entry each', () => {
    const khalid = sessionFor('u-khalid');
    const open = visibleAlerts(khalid).filter(a => a.status === 'open');
    const allowed = open.filter(a => mayAcknowledge(khalid, a)).map(a => a.id);
    expect(allowed.length).toBeGreaterThan(1);
    const before = auditCount('alert.acknowledge');

    const result = acknowledgeAlerts(khalid, allowed);
    expect(result.acknowledged.sort()).toEqual([...allowed].sort());
    expect(result.skipped).toEqual([]);
    expect(auditCount('alert.acknowledge')).toBe(before + allowed.length);
    expect(bellAlerts(khalid).some(a => allowed.includes(a.id))).toBe(false);
  });

  it('touches only allowed alerts: another company’s and rented-in alerts are skipped', () => {
    const fatima = sessionFor('u-fatima');
    const khalid = sessionFor('u-khalid');
    const fatimaOpen = visibleAlerts(fatima).filter(a => a.status === 'open');
    const rentedIn = fatimaOpen.filter(a => a.assetId && getRelationship(fatima, a.assetId) !== 'owner' && !a.tenantOwned);
    expect(rentedIn.map(a => a.id)).toContain('al-gn01-drop'); // GN-01 is rented from Emirates
    // Someone else's alert Fatima can't see at all.
    const foreign = visibleAlerts(khalid).find(a => !visibleAlerts(fatima).some(f => f.id === a.id));
    expect(foreign).toBeDefined();
    const ids = [...fatimaOpen.map(a => a.id), foreign!.id];
    const before = auditCount('alert.acknowledge');

    const result = acknowledgeAlerts(fatima, ids);
    expect(result.skipped).toContain(foreign!.id);
    for (const a of rentedIn) expect(result.skipped).toContain(a.id);
    expect(auditCount('alert.acknowledge')).toBe(before + result.acknowledged.length);
    // The foreign alert is still open for its owner.
    expect(db.getState().alerts.find(a => a.id === foreign!.id)?.acknowledgedAt).toBeUndefined();
  });

  it('a Site User’s bulk acknowledge does nothing and writes no audit', () => {
    const mark = sessionFor('u-mark');
    const before = auditCount('alert.acknowledge');
    const ids = visibleAlerts(mark).map(a => a.id);
    expect(ids.length).toBeGreaterThan(0);
    const result = acknowledgeAlerts(mark, ids);
    expect(result.acknowledged).toEqual([]);
    expect(auditCount('alert.acknowledge')).toBe(before);
  });

  it('is idempotent: a second run acknowledges nothing more', () => {
    const khalid = sessionFor('u-khalid');
    const ids = visibleAlerts(khalid).map(a => a.id);
    const first = acknowledgeAlerts(khalid, ids);
    expect(first.acknowledged.length).toBeGreaterThan(0);
    const before = auditCount('alert.acknowledge');
    expect(acknowledgeAlerts(khalid, ids).acknowledged).toEqual([]);
    expect(auditCount('alert.acknowledge')).toBe(before);
  });
});

describe('alert rules panel (prototype)', () => {
  it('is for Tenant Admins only: not Site Users, renters’ Site Users or Kasper staff', () => {
    for (const id of ['u-omar', 'u-khalid', 'u-priya', 'u-lina', 'u-fatima']) {
      expect(canManageAlertRules(sessionFor(id))).toBe(true);
    }
    for (const id of ['u-mark', 'u-deepa', 'u-rashid', 'u-ahmed', 'u-sara', 'u-ravi']) {
      expect(canManageAlertRules(sessionFor(id))).toBe(false);
      expect(alertRulesFor(sessionFor(id))).toEqual([]);
    }
    expect(canManageAlertRules(null)).toBe(false);
  });

  it('offers hardware types only to fleets that have the hardware', () => {
    const omar = alertRulesFor(sessionFor('u-omar')).map(r => r.type);   // Tier 1 fleet
    const khalid = alertRulesFor(sessionFor('u-khalid')).map(r => r.type); // Tier 3 fleet
    expect(omar).not.toContain('fuel_drop');
    expect(khalid).toContain('fuel_drop');
    expect(omar).toContain('offline');
  });

  it('saves per tenant, audits, and leaves other companies on the default', () => {
    const khalid = sessionFor('u-khalid');
    const omar = sessionFor('u-omar');
    const before = auditCount('alert.rule');
    const omarBefore = alertRulesFor(omar).find(r => r.type === 'offline');
    expect(omarBefore).toEqual({ type: 'offline', delivery: 'instant', saved: false });

    const result = saveAlertRule(khalid, 'offline', 'digest');
    expect(result.ok).toBe(true);
    expect(alertRulesFor(khalid).find(r => r.type === 'offline')).toEqual({ type: 'offline', delivery: 'digest', saved: true });
    expect(alertRulesFor(omar).find(r => r.type === 'offline')).toEqual(omarBefore);
    expect(db.getState().alertRules).toHaveLength(1);
    expect(db.getState().alertRules[0].tenantId).toBe('t-emirates');
    expect(auditCount('alert.rule')).toBe(before + 1);

    // The other Emirates admin sees the same saved rule.
    expect(alertRulesFor(sessionFor('u-khalid')).find(r => r.type === 'offline')?.delivery).toBe('digest');

    // Changing it again updates the row instead of adding one.
    expect(saveAlertRule(khalid, 'offline', 'in_app').ok).toBe(true);
    expect(db.getState().alertRules).toHaveLength(1);
    expect(auditCount('alert.rule')).toBe(before + 2);
  });

  it('refuses Site Users, unknown deliveries and types the fleet can’t produce', () => {
    expect(saveAlertRule(sessionFor('u-mark'), 'offline', 'instant').ok).toBe(false);
    expect(saveAlertRule(sessionFor('u-omar'), 'fuel_drop', 'instant').ok).toBe(false);
    expect(saveAlertRule(sessionFor('u-omar'), 'offline', 'sms' as never).ok).toBe(false);
    expect(db.getState().alertRules).toEqual([]);
    expect(auditCount('alert.rule')).toBe(0);
  });
});
