// Feature registry for the Kasper GPS prototype.
// Every feature declares the params it needs and its phase.
// hasFeature(asset, key) = all required params in asset.canProfile.supported.
// featureVisible(session, asset, key) = hasFeature AND phase allowed by demo switch AND user has the capability.
//
// Default lists are a prototype assumption; verify against Teltonika's vehicle support lists (Intern Task 5).

import type { ParamKey, Asset, FeatureDef, Session } from '@/domain/types';

export const FEATURES: FeatureDef[] = [
  // Day one
  { key: 'location.live', label: 'Live location', needs: ['gnss'], phase: 'day_one', group: 'Seeing assets' },
  { key: 'status', label: 'Live / Idle / Stale / Offline status', needs: ['gnss', 'ignition'], phase: 'day_one', group: 'Seeing assets' },
  { key: 'history.track', label: 'Track and positions history', needs: ['gnss'], phase: 'day_one', group: 'Seeing assets' },
  { key: 'trips', label: 'Trips and distance', needs: ['gnss', 'speed', 'ignition'], phase: 'day_one', group: 'Seeing assets' },
  { key: 'alerts.offline', label: 'Offline alerts', needs: ['gnss'], phase: 'day_one', group: 'Alerts' },

  // Phase 2
  { key: 'power.status', label: 'Vehicle battery & tracker battery', needs: ['extVoltage', 'intBattery'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'connection.quality', label: 'GSM level & satellites', needs: ['gsm'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'hours.ignition', label: 'Ignition hours (Estimated)', needs: ['ignition'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'hours.ecu', label: 'Engine hours · ECU (billing-grade)', needs: ['engineHours'], adapter: ['ALL-CAN300'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'hours.ecuPartial', label: 'Engine hours · ECU · partial, not for billing', needs: ['engineHours'], adapter: ['LVCAN200'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'driving.events', label: 'Harsh braking, acceleration, cornering', needs: ['accelEvents', 'speed'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'alerts.power', label: 'Power cut & low battery alerts', needs: ['extVoltage', 'intBattery'], phase: 'phase2', group: 'Alerts' },
  { key: 'alerts.towing', label: 'Towing alerts', needs: ['movement', 'ignition'], phase: 'phase2', group: 'Alerts' },
  { key: 'fuel.level', label: 'Fuel level gauge & chart', needs: ['fuelLevel'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'fuel.used', label: 'Fuel used per day', needs: ['fuelUsed'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'alerts.fuelDrop', label: 'Sudden fuel drop alerts', needs: ['fuelLevel'], phase: 'phase2', group: 'Alerts' },
  { key: 'engine.live', label: 'Engine RPM, coolant, load', needs: ['rpm'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'odometer.can', label: 'Vehicle odometer (CAN)', needs: ['canOdometer'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'faults', label: 'Active fault codes', needs: ['faultCodes'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'adblue', label: 'AdBlue level', needs: ['adBlue'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'utilisation', label: 'Working / idling / off hours', needs: ['ignition'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'labels', label: 'Label chips and filters', needs: [], phase: 'phase2', group: 'Seeing assets' },
  { key: 'geofence.events', label: 'Geofence enter/exit events', needs: ['gnss'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'playback', label: 'Trip playback on the map', needs: ['gnss', 'speed'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'eta', label: 'ETA on the tracking page', needs: ['gnss', 'speed'], phase: 'phase2', group: 'Seeing assets' },
  { key: 'muc', label: 'Monthly Utilisation Certificate (sealed)', needs: ['engineHours'], adapter: ['ALL-CAN300'], phase: 'phase2', group: 'Certificates & billing' },
  { key: 'billing.hours', label: 'Hourly rental billing from measured hours', needs: ['engineHours', 'ignition'], phase: 'phase2', group: 'Certificates & billing' },
  { key: 'report.geofence', label: 'Geofence report', needs: ['gnss'], phase: 'phase2', group: 'Reports & downloads' },

  // Later
  { key: 'maintenance.hours', label: 'Service plans by engine hours', needs: ['engineHours'], phase: 'later', group: 'Maintenance & cost' },
  { key: 'maintenance.km', label: 'Service plans by distance', needs: ['canOdometer'], phase: 'later', group: 'Maintenance & cost' },
  { key: 'maintenance.faults', label: 'Service tasks from fault codes', needs: ['faultCodes'], phase: 'later', group: 'Maintenance & cost' },
  { key: 'cost.fuel', label: 'Fuel cost from measured fuel used', needs: ['fuelUsed'], phase: 'later', group: 'Maintenance & cost' },
  { key: 'cost.idle', label: 'Idle cost from measured idling', needs: ['engineLoad', 'fuelRate'], phase: 'later', group: 'Maintenance & cost' },
];

export function hasFeature(asset: Asset, key: string): boolean {
  const feature = FEATURES.find(f => f.key === key);
  if (!feature) return false;
  if (feature.adapter && !feature.adapter.includes(asset.canProfile.adapter)) return false;
  return feature.needs.every(need => asset.canProfile.supported.includes(need));
}

export function featurePhase(key: string): 'day_one' | 'phase2' | 'later' | null {
  return FEATURES.find(f => f.key === key)?.phase ?? null;
}

export function featureVisible(session: Session, asset: Asset, key: string, phase: 'day_one' | 'phase2' | 'later', salesView: boolean): boolean {
  const feature = FEATURES.find(f => f.key === key);
  if (!feature) return false;

  // Phase gate
  if (feature.phase === 'later' && phase !== 'later') return false;
  if (feature.phase === 'phase2' && (phase === 'day_one')) return false;

  // Hardware gate
  const has = hasFeature(asset, key);
  if (!has) {
    // Sales view: show locked card for hardware features
    if (salesView && feature.needs.length > 0) {
      return false; // shown as locked card, not as visible feature
    }
    return false;
  }

  return true;
}

export function featureForSalesView(asset: Asset, key: string, salesView: boolean): { shown: boolean; reason?: string } {
  const feature = FEATURES.find(f => f.key === key);
  if (!feature) return { shown: false };

  if (!salesView) return { shown: false };

  const has = hasFeature(asset, key);
  if (has) return { shown: false }; // already visible normally, no need for locked card

  // The adapter is the blocker (e.g. billing-grade hours on a Tier 2 pickup).
  if (feature.adapter && !feature.adapter.includes(asset.canProfile.adapter)) {
    const upgrade = feature.adapter.includes('ALL-CAN300') ? 'ALL-CAN300 (Tier 3)' : feature.adapter.join(' or ');
    return { shown: true, reason: `Needs ${upgrade}` };
  }

  if (feature.needs.length === 0) return { shown: false };

  // Determine why it's locked
  const missing = feature.needs.filter(n => !asset.canProfile.supported.includes(n));
  if (missing.length > 0) {
    if (asset.canProfile.adapter === 'none') {
      return { shown: true, reason: `Needs ${asset.canProfile.adapter === 'none' ? 'a CAN adapter (Tier 2 or Tier 3)' : 'the right CAN adapter'}` };
    }
    if (asset.canProfile.adapter === 'LVCAN200' && missing.includes('fuelRate' as ParamKey) || missing.includes('engineLoad' as ParamKey) || missing.includes('faultCodes' as ParamKey) || missing.includes('adBlue' as ParamKey)) {
      return { shown: true, reason: 'Needs ALL-CAN300 (Tier 3)' };
    }
    return { shown: true, reason: `Needs ${adapterLabelForMissing(missing)}` };
  }

  return { shown: false };
}

function adapterLabelForMissing(missing: ParamKey[]): string {
  if (missing.includes('fuelLevel' as ParamKey) || missing.includes('fuelUsed' as ParamKey) || missing.includes('rpm' as ParamKey) || missing.includes('canOdometer' as ParamKey)) {
    return 'ALL-CAN300 (Tier 3)';
  }
  if (missing.includes('fuelRate' as ParamKey) || missing.includes('engineLoad' as ParamKey) || missing.includes('faultCodes' as ParamKey) || missing.includes('adBlue' as ParamKey)) {
    return 'ALL-CAN300 (Tier 3)';
  }
  if (missing.includes('coolantTemp' as ParamKey)) {
    return 'ALL-CAN300 (Tier 3)';
  }
  return 'a CAN adapter';
}

export function tierForAsset(asset: Asset): 1 | 2 | 3 {
  if (asset.canProfile.adapter === 'ALL-CAN300') return 3;
  if (asset.canProfile.adapter === 'LVCAN200') return 2;
  return 1;
}

export function assetsNeedingFeature(assets: Asset[], key: string): Asset[] {
  return assets.filter(a => hasFeature(a, key));
}

export function isBillingGradeHours(asset: Asset): boolean {
  return asset.canProfile.adapter === 'ALL-CAN300' && asset.canProfile.supported.includes('engineHours');
}

export function hoursSourceLabel(asset: Asset): string {
  if (asset.canProfile.adapter === 'ALL-CAN300' && asset.canProfile.supported.includes('engineHours')) {
    return 'ECU';
  }
  if (asset.canProfile.adapter === 'LVCAN200' && asset.canProfile.supported.includes('engineHours')) {
    return 'ECU · partial';
  }
  return 'Estimated (ignition)';
}
