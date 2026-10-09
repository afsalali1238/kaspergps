// Feature registry (spec 6): a feature is available when the asset's CAN check
// carries every param it needs, and only from the adapter it belongs to.
import { describe, it, expect } from 'vitest';
import {
  FEATURES, assetsNeedingFeature, featureForSalesView, featurePhase, featureVisible,
  hasFeature, hoursSourceLabel, isBillingGradeHours, tierForAsset,
} from './features';
import { db } from '@/server/db';
import type { Asset, Session } from '@/domain/types';

const asset = (code: string): Asset => db.getState().assets.find(a => a.code === code)!;

const sessionFor = (userId: string): Session => {
  const user = db.getState().users.find(u => u.id === userId)!;
  return {
    userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
};

describe('features — hasFeature', () => {
  it('gates features on the params the CAN check left behind', () => {
    // Tier 1: day-one only.
    const fb12 = asset('FB-12');
    expect(hasFeature(fb12, 'location.live')).toBe(true);
    expect(hasFeature(fb12, 'trips')).toBe(true);
    expect(hasFeature(fb12, 'fuel.level')).toBe(false);
    expect(hasFeature(fb12, 'hours.ecu')).toBe(false);
    expect(hasFeature(fb12, 'no.such.feature')).toBe(false);

    // Tier 3: full CAN set.
    expect(hasFeature(asset('EX-07'), 'adblue')).toBe(true);
    expect(hasFeature(asset('EX-07'), 'hours.ecu')).toBe(true);
    expect(hasFeature(asset('EX-07'), 'muc')).toBe(true);

    // The CAN check removals (8.2) take the feature away again.
    expect(hasFeature(asset('EX-04'), 'adblue')).toBe(false); // adBlue sensor faulty
    expect(hasFeature(asset('EX-11'), 'faults')).toBe(false); // faultCodes not available
    expect(hasFeature(asset('BH-05'), 'fuel.level')).toBe(false); // no fuelLevel sensor
    expect(hasFeature(asset('GR-01'), 'fuel.level')).toBe(false);
    expect(hasFeature(asset('CR-05'), 'faults')).toBe(false);
    expect(hasFeature(asset('TH-04'), 'adblue')).toBe(false);
  });

  it('keeps adapter-only features to their adapter', () => {
    // LVCAN200 never carries the ALL-CAN300-only params.
    const lv = asset('PU-51');
    expect(hasFeature(lv, 'hours.ecu')).toBe(false); // ECU billing grade needs ALL-CAN300
    expect(lv.canProfile.supported.includes('engineHours')).toBe(true);
    // hours.ecuPartial is the LVCAN200 flavour of engine hours.
    const partial = FEATURES.find(f => f.key === 'hours.ecuPartial')!;
    expect(partial.adapter).toEqual(['LVCAN200']);
    expect(hasFeature(lv, 'hours.ecuPartial')).toBe(true);
    // PU-52 lost engineHours in its CAN check, so neither hour feature applies.
    expect(hasFeature(asset('PU-52'), 'hours.ecuPartial')).toBe(false);
    expect(hasFeature(asset('PU-52'), 'muc')).toBe(false);
  });

  it('lists the assets that would gain a feature', () => {
    const withFaults = assetsNeedingFeature(db.getState().assets, 'faults');
    expect(withFaults.map(a => a.code)).toContain('BD-02');
    expect(withFaults.map(a => a.code)).not.toContain('EX-11');
    expect(assetsNeedingFeature(db.getState().assets, 'labels')).toHaveLength(db.getState().assets.length); // needs nothing
  });
});

describe('features — phases and visibility', () => {
  it('knows each feature phase, and unknown keys have none', () => {
    expect(featurePhase('location.live')).toBe('day_one');
    expect(featurePhase('muc')).toBe('phase2');
    expect(featurePhase('cost.idle')).toBe('later');
    expect(featurePhase('nope')).toBe(null);
  });

  it('hides phase-2 and later features until the demo switch allows them', () => {
    const ex07 = asset('EX-07');
    const khalid = sessionFor('u-khalid');
    expect(featureVisible(khalid, ex07, 'location.live', 'day_one', false)).toBe(true);
    expect(featureVisible(khalid, ex07, 'muc', 'day_one', false)).toBe(false); // phase 2 on a day-one switch
    expect(featureVisible(khalid, ex07, 'muc', 'phase2', false)).toBe(true);
    expect(featureVisible(khalid, ex07, 'cost.idle', 'phase2', false)).toBe(false); // later
    expect(featureVisible(khalid, ex07, 'cost.idle', 'later', false)).toBe(true);
    // Hardware still gates even in the right phase.
    expect(featureVisible(khalid, asset('FB-12'), 'muc', 'phase2', false)).toBe(false);
    expect(featureVisible(khalid, ex07, 'nope', 'later', false)).toBe(false);
  });

  it('offers locked cards in the sales view only for hardware gaps', () => {
    const fb12 = asset('FB-12'); // Tier 1
    expect(featureForSalesView(fb12, 'fuel.level', true)).toEqual({
      shown: true, reason: 'Needs a CAN adapter (Tier 2 or Tier 3)',
    });
    expect(featureForSalesView(fb12, 'fuel.level', false).shown).toBe(false);
    // Already available → no locked card.
    expect(featureForSalesView(fb12, 'location.live', true).shown).toBe(false);
    // Params the asset could have with a stronger adapter.
    const pu51 = asset('PU-51'); // LVCAN200
    expect(featureForSalesView(pu51, 'hours.ecu', true)).toEqual({
      shown: true, reason: 'Needs ALL-CAN300 (Tier 3)',
    });
    // Unknown feature, or one that needs nothing at all.
    expect(featureForSalesView(fb12, 'nope', true).shown).toBe(false);
    expect(featureForSalesView(fb12, 'labels', true).shown).toBe(false);
  });
});

describe('features — tiers and hour sources', () => {
  it('derives the tier from the fitted adapter', () => {
    expect(tierForAsset(asset('FB-12'))).toBe(1);
    expect(tierForAsset(asset('PU-41'))).toBe(2);
    expect(tierForAsset(asset('EX-04'))).toBe(3);
  });

  it('labels engine hours by how they are measured', () => {
    expect(isBillingGradeHours(asset('EX-04'))).toBe(true);
    expect(isBillingGradeHours(asset('PU-41'))).toBe(false); // partial
    expect(hoursSourceLabel(asset('EX-04'))).toBe('ECU');
    expect(hoursSourceLabel(asset('PU-41'))).toBe('ECU · partial');
    expect(hoursSourceLabel(asset('FB-12'))).toBe('Estimated (ignition)');
    expect(hoursSourceLabel(asset('PU-52'))).toBe('Estimated (ignition)'); // engineHours removed
  });

  it('keeps the registry coherent', () => {
    const keys = FEATURES.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of FEATURES) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.group.length).toBeGreaterThan(0);
    }
  });
});
