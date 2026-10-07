// Company user management (spec 11.8): invites, renames, role changes,
// deactivation with the last-admin rule, site assignment and audit entries.
import { describe, it, expect } from 'vitest';
import {
  createUser, deactivateUser, reactivateUser, updateUserName, updateUserRole, updateUserSites,
  userById, usersForTenant,
} from './team';
import { seed } from '@/server/seed/data';
import type { Session } from '@/domain/types';

function sessionFor(userId: string): Session {
  const user = seed.users.find(u => u.id === userId)!;
  return {
    userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

const omar = () => sessionFor('u-omar');       // Al Noor Admin
const khalid = () => sessionFor('u-khalid');   // Emirates Earthmovers Admin
const sara = () => sessionFor('u-sara');       // Kasper Admin
const ravi = () => sessionFor('u-ravi');       // Kasper Ops (no users.manage)
const mark = () => sessionFor('u-mark');       // Gulf Lift Site User

const auditFor = (action: string, needle: string) =>
  seed.auditEntries.find(e => e.action === action && e.detail.includes(needle));

describe('team — inviting users', () => {
  it('creates an invited user and audits it', () => {
    const result = createUser(omar(), {
      tenantId: 't-alnoor', name: 'Noura Test', email: 'Noura.Test@alnoor.ae', role: 'site_user',
      siteIds: ['s-alnoor-ja'],
    });
    expect(result.ok).toBe(true);
    const user = result.data!;
    expect(user.status).toBe('invited');
    expect(user.email).toBe('noura.test@alnoor.ae');
    expect(usersForTenant('t-alnoor')).toContainEqual(user);
    expect(auditFor('user.create', 'Noura Test')).toBeTruthy();
  });

  it('validates the email and the company scope', () => {
    expect(createUser(omar(), { tenantId: 't-alnoor', name: 'No Email', email: 'nope', role: 'site_user' }).error)
      .toBe('Enter a valid email address.');
    expect(createUser(omar(), { tenantId: 't-alnoor', name: '', email: 'x@y.ae', role: 'site_user' }).error)
      .toBe('Name required.');
    expect(createUser(omar(), { tenantId: 't-alnoor', name: 'Copy', email: 'omar@alnoor.ae', role: 'site_user' }).error)
      .toBe('This email is already in use.');
    // Another company's admin can't invite into Al Noor; Kasper can.
    expect(createUser(khalid(), { tenantId: 't-alnoor', name: 'Sneaky', email: 'sneaky@x.ae', role: 'site_user' }).error)
      .toContain('your own company');
    expect(createUser(sara(), { tenantId: 't-alnoor', name: 'Kasper Added', email: 'added@alnoor.ae', role: 'site_user' }).ok).toBe(true);
    // Ops has no users.manage.
    expect(createUser(ravi(), { tenantId: 't-alnoor', name: 'Ops Added', email: 'ops@alnoor.ae', role: 'site_user' }).ok).toBe(false);
  });
});

describe('team — editing users', () => {
  it('renames only when the name actually changes', () => {
    const user = createUser(omar(), { tenantId: 't-alnoor', name: 'Rename Me', email: 'rename@alnoor.ae', role: 'site_user' }).data!;
    expect(updateUserName(omar(), user.id, '   ').error).toBe('Name required.');
    const unchanged = updateUserName(omar(), user.id, 'Rename Me');
    expect(unchanged.ok).toBe(true);
    expect(unchanged.message).toContain('unchanged');
    expect(updateUserName(omar(), user.id, 'Renamed Person').ok).toBe(true);
    expect(userById(user.id)!.name).toBe('Renamed Person');
    expect(auditFor('user.rename', 'Renamed Person')).toBeTruthy();
    // Someone else's admin can't touch them.
    expect(updateUserName(khalid(), user.id, 'Hacked').ok).toBe(false);
  });

  it('keeps at least one active Tenant Admin', () => {
    const tenantId = 't-emirates'; // Khalid is the only active admin
    const admins = seed.users.filter(u => u.tenantId === tenantId && u.role === 'tenant_admin' && u.status === 'active');
    expect(admins).toHaveLength(1);
    // The last-admin rule is checked first, whoever asks.
    expect(deactivateUser(khalid(), 'u-khalid').error).toBe('Every company needs at least one Tenant Admin.');
    expect(updateUserRole(khalid(), 'u-khalid', 'site_user').error).toBe('Every company needs at least one Tenant Admin.');
    expect(deactivateUser(sara(), 'u-khalid').error).toBe('Every company needs at least one Tenant Admin.');
    // With a second active admin in place, an admin still can't deactivate themselves.
    const second = createUser(sara(), { tenantId: 't-alnoor', name: 'Second Admin', email: 'second.admin@alnoor.ae', role: 'tenant_admin' }).data!;
    expect(reactivateUser(sara(), second.id).ok).toBe(true);
    expect(deactivateUser(omar(), 'u-omar').error).toBe('You can\u2019t deactivate your own account.');
    expect(userById('u-omar')!.status).toBe('active');
  });

  it('deactivates, refuses sign-in status changes and reactivates', () => {
    const user = createUser(omar(), { tenantId: 't-alnoor', name: 'Temp Person', email: 'temp@alnoor.ae', role: 'site_user' }).data!;
    // New users are 'invited': make them active the way the demo does (seed users only).
    expect(userById(user.id)!.status).toBe('invited');
    const deactivated = deactivateUser(omar(), user.id);
    expect(deactivated.ok).toBe(true);
    expect(deactivateUser(omar(), user.id).error).toContain('already deactivated');
    expect(reactivateUser(omar(), user.id).ok).toBe(true);
    expect(userById(user.id)!.status).toBe('active');
    expect(reactivateUser(omar(), user.id).error).toContain('already active');
    expect(mark().role).toBe('site_user');
    expect(deactivateUser(mark(), user.id).ok).toBe(false); // no users.manage
  });

  it('moves a Site User between their company’s sites', () => {
    const user = createUser(omar(), { tenantId: 't-alnoor', name: 'Site Mover', email: 'mover@alnoor.ae', role: 'site_user' }).data!;
    expect(updateUserSites(omar(), user.id, ['s-alnoor-ja', 's-alnoor-dip']).ok).toBe(true);
    expect(userById(user.id)!.siteIds).toEqual(['s-alnoor-ja', 's-alnoor-dip']);
    // Sites from another company are dropped.
    expect(updateUserSites(omar(), user.id, ['s-alnoor-ja', 's-marina-dh']).ok).toBe(true);
    expect(userById(user.id)!.siteIds).toEqual(['s-alnoor-ja']);
    expect(auditFor('user.sites', 'Site Mover')).toBeTruthy();
    // A Tenant Admin is not tied to sites.
    expect(updateUserSites(omar(), 'u-omar', ['s-alnoor-ja']).error).toBe('Only Site Users are tied to sites.');
  });

  it('promotes a Site User to Tenant Admin', () => {
    const user = createUser(omar(), { tenantId: 't-alnoor', name: 'Promo Person', email: 'promo@alnoor.ae', role: 'site_user' }).data!;
    const promoted = updateUserRole(omar(), user.id, 'tenant_admin');
    expect(promoted.ok).toBe(true);
    expect(userById(user.id)!.role).toBe('tenant_admin');
    expect(auditFor('user.role', 'Promo Person')).toBeTruthy();
    expect(updateUserRole(omar(), user.id, 'kasper_admin').error).toContain('Tenant Admins and Site Users');
  });
});
