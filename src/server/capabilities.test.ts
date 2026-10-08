// Capabilities tests — verify role → capability mapping against capabilities.ts.
import { describe, it, expect } from 'vitest';
import { hasRoleCapability } from './capabilities';

describe('capabilities — hasRoleCapability', () => {
  it('kasper_admin has key capabilities', () => {
    expect(hasRoleCapability('kasper_admin', 'asset.view')).toBe(true);
    expect(hasRoleCapability('kasper_admin', 'asset.edit')).toBe(true);
    expect(hasRoleCapability('kasper_admin', 'console.audit.view')).toBe(true);
    expect(hasRoleCapability('kasper_admin', 'console.staff.manage')).toBe(true);
    expect(hasRoleCapability('kasper_admin', 'muc.issue')).toBe(true);
    expect(hasRoleCapability('kasper_admin', 'billing.pay')).toBe(true);
    expect(hasRoleCapability('kasper_admin', 'console.billing.manage')).toBe(true);
    expect(hasRoleCapability('kasper_admin', 'console.assets.transfer')).toBe(true);
    expect(hasRoleCapability('kasper_admin', 'console.adapters.manage')).toBe(true);
  });

  it('kasper_ops has operational capabilities, not admin ones', () => {
    // Has
    expect(hasRoleCapability('kasper_ops', 'asset.view')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'console.trackers.view')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'console.trackers.manage')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'console.trackers.configure')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'console.adapters.manage')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'console.bookings.view')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'console.bookings.manage')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'console.assets.transfer')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'console.import')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'asset.create')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'asset.retire')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'tracker.request')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'link.revoke')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'grant.endEarly')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'alert.view')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'alert.acknowledge')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'label.view')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'geofence.view')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'geofence.manage')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'playback.view')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'report.schedule')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'maintenance.view')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'maintenance.manage')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'muc.view')).toBe(true);
    expect(hasRoleCapability('kasper_ops', 'console.tenants.view')).toBe(true);

    // Does not have
    expect(hasRoleCapability('kasper_ops', 'users.manage')).toBe(false);
    expect(hasRoleCapability('kasper_ops', 'sites.manage')).toBe(false);
    expect(hasRoleCapability('kasper_ops', 'console.tenants.manage')).toBe(false);
    expect(hasRoleCapability('kasper_ops', 'console.audit.view')).toBe(false);
    expect(hasRoleCapability('kasper_ops', 'console.staff.manage')).toBe(false);
    expect(hasRoleCapability('kasper_ops', 'label.manage')).toBe(false);
    expect(hasRoleCapability('kasper_ops', 'muc.issue')).toBe(false);
    expect(hasRoleCapability('kasper_ops', 'muc.void')).toBe(false);
    expect(hasRoleCapability('kasper_ops', 'billing.view')).toBe(false);
    expect(hasRoleCapability('kasper_ops', 'billing.recordPayment')).toBe(false);
    expect(hasRoleCapability('kasper_ops', 'billing.pay')).toBe(false);
    expect(hasRoleCapability('kasper_ops', 'console.billing.view')).toBe(false);
    expect(hasRoleCapability('kasper_ops', 'console.billing.manage')).toBe(false);
    expect(hasRoleCapability('kasper_ops', 'cost.view')).toBe(false);
  });

  it('tenant_admin has own-company capabilities', () => {
    expect(hasRoleCapability('tenant_admin', 'asset.view')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'asset.edit')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'link.create')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'link.revoke')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'grant.endEarly')).toBe(false);
    expect(hasRoleCapability('tenant_admin', 'alert.view')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'muc.view')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'muc.issue')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'muc.void')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'billing.view')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'billing.recordPayment')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'billing.pay')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'label.view')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'label.manage')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'geofence.view')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'geofence.manage')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'playback.view')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'report.schedule')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'maintenance.view')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'maintenance.manage')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'asset.create')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'asset.retire')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'tracker.request')).toBe(true);
    expect(hasRoleCapability('tenant_admin', 'console.assets.transfer')).toBe(true);

    expect(hasRoleCapability('tenant_admin', 'users.manage')).toBe(false);
    expect(hasRoleCapability('tenant_admin', 'sites.manage')).toBe(false);
    expect(hasRoleCapability('tenant_admin', 'console.tenants.view')).toBe(false);
    expect(hasRoleCapability('tenant_admin', 'console.tenants.manage')).toBe(false);
    expect(hasRoleCapability('tenant_admin', 'console.audit.view')).toBe(false);
    expect(hasRoleCapability('tenant_admin', 'console.staff.manage')).toBe(false);
    expect(hasRoleCapability('tenant_admin', 'console.trackers.view')).toBe(false);
    expect(hasRoleCapability('tenant_admin', 'console.trackers.manage')).toBe(false);
    expect(hasRoleCapability('tenant_admin', 'console.trackers.configure')).toBe(false);
    expect(hasRoleCapability('tenant_admin', 'console.adapters.manage')).toBe(false);
    expect(hasRoleCapability('tenant_admin', 'console.bookings.view')).toBe(false);
    expect(hasRoleCapability('tenant_admin', 'console.import')).toBe(false);
  });

  it('site_user has view-only capabilities', () => {
    expect(hasRoleCapability('site_user', 'asset.view')).toBe(true);
    expect(hasRoleCapability('site_user', 'asset.viewHistory')).toBe(true);
    expect(hasRoleCapability('site_user', 'asset.viewTelemetry')).toBe(true);
    expect(hasRoleCapability('site_user', 'report.run')).toBe(true);
    expect(hasRoleCapability('site_user', 'alert.view')).toBe(true);
    expect(hasRoleCapability('site_user', 'label.view')).toBe(true);
    expect(hasRoleCapability('site_user', 'geofence.view')).toBe(true);
    expect(hasRoleCapability('site_user', 'playback.view')).toBe(true);
    expect(hasRoleCapability('site_user', 'report.schedule')).toBe(true);
    expect(hasRoleCapability('site_user', 'maintenance.view')).toBe(true);

    expect(hasRoleCapability('site_user', 'asset.edit')).toBe(false);
    expect(hasRoleCapability('site_user', 'link.create')).toBe(false);
    expect(hasRoleCapability('site_user', 'link.revoke')).toBe(false);
    expect(hasRoleCapability('site_user', 'grant.endEarly')).toBe(false);
    expect(hasRoleCapability('site_user', 'alert.acknowledge')).toBe(false);
    expect(hasRoleCapability('site_user', 'users.manage')).toBe(false);
    expect(hasRoleCapability('site_user', 'sites.manage')).toBe(false);
    expect(hasRoleCapability('site_user', 'label.manage')).toBe(false);
    expect(hasRoleCapability('site_user', 'geofence.manage')).toBe(false);
    expect(hasRoleCapability('site_user', 'muc.view')).toBe(false);
    expect(hasRoleCapability('site_user', 'muc.issue')).toBe(false);
    expect(hasRoleCapability('site_user', 'billing.view')).toBe(false);
    expect(hasRoleCapability('site_user', 'console.tenants.view')).toBe(false);
    expect(hasRoleCapability('site_user', 'console.trackers.view')).toBe(false);
  });
});
