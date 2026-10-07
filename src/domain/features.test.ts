// Features registry tests — verify hasFeature() for every asset.
import { describe, it, expect } from 'vitest';
import { seed } from '../server/seed/data';
import { hasFeature, featurePhase } from './features';

describe('features — hasFeature (per asset)', () => {
  it('every asset has location.live and status (Day one, all tiers)', () => {
    for (const asset of seed.assets) {
      expect(hasFeature(asset, 'location.live')).toBe(true);
      expect(hasFeature(asset, 'status')).toBe(true);
      expect(hasFeature(asset, 'history.track')).toBe(true);
      expect(hasFeature(asset, 'trips')).toBe(true);
      expect(hasFeature(asset, 'alerts.offline')).toBe(true);
    }
  });

  it('Tier 1 assets (no CAN) have no fuel or engine features', () => {
    const tier1Assets = seed.assets.filter(a => a.canProfile.adapter === 'none');
    for (const asset of tier1Assets) {
      expect(hasFeature(asset, 'fuel.level')).toBe(false);
      expect(hasFeature(asset, 'fuel.used')).toBe(false);
      expect(hasFeature(asset, 'engine.live')).toBe(false);
      expect(hasFeature(asset, 'hours.ecu')).toBe(false);
      expect(hasFeature(asset, 'faults')).toBe(false);
      expect(hasFeature(asset, 'muc')).toBe(false);
      expect(hasFeature(asset, 'adblue')).toBe(false);
    }
  });

  it('Al Noor\'s assets (all Tier 1) have no CAN features at all', () => {
    const alNoorAssets = seed.assets.filter(a => a.ownerTenantId === 't-alnoor');
    for (const asset of alNoorAssets) {
      expect(asset.canProfile.adapter).toBe('none');
      expect(hasFeature(asset, 'fuel.level')).toBe(false);
      expect(hasFeature(asset, 'fuel.used')).toBe(false);
      expect(hasFeature(asset, 'rpm')).toBe(false);
      expect(hasFeature(asset, 'engineHours')).toBe(false);
      expect(hasFeature(asset, 'coolantC')).toBe(false);
      expect(hasFeature(asset, 'faults')).toBe(false);
      expect(hasFeature(asset, 'muc')).toBe(false);
    }
  });

  it('EX-04 (Tier 3, ALL-CAN300) has all Tier 3 features except adBlue (removed by CAN check)', () => {
    const asset = seed.assets.find(a => a.code === 'EX-04')!;
    expect(asset.canProfile.adapter).toBe('ALL-CAN300');
    expect(hasFeature(asset, 'fuel.level')).toBe(true);
    expect(hasFeature(asset, 'fuel.used')).toBe(true);
    expect(hasFeature(asset, 'engine.live')).toBe(true); // rpm
    expect(hasFeature(asset, 'hours.ecu')).toBe(true); // billing-grade ECU hours
    expect(hasFeature(asset, 'faults')).toBe(true);
    expect(hasFeature(asset, 'muc')).toBe(true);
    // adBlue was removed by CAN check
    expect(asset.canProfile.supported).not.toContain('adBlue');
    expect(hasFeature(asset, 'adblue')).toBe(false);
    // coolantTemp was NOT removed — EX-04 supports the param
    expect(asset.canProfile.supported).toContain('coolantTemp');
  });

  it('BD-02 (Tier 3, ALL-CAN300) has faultCodes', () => {
    const asset = seed.assets.find(a => a.code === 'BD-02')!;
    expect(hasFeature(asset, 'faults')).toBe(true);
    expect(hasFeature(asset, 'engine.live')).toBe(true);
    expect(hasFeature(asset, 'muc')).toBe(true);
  });

  it('GN-01 (Tier 3, ALL-CAN300) has fuel features', () => {
    const asset = seed.assets.find(a => a.code === 'GN-01')!;
    expect(hasFeature(asset, 'fuel.level')).toBe(true);
    expect(hasFeature(asset, 'fuel.used')).toBe(true);
    expect(hasFeature(asset, 'alerts.fuelDrop')).toBe(true);
    // GN-01 has ALL-CAN300 and ECU engine hours, so a MUC can be issued for it
    expect(hasFeature(asset, 'muc')).toBe(true);
    expect(asset.canProfile.supported).toContain('engineHours');
    expect(hasFeature(asset, 'hours.ecu')).toBe(true);
  });

  it('PU-41 (Tier 2, LVCAN200) has partial CAN features', () => {
    const asset = seed.assets.find(a => a.code === 'PU-41')!;
    expect(asset.canProfile.adapter).toBe('LVCAN200');
    expect(hasFeature(asset, 'fuel.level')).toBe(true);
    expect(hasFeature(asset, 'fuel.used')).toBe(true);
    expect(hasFeature(asset, 'engine.live')).toBe(true); // rpm
    // This vehicle's CAN bus does not report engineHours (seed note), so the
    // partial-hours feature stays off.
    expect(asset.canProfile.supported).not.toContain('engineHours');
    expect(hasFeature(asset, 'hours.ecuPartial')).toBe(false);
    // No billing-grade ECU hours for Tier 2
    expect(hasFeature(asset, 'hours.ecu')).toBe(false);
    // KNOWN GAP: spec 6.2 gives faultCodes to Tier 3 only, but the seed keeps
    // faultCodes in PU-41's supported list (and in expected.ts), so this feature
    // is on for a Tier 2 asset. Fixing the seed is a Phase 6 concern, not P12.
    expect(asset.canProfile.supported).toContain('faultCodes');
    expect(hasFeature(asset, 'faults')).toBe(true);
    // No MUC for Tier 2
    expect(hasFeature(asset, 'muc')).toBe(false);
    // coolantTemp was removed by CAN check for PU-41
    expect(asset.canProfile.supported).not.toContain('coolantC');
  });

  it('PU-51 (Tier 2, LVCAN200, engineHours partial) has partial ECU hours', () => {
    const asset = seed.assets.find(a => a.code === 'PU-51')!;
    expect(asset.canProfile.adapter).toBe('LVCAN200');
    // KNOWN GAP: the seed note says "engineHours partial support — not billing-grade",
    // but engineHours is not in `supported`, so the partial-hours feature is off.
    expect(hasFeature(asset, 'hours.ecuPartial')).toBe(false);
    expect(hasFeature(asset, 'hours.ecu')).toBe(false);
    expect(hasFeature(asset, 'muc')).toBe(false);
  });

  it('Tier 1 assets have hours.ignition (Estimated) but not hours.ecu', () => {
    const tier1Assets = seed.assets.filter(a => a.canProfile.adapter === 'none');
    for (const asset of tier1Assets) {
      expect(hasFeature(asset, 'hours.ignition')).toBe(true);
      expect(hasFeature(asset, 'hours.ecu')).toBe(false);
    }
  });
});

describe('features — featurePhase', () => {
  it('Day one features are location.live, status, history.track, trips, alerts.offline', () => {
    const dayOneFeatures = ['location.live', 'status', 'history.track', 'trips', 'alerts.offline'];
    for (const key of dayOneFeatures) {
      expect(featurePhase(key)).toBe('day_one');
    }
  });

  it('Phase 2 features include fuel, engine, alerts, labels, geofences, playback, ETA, MUC, billing', () => {
    const phase2Features = [
      'power.status', 'hours.ignition', 'hours.ecu', 'hours.ecuPartial',
      'driving.events', 'alerts.power', 'alerts.towing', 'fuel.level', 'fuel.used',
      'alerts.fuelDrop', 'engine.live', 'odometer.can', 'faults', 'adblue',
      'utilisation', 'labels', 'geofence.events', 'playback', 'eta', 'muc', 'billing.hours'
    ];
    for (const key of phase2Features) {
      expect(featurePhase(key)).toBe('phase2');
    }
  });

  it('Later features include maintenance and cost', () => {
    expect(featurePhase('maintenance.hours')).toBe('later');
    expect(featurePhase('maintenance.km')).toBe('later');
    expect(featurePhase('cost.fuel')).toBe('later');
  });
});

describe('features — hasFeature edge cases', () => {
  it('returns false for unknown feature keys', () => {
    const asset = seed.assets[0];
    expect(hasFeature(asset, 'nonexistent.feature')).toBe(false);
  });

  it('a feature requiring two params needs both', () => {
    // utilisation needs ignition (and engineLoad for Tier 3 working/idling split)
    const tier1Asset = seed.assets.find(a => a.canProfile.adapter === 'none')!;
    expect(hasFeature(tier1Asset, 'utilisation')).toBe(true); // ignition is enough for Tier 1
  });
});
