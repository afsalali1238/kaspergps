// J3: alerts tell the truth. Every time written in an alert's text is its
// "Since" time, and nothing is shown before the demo clock reaches it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Session, User } from '@/domain/types';
import { visibleAlerts, bellAlerts } from '@/server/alerts';
import { isKasperStaff } from '@/server/capabilities';
import { db, resetDb } from '@/server/db';
import { ANCHOR_MS } from '@/server/seed/data';
import * as clock from '@/lib/clock';

function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId) as User;
  return { userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role: user.role, isKasper: isKasperStaff(user.role) };
}

const ms = (v: string | number) => (typeof v === 'number' ? v : new Date(v).getTime());
const byId = (id: string) => db.getState().alerts.find(a => a.id === id)!;

beforeEach(() => {
  resetDb();
  clock.setOffsetMs(0);
});
afterEach(() => clock.setOffsetMs(0));

describe('alert times (J3)', () => {
  it('every HH:mm in an alert text equals its Since time', () => {
    for (const alert of db.getState().alerts) {
      const times = alert.detail.match(/\b\d{2}:\d{2}\b/g) ?? [];
      for (const time of times) expect(time, alert.id).toBe(clock.formatDubaiTime(ms(alert.openedAt)));
    }
  });

  it('no seeded alert opens or closes after the anchor', () => {
    for (const alert of db.getState().alerts) {
      expect(ms(alert.openedAt), alert.id).toBeLessThanOrEqual(ANCHOR_MS);
      if (alert.closedAt) expect(ms(alert.closedAt), alert.id).toBeLessThanOrEqual(ANCHOR_MS);
    }
  });

  // The §8.7 scenario times are checked against the readings in seed/alerts-truthful.test.ts.

  it('jumping the clock back hides alerts that have not happened yet', () => {
    const sara = sessionFor('u-sara');
    clock.setOffsetMs(-3 * 3600000); // 07:00, before the 08:00 power cut
    const ids = visibleAlerts(sara).map(a => a.id);
    expect(ids).not.toContain('al-tp23-power');
    expect(ids).not.toContain('al-tp23-offline');
    expect(ids).toContain('al-ex07-offline'); // 06:50
    for (const a of visibleAlerts(sara)) expect(ms(a.openedAt)).toBeLessThanOrEqual(clock.now());
  });

  it('an alert whose close is still ahead of the clock reads as open', () => {
    const omar = sessionFor('u-omar');
    clock.setOffsetMs(ms(byId('al-wt07-speed').openedAt) + 60000 - ANCHOR_MS);
    expect(visibleAlerts(omar).find(a => a.id === 'al-wt07-speed')?.status).toBe('open');
    clock.setOffsetMs(0);
    expect(visibleAlerts(omar).find(a => a.id === 'al-wt07-speed')?.status).toBe('closed');
  });

  it('the bell and the Alerts page show the same open alerts with the same times', () => {
    for (const userId of ['u-omar', 'u-khalid', 'u-deepa']) {
      const session = sessionFor(userId);
      const page = visibleAlerts(session).filter(a => a.status === 'open');
      expect(bellAlerts(session).map(a => [a.id, a.openedAt])).toEqual(page.map(a => [a.id, a.openedAt]));
    }
  });
});
