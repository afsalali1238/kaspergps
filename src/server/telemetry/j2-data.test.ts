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

  it('trucks cover realistic, different distances in a day (10–60 km, at least 5 km apart)', () => {
    const km = ['TP-21', 'WT-07', 'FB-14', 'LB-02', 'LB-05', 'TP-22'].map(c => distanceKm(yesterdayReadings(c)));
    for (const d of km) {
      expect(d).toBeGreaterThanOrEqual(10);
      expect(d).toBeLessThanOrEqual(60);
    }
    expect(Math.max(...km) - Math.min(...km)).toBeGreaterThanOrEqual(5);
  });

  it('a generator stays put: no movement all day', () => {
    const moved = yesterdayReadings('GN-01').filter(r => r.moving || r.speedKmh > 0);
    expect(moved.length).toBe(0);
  });
});

// Great-circle distance in km, for checking positions in tests.
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const site = (id: string) => seed.sites.find(s => s.id === id)!;
const MIN = 60000;

describe('J2 — FB-12 scripted journey (Jebel Ali Yard → Al Habtoor site, Al Barsha)', () => {
  const anchorDay = () => clock.startOfDubaiDay(clock.now());
  const fb12 = () => getReadingsForAsset(asset('FB-12'), anchorDay(), clock.now());

  it('waits at the Jebel Ali Yard, engine off, before it departs', () => {
    const yard = site('s-alnoor-ja').center;
    const wait = fb12().filter(r => {
      const t = new Date(r.deviceTime).getTime();
      return t >= clock.now() - 40 * MIN && t <= clock.now() - 10 * MIN;
    });
    expect(wait.length).toBeGreaterThan(0);
    for (const r of wait) {
      expect(r.moving).toBe(false);
      expect(r.ignition).toBe(false);
      expect(km(r, yard) * 1000).toBeLessThan(300);
    }
  });

  it('is on the road at the anchor, with the engine on and moving', () => {
    const last = fb12().at(-1)!;
    expect(last.moving).toBe(true);
    expect(last.ignition).toBe(true);
    expect(last.speedKmh).toBeGreaterThan(0);
  });

  it('heads towards Al Barsha: the track gets closer to the destination', () => {
    const dest = { lat: 25.1130, lng: 55.2000 };
    const track = fb12().filter(r => r.moving);
    // Five minutes into a 90-minute journey at the anchor: about 10 samples, about 0.8 km covered.
    expect(track.length).toBeGreaterThanOrEqual(5);
    const first = km(track[0], dest), last = km(track.at(-1)!, dest);
    expect(last).toBeLessThan(first);
    expect(first - last).toBeGreaterThan(0.4);
  });

  it('reported speed matches the distance covered (about 9–11 km/h over 14 km in 90 min)', () => {
    const track = fb12().filter(r => r.moving);
    const speeds = track.map(r => r.speedKmh).sort((a, b) => a - b);
    const median = speeds[Math.floor(speeds.length / 2)];
    expect(median).toBeGreaterThan(8);
    expect(median).toBeLessThan(12);
  });
});

describe('J2 — a rented asset sits at the renter\'s site during the rental', () => {
  const anchorDay = () => clock.startOfDubaiDay(clock.now());

  it('EX-04, rented to Marina Builders, works at Dubai Hills Project', () => {
    const target = site('s-marina-dh').center;
    const readings = getReadingsForAsset(asset('EX-04'), anchorDay(), clock.now());
    expect(readings.length).toBeGreaterThan(0);
    for (const r of readings.filter(r => r.moving)) expect(km(r, target)).toBeLessThan(1);
  });

  it('WL-06, rented to Palm Contracting, works at Palm Crescent Works', () => {
    const target = site('s-palm-pc').center;
    const readings = getReadingsForAsset(asset('WL-06'), anchorDay(), clock.now());
    expect(readings.length).toBeGreaterThan(0);
    for (const r of readings.filter(r => r.moving)) expect(km(r, target)).toBeLessThan(1);
  });
});

describe('J2 — plant and lifting stay near their working site (§9)', () => {
  // The site an asset works at: its renter's site while a rental is active, otherwise its home site.
  const workingSite = (code: string, atMs: number) => {
    const a = asset(code);
    const rental = seed.bookings.find(b => b.assetId === a.id && b.renterSiteId &&
      new Date(b.start).getTime() <= atMs && atMs <= new Date(b.end).getTime());
    return site(rental ? rental.renterSiteId! : a.homeSiteId);
  };
  const anchorDay = () => clock.startOfDubaiDay(clock.now());
  const maxOffsetM = (code: string) => {
    const centre = workingSite(code, anchorDay()).center;
    const readings = getReadingsForAsset(asset(code), anchorDay(), clock.now());
    expect(readings.length).toBeGreaterThan(0);
    return Math.max(...readings.map(r => km(r, centre) * 1000));
  };

  it.each(['EX-04', 'WL-06', 'GR-01', 'CP-03'])('plant %s stays within 300 m of its working site', code => {
    expect(maxOffsetM(code)).toBeLessThanOrEqual(300);
  });

  it.each(['TH-04', 'TH-01'])('lifting %s makes short moves: within 150 m of its working site', code => {
    expect(maxOffsetM(code)).toBeLessThanOrEqual(150);
  });

  it('a working plant asset logs real distance (the odometer accumulates)', () => {
    const day = yesterdayDubai();
    const rs = getReadingsForAsset(asset('EX-04'), day, day + DAY - 1);
    const travelled = rs.at(-1)!.gnssOdometerKm - rs[0].gnssOdometerKm;
    expect(travelled).toBeGreaterThan(0.5);
    expect(travelled).toBeLessThan(60);
  });
});
