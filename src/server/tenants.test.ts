// Company (tenant) administration in the Kasper console (spec 11.9):
// create, edit, suspend/unsuspend with the active-admin rule, all audited.
import { describe, it, expect } from 'vitest';
import {
  createTenant, onboardingTenants, setTenantStatus, suspendTenant, tenantById, unsuspendTenant, updateTenant,
} from './tenants';
import { createUser, reactivateUser } from './team';
import { db } from '@/server/db';
import type { Session } from '@/domain/types';

function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId)!;
  return {
    userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

const sara = () => sessionFor('u-sara');     // Kasper Admin — console.tenants.manage
const ravi = () => sessionFor('u-ravi');     // Kasper Ops — read only
const omar = () => sessionFor('u-omar');     // Al Noor Tenant Admin

const auditFor = (action: string, needle: string) =>
  db.getState().auditEntries.find(e => e.action === action && e.detail.includes(needle));

describe('tenants — creating and editing companies', () => {
  it('creates a company and refuses duplicate names', () => {
    const created = createTenant(sara(), { name: 'Desert Star Logistics', type: 'client' });
    expect(created.ok).toBe(true);
    expect(created.data!.status).toBe('active');
    expect(db.getState().tenants).toContainEqual(created.data!);
    expect(auditFor('tenant.create', 'Desert Star Logistics')).toBeTruthy();
    expect(createTenant(sara(), { name: '  desert star logistics ', type: 'vendor' }).error)
      .toBe('A company with that name already exists.');
    expect(createTenant(sara(), { name: '   ', type: 'vendor' }).error).toBe('Company name required.');
  });

  it('is Kasper Admin only', () => {
    expect(createTenant(ravi(), { name: 'Ops Company', type: 'vendor' }).error).toBe('Only Kasper Admin can create companies.');
    expect(createTenant(omar(), { name: 'Tenant Company', type: 'vendor' }).error).toBe('Only Kasper Admin can create companies.');
  });

  it('edits name and type and reports a no-op', () => {
    const tenant = createTenant(sara(), { name: 'Rename Co', type: 'vendor' }).data!;
    const renamed = updateTenant(sara(), tenant.id, { name: 'Rename Co 2', type: 'both' });
    expect(renamed.ok).toBe(true);
    expect(renamed.message).toBe('Rename Co 2 updated.');
    expect(tenantById(tenant.id)!.type).toBe('both');
    expect(auditFor('tenant.update', 'Rename Co 2')).toBeTruthy();
    expect(updateTenant(sara(), tenant.id, {}).message).toBe('Nothing changed.');
    expect(updateTenant(sara(), tenant.id, { name: '  ' }).error).toBe('Company name required.');
    expect(updateTenant(sara(), 't-nope', { name: 'X' }).error).toBe('Tenant not found.');
  });
});

describe('tenants — suspend and unsuspend', () => {
  it('suspends a company that still has an active admin, then brings it back', () => {
    const tenant = createTenant(sara(), { name: 'Suspend Co', type: 'client' }).data!;
    const admin = createUser(sara(), {
      tenantId: tenant.id, name: 'Suspend Admin', email: 'admin@suspend.co', role: 'tenant_admin',
    }).data!;
    expect(reactivateUser(sara(), admin.id).ok).toBe(true);
    const suspended = suspendTenant(sara(), tenant.id, 'Non-payment');
    expect(suspended.ok).toBe(true);
    expect(tenantById(tenant.id)!.status).toBe('suspended');
    expect(onboardingTenants()).toContainEqual(tenantById(tenant.id));
    const entry = auditFor('tenant.suspend', 'Suspend Co');
    expect(entry?.reason).toBe('Non-payment');
    expect(suspendTenant(sara(), tenant.id).message).toBe('Suspend Co is already suspended.');
    expect(unsuspendTenant(sara(), tenant.id).message).toBe('Suspend Co is active again.');
    expect(tenantById(tenant.id)!.status).toBe('active');
    expect(auditFor('tenant.unsuspend', 'Suspend Co')).toBeTruthy();
  });

  it('refuses to suspend a company with no active Tenant Admin', () => {
    const tenant = createTenant(sara(), { name: 'No Admin Co', type: 'vendor' }).data!;
    expect(suspendTenant(sara(), tenant.id).error)
      .toBe('This company has no active Tenant Admin — suspend it only after adding one.');
    expect(suspendTenant(ravi(), tenant.id).error).toBe('Only Kasper Admin can change a company\u2019s status.');
    expect(setTenantStatus(sara(), 't-nope', 'suspended').error).toBe('Tenant not found.');
  });
});
