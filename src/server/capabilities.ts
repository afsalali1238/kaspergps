// Permissions — spec §5. The single answer to "may this session do X?".
//
// UI and API call  can(session, cap)            for role-level and company-level checks
//                  can(session, cap, assetId)   for anything about one asset
//
// Two layers, both required (spec §5 "role has capability AND relationship to the
// asset allows it"):
//   1. ROLE_CAPABILITIES — what the role may do at all.
//   2. assetRule()       — whether the session's relationship to the asset allows it.
//
// Only this file and the session builder / capability-reasons compare roles.
// Everything else asks can(). The architecture test enforces that.

import type { Role, Session } from '@/domain/types';
import { hasFeature, featurePhase } from '@/domain/features';
import { db } from '@/server/db';
import {
  getRelationship,
  hasLiveBooking,
  isAssetVisible,
  pastRentalFor,
} from '@/server/access';

// All capabilities defined in section 5
export type Capability =
  | 'asset.view'
  | 'asset.viewHistory'
  | 'asset.viewTelemetry'
  | 'asset.edit'
  | 'report.run'
  | 'link.create'
  | 'link.revoke'
  | 'grant.endEarly'
  | 'alert.view'
  | 'alert.acknowledge'
  | 'users.manage'
  | 'sites.manage'
  | 'console.tenants.view'
  | 'console.tenants.manage'
  | 'console.assets.manage'
  | 'console.trackers.view'
  | 'console.trackers.manage'
  | 'console.trackers.configure'
  | 'console.audit.view'
  | 'label.view'
  | 'label.manage'
  | 'geofence.view'
  | 'geofence.manage'
  | 'playback.view'
  | 'report.schedule'
  | 'maintenance.view'
  | 'maintenance.manage'
  | 'cost.view'
  | 'muc.view'
  | 'muc.issue'
  | 'muc.void'
  | 'billing.view'
  | 'billing.recordPayment'
  | 'billing.pay'
  | 'console.billing.view'
  | 'console.billing.manage'
  | 'asset.create'
  | 'asset.retire'
  | 'tracker.request'
  | 'console.assets.transfer'
  | 'console.adapters.manage'
  | 'console.bookings.view'
  | 'console.bookings.manage'
  | 'console.staff.manage'
  | 'console.import';

// Layer 1: what each role may do at all (spec §5 matrix and company table).
const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  kasper_admin: [
    'asset.view', 'asset.viewHistory', 'asset.viewTelemetry', 'asset.edit',
    'report.run',
    'link.create', 'link.revoke', 'grant.endEarly',
    'alert.view', 'alert.acknowledge',
    'users.manage', 'sites.manage',
    'console.tenants.view', 'console.tenants.manage', 'console.assets.manage',
    'console.trackers.view', 'console.trackers.manage', 'console.trackers.configure',
    'console.audit.view',
    'label.view', 'label.manage',
    'geofence.view', 'geofence.manage',
    'playback.view',
    'report.schedule',
    'maintenance.view', 'maintenance.manage',
    'cost.view',
    'muc.view', 'muc.issue', 'muc.void',
    'billing.view', 'billing.recordPayment',
    'console.billing.view', 'console.billing.manage',
    'asset.create', 'asset.retire', 'tracker.request',
    'console.assets.transfer', 'console.adapters.manage',
    'console.bookings.view', 'console.bookings.manage',
    'console.staff.manage', 'console.import',
  ],
  kasper_ops: [
    'asset.view', 'asset.viewHistory', 'asset.viewTelemetry', 'asset.edit',
    'report.run',
    'link.revoke',
    'grant.endEarly',
    'alert.view', 'alert.acknowledge',
    'label.view',
    'console.tenants.view',
    'console.trackers.view', 'console.trackers.manage', 'console.trackers.configure',
    'geofence.view',
    'playback.view',
    'report.schedule',
    'maintenance.view', 'maintenance.manage',
    'asset.create', 'asset.retire', 'tracker.request',
    'console.adapters.manage',
    'console.bookings.view', 'console.bookings.manage',
    'console.import',
    'muc.view',
  ],
  tenant_admin: [
    'asset.view', 'asset.viewHistory', 'asset.viewTelemetry',
    'asset.edit',
    'report.run',
    'link.create', 'link.revoke', 'grant.endEarly',
    'alert.view', 'alert.acknowledge',
    'label.view', 'label.manage',
    'geofence.view', 'geofence.manage',
    'playback.view',
    'report.schedule',
    'maintenance.view', 'maintenance.manage',
    'cost.view',
    'muc.view', 'muc.issue', 'muc.void',
    'billing.view', 'billing.recordPayment', 'billing.pay',
    'asset.create', 'asset.retire', 'tracker.request',
    'users.manage', 'sites.manage',
  ],
  site_user: [
    'asset.view', 'asset.viewHistory', 'asset.viewTelemetry',
    'report.run',
    'alert.view',
    'label.view',
    'geofence.view',
    'playback.view',
    'report.schedule',
    'maintenance.view',
  ],
};

/** Layer 1 only. Kept for the role-level listings (dev access page, capability-reasons). */
export function hasRoleCapability(role: Role, cap: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(cap);
}

// ── Role predicates ───────────────────────────────────────────────────────────

export function hasRole(user: { role: Role }, ...roles: Role[]): boolean {
  return roles.includes(user.role);
}

export function isKasperStaff(role: Role): boolean {
  return role === 'kasper_admin' || role === 'kasper_ops';
}

/**
 * A Site User sees only their sites. The only place the role decides this is
 * here; everything else asks isSiteScoped. A site-scoped session with no sites
 * sees nothing — an empty site list never means "all sites".
 */
export function isSiteScopedRole(role: Role): boolean {
  return role === 'site_user';
}

export function isSiteScoped(session: { role: Role }): boolean {
  return isSiteScopedRole(session.role);
}

// ── can() ─────────────────────────────────────────────────────────────────────

/**
 * May this session perform `capability`?
 *
 * With no `assetId` this is the role check. Company-scoped capabilities
 * (users.manage, sites.manage, geofence.manage, …) are scoped by the caller to
 * the company it is acting on: Kasper Admin acts on any company, a Tenant Admin
 * only on their own. The caller compares tenant ids; the table has no tenant.
 *
 * With an `assetId` the relationship to that asset must also allow it (layer 2).
 * An asset the session cannot see is never allowed.
 */
export function can(session: Session, capability: Capability, assetId?: string): boolean {
  if (!hasRoleCapability(session.role, capability)) return false;
  if (assetId === undefined) return true;
  return assetRule(session, capability, assetId);
}

/**
 * Layer 2 — the asset relationship (spec §5 matrix).
 *
 * owner   : the session's company owns the asset (Tenant Admin, or Site User on
 *           an owned asset at their site).
 * renter  : an active grant (a booking whose window covers now).
 * past    : a closed or cancelled rental to the session's company (reports,
 *           certificates only).
 */
function assetRule(session: Session, capability: Capability, assetId: string): boolean {
  const asset = db.getState().assets.find(a => a.id === assetId);
  if (!asset) return false;
  // Kasper staff act across tenants (the role table already limits which caps).
  if (session.isKasper) return true;

  const visible = isAssetVisible(session, assetId);
  const rel = getRelationship(session, assetId);
  const owner = rel === 'owner' && visible;
  const past = pastRentalFor(session, assetId) !== null;

  switch (capability) {
    // Visible assets: view, telemetry, alerts, playback (inside the rental window).
    case 'asset.view':
    case 'asset.viewHistory':
    case 'asset.viewTelemetry':
    case 'alert.view':
    case 'playback.view':
      return visible;

    // Reports and certificates also cover the renter's past rental periods.
    case 'report.run':
    case 'report.schedule':
    case 'muc.view':
      return visible || past;

    // Owner only: renters and site users on rented assets never get these.
    case 'asset.edit':
    case 'link.create':
    case 'link.revoke':
    case 'grant.endEarly':
    case 'alert.acknowledge':
    case 'label.view':
    case 'label.manage':
    case 'maintenance.view':
    case 'maintenance.manage':
    case 'cost.view':
    case 'muc.issue':
    case 'muc.void':
    case 'tracker.request':
      return owner;

    // Owner, with no booking running or booked for the future.
    case 'asset.retire':
      return owner && !hasLiveBooking(assetId);

    default:
      return visible;
  }
}

// ── Feature visibility (spec §6.3 + §5) ───────────────────────────────────────

/** The capability that gates a feature, or null when the feature needs none. */
export function featureCapability(key: string): Capability | null {
  const map: Record<string, Capability> = {
    'fuel.level': 'asset.viewTelemetry',
    'fuel.used': 'asset.viewTelemetry',
    'engine.live': 'asset.viewTelemetry',
    'hours.ecu': 'asset.viewTelemetry',
    'faults': 'asset.viewTelemetry',
    'adblue': 'asset.viewTelemetry',
    'muc': 'muc.view',
    'billing.hours': 'billing.view',
    'cost.fuel': 'cost.view',
    'cost.idle': 'cost.view',
    'maintenance.hours': 'maintenance.view',
    'maintenance.km': 'maintenance.view',
    'maintenance.faults': 'maintenance.view',
    'labels': 'label.view',
    'geofence.events': 'geofence.view',
    'playback': 'playback.view',
    'eta': 'link.create',
    'report.geofence': 'report.run',
  };
  return map[key] ?? null;
}

export function isFeatureVisible(session: Session, assetId: string, featureKey: string, phase: string, _salesView: boolean): boolean {
  const asset = db.getState().assets.find(a => a.id === assetId);
  if (!asset) return false;
  const phaseMap: Record<string, 'day_one' | 'phase2' | 'later'> = {
    day_one: 'day_one',
    phase2: 'phase2',
    later: 'later',
  };
  const p = phaseMap[phase] ?? 'later';

  if (!isAssetVisible(session, assetId)) return false;

  const cap = featureCapability(featureKey);
  if (cap && !can(session, cap, assetId)) return false;

  return hasFeature(asset, featureKey) && featurePhase(featureKey) !== undefined && (featurePhase(featureKey) === 'day_one' || featurePhase(featureKey) === p || p === 'later');
}
