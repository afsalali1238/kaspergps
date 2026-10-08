// Alerts visibility and acknowledge (spec §11.4, S9).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Session, User } from '@/domain/types';
import { visibleAlerts, acknowledgeAlert, openAlertCount } from '@/server/alerts';
import { isKasperStaff } from '@/server/capabilities';
import { db } from '@/server/db';
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

beforeEach(() => {
  clock.setOffsetMs(0);
});

afterEach(() => {
  clock.setOffsetMs(0);
});

describe('alerts (§11.4)', () => {
  it('limits a site user to alerts at their sites (S9 — Deepa has exactly 2 sites)', () => {
    const deepa = sessionFor('u-deepa'); // Palm: Dubai South + Palm Crescent
    expect(deepa.siteIds).toHaveLength(2);
    const alerts = visibleAlerts(deepa);
    // Never: Al Quoz power-cut on EX-11 (Emirates, Al Quoz).
    expect(alerts.some(a => a.id === 'al-ex11-power')).toBe(false);
    // Never: Emirates maintenance alerts.
    expect(alerts.some(a => a.id === 'al-bd02-maint')).toBe(false);
    // Hers: Palm geofence-exit on WL-06 at Palm Crescent.
    expect(alerts.some(a => a.id === 'al-wl06-geo')).toBe(true);
  });

  it('day one shows offline only', () => {
    const omar = sessionFor('u-omar');
    const dayOne = visibleAlerts(omar, 'day_one');
    expect(dayOne.length).toBeGreaterThan(0);
    expect(dayOne.every(a => a.type === 'offline')).toBe(true);
  });

  it('site users cannot acknowledge; the owner admin can, and it records who saw it', () => {
    const deepa = sessionFor('u-deepa');
    expect(acknowledgeAlert(deepa, 'al-wl06-geo').ok).toBe(false);

    const omar = sessionFor('u-omar'); // Emirates Tenant Admin (owner)
    const result = acknowledgeAlert(omar, 'al-tp23-power');
    expect(result.ok).toBe(true);
    expect(result.data!.status).toBe('acknowledged');
    expect(result.data!.acknowledgedBy).toBe('Omar Saleh');
    // Acknowledging again is idempotent.
    expect(acknowledgeAlert(omar, 'al-tp23-power').ok).toBe(true);
    // A closed alert stays closed even when acknowledged.
    const fatima = sessionFor('u-fatima'); // Palm Tenant Admin — al-wl06-geo is a closed exit
    const closed = acknowledgeAlert(fatima, 'al-wl06-geo');
    expect(closed.ok).toBe(true);
    expect(closed.data!.status).toBe('closed');
    expect(closed.data!.acknowledgedBy).toBe('Fatima Noor');
  });

  it('counts open alerts for the bell and drops acknowledged ones', () => {
    const omar = sessionFor('u-omar'); // sites: Marina + Business Bay
    const count = openAlertCount(omar);
    expect(count).toBeGreaterThan(0);
    // EX-11 is at the RAK site — outside Omar's sites, so he can't ack it.
    expect(acknowledgeAlert(omar, 'al-ex11-power').ok).toBe(false);
    // TP-23 offline is visible to him.
    acknowledgeAlert(omar, 'al-tp23-offline');
    expect(openAlertCount(omar)).toBe(count - 1);
  });
});
