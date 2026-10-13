import { it } from 'vitest';
import { db, resetDb } from '@/server/db';
import { getReadingsForAsset, getReadingForAsset } from '@/server/telemetry/simulator';
import { groupTrips } from '@/domain/trips';
import { resolveTrackingLink } from '@/server/links';
import { ANCHOR_MS } from '@/server/seed/data';
import * as clock from '@/lib/clock';
const DAY = 86400000;
it('measure', () => {
  resetDb(); clock.setOffsetMs(0);
  const a = (c: string) => db.getState().assets.find(x => x.code === c)!;
  const out: string[] = [];
  for (const c of ['EX-04', 'WL-06', 'FB-12', 'TP-21', 'LB-05', 'WT-07', 'CR-05', 'SL-02']) {
    const week = groupTrips(getReadingsForAsset(a(c), ANCHOR_MS - 7 * DAY, ANCHOR_MS)).length;
    const perDay: number[] = [];
    for (let d = 7; d >= 1; d--) perDay.push(groupTrips(getReadingsForAsset(a(c), ANCHOR_MS - d * DAY, ANCHOR_MS - (d - 1) * DAY)).length);
    out.push(`${c}: week ${week}, per day ${perDay.join(',')}`);
  }
  const dest = { lat: 25.1130, lng: 55.2000 };
  for (const m of [0, 10, 20, 30, 40, 60, 90, 100]) {
    clock.setOffsetMs(m * 60000);
    const r = getReadingForAsset(a('FB-12'))!;
    const km = Math.hypot((r.lat - dest.lat) * 111, (r.lng - dest.lng) * 101);
    const eta = resolveTrackingLink('k7Qm2Xc9TpLw4ZaN8rVb3Ye5')?.eta;
    out.push(`+${m}: ${km.toFixed(2)} km, speed ${r.speedKmh.toFixed(1)}, eta ${eta ? new Date(eta.etaAt + 4 * 3600000).toISOString().slice(11, 16) + ' ' + eta.state : '-'}`);
  }
  clock.setOffsetMs(0);
  console.log(out.join('\n'));
}, 120000);
