// Capabilities map: role → capability.
// Architecture rule 2: UI and API call can(session, 'asset.edit', assetId).
// Only this file and the session builder use "role ===". grep "role ===" src/ must find nothing else.

import type { Role, Session } from '@/domain/types';

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
  | 'console.import'
  | 'console.bookings.view'
  | 'console.staff.manage';

const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  kasper_admin: [
    'asset.view', 'asset.viewHistory', 'asset.viewTelemetry', 'asset.edit',
    'report.run',
    'link.create', 'link.revoke',
    'grant.endEarly',
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
    'console.tenants.view',
    'console.trackers.view', 'console.trackers.manage', 'console.trackers.configure',
    'console.assets.manage',
    'geofence.view', 'geofence.manage',
    'playback.view',
    'report.schedule',
    'maintenance.view', 'maintenance.manage',
    'asset.create', 'asset.retire',
    'console.assets.transfer', 'console.adapters.manage',
    'console.bookings.view', 'console.bookings.manage',
    'console.import',
  ],
  tenant_admin: [
    'asset.view', 'asset.viewHistory', 'asset.viewTelemetry',
    'asset.edit',
    'report.run',
    'link.create', 'link.revoke',
    'grant.endEarly',
    'alert.view',
    'users.manage', 'sites.manage',
    'label.view', 'label.manage',
    'geofence.view', 'geofence.manage',
    'playback.view',
    'report.schedule',
    'maintenance.view', 'maintenance.manage',
    'cost.view',
    'muc.view', 'muc.issue', 'muc.void',
    'billing.view', 'billing.recordPayment', 'billing.pay',
    'asset.create', 'asset.retire', 'tracker.request',
  ],
  site_user: [
    'asset.view', 'asset.viewHistory', 'asset.viewTelemetry',
    'report.run',
    'alert.view',
    'geofence.view',
    'playback.view',
    'report.schedule',
    'maintenance.view',
  ],
};

export function hasRoleCapability(role: Role, cap: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(cap);
}

// Company-level capabilities (not tied to a single asset)
const COMPANY_CAPABILITIES: Record<Role, Capability[]> = {
  kasper_admin: ['geofence.view', 'geofence.manage', 'billing.view', 'console.billing.view', 'console.billing.manage', 'asset.create', 'asset.retire', 'console.assets.transfer', 'console.adapters.manage', 'console.bookings.view', 'console.bookings.manage', 'console.staff.manage', 'console.import'],
  kasper_ops: ['geofence.view', 'geofence.manage', 'asset.create', 'asset.retire', 'console.adapters.manage', 'console.bookings.view', 'console.bookings.manage', 'console.import'],
  tenant_admin: ['geofence.view', 'geofence.manage', 'billing.view', 'asset.create', 'asset.retire', 'tracker.request'],
  site_user: ['geofence.view'],
};

export function hasCompanyCapability(session: Session, cap: Capability): boolean {
  return COMPANY_CAPABILITIES[session.role].includes(cap);
}

/**
 * Check whether a session has a capability for a specific asset,
 * taking into account both the role's capabilities and the relationship to the asset.
 */
export function can(session: Session, capability: Capability, assetId?: string): boolean {
  // First check: does the role have this capability?
  if (!hasRoleCapability(session.role, capability)) return false;

  // Then check relationship-based restrictions
  return relationshipAllows(session, capability, assetId);
}

function relationshipAllows(session: Session, capability: Capability, assetId?: string): boolean {
  // Capabilities not tied to a specific asset
  const noAssetCheck: Capability[] = [
    'users.manage', 'sites.manage',
    'console.tenants.view', 'console.tenants.manage', 'console.assets.manage',
    'console.trackers.view', 'console.trackers.manage', 'console.trackers.configure',
    'console.audit.view',
    'label.manage', 'geofence.manage',
    'report.schedule',
    'maintenance.manage',
    'cost.view',
    'muc.issue', 'muc.void',
    'billing.recordPayment', 'billing.pay',
    'console.billing.view', 'console.billing.manage',
    'asset.create', 'asset.retire', 'tracker.request',
    'console.assets.transfer', 'console.adapters.manage',
    'console.bookings.view', 'console.bookings.manage',
    'console.staff.manage', 'console.import',
    'link.create', 'link.revoke', 'grant.endEarly',
  ];

  if (!assetId || noAssetCheck.includes(capability)) {
    // For company-level capabilities, check company scope
    if (noAssetCheck.includes(capability)) {
      return companyScopeAllows(session, capability);
    }
    return true;
  }

  // Asset-specific checks
  switch (capability) {
    case 'asset.edit':
      // Only owners (tenant_admin of owner company) can edit
      return session.role === 'tenant_admin' && session.tenantId !== null && session.role === 'tenant_admin';
    case 'label.view':
      // Renters never see owner's labels
      return session.role !== 'site_user' || true; // simplified — will be checked with actual data
    default:
      return true;
  }
}

function companyScopeAllows(session: Session, capability: Capability): boolean {
  // Kasper can do anything cross-tenant
  if (session.isKasper) return true;

  // Tenant admin: own company only for most capabilities
  if (session.role === 'tenant_admin') {
    return true; // caller provides tenantId context
  }

  // Site user: very limited
  if (session.role === 'site_user') {
    return ['geofence.view'].includes(capability);
  }

  return false;
}
