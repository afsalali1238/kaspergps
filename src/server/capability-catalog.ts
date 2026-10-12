// The Features panel's catalogue (spec §10.2, J5.2/J6.5).
//
// One place that turns the capability list and the feature registry into the
// words a reviewer reads: a label that reads as a sentence ("View telemetry"), a
// group, the scope for this session ("Your sites only"), and — for the hardware
// list — why none of the assets in view can show a feature.
//
// Nothing here decides access: every ✓ comes from can(), every hardware answer
// from hasFeature(), so the panel cannot drift from the screens.

import type { FeatureDef, Role, Session } from '@/domain/types';
import { can, type Capability } from './capabilities';
import { reasonFor } from './capability-reasons';
import { FEATURES, hasFeature } from '@/domain/features';
import { db } from './db';
import { getRelationship, isAssetVisible } from './access';
import { getTrackingLinkState } from './links';
import { openAlertCount } from './alerts';

export type Relationship = 'kasper' | 'owner' | 'renter' | 'none';

// ── Labels: §6.2 capability names as words, not dotted ids (J6.5) ───────────────

export const CAPABILITY_LABELS: Record<Capability, string> = {
  'asset.view': 'View assets',
  'asset.viewTelemetry': 'View telemetry',
  'asset.viewHistory': 'View history and trips',
  'asset.edit': 'Edit asset details',
  'asset.create': 'Add assets',
  'asset.retire': 'Retire assets',
  'tracker.request': 'Request a tracker',
  'playback.view': 'Trip playback',
  'link.create': 'Create tracking links',
  'link.revoke': 'Revoke tracking links',
  'grant.endEarly': 'End a rental early',
  'alert.view': 'See alerts',
  'alert.acknowledge': 'Acknowledge alerts',
  'label.view': 'See labels',
  'label.manage': 'Manage labels',
  'geofence.view': 'See geofences',
  'geofence.manage': 'Manage geofences',
  'report.run': 'Run reports',
  'report.schedule': 'Schedule reports',
  'muc.view': 'View certificates (MUC)',
  'muc.issue': 'Issue certificates',
  'muc.void': 'Void certificates',
  'billing.view': 'View billing and invoices',
  'billing.pay': 'Pay invoices',
  'billing.recordPayment': 'Record payments',
  'maintenance.view': 'View maintenance',
  'maintenance.manage': 'Manage maintenance',
  'cost.view': 'View Cost & ROI',
  'users.manage': 'Invite and manage users',
  'sites.manage': 'Manage sites',
  'console.tenants.view': 'See tenants',
  'console.tenants.manage': 'Create and edit tenants',
  'console.assets.manage': 'Manage assets across companies',
  'console.assets.transfer': 'Transfer assets between companies',
  'console.trackers.view': 'See trackers',
  'console.trackers.manage': 'Register and pair trackers',
  'console.trackers.configure': 'Configure trackers',
  'console.adapters.manage': 'Fit CAN adapters',
  'console.bookings.view': 'See bookings',
  'console.bookings.manage': 'Manage bookings',
  'console.billing.view': 'See GPS billing',
  'console.billing.manage': 'Manage GPS billing',
  'console.audit.view': 'Read the audit log',
  'console.staff.manage': 'Manage Kasper staff',
  'console.import': 'Import data',
};

export function capabilityLabel(capability: Capability): string {
  return CAPABILITY_LABELS[capability];
}

// ── Groups (spec §10.2) ────────────────────────────────────────────────────────

export interface CapabilityGroup {
  id: string;
  label: string;
  capabilities: Capability[];
}

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  { id: 'seeing', label: 'Seeing assets', capabilities: ['asset.view', 'asset.viewTelemetry', 'asset.viewHistory', 'playback.view'] },
  { id: 'acting', label: 'Acting on assets', capabilities: ['asset.edit', 'asset.create', 'asset.retire', 'tracker.request'] },
  { id: 'rentals', label: 'Rentals & links', capabilities: ['link.create', 'link.revoke', 'grant.endEarly'] },
  { id: 'alerts', label: 'Alerts', capabilities: ['alert.view', 'alert.acknowledge'] },
  { id: 'labels', label: 'Labels & geofences', capabilities: ['label.view', 'label.manage', 'geofence.view', 'geofence.manage'] },
  { id: 'reports', label: 'Reports & downloads', capabilities: ['report.run', 'report.schedule'] },
  {
    id: 'certificates',
    label: 'Certificates & billing',
    capabilities: ['muc.view', 'muc.issue', 'muc.void', 'billing.view', 'billing.pay', 'billing.recordPayment'],
  },
  { id: 'fleet', label: 'Maintenance & cost', capabilities: ['maintenance.view', 'maintenance.manage', 'cost.view'] },
  { id: 'company', label: 'Company admin', capabilities: ['users.manage', 'sites.manage'] },
  {
    id: 'console',
    label: 'Kasper console',
    capabilities: [
      'console.tenants.view', 'console.tenants.manage', 'console.assets.manage', 'console.assets.transfer',
      'console.trackers.view', 'console.trackers.manage', 'console.trackers.configure', 'console.adapters.manage',
      'console.bookings.view', 'console.bookings.manage', 'console.billing.view', 'console.billing.manage',
      'console.audit.view', 'console.staff.manage', 'console.import',
    ],
  },
];

// ── Scope in plain words ───────────────────────────────────────────────────────

/**
 * What the capability reaches for this session — deliberately about the data and
 * the window, never about the role (the ✓/✕ already covers the role).
 */
export function scopeWords(session: Session, capability: Capability): string {
  const scoped = session.siteIds.length > 0;
  const own = scoped ? 'Your sites only' : 'Every asset you can see';
  const window = 'Inside the access window';

  switch (capability) {
    case 'asset.view':
    case 'asset.viewTelemetry':
      return own;
    case 'asset.viewHistory':
      return scoped ? 'Your sites only' : 'Own range; renters clipped to the rental';
    case 'playback.view':
      return window;
    case 'report.run':
    case 'report.schedule':
      return 'Own range; renters clipped to the rental';
    case 'asset.edit':
    case 'maintenance.view':
    case 'maintenance.manage':
    case 'cost.view':
      return 'Own assets only';
    case 'asset.create':
      return session.isKasper ? 'Any company' : 'Your company';
    case 'asset.retire':
      return 'Own assets with no live booking';
    case 'tracker.request':
      return 'Own assets without a tracker';
    case 'link.create':
      return 'Own assets only';
    case 'link.revoke':
      return 'Links on own assets';
    case 'grant.endEarly':
      return 'Own assets, while a rental runs';
    case 'alert.view':
      return 'Alerts on the assets you can see';
    case 'alert.acknowledge':
      return 'Open alerts on own assets';
    case 'label.view':
      return 'Your company’s labels on your assets';
    case 'label.manage':
      return 'Your company’s labels';
    case 'geofence.view':
      return scoped ? 'Your sites only' : 'Your company’s geofences';
    case 'geofence.manage':
      return 'Your company’s geofences';
    case 'muc.view':
      return 'Sealed certificates for own assets';
    case 'muc.issue':
      return 'Own assets with ECU hours';
    case 'muc.void':
      return 'Own assets, with a reason';
    case 'billing.view':
    case 'billing.pay':
      return 'Invoices addressed to your company';
    case 'billing.recordPayment':
      return 'Invoices your company issued';
    case 'users.manage':
    case 'sites.manage':
      return session.isKasper ? 'Any company' : 'Your company';
    case 'console.audit.view':
      return 'Every action, every company';
    case 'console.staff.manage':
      return 'Kasper staff accounts';
    default:
      return 'Every company';
  }
}

// ── Who they are ───────────────────────────────────────────────────────────────

export const ROLE_WORDS: Record<Role, string> = {
  kasper_admin: 'Kasper Admin',
  kasper_ops: 'Kasper Ops',
  tenant_admin: 'Tenant Admin',
  site_user: 'Site User',
};

/** What the role exists to do (spec §10.2, "one line on role purpose"). */
export const ROLE_PURPOSE: Record<Role, string> = {
  kasper_admin: 'Runs the platform: every company, every asset, and the Kasper console.',
  kasper_ops: 'Supports customers day to day — trackers, CAN adapters and bookings, but no user administration.',
  tenant_admin: 'Runs the company’s fleet in Kasper: assets, people, rentals, certificates and billing.',
  site_user: 'Sees the assets and alerts at the sites they are given. Read-only.',
};

/** The site names this session is limited to, or the whole company when unrestricted. */
export function siteWords(session: Session): string {
  const state = db.getState();
  if (session.siteIds.length === 0) {
    if (session.isKasper) return `All sites · ${state.tenants.length} companies`;
    const company = state.tenants.find(t => t.id === session.tenantId);
    return company ? `All sites · ${company.name}` : 'All sites';
  }
  const names = session.siteIds
    .map(id => state.sites.find(s => s.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  return names.length > 0 ? `Sites: ${names.join(' · ')}` : 'No sites assigned';
}

// ── Capability rows ────────────────────────────────────────────────────────────

export interface CapabilityRow {
  capability: Capability;
  label: string;
  held: boolean;
  scope: string;
  /** Plain-words reason from capability-reasons.ts; null when the capability is held. */
  reason: string | null;
}

export const ALL_CAPABILITIES: Capability[] = CAPABILITY_GROUPS.flatMap(g => g.capabilities);

/**
 * Every capability in the registry for this session, held or not — the role's
 * answer via can(), and the same answer again against `assetId` when the reviewer
 * is looking at one asset. The reason for a ✕ always comes from
 * capability-reasons.ts, so the panel and the hidden-item explanations cannot
 * disagree.
 */
export function capabilityRows(session: Session, assetId?: string): CapabilityRow[] {
  const relationship: Relationship = assetId ? getRelationship(session, assetId) : 'none';
  return ALL_CAPABILITIES.map(capability => {
    const held = can(session, capability, assetId);
    return {
      capability,
      label: capabilityLabel(capability),
      held,
      scope: scopeWords(session, capability),
      reason: held ? null : reasonFor(session, capability, relationship) ?? 'Your role doesn’t include this.',
    };
  });
}

// ── Hardware in the current view ───────────────────────────────────────────────

export type Tier = 1 | 2 | 3;

export function tierOf(adapter: string): Tier {
  if (adapter === 'ALL-CAN300') return 3;
  if (adapter === 'LVCAN200') return 2;
  return 1;
}

export interface TierSummary {
  total: number;
  counts: Record<Tier, number>;
  /** "10 assets · all Tier 1 (no CAN)" or "12 assets · T1 3 · T2 2 · T3 7". */
  sentence: string;
}

export function tierSummary(session: Session): TierSummary {
  const assets = db.getState().assets.filter(a => isAssetVisible(session, a.id));
  const counts: Record<Tier, number> = { 1: 0, 2: 0, 3: 0 };
  for (const a of assets) counts[tierOf(a.canProfile.adapter)] += 1;
  const total = assets.length;
  const sentence = total === 0
    ? 'No assets in your current view'
    : counts[2] === 0 && counts[3] === 0
      ? `${total} assets · all Tier 1 (no CAN)`
      : [
        `${total} assets`,
        counts[1] > 0 ? `T1 ${counts[1]}` : '',
        counts[2] > 0 ? `T2 ${counts[2]}` : '',
        counts[3] > 0 ? `T3 ${counts[3]}` : '',
      ].filter(Boolean).join(' · ');
  return { total, counts, sentence };
}

export interface FeatureRow {
  key: string;
  label: string;
  group: string;
  /** Assets in the view that can show this feature. */
  available: number;
  total: number;
  /** Why none can, when none can. */
  reason: string | null;
}

/** The missing parameter in the words a non-engineer reads. */
const PARAM_WORDS: Record<string, string> = {
  fuelLevel: 'fuel level',
  fuelUsed: 'fuel used',
  fuelRate: 'fuel rate',
  rpm: 'RPM',
  canOdometer: 'the vehicle odometer',
  coolantTemp: 'coolant temperature',
  engineLoad: 'engine load',
  engineHours: 'engine hours',
  faultCodes: 'fault codes',
  adBlue: 'AdBlue',
  gsm: 'GSM signal',
  extVoltage: 'battery voltage',
  intBattery: 'the tracker battery',
  accelEvents: 'harsh-driving events',
  movement: 'movement',
  speed: 'speed',
  ignition: 'ignition',
  gnss: 'GPS',
};

/**
 * Every feature in the registry (§6.3) against the assets this session can see,
 * with the reason none of them shows it when that is the case.
 */
export function featureAvailability(session: Session): FeatureRow[] {
  const assets = db.getState().assets.filter(a => isAssetVisible(session, a.id));
  const total = assets.length;
  const anyCan = assets.some(a => a.canProfile.adapter !== 'none');

  return FEATURES.map(feature => {
    const available = assets.filter(a => hasFeature(a, feature.key)).length;
    let reason: string | null = null;
    if (available === 0 && total > 0) {
      reason = featureReason(assets, feature, anyCan);
    }
    return { key: feature.key, label: feature.label, group: feature.group, available, total, reason };
  });
}

function featureReason(
  assets: { canProfile: { adapter: string; supported: string[] } }[],
  feature: FeatureDef,
  anyCan: boolean,
): string {
  if (!anyCan) return 'None of these assets has a CAN adapter.';
  if (feature.adapter && feature.adapter.length > 0 && !assets.some(a => feature.adapter!.includes(a.canProfile.adapter as never))) {
    return `Needs ${feature.adapter.join(' or ')} — none of these assets has one.`;
  }
  const missing = new Set<string>();
  for (const a of assets) for (const p of feature.needs) if (!a.canProfile.supported.includes(p)) missing.add(p);
  const words = Array.from(missing).map(p => PARAM_WORDS[p] ?? p);
  if (words.length === 0) return 'None of these assets supports this.';
  const head = words.length === 1
    ? words[0]
    : `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
  return `No CAN data for ${head}.`;
}

// ── Right now ──────────────────────────────────────────────────────────────────

export interface RightNowCounts {
  assets: number;
  owned: number;
  rentedIn: number;
  rentedOut: number;
  openAlerts: number;
  activeLinks: number;
}

/** Counts for the panel's "Right now" block (spec §10.2). */
export function rightNowCounts(session: Session): RightNowCounts {
  const state = db.getState();
  const visible = state.assets.filter(a => isAssetVisible(session, a.id));
  const owned = session.tenantId === null
    ? visible.length
    : visible.filter(a => a.ownerTenantId === session.tenantId).length;
  const rentedIn = session.tenantId === null
    ? 0
    : visible.filter(a => a.ownerTenantId !== session.tenantId).length;
  const rentedOut = session.tenantId === null
    ? 0
    : state.assets.filter(a =>
      a.ownerTenantId === session.tenantId &&
      state.bookings.some(b => b.assetId === a.id && b.renterTenantId !== session.tenantId && b.status === 'active'),
    ).length;
  const visibleIds = new Set(visible.map(a => a.id));
  const activeLinks = state.trackingLinks.filter(l =>
    visibleIds.has(l.assetId) && getTrackingLinkState(l.token) === 'active',
  ).length;

  return {
    assets: visible.length,
    owned,
    rentedIn,
    rentedOut,
    openAlerts: openAlertCount(session),
    activeLinks,
  };
}
