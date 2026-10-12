// J2: simulated data is believable at the anchor (spec §8.2, §9).
import { describe, it, expect } from 'vitest';
import { seed } from '@/server/seed/data';
import { getReadingsForAsset, computeStatus } from '@/server/telemetry/simulator';
import * as clock from '@/lib/clock';

const DAY = 86400000;
const yesterdayDubai = () => clock.startOfDubaiDay(clock.now()) - DAY;
const asset = (code: string) => seed.assets.find(a => a.code === code)!;
const hhmm = (ms: number) => clock.formatDubaiTime(ms);

describe('J2 — the day starts at Dubai midnight', () => {
  it('a working shift starts at 07:00 Dubai, not 11:00', () => {
    const day = yesterdayDubai();
    const readings = getReadingsForAsset(asset('EX-04'), day, day + DAY - 1);
    const working = readings.filter(r => r.ignition);
    expect(working.length).toBeGreaterThan(0);
    const first = new Date(working[0].deviceTime).getTime();
    expect(hhmm(first)).toBe('07:00');
  });

  it('the day key is Dubai midnight, four hours before UTC midnight', () => {
    const day = yesterdayDubai();
    expect(new Date(day).getUTCHours()).toBe(20);
  });
});

describe('J2 — working assets read as working at the anchor', () => {
  it.each(['EX-04', 'WL-06', 'TH-01', 'TP-21', 'BH-05', 'TH-04', 'PU-51'])(
    '%s is live: engine on and moving in the last 30 minutes',
    code => {
      const a = asset(code);
      expect(computeStatus(a)).toBe('live');
      const day = clock.startOfDubaiDay(clock.now());
      const recent = getReadingsForAsset(a, clock.now() - 30 * 60000, clock.now())
        .filter(r => r.ignition && r.moving && r.speedKmh >= 3);
      expect(recent.length).toBeGreaterThan(0);
      expect(day).toBeLessThanOrEqual(clock.now());
    }
  );

  it('EX-04 shows working engine values: rpm 1,200–2,100 at speed', () => {
    const a = asset('EX-04');
    const last = getReadingsForAsset(a, clock.now() - 10 * 60000, clock.now()).at(-1)!;
    expect(last.ignition).toBe(true);
    expect(last.rpm).toBeGreaterThanOrEqual(1200);
    expect(last.rpm).toBeLessThanOrEqual(2100);
  });
});

describe('J2 — parked assets', () => {
  it('a parked asset reports every 10 minutes', () => {
    const day = yesterdayDubai();
    const parked = getReadingsForAsset(asset('CR-08'), day, day + DAY - 1);
    expect(parked.length).toBeGreaterThan(10);
    for (let i = 1; i < parked.length; i++) {
      const gap = new Date(parked[i].deviceTime).getTime() - new Date(parked[i - 1].deviceTime).getTime();
      expect(gap).toBe(10 * 60000);
    }
  });

  it('a parked asset keeps one heading all day (it does not spin)', () => {
    const day = yesterdayDubai();
    const headings = new Set(getReadingsForAsset(asset('CR-08'), day, day + DAY - 1).map(r => r.heading));
    expect(headings.size).toBe(1);
  });
});

describe('J2 — fuel levels vary by asset and move with use', () => {
  it('Tier 3 assets do not all read the same fuel level at the anchor', () => {
    const codes = ['EX-04', 'WL-06', 'TH-01'];
    const levels = codes.map(code => {
      const last = getReadingsForAsset(asset(code), clock.now() - 5 * 60000, clock.now()).at(-1)!;
      return last.fuelLevelPct;
    });
    expect(levels.every(v => v !== undefined)).toBe(true);
    expect(new Set(levels).size).toBeGreaterThan(1);
    expect(levels.every(v => v !== 53)).toBe(true);
  });

  it('GN-01 drops about 18 points at 02:10 Dubai', () => {
    const day = yesterdayDubai();
    const readings = getReadingsForAsset(asset('GN-01'), day, day + DAY - 1)
      .filter(r => r.fuelLevelPct !== undefined);
    const before = readings.filter(r => hhmm(new Date(r.deviceTime).getTime()) < '02:10').at(-1)!;
    const after = readings.find(r => hhmm(new Date(r.deviceTime).getTime()) >= '02:10')!;
    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    expect(before.fuelLevelPct! - after.fuelLevelPct!).toBeGreaterThan(15);
  });
});

describe('J2 — movement by class (§9)', () => {
  const yesterdayReadings = (code: string) => {
    const day = yesterdayDubai();
    return getReadingsForAsset(asset(code), day, day + DAY - 1);
  };
  const distanceKm = (readings: ReturnType<typeof yesterdayReadings>) =>
    readings.length ? readings[readings.length - 1].gnssOdometerKm - readings[0].gnssOdometerKm : 0;

  it('trucks drive between sites at 20–90 km/h', () => {
    const moving = yesterdayReadings('TP-21').filter(r => r.moving).map(r => r.speedKmh);
    expect(moving.length).toBeGreaterThan(20);
    expect(Math.max(...moving)).toBeGreaterThanOrEqual(40);
    expect(Math.max(...moving)).toBeLessThanOrEqual(90);
    expect(Math.min(...moving)).toBeGreaterThanOrEqual(20);
  });

  it('trucks do not all cover the same distance in a day', () => {
    const km = ['FB-12', 'TP-21', 'WT-07', 'FB-14'].map(c => Math.round(distanceKm(yesterdayReadings(c))));
    expect(new Set(km).size).toBeGreaterThan(1);
  });

  it('a generator stays put: no movement all day', () => {
    const moved = yesterdayReadings('GN-01').filter(r => r.moving || r.speedKmh > 0);
    expect(moved.length).toBe(0);
  });
});
