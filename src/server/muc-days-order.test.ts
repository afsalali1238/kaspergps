// Utilisation and certificate day tables run in date order (29 Sep before 1 Oct),
// never in the alphabetical order of their "5 Oct" labels.
import { describe, expect, it } from 'vitest';
import { buildEcuBreakdown } from './muc';
import { db } from './db';
import * as clock from '@/lib/clock';

describe('buildEcuBreakdown day order', () => {
  it('lists days chronologically across a month boundary', () => {
    const asset = db.getState().assets.find(a => a.code === 'EX-04')!;
    const now = clock.now();
    const out = buildEcuBreakdown(asset, now - 8 * 86400000, now);
    expect(out.days.length).toBeGreaterThan(3);
    const year = clock.dubaiToIso(now).slice(0, 4);
    const ms = out.days.map(d => Date.parse(`${d.date} ${year}`));
    for (let i = 1; i < ms.length; i++) expect(ms[i]).toBeGreaterThan(ms[i - 1]);
  });
});
