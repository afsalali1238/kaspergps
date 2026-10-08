// Geofence visibility, create and delete (spec §12.2, S31).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Session, User } from '@/domain/types';
import { visibleGeofences, visibleGeofenceEvents, createGeofence, deleteGeofence } from '@/server/geofences';
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

describe('geofences (§12.2)', () => {
  it('scopes geofences to the tenant (S31)', () => {
    const fatima = sessionFor('u-fatima'); // Palm
    const names = visibleGeofences(fatima).map(g => g.name);
    expect(names).toContain('Palm Crescent works');
    expect(names.some(n => n.includes('Hatta'))).toBe(false);

    const sara = sessionFor('u-sara'); // Kasper sees all
    expect(visibleGeofences(sara).length).toBeGreaterThan(names.length);
  });

  it('shows enter/exit events only for visible assets', () => {
    const fatima = sessionFor('u-fatima');
    const events = visibleGeofenceEvents(fatima);
    expect(events.some(e => e.id === 'ge-001')).toBe(true); // WL-06 exit at Palm Crescent
  });

  it('creates and deletes a circle behind geofence.manage', () => {
    const fatima = sessionFor('u-fatima');
    const result = createGeofence(fatima, {
      name: 'Al Quoz Yard',
      kind: 'yard',
      center: { lat: 25.1972, lng: 55.2744 },
      radiusM: 500,
      alertOnEnter: false,
      alertOnExit: true,
      assetIds: 'all',
    });
    expect(result.ok).toBe(true);
    expect(visibleGeofences(fatima).some(g => g.name === 'Al Quoz Yard')).toBe(true);

    const del = deleteGeofence(fatima, result.data!.id);
    expect(del.ok).toBe(true);
    expect(visibleGeofences(fatima).some(g => g.name === 'Al Quoz Yard')).toBe(false);

    // Site users cannot create.
    const deepa = sessionFor('u-deepa');
    expect(createGeofence(deepa, {
      name: 'Nope', kind: 'yard', center: { lat: 0, lng: 0 }, radiusM: 10,
      alertOnEnter: false, alertOnExit: true, assetIds: 'all',
    }).ok).toBe(false);
  });
});
