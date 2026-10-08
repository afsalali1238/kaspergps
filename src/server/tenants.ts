// Tenants (companies) in the Kasper console (spec 11.9 Tenants / 11.9 Onboard).
//
// Kasper Admin creates and edits companies; Ops can look but not change.
// Suspending a company blocks its users from signing in, so the last active
// admin rule applies here too. Every change is audited.

import type { Session, Tenant } from '@/domain/types';
import { db, append, nextNumber, touch } from '@/server/db';
import { recordAuditForSession } from '@/server/audit';
import { fail, ok, type OpResult } from '@/server/result';
import { hasCapability } from '@/server/access';
import { hasRole } from '@/server/capabilities';
import * as clock from '@/lib/clock';

export function tenantById(tenantId: string): Tenant | null {
  return db.getState().tenants.find(t => t.id === tenantId) ?? null;
}

function canManageTenants(session: Session): boolean {
  return hasCapability(session, 'console.tenants.manage');
}

export interface CreateTenantInput {
  name: string;
  type: Tenant['type'];
}

export function createTenant(session: Session, input: CreateTenantInput): OpResult<Tenant> {
  if (!canManageTenants(session)) return fail('Only Kasper Admin can create companies.');
  const name = input.name.trim();
  if (!name) return fail('Company name required.');
  if (db.getState().tenants.some(t => t.name.toLowerCase() === name.toLowerCase())) {
    return fail('A company with that name already exists.');
  }

  const tenant: Tenant = {
    id: `t-${nextNumber('t-', db.getState().tenants, 100)}`,
    name,
    type: input.type,
    status: 'active',
    createdAt: new Date(clock.now()).toISOString(),
  };
  append('tenants', tenant);

  recordAuditForSession(session, {
    action: 'tenant.create',
    tenantId: tenant.id,
    detail: `${name} created (${input.type})`,
  });
  return ok(tenant, `${name} created.`);
}

export interface UpdateTenantInput {
  name?: string;
  type?: Tenant['type'];
}

export function updateTenant(session: Session, tenantId: string, input: UpdateTenantInput): OpResult<Tenant> {
  const tenant = tenantById(tenantId);
  if (!tenant) return fail('Tenant not found.');
  if (!canManageTenants(session)) return fail('Only Kasper Admin can edit companies.');

  const changes: string[] = [];
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return fail('Company name required.');
    if (name !== tenant.name) {
      if (db.getState().tenants.some(t => t.id !== tenantId && t.name.toLowerCase() === name.toLowerCase())) {
        return fail('A company with that name already exists.');
      }
      changes.push(`name ${tenant.name} → ${name}`);
      tenant.name = name;
      touch('tenants');
    }
  }
  if (input.type !== undefined && input.type !== tenant.type) {
    changes.push(`type ${tenant.type} → ${input.type}`);
    tenant.type = input.type;
    touch('tenants');
  }
  if (changes.length === 0) return ok(tenant, 'Nothing changed.');

  recordAuditForSession(session, {
    action: 'tenant.update',
    tenantId,
    detail: `${tenant.name}: ${changes.join('; ')}`,
  });
  return ok(tenant, `${tenant.name} updated.`);
}

export function setTenantStatus(session: Session, tenantId: string, status: Tenant['status'], reason?: string): OpResult<Tenant> {
  const tenant = tenantById(tenantId);
  if (!tenant) return fail('Tenant not found.');
  if (!canManageTenants(session)) return fail('Only Kasper Admin can change a company\u2019s status.');
  if (tenant.status === status) return ok(tenant, `${tenant.name} is already ${status}.`);
  if (status === 'suspended') {
    const admins = db.getState().users.filter(u => u.tenantId === tenantId && hasRole(u, 'tenant_admin') && u.status === 'active');
    if (admins.length === 0) {
      return fail('This company has no active Tenant Admin — suspend it only after adding one.');
    }
  }

  const before = tenant.status;
  tenant.status = status;
  touch('tenants');
  recordAuditForSession(session, {
    action: status === 'suspended' ? 'tenant.suspend' : 'tenant.unsuspend',
    tenantId,
    detail: `${tenant.name} ${before} → ${status}`,
    reason: reason?.trim() || undefined,
  });
  return ok(tenant, status === 'suspended'
    ? `${tenant.name} suspended — its users can no longer sign in.`
    : `${tenant.name} is active again.`);
}

export function suspendTenant(session: Session, tenantId: string, reason?: string): OpResult<Tenant> {
  return setTenantStatus(session, tenantId, 'suspended', reason);
}

export function unsuspendTenant(session: Session, tenantId: string): OpResult<Tenant> {
  return setTenantStatus(session, tenantId, 'active');
}

/** Tenants whose users are seen as "on trial" in the demo data. */
export function onboardingTenants(): Tenant[] {
  return db.getState().tenants.filter(t => t.status !== 'active');
}
