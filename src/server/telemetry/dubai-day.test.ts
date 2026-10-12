// Shifts are Dubai local time (§9: 07:00–18:00), so at the demo anchor
// (10:00 Dubai) working plant is running, not parked.
import { describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { getReadingForAsset, getReadingsForAsset } from './simulator';
import * as clock from '@/lib/clock';

const asset = (code: string) => db.getState().assets.find(a => a.code === code)!;

describe('simulator day boundary', () => {
  it('EX-04 is working at the anchor', () => {
    const r = getReadingForAsset(asset('EX-04'))!;
    expect(r.ignition).toBe(true);
    expect(r.rpm!).toBeGreaterThanOrEqual(1200);
    expect(r.engineLoadPct!).toBeGreaterThanOrEqual(35);
  });

  it("yesterday's shift starts after 06:00 and ends by 19:00 Dubai, not 11:00–22:00", () => {
    const now = clock.now();
    const yStart = clock.startOfDubaiDay(now) - 86400000;
    const readings = getReadingsForAsset(asset('WL-03'), yStart, yStart + 86400000 - 1);
    const on = readings.filter(r => r.ignition).map(r => new Date(r.deviceTime).getTime());
    expect(on.length).toBeGreaterThan(0);
    const hour = (ms: number) => (ms - yStart) / 3600000;
    expect(hour(Math.min(...on))).toBeLessThan(8);
    expect(hour(Math.max(...on))).toBeLessThanOrEqual(19);
  });
});
