// Capability reasons for the Features panel and Show hidden mode.
// These explain WHY a user can't do something, in plain words.

import type { Session } from '@/domain/types';

export type Capability = 
  | 'asset.view' | 'asset.viewHistory' | 'asset.viewTelemetry' | 'asset.edit'
  | 'report.run' | 'link.create' | 'link.revoke' | 'grant.endEarly'
  | 'alert.view' | 'alert.acknowledge'
  | 'users.manage' | 'sites.manage'
  | 'console.tenants.view' | 'console.tenants.manage' | 'console.assets.manage'
  | 'console.trackers.view' | 'console.trackers.manage' | 'console.trackers.configure'
  | 'console.audit.view'
  | 'label.view' | 'label.manage'
  | 'geofence.view' | 'geofence.manage'
  | 'playback.view' | 'report.schedule'
  | 'maintenance.view' | 'maintenance.manage'
  | 'cost.view'
  | 'muc.view' | 'muc.issue' | 'muc.void'
  | 'billing.view' | 'billing.recordPayment' | 'billing.pay'
  | 'console.billing.view' | 'console.billing.manage'
  | 'asset.create' | 'asset.retire' | 'tracker.request'
  | 'console.assets.transfer' | 'console.adapters.manage'
  | 'console.bookings.view' | 'console.bookings.manage'
  | 'console.staff.manage' | 'console.import';

export function reasonFor(session: Session, capability: Capability, assetRelationship?: 'kasper' | 'owner' | 'renter' | 'none'): string | null {
  const role = session.role;

  switch (capability) {
    case 'asset.view':
    case 'asset.viewHistory':
    case 'asset.viewTelemetry':
      if (assetRelationship === 'none') {
        return assetNotVisibleReason(session);
      }
      if (assetRelationship === 'renter') {
        if (session.role === 'site_user') {
          return null; // site users see rented assets at their site
        }
        return 'Renters see readings only inside their rental window.';
      }
      return null;

    case 'asset.edit':
      if (role === 'kasper_admin' || role === 'kasper_ops') return null;
      if (role === 'tenant_admin') {
        return 'Tenant Admins can edit only their own company\'s assets — the company decides how its fleet is organised.';
      }
      if (role === 'site_user') {
        return 'Site Users can\'t edit assets — the company decides how its fleet is organised.';
      }
      return 'Your role doesn\'t allow editing assets.';

    case 'report.run':
      if (assetRelationship === 'renter') {
        return 'Renters can run reports only for their rental periods, including past rentals.';
      }
      return null;

    case 'link.create':
      if (role === 'kasper_ops') {
        return 'Kasper Ops can\'t create tracking links — they support existing ones.';
      }
      if (role === 'tenant_admin' && assetRelationship === 'renter') {
        return 'Renters can\'t create tracking links — only the asset owner can.';
      }
      if (role === 'site_user') {
        return 'Site Users can\'t create tracking links.';
      }
      if (assetRelationship === 'none') {
        return 'You can\'t see this asset, so you can\'t create a link for it.';
      }
      return null;

    case 'link.revoke':
      if (role === 'site_user') {
        return 'Site Users can\'t revoke tracking links.';
      }
      if (assetRelationship === 'renter') {
        return 'Renters can\'t revoke the owner\'s tracking links.';
      }
      return null;

    case 'grant.endEarly':
      if (role === 'site_user') {
        return 'Site Users can\'t end a rental early.';
      }
      if (assetRelationship === 'renter') {
        return 'Renters can\'t end their own rental early — only the owner can.';
      }
      return null;

    case 'alert.view':
      if (assetRelationship === 'none') return assetNotVisibleReason(session);
      return null;

    case 'alert.acknowledge':
      if (role === 'site_user') {
        return 'Site Users can\'t acknowledge alerts — only the company admin or Kasper can.';
      }
      if (assetRelationship === 'renter') {
        return 'Renters can\'t acknowledge alerts on the owner\'s asset.';
      }
      return null;

    case 'users.manage':
    case 'sites.manage':
      if (role === 'kasper_ops') {
        return 'Kasper Ops can\'t manage users or sites — that\'s for Kasper Admin or the tenant.';
      }
      if (role === 'site_user') {
        return 'Site Users can\'t manage users or sites.';
      }
      if (role === 'tenant_admin') {
        return null; // own company
      }
      return null;

    case 'console.tenants.view':
      if (!session.isKasper) return 'Only Kasper staff can view the console.';
      return null;

    case 'console.tenants.manage':
    case 'console.assets.manage':
      if (role !== 'kasper_admin') {
        return 'Only Kasper Admin can manage tenants and assets across the platform.';
      }
      return null;

    case 'console.trackers.view':
    case 'console.trackers.manage':
    case 'console.trackers.configure':
      if (role === 'tenant_admin') {
        return 'Trackers are managed by Kasper — contact Kasper to change hardware.';
      }
      if (role === 'site_user') {
        return 'Trackers are managed by Kasper — contact Kasper to change hardware.';
      }
      return null;

    case 'console.audit.view':
      if (role !== 'kasper_admin') {
        return 'Only Kasper Admin can view the audit log.';
      }
      return null;

    case 'label.view':
      if (assetRelationship === 'renter') {
        return 'Renters don\'t see the owner\'s labels.';
      }
      if (role === 'site_user') {
        return 'Site Users see their company\'s labels on their company\'s assets.';
      }
      return null;

    case 'label.manage':
      if (role === 'kasper_ops') {
        return 'Kasper Ops can\'t manage labels — only the tenant admin can.';
      }
      if (role === 'site_user') {
        return 'Site Users can\'t edit labels — the company admin decides labels.';
      }
      if (assetRelationship === 'renter') {
        return 'Renters don\'t see the owner\'s labels, so they can\'t manage them.';
      }
      return null;

    case 'geofence.view':
      if (assetRelationship === 'renter') {
        return 'Renters don\'t see the owner\'s geofences.';
      }
      if (role === 'site_user') {
        return 'Site Users see their company\'s geofences at their sites only.';
      }
      return null;

    case 'geofence.manage':
      if (role === 'kasper_ops') {
        return 'Kasper Ops can\'t manage geofences — only the tenant admin can.';
      }
      if (role === 'site_user') {
        return 'Site Users can\'t manage geofences.';
      }
      if (assetRelationship === 'renter') {
        return 'Renters don\'t see the owner\'s geofences, so they can\'t manage them.';
      }
      return null;

    case 'playback.view':
      if (assetRelationship === 'renter') {
        return 'Renters can play back trips only inside their rental window.';
      }
      return null;

    case 'report.schedule':
      if (assetRelationship === 'renter') {
        return 'Renters can schedule reports only for their rental periods.';
      }
      return null;

    case 'maintenance.view':
      if (role === 'site_user' && assetRelationship === 'owner') {
        return null; // site users of owner company can view
      }
      if (assetRelationship === 'renter') {
        return 'Renters don\'t see the owner\'s maintenance plans.';
      }
      return null;

    case 'maintenance.manage':
      if (role === 'site_user') {
        return 'Site Users can\'t manage maintenance — only the owner admin or Kasper can.';
      }
      if (assetRelationship === 'renter') {
        return 'Renters don\'t see the owner\'s maintenance plans.';
      }
      return null;

    case 'cost.view':
      if (role === 'kasper_ops') return 'Kasper Ops can\'t see cost & ROI.';
      if (role === 'site_user') return 'Site Users can\'t see cost & ROI.';
      if (assetRelationship === 'renter') return 'Renters can\'t see the owner\'s cost & ROI.';
      return null;

    case 'muc.view':
      if (assetRelationship === 'renter') {
        return 'Renters can view certificates only for periods inside their rental windows.';
      }
      if (role === 'site_user') {
        return 'Site Users can\'t view MUCs.';
      }
      return null;

    case 'muc.issue':
    case 'muc.void':
      if (role === 'kasper_ops') return 'Kasper Ops can\'t issue or void MUCs.';
      if (role === 'tenant_admin' && assetRelationship === 'renter') {
        return 'Renters can\'t issue or void certificates — only the owner can.';
      }
      if (role === 'site_user') return 'Site Users can\'t issue or void MUCs.';
      return null;

    case 'billing.view':
      if (role === 'kasper_ops') return 'Kasper Ops can\'t see billing.';
      if (role === 'site_user') return 'Site Users can\'t see billing.';
      if (assetRelationship === 'renter') return 'Renters see only invoices addressed to their company.';
      return null;

    case 'billing.recordPayment':
      if (role === 'kasper_ops') return 'Kasper Ops can\'t record payments.';
      if (role === 'site_user') return 'Site Users can\'t record payments.';
      if (assetRelationship === 'renter') return 'Renters can\'t record payments on invoices they received.';
      return null;

    case 'billing.pay':
      if (role === 'kasper_admin') return 'Kasper Admin can\'t pay invoices — they don\'t receive bills.';
      if (role === 'kasper_ops') return 'Kasper Ops can\'t pay invoices.';
      if (role === 'site_user') return 'Site Users can\'t pay invoices — the company admin does that.';
      return null;

    case 'console.billing.view':
    case 'console.billing.manage':
      if (role !== 'kasper_admin') {
        return 'Only Kasper Admin can view billing in the console.';
      }
      return null;

    case 'asset.create':
      if (role === 'site_user') return 'Site Users can\'t create assets.';
      if (role === 'kasper_ops') return null; // kasper ops can create for any tenant
      if (role === 'tenant_admin') return null;
      return null;

    case 'asset.retire':
      if (role === 'site_user') return 'Site Users can\'t retire assets.';
      return null;

    case 'tracker.request':
      if (role === 'site_user') return 'Site Users can\'t request trackers.';
      if (assetRelationship === 'renter') return 'Renters can\'t request trackers — only the owner can.';
      return null;

    case 'console.assets.transfer':
      if (role !== 'kasper_admin') return 'Only Kasper Admin can transfer assets between companies.';
      return null;

    case 'console.adapters.manage':
      if (role === 'tenant_admin') return 'CAN adapters are managed by Kasper — contact Kasper.';
      if (role === 'site_user') return 'CAN adapters are managed by Kasper — contact Kasper.';
      return null;

    case 'console.bookings.view':
    case 'console.bookings.manage':
      if (role === 'tenant_admin') return 'Bookings are managed by Kasper — use the rental tools in your dashboard.';
      if (role === 'site_user') return 'Bookings are managed by Kasper — use the rental tools in your dashboard.';
      return null;

    case 'console.staff.manage':
      if (role !== 'kasper_admin') return 'Only Kasper Admin can manage Kasper staff accounts.';
      return null;

    case 'console.import':
      if (role === 'tenant_admin') return 'Imports are managed by Kasper — only Kasper Admin and Ops can import.';
      return null;

    default:
      return null;
  }
}

function assetNotVisibleReason(session: Session): string {
  if (session.role === 'site_user') {
    return 'This asset isn\'t at your site or rented to your site.';
  }
  if (session.role === 'tenant_admin') {
    return 'This asset belongs to another company.';
  }
  return 'You don\'t have access to this asset.';
}
