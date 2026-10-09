// View as (spec 10.1): groups and badges come from the live db, not a fixed list.

import { describe, it, expect, beforeEach } from 'vitest';
import { db, resetDb } from '@/server/db';
import { viewAsGroups, type ViewAsState } from './view-as';

function state(): ViewAsState {
  const s = db.getState();
  return { users: s.users, tenants: s.tenants, sites: s.sites, assets: s.assets, bookings: s.bookings };
}

describe('View as: live groups and badges', () => {
  beforeEach(() => {
    resetDb();
  });

  it('lists Kasper staff first, then each company in table order', () => {
    const names = viewAsGroups(state(), '').map(g => g.name);
    expect(names[0]).toBe('Kasper');
    const companies = names.slice(1);
    const tenantOrder = db.getState().tenants.map(t => t.name).filter(n => companies.includes(n));
    expect(companies).toEqual(tenantOrder);
  });

  it('shows a company created in the demo, with its users', () => {
    const base = db.getState();
    const tenant = { ...base.tenants[0], id: 't-fresh', name: 'Fresh Hire Co' };
    const user = { ...base.users.find(u => u.role === 'tenant_admin')!, id: 'u-fresh', name: 'Farah Fresh', email: 'farah@fresh.ae', tenantId: 't-fresh', siteIds: [], status: 'active' as const };
    db.setState(s => ({ tenants: [...s.tenants, tenant], users: [...s.users, user] }));
    const group = viewAsGroups(state(), '').find(g => g.name === 'Fresh Hire Co');
    expect(group?.rows.map(r => r.user.name)).toEqual(['Farah Fresh']);
  });

  it('a search keeps only the companies with a matching user', () => {
    const groups = viewAsGroups(state(), 'karim');
    expect(groups.map(g => g.name)).toEqual(['Marina Builders']);
    expect(groups[0].rows.map(r => r.user.id)).toEqual(['u-karim']);
  });

  it('badges a deactivated user and an invited user', () => {
    db.setState(s => ({ users: s.users.map(u => (u.id === 'u-omar' ? { ...u, status: 'invited' as const } : u)) }));
    const rows = viewAsGroups(state(), '').flatMap(g => g.rows);
    const omar = rows.find(r => r.user.id === 'u-omar')!;
    expect(omar.badges.map(b => b.label)).toContain('invited');
    const karim = rows.find(r => r.user.id === 'u-karim')!;
    expect(karim.deactivated).toBe(true);
    expect(karim.badges.map(b => b.label)).toContain('deactivated');
  });

  it('badges a tier-1 fleet "No CAN" and a tier-3 fleet by its tiers', () => {
    const rows = viewAsGroups(state(), '').flatMap(g => g.rows);
    const omarLabels = rows.find(r => r.user.id === 'u-omar')!.badges.map(b => b.label);
    expect(omarLabels).toContain('No CAN');
    const khalidLabels = rows.find(r => r.user.id === 'u-khalid')!.badges.map(b => b.label);
    expect(khalidLabels).not.toContain('No CAN');
    expect(khalidLabels.some(l => /^T\d /.test(l) && l.includes('T3'))).toBe(true);
  });

  it('gives each row a role and site line', () => {
    const rows = viewAsGroups(state(), '').flatMap(g => g.rows);
    const ahmed = rows.find(r => r.user.id === 'u-ahmed');
    expect(ahmed?.subtitle.startsWith('Site User · ')).toBe(true);
  });
});
