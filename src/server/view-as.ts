// The "View as" list in the demo bar (spec §10.1). Built from live data, never
// from a fixed list of companies: a company created in the demo appears here,
// and so does a user invited in the demo.

import type { Asset, Booking, Role, Site, Tenant, User } from '@/domain/types';
import { tierForAsset } from '@/domain/features';
import { isKasperStaff } from '@/server/capabilities';

export interface ViewAsBadge {
  label: string;
  tone: 'warn' | 'info' | 'muted';
}

export interface ViewAsRow {
  user: User;
  /** e.g. "Site User · Dubai Hills" */
  subtitle: string;
  badges: ViewAsBadge[];
  deactivated: boolean;
}

export interface ViewAsGroup {
  key: string;
  name: string;
  rows: ViewAsRow[];
}

export interface ViewAsState {
  users: User[];
  tenants: Tenant[];
  sites: Site[];
  assets: Asset[];
  bookings: Booking[];
}

const ROLE_LABEL: Record<Role, string> = {
  kasper_admin: 'Kasper Admin',
  kasper_ops: 'Kasper Ops',
  tenant_admin: 'Tenant Admin',
  site_user: 'Site User',
};

const LIVE_BOOKING: ReadonlyArray<Booking['status']> = ['scheduled', 'active'];

/** The assets a user can see on the map, as a plain count basis for the badges. */
function visibleAssets(state: ViewAsState, user: User): Asset[] {
  if (isKasperStaff(user.role)) return state.assets;
  const owned = state.assets.filter(a => a.ownerTenantId === user.tenantId);
  if (user.role !== 'site_user') return owned;
  return owned.filter(a => user.siteIds.includes(a.homeSiteId));
}

function badgesFor(state: ViewAsState, user: User): ViewAsBadge[] {
  const badges: ViewAsBadge[] = [];
  if (user.status === 'deactivated') badges.push({ label: 'deactivated', tone: 'warn' });
  if (user.status === 'invited') badges.push({ label: 'invited', tone: 'info' });
  if (isKasperStaff(user.role) || !user.tenantId) return badges;

  const assets = visibleAssets(state, user);
  if (assets.length > 0) {
    const counts = [1, 2, 3].map(t => assets.filter(a => tierForAsset(a) === t).length);
    if (counts[0] === assets.length) badges.push({ label: 'No CAN', tone: 'muted' });
    const mix = counts
      .map((n, i) => (n > 0 ? `T${i + 1} ${n}` : null))
      .filter((x): x is string => x !== null)
      .join(' · ');
    badges.push({ label: mix, tone: 'muted' });
  }

  const renting = new Set(
    state.bookings
      .filter(b => LIVE_BOOKING.includes(b.status) && b.renterTenantId === user.tenantId)
      .map(b => b.assetId)
  );
  if (renting.size > 0) badges.push({ label: `renting ${renting.size}`, tone: 'info' });

  const rentedOut = new Set(
    state.bookings
      .filter(b => LIVE_BOOKING.includes(b.status) && b.ownerTenantId === user.tenantId && b.renterTenantId && b.renterTenantId !== b.ownerTenantId)
      .map(b => b.assetId)
  );
  if (rentedOut.size > 0) badges.push({ label: `rented out ${rentedOut.size}`, tone: 'info' });

  return badges;
}

function subtitleFor(state: ViewAsState, user: User): string {
  const role = ROLE_LABEL[user.role] ?? user.role;
  const sites = user.siteIds
    .map(id => state.sites.find(s => s.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  return sites.length > 0 ? `${role} · ${sites.join(', ')}` : role;
}

/**
 * The groups for the menu: Kasper staff first, then each company that has
 * users, in the order the companies were created. A search matches name or
 * email; groups with no match are dropped.
 */
export function viewAsGroups(state: ViewAsState, search: string): ViewAsGroup[] {
  const q = search.trim().toLowerCase();
  const matches = (u: User) =>
    q === '' || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  const row = (u: User): ViewAsRow => ({
    user: u,
    subtitle: subtitleFor(state, u),
    badges: badgesFor(state, u),
    deactivated: u.status === 'deactivated',
  });

  const groups: ViewAsGroup[] = [];
  const staff = state.users.filter(u => isKasperStaff(u.role) && matches(u));
  if (staff.length > 0) groups.push({ key: 'kasper', name: 'Kasper', rows: staff.map(row) });

  for (const tenant of state.tenants) {
    const users = state.users.filter(u => !isKasperStaff(u.role) && u.tenantId === tenant.id && matches(u));
    if (users.length > 0) groups.push({ key: tenant.id, name: tenant.name, rows: users.map(row) });
  }
  return groups;
}
