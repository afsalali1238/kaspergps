// CAN adapters (spec 11.9 console → CAN adapters, and 6.2 adapter defaults).
// Fitting is dated: the tier changes from the fitting time only, so earlier
// history stays Tier 1 and CAN readings only exist after the fit.

import type { Asset, CanAdapter, Session } from '@/domain/types';
import { seed, allParamsExcept } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { fail, ok, type OpResult } from '@/server/result';
import { hasCapability } from '@/server/access';
import { recordAuditForSession } from '@/server/audit';
import { currentTrackerForAsset } from '@/server/trackers';

let adapterSeq = 0;
let fittingSeq = 0;

export function adapterById(adapterId: string): CanAdapter | null {
  return seed.adapters.find(a => a.id === adapterId) ?? null;
}

/** The asset an adapter is fitted to right now (null when in stock/faulty). */
export function fittedAssetFor(adapter: CanAdapter): Asset | null {
  if (!adapter.assetId) return null;
  return seed.assets.find(a => a.id === adapter.assetId) ?? null;
}

export function adapterForAsset(assetId: string): CanAdapter | null {
  return seed.adapters.find(a => a.assetId === assetId && a.status === 'fitted') ?? null;
}

export function stockAdapters(model?: CanAdapter['model']): CanAdapter[] {
  return seed.adapters.filter(a => a.status === 'in_stock' && (!model || a.model === model));
}

export function fittingHistory(adapterId: string) {
  return seed.adapterFittings
    .filter(f => f.adapterId === adapterId)
    .sort((a, b) => toMs(b.from) - toMs(a.from));
}

/** LVCAN200 is for light vehicles only. */
export function modelFitsAsset(model: CanAdapter['model'], asset: Asset): boolean {
  return model === 'ALL-CAN300' || asset.assetClass === 'light_vehicle';
}

export const LVCAN_MODEL_ERROR = 'LVCAN200 is for light vehicles. Use ALL-CAN300 for trucks and machinery.';
export const ADAPTER_SERIAL_DUPLICATE = 'This serial is already registered.';

export function registerAdapter(session: Session, input: { serial: string; model: CanAdapter['model'] }): OpResult<CanAdapter> {
  if (!hasCapability(session, 'console.adapters.manage')) {
    return fail('Only Kasper can register adapters.');
  }
  const serial = input.serial.trim().toUpperCase();
  if (!/^(AC3|LV2)-\d{6}$/.test(serial)) {
    return fail('Serial must look like AC3-006101 (ALL-CAN300) or LV2-002201 (LVCAN200).');
  }
  if (seed.adapters.some(a => a.serial.toUpperCase() === serial)) return fail(ADAPTER_SERIAL_DUPLICATE);

  const adapter: CanAdapter = {
    id: `ad-new-${++adapterSeq}`,
    serial,
    model: input.model,
    status: 'in_stock',
    assetId: null,
    registeredAt: new Date(clock.now()).toISOString(),
  };
  seed.adapters.push(adapter);
  recordAuditForSession(session, {
    action: 'adapter.register',
    detail: `CAN adapter ${serial} (${input.model}) registered`,
  });
  return ok(adapter, `${serial} registered.`);
}

export interface FitAdapterInput {
  adapterId: string;
  assetId: string;
  /** Params the CAN check found. Defaults to the adapter's full default set. */
  supported?: Asset['canProfile']['supported'];
  notes?: string;
}

export function fitAdapter(session: Session, input: FitAdapterInput): OpResult<CanAdapter> {
  if (!hasCapability(session, 'console.adapters.manage')) {
    return fail('Only Kasper can fit adapters.');
  }
  const adapter = adapterById(input.adapterId);
  if (!adapter) return fail('Adapter not found.');
  const asset = seed.assets.find(a => a.id === input.assetId);
  if (!asset) return fail('Asset not found.');
  if (adapter.status === 'faulty') return fail('This adapter is flagged faulty.');
  if (adapter.status === 'retired') return fail('This adapter is retired.');
  if (adapter.assetId === asset.id) return fail(`${asset.code} already has this adapter.`);
  if (!currentTrackerForAsset(asset.id)) {
    return fail(`Fit a tracker to ${asset.code} first — CAN adapters need one.`);
  }
  if (!modelFitsAsset(adapter.model, asset)) return fail(LVCAN_MODEL_ERROR);

  const existing = adapterForAsset(asset.id);
  if (existing) {
    return fail(`${asset.code} already has ${existing.serial}. Remove it first.`);
  }

  const now = new Date(clock.now()).toISOString();
  adapter.status = 'fitted';
  adapter.assetId = asset.id;
  adapter.fittedAt = now;
  const supported = input.supported ?? (allParamsExcept(adapter.model) as Asset['canProfile']['supported']);
  asset.canProfile = {
    adapter: adapter.model,
    supported,
    checkedAt: now,
    notes: input.notes,
  };
  seed.adapterFittings.push({
    id: `fit-new-${++fittingSeq}`,
    adapterId: adapter.id,
    assetId: asset.id,
    from: now,
    to: null,
  });

  recordAuditForSession(session, {
    action: 'adapter.fit',
    assetId: asset.id,
    tenantId: asset.ownerTenantId,
    detail: `${adapter.serial} (${adapter.model}) fitted to ${asset.code} — tier changes from now, earlier history stays Tier 1`,
  });
  return ok(adapter, `${adapter.serial} fitted to ${asset.code}. CAN readings start now; earlier history stays Tier 1.`);
}

/** Removing drops the asset back to Tier 1 from now; earlier CAN data stays visible. */
export function removeAdapter(session: Session, adapterId: string): OpResult<CanAdapter> {
  if (!hasCapability(session, 'console.adapters.manage')) {
    return fail('Only Kasper can remove adapters.');
  }
  const adapter = adapterById(adapterId);
  if (!adapter) return fail('Adapter not found.');
  const asset = adapter.assetId ? seed.assets.find(a => a.id === adapter.assetId) : null;
  if (!asset) return fail('This adapter is not fitted to an asset.');

  const now = new Date(clock.now()).toISOString();
  const open = seed.adapterFittings.find(f => f.adapterId === adapter.id && f.to === null && f.assetId === asset.id);
  if (open) open.to = now;
  adapter.status = 'in_stock';
  adapter.assetId = null;
  adapter.fittedAt = undefined;
  asset.canProfile = {
    adapter: 'none',
    supported: allParamsExcept('none') as Asset['canProfile']['supported'],
    checkedAt: now,
    notes: `${adapter.serial} removed ${clock.formatDubaiDate(clock.now())}`,
  };

  recordAuditForSession(session, {
    action: 'adapter.remove',
    assetId: asset.id,
    tenantId: asset.ownerTenantId,
    detail: `${adapter.serial} removed from ${asset.code} — back to Tier 1 from now`,
  });
  return ok(adapter, `${adapter.serial} removed from ${asset.code}. The asset is Tier 1 from now; earlier CAN data stays.`);
}

export function markAdapterFaulty(session: Session, adapterId: string, note: string): OpResult<CanAdapter> {
  if (!hasCapability(session, 'console.adapters.manage')) {
    return fail('Only Kasper can flag adapters.');
  }
  const adapter = adapterById(adapterId);
  if (!adapter) return fail('Adapter not found.');
  if (!note.trim()) return fail('Add a note saying what is wrong.');

  const asset = adapter.assetId ? seed.assets.find(a => a.id === adapter.assetId) ?? null : null;
  if (asset) {
    const now = new Date(clock.now()).toISOString();
    const open = seed.adapterFittings.find(f => f.adapterId === adapter.id && f.to === null && f.assetId === asset.id);
    if (open) open.to = now;
    asset.canProfile = { adapter: 'none', supported: allParamsExcept('none') as Asset['canProfile']['supported'], checkedAt: now };
    adapter.assetId = null;
  }
  adapter.status = 'faulty';
  adapter.fittedAt = undefined;

  recordAuditForSession(session, {
    action: 'adapter.faulty',
    assetId: asset?.id,
    detail: `CAN adapter ${adapter.serial} marked faulty — ${note.trim()}`,
    reason: note.trim(),
  });
  return ok(adapter, `${adapter.serial} flagged faulty.`);
}

function toMs(v: string | number): number {
  return typeof v === 'number' ? v : new Date(v).getTime();
}
