// Capability reasons (spec 5.2 rule 5): whenever a rail item, button or scope
// is hidden, the UI can ask why. Every capability must have a reason someone
// can act on — never a bare "you can't".
import { describe, it, expect } from 'vitest';
import { reasonFor } from './capability-reasons';
import type { Capability } from './capabilities';
import { seed } from '@/server/seed/data';
import type { Role, Session } from '@/domain/types';

const ROLES: Role[] = ['kasper_admin', 'kasper_ops', 'tenant_admin', 'site_user'];
const RELATIONSHIPS: ('kasper' | 'owner' | 'renter' | 'none')[] = ['kasper', 'owner', 'renter', 'none'];

const CAPS: Capability[] = [
  'asset.view', 'asset.viewHistory', 'asset.viewTelemetry', 'asset.edit', 'report.run',
  'link.create', 'link.revoke', 'grant.endEarly', 'alert.view', 'alert.acknowledge',
  'users.manage', 'sites.manage', 'console.tenants.view', 'console.tenants.manage',
  'console.assets.manage', 'console.trackers.view', 'console.trackers.manage',
  'console.trackers.configure', 'console.audit.view', 'label.view', 'label.manage',
  'geofence.view', 'geofence.manage', 'playback.view', 'report.schedule',
  'maintenance.view', 'maintenance.manage', 'cost.view', 'muc.view', 'muc.issue',
  'muc.void', 'billing.view', 'billing.recordPayment', 'billing.pay',
  'console.billing.view', 'console.billing.manage', 'asset.create', 'asset.retire',
  'tracker.request', 'console.assets.transfer', 'console.adapters.manage',
  'console.bookings.view', 'console.bookings.manage', 'console.staff.manage', 'console.import',
];

function sessionFor(role: Role, userId: string): Session {
  const user = seed.users.find(u => u.id === userId)!;
  return {
    userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

const SESSIONS = ROLES.map(role => sessionFor(role, 'u-khalid'));

describe('capability reasons', () => {
  it('answers every capability, role and relationship', () => {
    for (const session of SESSIONS) {
      for (const cap of CAPS) {
        for (const rel of RELATIONSHIPS) {
          const reason = reasonFor(session, cap, rel);
          expect(reason === null || (typeof reason === 'string' && reason.trim().length >= 20)).toBe(true);
        }
      }
    }
  });

  it('explains the cross-company and renter rules concretely', () => {
    const khalid = SESSIONS[2]; // tenant_admin of the owning company
    const lina = SESSIONS[2]; // renter admin
    expect(reasonFor(khalid, 'alert.view', 'none')).toBe('This asset belongs to another company.');
    expect(reasonFor(lina, 'link.create', 'renter')).toBe("Renters can't create tracking links — only the asset owner can.");
    expect(reasonFor(sessionFor('kasper_ops', 'u-ravi'), 'link.create', 'owner')).toContain('Kasper Ops');
    expect(reasonFor(sessionFor('kasper_ops', 'u-ravi'), 'cost.view')).toContain('cost & ROI');
    expect(reasonFor(SESSIONS[0], 'console.audit.view')).toBe(null);
    expect(reasonFor(sessionFor('kasper_ops', 'u-ravi'), 'console.audit.view')).toBe('Only Kasper Admin can view the audit log.');
    expect(reasonFor(sessionFor('site_user', 'u-fatima'), 'asset.view', 'none')).toBe("This asset isn't at your site or rented to your site.");
  });

  it('gives Kasper the guidance for requests from tenants', () => {
    const ops = sessionFor('kasper_ops', 'u-ravi');
    expect(reasonFor(ops, 'link.create', 'owner')).toMatch(/support/);
    const tenant = sessionFor('tenant_admin', 'u-khalid');
    expect(reasonFor(tenant, 'console.adapters.manage')).toBe('CAN adapters are managed by Kasper — contact Kasper.');
    expect(reasonFor(tenant, 'console.bookings.manage')).toContain('Bookings are managed by Kasper');
    expect(reasonFor(tenant, 'console.import')).toContain('only Kasper Admin and Ops');
  });

  it('falls back to the visibility rule when nothing else applies', () => {
    const ops = sessionFor('kasper_ops', 'u-ravi');
    expect(reasonFor(ops, 'alert.view', 'none')).toBe("You don't have access to this asset.");
    // Unknown relationship or missing argument never throws and stays null-safe.
    expect(reasonFor(ops, 'alert.view')).toBe(null);
    expect(reasonFor(ops, 'link.create', undefined)).toBe("Kasper Ops can't create tracking links — they support existing ones.");
  });
});
