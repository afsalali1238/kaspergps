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

describe('geofence shapes and events (§11.12)', () => {
  it('polygons need 3 to 30 points; circles need 50 to 5,000 m', async () => {
    const { createGeofence: create } = await import('@/server/geofences');
    const fatima = sessionFor('u-fatima');
    const base = { name: 'Shape test', kind: 'job' as const, alertOnEnter: false, alertOnExit: true, assetIds: 'all' as const };
    expect(create(fatima, { ...base, shape: { type: 'polygon', points: [{ lat: 1, lng: 1 }, { lat: 1, lng: 2 }] } }).ok).toBe(false);
    expect(create(fatima, { ...base, shape: { type: 'circle', center: { lat: 25, lng: 55 }, radiusM: 49 } }).ok).toBe(false);
    expect(create(fatima, { ...base, shape: { type: 'circle', center: { lat: 25, lng: 55 }, radiusM: 5001 } }).ok).toBe(false);
    const ok = create(fatima, { ...base, shape: { type: 'polygon', points: [{ lat: 25.1, lng: 55.1 }, { lat: 25.1, lng: 55.2 }, { lat: 25.2, lng: 55.2 }] } });
    expect(ok.ok).toBe(true);
    expect(ok.data!.shape).toBe('polygon');
  });

  it('point-in-polygon and point-in-circle agree with simple cases', async () => {
    const { insideShape } = await import('@/server/geofences');
    const square = { type: 'polygon' as const, points: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 1, lng: 0 }] };
    expect(insideShape(square, { lat: 0.5, lng: 0.5 })).toBe(true);
    expect(insideShape(square, { lat: 1.5, lng: 0.5 })).toBe(false);
    const circle = { type: 'circle' as const, center: { lat: 25.2, lng: 55.3 }, radiusM: 500 };
    expect(insideShape(circle, { lat: 25.2, lng: 55.3 })).toBe(true);
    expect(insideShape(circle, { lat: 25.3, lng: 55.3 })).toBe(false);
  });

  it('an enter then exit is found; a single stray reading is not an event', async () => {
    const { eventsFromReadings } = await import('@/server/geofences');
    const shape = { type: 'circle' as const, center: { lat: 25.2, lng: 55.3 }, radiusM: 500 };
    const at = (min: number, lat: number) => ({ lat, lng: 55.3, deviceTime: new Date(Date.UTC(2026, 9, 6, 6, min)).toISOString() });
    const inside = 25.2, outside = 25.3;
    const run = [at(0, outside), at(1, inside), at(2, inside), at(3, outside), at(4, outside)];
    expect(eventsFromReadings(shape, run).map(e => e.type)).toEqual(['enter', 'exit']);
    const stray = [at(0, outside), at(1, inside), at(2, outside), at(3, outside)];
    expect(eventsFromReadings(shape, stray)).toEqual([]);
  });
});
