// Asset and site administration (spec §11.8, H4.5): add an asset, retire or
// reinstate it, and manage sites. Every write is gated by a capability and
// audited. Rules are checked here, not in the screen.

import type { Asset, AssetClass, ParamKey, Session, Site } from '@/domain/types';
import { db, append, touch, removeWhere } from '@/server/db';
import { fail, ok, type OpResult } from '@/server/result';
import { recordAuditForSession } from '@/server/audit';
import { can } from '@/server/capabilities';
import { DAY_ONE_PARAMS } from '@/server/seed/data';
import * as clock from '@/lib/clock';

const ASSET_CLASSES: AssetClass[] = ['truck', 'light_vehicle', 'plant', 'lifting', 'power'];

export interface CreateAssetInput {
  code: string;
  name: string;
  type: string;
  assetClass: AssetClass;
  make: string;
  model: string;
  year: number;
  plateOrSerial: string;
  homeSiteId: string;
  tankLitres?: number;
  behaviour: Asset['behaviour'];
}

/** Codes are unique across every company, case-insensitive (spec §11.8). */
export function assetCodeTaken(code: string): boolean {
  const wanted = code.trim().toLowerCase();
  return db.getState().assets.some(a => a.code.toLowerCase() === wanted);
}

/** Add an asset. It starts as No tracker, Tier 1, and lists at its home site until a tracker reports. */
export function createAsset(session: Session, input: CreateAssetInput): OpResult<Asset> {
  if (!can(session, 'asset.create')) return fail('Your role can’t add assets.');
  const code = input.code.trim();
  if (!code) return fail('Enter a code for the asset.');
  if (code.length > 20) return fail('Codes are 20 characters or fewer.');
  if (assetCodeTaken(code)) return fail('This code is already in use.');
  if (!input.name.trim()) return fail('Enter a name.');
  if (!ASSET_CLASSES.includes(input.assetClass)) return fail('Pick a class.');
  if (!Number.isInteger(input.year) || input.year < 1950 || input.year > new Date(clock.now()).getUTCFullYear() + 1) {
    return fail('Enter a valid year.');
  }
  const site = db.getState().sites.find(s => s.id === input.homeSiteId);
  if (!site) return fail('Pick a home site.');
  const ownerTenantId = session.isKasper ? site.tenantId : (session.tenantId ?? '');
  if (site.tenantId !== ownerTenantId) return fail('That site belongs to another company.');
  if (input.tankLitres !== undefined && !(input.tankLitres > 0)) return fail('The tank size must be more than 0 litres.');

  // Ids come from the code, with a counter if another asset already has that id.
  const base = `a-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const idTaken = (id: string) => db.getState().assets.some(a => a.id === id);
  let id = base;
  for (let n = 2; idTaken(id); n++) id = `${base}-${n}`;
  const asset: Asset = {
    id,
    code,
    name: input.name.trim(),
    type: input.type.trim() || input.assetClass,
    assetClass: input.assetClass,
    make: input.make.trim(),
    model: input.model.trim(),
    year: input.year,
    plateOrSerial: input.plateOrSerial.trim(),
    ownerTenantId,
    homeSiteId: site.id,
    tankLitres: input.tankLitres,
    // Tier 1: the day-one parameters only, as with the other no-tracker kit.
    canProfile: { adapter: 'none', supported: [...DAY_ONE_PARAMS] as ParamKey[] },
    status: 'no_tracker',
    behaviour: input.behaviour,
    createdAt: new Date(clock.now()).toISOString(),
    createdBy: session.userId,
  };
  append('assets', asset);
  recordAuditForSession(session, { action: 'asset.create', tenantId: ownerTenantId, assetId: asset.id, detail: `Asset ${code} added (No tracker, Tier 1)` });
  return ok(asset, `${code} added. It shows as No tracker until a tracker reports.`);
}

/** A booking that is running or still to come (spec §11.8: retire only with none). */
function liveOrUpcomingBooking(assetId: string) {
  const now = clock.now();
  return db.getState().bookings.find(b =>
    b.assetId === assetId && (b.status === 'active' || b.status === 'scheduled') && new Date(b.end).getTime() > now,
  );
}

function assetForAdmin(session: Session, id: string): Asset | null {
  const asset = db.getState().assets.find(a => a.id === id);
  if (!asset) return null;
  if (!session.isKasper && asset.ownerTenantId !== session.tenantId) return null;
  return asset;
}

/** Retire: leaves the map, list, KPIs and alerts. History and past reports remain. */
export function retireAsset(session: Session, id: string): OpResult<Asset> {
  if (!can(session, 'asset.retire')) return fail('Your role can’t retire assets.');
  const asset = assetForAdmin(session, id);
  if (!asset) return fail('Asset not found.');
  if (asset.retiredAt) return fail(`${asset.code} is already retired.`);
  const booking = liveOrUpcomingBooking(id);
  if (booking) {
    const until = clock.formatDubaiDate(new Date(booking.end).getTime());
    return fail(`${asset.code} is on hire until ${until}. Retire it after the hire ends.`);
  }
  asset.retiredAt = new Date(clock.now()).toISOString();
  touch('assets');
  recordAuditForSession(session, { action: 'asset.retire', tenantId: asset.ownerTenantId, assetId: id, detail: `${asset.code} retired` });
  return ok(asset, `${asset.code} retired.`);
}

/** Reinstate a retired asset. */
export function reinstateAsset(session: Session, id: string): OpResult<Asset> {
  if (!can(session, 'asset.retire')) return fail('Your role can’t reinstate assets.');
  const asset = assetForAdmin(session, id);
  if (!asset) return fail('Asset not found.');
  if (!asset.retiredAt) return fail(`${asset.code} is not retired.`);
  delete asset.retiredAt;
  touch('assets');
  recordAuditForSession(session, { action: 'asset.reinstate', tenantId: asset.ownerTenantId, assetId: id, detail: `${asset.code} reinstated` });
  return ok(asset, `${asset.code} reinstated.`);
}

// ── Sites ──────────────────────────────────────────────────────────────────────

export interface SiteInput {
  name: string;
  center: { lat: number; lng: number };
  radiusM: number;
}

function validateSite(input: SiteInput): string | null {
  if (!input.name.trim()) return 'Enter a site name.';
  if (!(input.radiusM >= 100 && input.radiusM <= 2000)) return 'The radius must be between 100 and 2,000 m.';
  if (!Number.isFinite(input.center.lat) || !Number.isFinite(input.center.lng)) return 'Pick a location on the map.';
  return null;
}

export function createSite(session: Session, input: SiteInput): OpResult<Site> {
  if (!can(session, 'sites.manage')) return fail('Your role can’t manage sites.');
  const problem = validateSite(input);
  if (problem) return fail(problem);
  // Sites belong to a company; a Kasper session without one can't create a site here.
  const tenantId = session.tenantId;
  if (!tenantId) return fail('Pick a company first.');
  const site: Site = {
    id: `s-${input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${db.getState().sites.length + 1}`,
    tenantId,
    name: input.name.trim(),
    center: input.center,
    radiusM: input.radiusM,
  };
  append('sites', site);
  recordAuditForSession(session, { action: 'site.create', tenantId, detail: `Site ${site.name} added (${site.radiusM} m)` });
  return ok(site, `${site.name} added.`);
}

export function updateSite(session: Session, id: string, input: SiteInput): OpResult<Site> {
  if (!can(session, 'sites.manage')) return fail('Your role can’t manage sites.');
  const site = db.getState().sites.find(s => s.id === id);
  if (!site || (!session.isKasper && site.tenantId !== session.tenantId)) return fail('Site not found.');
  const problem = validateSite(input);
  if (problem) return fail(problem);
  site.name = input.name.trim();
  site.center = input.center;
  site.radiusM = input.radiusM;
  touch('sites');
  recordAuditForSession(session, { action: 'site.update', tenantId: site.tenantId, detail: `Site ${site.name} updated` });
  return ok(site, `${site.name} saved.`);
}

/** Delete only when nothing depends on the site (spec §11.8). */
export function deleteSite(session: Session, id: string): OpResult<null> {
  if (!can(session, 'sites.manage')) return fail('Your role can’t manage sites.');
  const state = db.getState();
  const site = state.sites.find(s => s.id === id);
  if (!site || (!session.isKasper && site.tenantId !== session.tenantId)) return fail('Site not found.');
  const assets = state.assets.filter(a => a.homeSiteId === id).length;
  if (assets > 0) return fail(`Move the ${assets} asset${assets === 1 ? '' : 's'} at this site first.`);
  const users = state.users.filter(u => u.siteIds.includes(id)).length;
  if (users > 0) return fail(`Move the ${users} user${users === 1 ? '' : 's'} at this site first.`);
  const bookings = state.bookings.filter(b => b.renterSiteId === id).length;
  if (bookings > 0) return fail(`This site has ${bookings} booking${bookings === 1 ? '' : 's'}. Close them first.`);
  const geofences = state.geofences.filter(g => g.siteId === id).length;
  if (geofences > 0) return fail('Delete its site geofence from the site first.');
  removeWhere('sites', x => x.id === id);
  recordAuditForSession(session, { action: 'site.delete', tenantId: site.tenantId, detail: `Site ${site.name} deleted` });
  return ok(null, `${site.name} deleted.`);
}

/**
 * Transfer an asset to another company (Kasper only). Active or upcoming
 * bookings must end first; the asset takes a home site at the new owner.
 */
export function transferAsset(session: Session, assetId: string, toTenantId: string): OpResult<Asset> {
  if (!session.isKasper) return fail('Only Kasper can transfer assets.');
  const asset = db.getState().assets.find(a => a.id === assetId);
  if (!asset) return fail('Asset not found.');
  if (asset.ownerTenantId === toTenantId) return fail('Pick a different company.');
  if (liveOrUpcomingBooking(assetId)) return fail('Active or upcoming bookings must be resolved before a transfer can proceed.');
  const newSite = db.getState().sites.find(s => s.tenantId === toTenantId);
  if (!newSite) return fail('The new owner needs a site before an asset can move there.');
  const fromTenantId = asset.ownerTenantId;
  asset.ownerTenantId = toTenantId;
  asset.homeSiteId = newSite.id;
  touch('assets');
  recordAuditForSession(session, {
    action: 'asset.transfer',
    tenantId: toTenantId,
    assetId,
    detail: `${asset.code} transferred from ${fromTenantId} to ${toTenantId}`,
  });
  return ok(asset, `${asset.code} transferred. The previous owner's access is now report-only from today.`);
}
