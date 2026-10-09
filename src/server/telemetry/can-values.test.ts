// H3.4 — every CAN parameter an asset supports has values today, and every one
// it doesn't support has none. ECU engine hours match the spec (EX-04 ≈ 8,420 h,
// BD-02 ≈ 14,980 h).
import { describe, it, expect } from 'vitest';
import { db } from '@/server/db';
import * as clock from '@/lib/clock';
import { getReadingForAsset } from '@/server/telemetry/simulator';
import { ecuHoursAt } from '@/server/telemetry/ecu';
import type { Asset, Reading } from '@/domain/types';

// Adapter parameter key → the Reading field that carries its value.
const CAN_FIELDS: Record<string, keyof Reading> = {
  rpm: 'rpm',
  engineLoad: 'engineLoadPct',
  fuelLevel: 'fuelLevelPct',
  fuelUsed: 'fuelUsedL',
  fuelRate: 'fuelRateLph',
  canOdometer: 'canOdometerKm',
  coolantTemp: 'coolantC',
  engineHours: 'engineHours',
  faultCodes: 'activeDtcs',
  adBlue: 'adBluePct',
};

const assets = db.getState().assets;

describe('CAN values (H3.4)', () => {
  for (const asset of assets as Asset[]) {
    const pairing = db.getState().pairings.find(p => p.assetId === asset.id && p.to === null);
    if (!pairing) continue; // no tracker: nothing to read
    // A tracker paired within the last day has not reported yet (FL-09 this morning).
    const freshlyPaired = clock.now() - new Date(pairing.from).getTime() < 86400000;

    it(`${asset.code}: supported CAN params have values, unsupported have none`, () => {
      const reading = getReadingForAsset(asset);
      if (freshlyPaired && !reading) return;
      expect(reading, `${asset.code} has a reading today`).not.toBeNull();
      const supported = new Set<string>(asset.canProfile.supported);
      for (const [param, field] of Object.entries(CAN_FIELDS)) {
        const value = reading![field];
        if (supported.has(param)) {
          expect(value, `${asset.code} ${param}`).not.toBeUndefined();
        } else {
          expect(value, `${asset.code} ${param} (unsupported)`).toBeUndefined();
        }
      }
    });
  }

  it('EX-04 shows about 8,420 ECU engine hours today', () => {
    const ex04 = assets.find(a => a.code === 'EX-04')! as Asset;
    expect(ecuHoursAt(ex04, clock.now())).toBeGreaterThan(8400);
    expect(ecuHoursAt(ex04, clock.now())).toBeLessThan(8440);
    const reading = getReadingForAsset(ex04);
    expect(reading?.engineHours).toBeGreaterThan(8000);
  });

  it('BD-02 shows about 14,980 ECU engine hours today', () => {
    const bd02 = assets.find(a => a.code === 'BD-02')! as Asset;
    expect(ecuHoursAt(bd02, clock.now())).toBeGreaterThan(14950);
    expect(ecuHoursAt(bd02, clock.now())).toBeLessThan(15010);
  });
});
