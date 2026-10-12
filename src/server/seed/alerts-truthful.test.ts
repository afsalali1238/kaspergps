// J3/J5 proof: seeded alerts tell the truth about the readings (spec §8.7, §8.10).
// Each alert is checked against them: the time it opened, the time it closed, and the
// time written in its detail text. The four scripted events the simulator had to learn
// for J5 (TP-21 harsh driving, PU-51 idling, EX-11's power cut, GR-01 after hours) are
// checked here too, so no alert stays in the seed without readings behind it.
import { describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { ANCHOR_MS, dubaiAt } from '@/server/seed/data';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { refuelTimesFor } from '@/server/telemetry/fuel';
import { haversineKm } from '@/server/telemetry/movement';
import { insideShape, eventsFromReadings, type GeofenceShape } from '@/server/geofences';
import { formatDubaiTime } from '@/lib/clock';
import type { Alert, Asset, Reading } from '@/domain/types';

const MIN = 60 * 1000;
const TOL = 10 * MIN;
const alertOf = (id: string): Alert => db.getState().alerts.find(a => a.id === id)!;
const assetOf = (code: string): Asset => db.getState().assets.find(a => a.code === code)!;
const ts = (r: Reading) => new Date(r.deviceTime).getTime();
const readings = (code: string, from: number, to: number) => getReadingsForAsset(assetOf(code), from, to);
const openedMs = (id: string) => new Date(alertOf(id).openedAt).getTime();
const closedMs = (id: string) => new Date(alertOf(id).closedAt!).getTime();

describe('seeded alert times (§8.7)', () => {
  it('no alert opens after the anchor, and each closes after it opens', () => {
    for (const a of db.getState().alerts) {
      const opened = new Date(a.openedAt).getTime();
      expect(opened, `${a.id} opens after the anchor`).toBeLessThanOrEqual(ANCHOR_MS);
      if (a.closedAt) expect(new Date(a.closedAt).getTime(), `${a.id} closes before it opens`).toBeGreaterThan(opened);
    }
  });

  it('TP-23 power cut: external voltage is 0 at the opened time, and it was on before', () => {
    const at = openedMs('al-tp23-power');
    expect(at).toBe(ANCHOR_MS - 2 * 60 * MIN);
    const before = readings('TP-23', at - 30 * MIN, at - 20 * MIN);
    const during = readings('TP-23', at + 5 * MIN, at + 15 * MIN);
    expect(before.length).toBeGreaterThan(0);
    expect(Math.min(...before.map(r => r.extVoltage))).toBeGreaterThan(10);
    expect(Math.max(...during.map(r => r.extVoltage))).toBeLessThan(1);
    expect(alertOf('al-tp23-power').detail).toContain(formatDubaiTime(at));
  });

  it('TP-23 offline: its last reading is at the opened time', () => {
    const at = openedMs('al-tp23-offline');
    expect(at).toBe(ANCHOR_MS - 40 * MIN);
    const last = readings('TP-23', at - 2 * 60 * MIN, ANCHOR_MS).at(-1)!;
    expect(Math.abs(ts(last) - at)).toBeLessThanOrEqual(TOL);
    expect(alertOf('al-tp23-offline').detail).toContain(formatDubaiTime(at));
  });

  it('EX-07 offline: its last reading is at the opened time', () => {
    const at = openedMs('al-ex07-offline');
    const last = readings('EX-07', at - 3 * 60 * MIN, ANCHOR_MS).at(-1)!;
    expect(Math.abs(ts(last) - at)).toBeLessThanOrEqual(TOL);
    expect(alertOf('al-ex07-offline').detail).toContain(formatDubaiTime(at));
  });

  it('SL-02 offline: its last reading is at the opened time, two days before the anchor', () => {
    const at = openedMs('al-sl02-offline');
    expect(at).toBe(dubaiAt(2, 10, 0));
    const last = readings('SL-02', at - 60 * MIN, at + 2 * 60 * MIN).at(-1)!;
    expect(Math.abs(ts(last) - at)).toBeLessThanOrEqual(TOL);
    expect(alertOf('al-sl02-offline').detail).toContain('4 Oct 10:00');
  });

  it('GN-02 low battery: the tracker reads below 3.6 V from the opened time', () => {
    const at = openedMs('al-gn02-battery');
    const after = readings('GN-02', at + 60 * MIN, at + 120 * MIN);
    expect(after.length).toBeGreaterThan(0);
    expect(Math.max(...after.map(r => r.intBattery))).toBeLessThan(3.6);
  });

  it('WT-07 over-speed: the peak reading in the window is the 104 km/h in the detail', () => {
    const a = alertOf('al-wt07-speed');
    const window = readings('WT-07', openedMs('al-wt07-speed'), closedMs('al-wt07-speed'));
    const peak = Math.max(...window.map(r => r.speedKmh));
    expect(Math.round(peak)).toBe(104);
    expect(a.detail).toContain('104 km/h');
    expect(window.some(r => r.speedKmh >= 90 && Math.abs(ts(r) - openedMs('al-wt07-speed')) <= 2 * MIN)).toBe(true);
  });

  it('FB-12 over-speed: the peak reading in the window is the 96 km/h in the detail', () => {
    const window = readings('FB-12', openedMs('al-fb12-speed'), closedMs('al-fb12-speed'));
    expect(Math.round(Math.max(...window.map(r => r.speedKmh)))).toBe(96);
    expect(alertOf('al-fb12-speed').detail).toContain('96 km/h');
    expect(window.some(r => r.speedKmh >= 90 && Math.abs(ts(r) - openedMs('al-fb12-speed')) <= 2 * MIN)).toBe(true);
  });

  it('BD-02 fault: the fault code first appears at the opened time', () => {
    const at = openedMs('al-bd02-fault');
    const first = readings('BD-02', at - 30 * MIN, at + 30 * MIN).find(r => (r.activeDtcs?.length ?? 0) > 0)!;
    expect(first).toBeDefined();
    expect(Math.abs(ts(first) - at)).toBeLessThanOrEqual(MIN);
    expect(alertOf('al-bd02-fault').detail).toContain('SPN 110 FMI 0');
  });

  it('GN-01 fuel drop: 18% fell at 02:10 with the engine off', () => {
    const at = openedMs('al-gn01-drop');
    expect(at).toBe(dubaiAt(0, 2, 10));
    const before = readings('GN-01', at - 15 * MIN, at - MIN);
    const after = readings('GN-01', at, at + 15 * MIN);
    const drop = before.at(-1)!.fuelLevelPct! - after[0].fuelLevelPct!;
    expect(drop).toBeGreaterThanOrEqual(18);
    expect(after.every(r => !r.ignition)).toBe(true);
    expect(alertOf('al-gn01-drop').detail).toContain('02:10');
  });

  it('GN-01 low fuel: the level first reaches 20% at the opened time and is refilled at the closed time', () => {
    const at = openedMs('al-gn01-lowfuel');
    const first = readings('GN-01', at - 30 * MIN, at + 30 * MIN).find(r => (r.fuelLevelPct ?? 100) <= 20)!;
    expect(first).toBeDefined();
    expect(Math.abs(ts(first) - at)).toBeLessThanOrEqual(MIN);
    const refuel = refuelTimesFor(assetOf('GN-01')).find(t => Math.abs(t - closedMs('al-gn01-lowfuel')) < MIN);
    expect(refuel).toBeDefined();
    expect(alertOf('al-gn01-lowfuel').detail).toContain('20%');
  });
});

describe('scripted events the readings now show (spec §8.7, §9)', () => {
  const yardOf = (code: string) => {
    const site = db.getState().sites.find(s => s.id === assetOf(code).homeSiteId)!;
    return site.center;
  };
  const worksOf = () => {
    const fence = db.getState().geofences.find(g => g.id === 'g-palm-crescent')!;
    const pts = (fence.shape as { points: { lat: number; lng: number }[] }).points;
    return {
      lat: pts.reduce((sum, p) => sum + p.lat, 0) / pts.length,
      lng: pts.reduce((sum, p) => sum + p.lng, 0) / pts.length,
    };
  };
  const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    haversineKm(a, b) * 1000;

  it('LB-05 towing: moved about 400 m with the ignition off, 23:40–23:50 yesterday', () => {
    const from = dubaiAt(1, 23, 35);
    const to = dubaiAt(0, 0, 0);
    const window = readings('LB-05', from, to);
    expect(window.length).toBeGreaterThan(0);
    expect(window.every(r => !r.ignition)).toBe(true);
    const yard = yardOf('LB-05');
    const farthest = Math.max(...window.map(r => metres(yard, r)));
    expect(farthest).toBeGreaterThan(350);
    expect(farthest).toBeLessThan(450);
    expect(window.some(r => r.speedKmh > 0)).toBe(true);
    expect(alertOf('al-lb05-towing').detail).toContain('400 m');
  });

  it('WL-06 leaves the Palm Crescent works at 19:10 and is back inside by 19:55', () => {
    const works = worksOf();
    const out = readings('WL-06', dubaiAt(1, 19, 15), dubaiAt(1, 19, 25));
    expect(out.length).toBeGreaterThan(0);
    expect(Math.max(...out.map(r => metres(works, r)))).toBeGreaterThan(500);
    const back = readings('WL-06', dubaiAt(1, 19, 52), dubaiAt(1, 19, 56));
    expect(back.length).toBeGreaterThan(0);
    expect(Math.min(...back.map(r => metres(works, r)))).toBeLessThan(150);
    expect(alertOf('al-wl06-geo').detail).toContain('19:10');
    expect(closedMs('al-wl06-geo')).toBe(dubaiAt(1, 19, 55));
  });
});

describe('seeded alerts the readings now show (spec §8.7, §9)', () => {
  it('TP-21 harsh driving: three events in the two days the alert names', () => {
    const a = alertOf('al-tp21-harsh');
    const from = new Date(a.openedAt).getTime();
    const events = readings('TP-21', from, ANCHOR_MS).filter(r => r.event?.startsWith('harsh'));
    expect(events).toHaveLength(3);
    for (const r of events) {
      // An accelerometer event can only happen while the truck is driving.
      expect(r.moving).toBe(true);
      expect(r.ignition).toBe(true);
      expect(ts(r)).toBeGreaterThanOrEqual(from);
      expect(ts(r)).toBeLessThanOrEqual(ANCHOR_MS);
    }
    expect(a.detail).toContain('3 events');
    expect(a.detail).toContain('last 2 days');
  });

  it('PU-51 idle: 2.5 hours with the engine on, standing at Dubai Hills, 21:00–23:30', () => {
    const a = alertOf('al-pu51-idle');
    const from = dubaiAt(1, 21, 0);
    const to = dubaiAt(1, 23, 30);
    expect(new Date(a.openedAt).getTime()).toBe(from);
    expect(closedMs('al-pu51-idle')).toBe(to);
    // The window's samples, minus the one at the closing time (the engine is off again then).
    const during = readings('PU-51', from, to - MIN);
    expect(during.length).toBeGreaterThan(0);
    expect(during.every(r => r.ignition && !r.moving && r.speedKmh < 3)).toBe(true);
    // It idles from the opened time to the closed time, not for a minute of it.
    expect(ts(during[0]) - from).toBeLessThanOrEqual(TOL);
    expect(to - ts(during.at(-1)!)).toBeLessThanOrEqual(TOL);
    expect(ts(during.at(-1)!) - ts(during[0])).toBeGreaterThan(140 * MIN);
    // Standing at the Dubai Hills site, not driving around it.
    const site = db.getState().sites.find(s => s.id === assetOf('PU-51').homeSiteId)!;
    expect(Math.max(...during.map(r => haversineKm(site.center, r) * 1000))).toBeLessThan(site.radiusM);
    expect(a.detail).toContain('2.5 hours');
    expect(a.detail).toContain('Dubai Hills');
  });

  it('EX-11 power cut: external voltage is 0 at Ras Al Khor Yard, 03:30–04:15', () => {
    const a = alertOf('al-ex11-power');
    const at = new Date(a.openedAt).getTime();
    const to = closedMs('al-ex11-power');
    expect(at).toBe(dubaiAt(0, 3, 30));
    expect(to).toBe(dubaiAt(0, 4, 15));
    const before = readings('EX-11', at - 60 * MIN, at - MIN);
    const during = readings('EX-11', at, to - MIN);
    const after = readings('EX-11', to + 5 * MIN, to + 60 * MIN);
    expect(before.length).toBeGreaterThan(0);
    expect(Math.min(...before.map(r => r.extVoltage))).toBeGreaterThan(10);
    expect(during.length).toBeGreaterThan(0);
    expect(Math.max(...during.map(r => r.extVoltage))).toBeLessThan(1);
    expect(after.length).toBeGreaterThan(0);
    expect(Math.min(...after.map(r => r.extVoltage))).toBeGreaterThan(10);
    // Running on the tracker's own battery while the vehicle feed is dead (the TP-23 pattern).
    expect(Math.max(...during.map(r => r.intBattery))).toBeLessThan(3.9);
    expect(Math.min(...before.map(r => r.intBattery))).toBeGreaterThanOrEqual(3.9);
    expect(Math.min(...after.map(r => r.intBattery))).toBeGreaterThanOrEqual(3.9);
    // A power cut is not a journey: the truck stays in the yard.
    const yard = db.getState().sites.find(s => s.id === assetOf('EX-11').homeSiteId)!;
    expect(Math.max(...during.map(r => haversineKm(yard.center, r) * 1000))).toBeLessThan(yard.radiusM);
    expect(a.detail).toContain('Ras Al Khor');
  });

  it('GR-01 after hours: out of Al Quoz Yard at 23:40, back inside by 23:55', () => {
    const a = alertOf('al-gr01-afterhours');
    expect(a.assetId).toBe('a-gr01');
    expect(new Date(a.openedAt).getTime()).toBe(dubaiAt(1, 23, 40));
    expect(closedMs('al-gr01-afterhours')).toBe(dubaiAt(1, 23, 55));
    const fence = db.getState().geofences.find(g => g.id === 'g-em-afterhours')!;
    const shape = fence.shape as GeofenceShape;
    // The fence still holds the yard: the machines parked there are inside it before the move.
    expect(insideShape(shape, db.getState().sites.find(s => s.id === 's-emirates-alq')!.center)).toBe(true);
    const night = readings('GR-01', dubaiAt(1, 20, 0), dubaiAt(0, 2, 0));
    const crossed = eventsFromReadings(shape, night);
    expect(crossed.map(e => e.type)).toEqual(['exit', 'enter']);
    // Two minutes of travel before the grader is clear of the yard fence, and the same back.
    expect(Math.abs(crossed[0].at - dubaiAt(1, 23, 40))).toBeLessThanOrEqual(3 * MIN);
    expect(Math.abs(crossed[1].at - dubaiAt(1, 23, 55))).toBeLessThanOrEqual(3 * MIN);
    const away = night.filter(r => ts(r) >= crossed[0].at && ts(r) <= crossed[1].at);
    expect(away.every(r => r.ignition)).toBe(true);
    expect(away.some(r => r.speedKmh > 0)).toBe(true);
    // It was inside before it left, and inside again after it came back.
    const before = night.filter(r => ts(r) < crossed[0].at);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every(r => insideShape(shape, r))).toBe(true);
    const after = night.filter(r => ts(r) > crossed[1].at);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(r => insideShape(shape, r))).toBe(true);
    // The seeded event and the alert agree with the crossing.
    const seeded = db.getState().geofenceEvents.filter(e => e.geofenceId === 'g-em-afterhours' && e.assetId === 'a-gr01');
    expect(seeded.map(e => e.type)).toEqual(['exit', 'enter']);
    expect(new Date(seeded[0].at).getTime()).toBe(dubaiAt(1, 23, 40));
    expect(new Date(seeded[1].at).getTime()).toBe(dubaiAt(1, 23, 55));
    expect(a.detail).toContain('23:40');
    expect(a.detail).toContain('Al Quoz Yard');
  });
});
