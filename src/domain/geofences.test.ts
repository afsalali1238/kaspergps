import { describe, expect, it } from 'vitest';
import type { Geofence, Reading } from '@/domain/types';
import { deriveGeofenceEvents, pointInsideGeofence, timestampMs, visitsFromGeofenceEvents } from '@/domain/geofences';

const fence: Geofence = {
  id: 'g-test', tenantId: 't-one', name: 'Test', kind: 'site',
  shape: { type: 'circle', center: { lat: 25, lng: 55 }, radiusM: 100 },
  alertOnEnter: true, alertOnExit: true, assetIds: 'all', createdBy: 'u-one', createdAt: 1,
};

function reading(minutes: number, inside: boolean): Reading {
  const at = new Date(Date.UTC(2026, 9, 1, 0, minutes)).toISOString();
  return {
    trackerId: 'tr-one', deviceTime: at, receivedAt: at,
    lat: inside ? 25 : 25.01, lng: 55, speedKmh: 0, heading: 0, satellites: 8,
    ignition: false, moving: false, extVoltage: 12, intBattery: 4, gsm: 4, gnssOdometerKm: 0,
  };
}

describe('geofence history', () => {
  it('checks circles and polygons', () => {
    expect(pointInsideGeofence(fence, { lat: 25, lng: 55 })).toBe(true);
    expect(pointInsideGeofence(fence, { lat: 25.01, lng: 55 })).toBe(false);
    const polygon: Geofence = { ...fence, shape: { type: 'polygon', points: [
      { lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 1, lng: 0 },
    ] } };
    expect(pointInsideGeofence(polygon, { lat: 0.5, lng: 0.5 })).toBe(true);
    expect(pointInsideGeofence(polygon, { lat: 2, lng: 2 })).toBe(false);
  });

  it('waits for two consecutive readings on the new side', () => {
    const events = deriveGeofenceEvents(fence, 'a-one', [
      reading(0, false), reading(1, true), reading(2, true), reading(3, false), reading(4, false),
    ], 15 * 60 * 1000);
    expect(events.map(event => [event.type, timestampMs(event.at), event.source])).toEqual([
      ['enter', timestampMs(reading(2, true).deviceTime), 'reading_history'],
      ['exit', timestampMs(reading(4, false).deviceTime), 'reading_history'],
    ]);
  });

  it('does not create an event across a reading gap', () => {
    const events = deriveGeofenceEvents(fence, 'a-one', [
      reading(0, false), reading(1, true), reading(60, true), reading(61, true),
    ], 15 * 60 * 1000);
    expect(events).toEqual([]);
  });

  it('pairs entry and exit history into visit durations', () => {
    const events = deriveGeofenceEvents(fence, 'a-one', [
      reading(0, false), reading(1, true), reading(2, true), reading(3, false), reading(4, false),
    ], 15 * 60 * 1000);
    const visits = visitsFromGeofenceEvents(events, timestampMs(reading(10, false).deviceTime));
    expect(visits).toHaveLength(1);
    expect(visits[0].exitedAt).toBeTypeOf('number');
    expect(visits[0].dwellMs).toBe(2 * 60 * 1000);
  });
});
