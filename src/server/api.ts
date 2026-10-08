// Server API — all reads and writes go through here.
// Architecture rule 1: components never import the store, seed or telemetry modules.
// Every function takes a session first and delegates access to access.ts.

import type { Session } from '@/domain/types';
import { db, type DbRow, touch } from '@/server/db';
import { computeStatus } from '@/server/telemetry/simulator';
import { hasCapability } from '@/server/access';
import { isKasperStaff } from '@/server/capabilities';
import * as clock from '@/lib/clock';

export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Auth
export async function signIn(email: string, _password: string): Promise<ApiResult<{ session: Session }>> {
  const user = db.getState().users.find(u => u.email === email);
  if (!user) {
    return { success: false, error: "You don't have an account. Please contact your administrator." };
  }
  if (user.status === 'deactivated') {
    return { success: false, error: 'Your account is no longer active. Contact your company admin.' };
  }
  if (user.status === 'invited') {
    // Activate on sign in
    user.status = 'active';
    touch('users');
    return {
      success: true,
      data: {
        session: buildSession(user),
      },
    };
  }
  const tenant = user.tenantId ? db.getState().tenants.find(t => t.id === user.tenantId) : null;
  if (tenant && tenant.status === 'suspended') {
    return { success: false, error: "Your company's account is suspended. Contact Kasper." };
  }
  return {
    success: true,
    data: { session: buildSession(user) },
  };
}

function buildSession(user: DbRow<'users'>): Session {
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: user.siteIds,
    role: user.role,
    isKasper: isKasperStaff(user.role),
  };
}

// Asset reads
export async function getAsset(session: Session, assetId: string): Promise<ApiResult<AssetView>> {
  const access = hasCapability(session, 'asset.view');
  if (!access) {
    return { success: false, error: 'Asset not found' };
  }
  const asset = db.getState().assets.find(a => a.id === assetId);
  if (!asset) {
    return { success: false, error: 'Asset not found' };
  }
  if (session.isKasper && asset.ownerTenantId !== session.tenantId) {
    // audit entry would go here
  }
  return { success: true, data: assetToView(asset, session) };
}

export async function getVisibleAssets(session: Session): Promise<ApiResult<AssetView[]>> {
  const access = hasCapability(session, 'asset.view');
  if (!access) {
    return { success: false, error: 'Access denied' };
  }
  const all = db.getState().assets.filter(a => assetVisibleTo(session, a));
  return { success: true, data: all.map(a => assetToView(a, session)) };
}

function assetVisibleTo(session: Session, asset: DbRow<'assets'>): boolean {
  if (session.isKasper) return true;
  if (asset.ownerTenantId === session.tenantId) return true;
  const booking = db.getState().bookings.find(b => b.assetId === asset.id && isBookingActive(b));
  if (booking && booking.renterTenantId === session.tenantId) {
    const nowMs = clock.now();
    return new Date(booking.start).getTime() <= nowMs && nowMs <= new Date(booking.end).getTime();
  }
  return false;
}

function isBookingActive(b: DbRow<'bookings'>): boolean {
  return b.status === 'active' || b.status === 'scheduled';
}

function assetToView(asset: DbRow<'assets'>, _session: Session): AssetView {
  return {
    id: asset.id,
    code: asset.code,
    name: asset.name,
    type: asset.type,
    assetClass: asset.assetClass,
    make: asset.make,
    model: asset.model,
    year: asset.year,
    plateOrSerial: asset.plateOrSerial,
    ownerTenantId: asset.ownerTenantId,
    ownerName: db.getState().tenants.find(t => t.id === asset.ownerTenantId)?.name ?? '',
    homeSiteId: asset.homeSiteId,
    homeSiteName: db.getState().sites.find(s => s.id === asset.homeSiteId)?.name ?? '',
    tankLitres: asset.tankLitres,
    canProfile: asset.canProfile,
    status: computeStatus(asset, clock.now()),
    behaviour: asset.behaviour,
    tier: asset.canProfile.adapter === 'ALL-CAN300' ? 3 : asset.canProfile.adapter === 'LVCAN200' ? 2 : 1,
  };
}

export interface AssetView {
  id: string;
  code: string;
  name: string;
  type: string;
  assetClass: string;
  make: string;
  model: string;
  year: number;
  plateOrSerial: string;
  ownerTenantId: string;
  ownerName: string;
  homeSiteId: string;
  homeSiteName: string;
  tankLitres?: number;
  canProfile: { adapter: string; supported: string[]; checkedAt?: string; notes?: string };
  status: string;
  behaviour: string;
  tier: number;
}

export type { Session };
