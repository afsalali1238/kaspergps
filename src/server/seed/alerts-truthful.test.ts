// J3 proof: seeded alerts tell the truth about the readings (spec §8.7, §8.10).
// Each alert that the readings can show is checked against them: the time it
// opened, the time it closed, and the time written in its detail text.
// Alerts whose event the readings do not yet show are listed as todo, not passed.
import { describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { ANCHOR_MS, dubaiAt } from '@/server/seed/data';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { refuelTimesFor } from '@/server/telemetry/fuel';
import { haversineKm } from '@/server/telemetry/movement';
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

// Events the readings do not show yet. They stay todo until the simulator produces them
// (spec §9 scripted movements). Do not turn these into passing tests by weakening the check.
describe.todo('seeded alerts the readings do not show yet');
it.todo('LB-05 after-hours exit from Al Quoz Yard, 5 Oct 23:40 (spec §8.7, §9) — LB-05 is homed at DIP, not at the Al Quoz Yard fence, so the crossing needs the spec resolved first');
it.todo('EX-11 power cut at Ras Al Khor Yard (seed alert) — external voltage stays on in readings');
it.todo('PU-51 idle at Dubai Hills (seed alert) — readings show ignition off, not idling');
it.todo('FB-12 over-speed 96 km/h (seed alert) — highest FB-12 speed in the past week is 84 km/h');
it.todo('TP-21 harsh driving, 3 events (spec §8.7) — readings carry no accelerometer events');
