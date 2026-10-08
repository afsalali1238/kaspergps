// User management inside a company (spec 11.8: Users & sites).
//
// Rules: a company must keep at least one active Tenant Admin, deactivated
// users can't sign in, and every change writes an audit entry. Kasper Admin can
// manage any company; a Tenant Admin only its own.

import type { Role, Session, User } from '@/domain/types';
import { db, append, nextNumber, touch } from '@/server/db';
import { recordAuditForSession } from '@/server/audit';
import { fail, ok, type OpResult } from '@/server/result';
import { hasCapability } from '@/server/access';
import { hasCompanyCapability, hasRole } from '@/server/capabilities';

export function userById(userId: string): User | null {
  return db.getState().users.find(u => u.id === userId) ?? null;
}

// Kasper Admin has the role capability; a Tenant Admin only for its own company
// (the company matrix grants users.manage / sites.manage).
export function canManageUsers(session: Session): boolean {
  return hasCapability(session, 'users.manage') || hasCompanyCapability(session, 'users.manage');
}

function canManageUser(session: Session, user: User): boolean {
  if (!canManageUsers(session)) return false;
  if (session.isKasper) return true;
  return user.tenantId !== null && user.tenantId === session.tenantId;
}

function activeAdminsFor(tenantId: string | null, excludingUserId?: string): User[] {
  return db.getState().users.filter(u =>
    u.tenantId === tenantId &&
    hasRole(u, 'tenant_admin') &&
    u.status === 'active' &&
    u.id !== excludingUserId
  );
}

export interface CreateUserInput {
  tenantId: string;
  name: string;
  email: string;
  role: Role;
  siteIds?: string[];
  title?: string;
}

export function createUser(session: Session, input: CreateUserInput): OpResult<User> {
  if (!canManageUsers(session)) return fail('Your role can\u2019t manage users.');
  if (!session.isKasper && input.tenantId !== session.tenantId) {
    return fail('You can only add users to your own company.');
  }
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return fail('Name required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Enter a valid email address.');
  if (db.getState().users.some(u => u.email.toLowerCase() === email)) return fail('This email is already in use.');
  if (!input.tenantId) return fail('Pick a company.');

  const user: User = {
    id: `u-${nextNumber('u-', db.getState().users, 900)}`,
    name,
    email,
    role: input.role,
    tenantId: input.tenantId,
    siteIds: input.siteIds ?? [],
    status: 'invited',
    title: input.title,
  };
  append('users', user);

  recordAuditForSession(session, {
    action: 'user.create',
    tenantId: input.tenantId,
    detail: `${name} (${hasRole(input, 'tenant_admin') ? 'Tenant Admin' : hasRole(input, 'site_user') ? 'Site User' : input.role}) invited`,
  });

  return ok(user, `${name} invited — they can sign in with any password in the demo.`);
}

export function updateUserName(session: Session, userId: string, name: string): OpResult<User> {
  const user = userById(userId);
  if (!user) return fail('User not found.');
  if (!canManageUser(session, user)) return fail('You can\u2019t edit this user.');
  const trimmed = name.trim();
  if (!trimmed) return fail('Name required.');
  const before = user.name;
  if (before === trimmed) return ok(user, `${trimmed} unchanged.`);
  user.name = trimmed;
  touch('users');
  recordAuditForSession(session, {
    action: 'user.rename',
    tenantId: user.tenantId ?? undefined,
    detail: `${before} renamed to ${trimmed}`,
  });
  return ok(user, `Name changed to ${trimmed}.`);
}

export function updateUserRole(session: Session, userId: string, nextRole: Role): OpResult<User> {
  const user = userById(userId);
  if (!user) return fail('User not found.');
  if (!canManageUser(session, user)) return fail('You can\u2019t change this user\u2019s role.');
  if (nextRole !== 'tenant_admin' && nextRole !== 'site_user') return fail('Companies can only have Tenant Admins and Site Users.');
  const label = nextRole === 'tenant_admin' ? 'a Tenant Admin' : 'a Site User';
  if (hasRole(user, nextRole)) return ok(user, `${user.name} is already ${label}.`);
  if (hasRole(user, 'tenant_admin') && nextRole === 'site_user') {
    if (activeAdminsFor(user.tenantId, user.id).length === 0) {
      return fail('Every company needs at least one Tenant Admin.');
    }
  }
  const before = user.role;
  user.role = nextRole;
  touch('users');
  recordAuditForSession(session, {
    action: 'user.role',
    tenantId: user.tenantId ?? undefined,
    detail: `${user.name} changed from ${before} to ${nextRole}`,
  });
  return ok(user, `${user.name} is now ${label}.`);
}

export function deactivateUser(session: Session, userId: string): OpResult<User> {
  const user = userById(userId);
  if (!user) return fail('User not found.');
  if (!canManageUser(session, user)) return fail('You can\u2019t deactivate this user.');
  if (user.status === 'deactivated') return fail(`${user.name} is already deactivated.`);
  if (hasRole(user, 'tenant_admin') && activeAdminsFor(user.tenantId, user.id).length === 0) {
    return fail('Every company needs at least one Tenant Admin.');
  }
  if (session.userId === user.id) return fail('You can\u2019t deactivate your own account.');

  user.status = 'deactivated';
  touch('users');
  recordAuditForSession(session, {
    action: 'user.deactivate',
    tenantId: user.tenantId ?? undefined,
    detail: `${user.name} deactivated`,
  });
  return ok(user, `${user.name} deactivated — they can no longer sign in.`);
}

export function reactivateUser(session: Session, userId: string): OpResult<User> {
  const user = userById(userId);
  if (!user) return fail('User not found.');
  if (!canManageUser(session, user)) return fail('You can\u2019t reactivate this user.');
  if (user.status === 'active') return fail(`${user.name} is already active.`);
  user.status = 'active';
  touch('users');
  recordAuditForSession(session, {
    action: 'user.reactivate',
    tenantId: user.tenantId ?? undefined,
    detail: `${user.name} reactivated`,
  });
  return ok(user, `${user.name} is active again.`);
}

export function updateUserSites(session: Session, userId: string, siteIds: string[]): OpResult<User> {
  const user = userById(userId);
  if (!user) return fail('User not found.');
  if (!canManageUser(session, user)) return fail('You can\u2019t change this user\u2019s sites.');
  if (user.role !== 'site_user') return fail('Only Site Users are tied to sites.');
  const valid = siteIds.filter(id => db.getState().sites.some(s => s.id === id && s.tenantId === user.tenantId));
  user.siteIds = valid;
  touch('users');
  recordAuditForSession(session, {
    action: 'user.sites',
    tenantId: user.tenantId ?? undefined,
    detail: `${user.name} sites set to ${valid.length === 0 ? 'none' : valid.map(id => db.getState().sites.find(s => s.id === id)?.name ?? id).join(', ')}`,
  });
  return ok(user, `${user.name} updated.`);
}

export function usersForTenant(tenantId: string): User[] {
  return db.getState().users.filter(u => u.tenantId === tenantId);
}
