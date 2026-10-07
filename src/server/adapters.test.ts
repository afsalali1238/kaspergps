// CAN adapters (spec 11.9 console → CAN adapters): registration rules, fitting
// (dated, tracker required, LVCAN200 light vehicles only) and removal.
import { describe, it, expect, afterEach } from 'vitest';
import {
  ADAPTER_SERIAL_DUPLICATE, LVCAN_MODEL_ERROR, adapterForAsset, adapterById, fitAdapter,
  fittedAssetFor, fittingHistory, markAdapterFaulty, modelFitsAsset, registerAdapter, removeAdapter,
  stockAdapters,
} from './adapters';
import { currentTrackerForAsset } from './trackers';
import { seed, ANCHOR_MS } from '@/server/seed/data';
import type { Asset, CanAdapter, Session } from '@/domain/types';
import * as clock from '@/lib/clock';

function sessionFor(userId: string): Session {
  const user = seed.users.find(u => u.id === userId)!;
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: user.siteIds,
    role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

const sara = () => sessionFor('u-sara');      // Kasper Admin
const ravi = () => sessionFor('u-ravi');      // Kasper Ops
const khalid = () => sessionFor('u-khalid');  // Emirates owner — not Kasper

/** An asset that could take a CAN adapter: tracker on it, no adapter yet. */
function target(pred: (a: Asset) => boolean): Asset {
  const asset = seed.assets.find(a => currentTrackerForAsset(a.id) && !adapterForAsset(a.id) && pred(a));
  if (!asset) throw new Error('no candidate asset left in the seed');
  return asset;
}

const fittedCount = () => seed.adapters.filter(a => a.status === 'fitted').length;

/** Register a fresh adapter so the tests do not fight over the seeded stock. */
let serialSeq = 0;
function freshAdapter(model: CanAdapter['model'] = 'ALL-CAN300'): CanAdapter {
  const prefix = model === 'ALL-CAN300' ? 'AC3' : 'LV2';
  const serial = `${prefix}-009${String(++serialSeq).padStart(3, '0')}`;
  const result = registerAdapter(sara(), { serial, model });
  if (!result.ok) throw new Error(result.error);
  return result.data!;
}

afterEach(() => {
  clock.setAnchor(ANCHOR_MS);
});

describe('adapters — reads', () => {
  it('looks an adapter up by id and by asset', () => {
    expect(adapterById('a-ex04')?.serial).toBe('AC3-004123');
    expect(adapterById('a-nope')).toBeNull();
    expect(adapterForAsset('a-ex04')?.id).toBe('a-ex04');
    expect(adapterForAsset('a-fb12')).toBeNull(); // Tier 1, no adapter
    expect(fittedAssetFor(adapterById('a-ex04')!)?.code).toBe('EX-04');
    expect(fittedAssetFor(adapterById('a-stock-1')!)).toBeNull();
  });

  it('lists stock by model and knows the fitting history', () => {
    const stock = stockAdapters();
    expect(stock.length).toBeGreaterThanOrEqual(4);
    expect(stock.every(a => a.status === 'in_stock')).toBe(true);
    expect(stockAdapters('LVCAN200').map(a => a.serial)).toEqual(['LV2-002201', 'LV2-002202']);
    expect(stockAdapters('ALL-CAN300').map(a => a.serial)).toContain('AC3-006101');

    const history = fittingHistory('a-ex04');
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ adapterId: 'a-ex04', assetId: 'a-ex04', to: null });
    expect(new Date(history[0].from).getTime()).toBe(new Date('2026-01-15T09:00:00Z').getTime());
    expect(fittingHistory('a-nope')).toEqual([]);
  });

  it('keeps LVCAN200 for light vehicles only', () => {
    const truck = seed.assets.find(a => a.assetClass === 'truck')!;
    const light = seed.assets.find(a => a.assetClass === 'light_vehicle')!;
    expect(modelFitsAsset('LVCAN200', truck)).toBe(false);
    expect(modelFitsAsset('LVCAN200', light)).toBe(true);
    expect(modelFitsAsset('ALL-CAN300', truck)).toBe(true);
    expect(modelFitsAsset('ALL-CAN300', light)).toBe(true);
  });
});

describe('adapters — register', () => {
  it('registers a stock adapter in the expected serial formats', () => {
    const result = registerAdapter(ravi(), { serial: 'ac3-006103', model: 'ALL-CAN300' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data!.serial).toBe('AC3-006103'); // normalised to upper case
    expect(result.data!.status).toBe('in_stock');
    expect(result.data!.assetId).toBe(null);
    expect(result.message).toBe('AC3-006103 registered.');
    expect(stockAdapters('ALL-CAN300').some(a => a.serial === 'AC3-006103')).toBe(true);
    expect(seed.auditEntries.some(e => e.action === 'adapter.register' && e.detail.includes('AC3-006103'))).toBe(true);
  });

  it('rejects a malformed serial and a duplicate', () => {
    expect(registerAdapter(sara(), { serial: 'CAN-001', model: 'ALL-CAN300' })).toMatchObject({
      ok: false, error: 'Serial must look like AC3-006101 (ALL-CAN300) or LV2-002201 (LVCAN200).',
    });
    expect(registerAdapter(sara(), { serial: 'LV2-221', model: 'LVCAN200' }).ok).toBe(false);
    expect(registerAdapter(sara(), { serial: 'AC3-006101', model: 'ALL-CAN300' })).toMatchObject({
      ok: false, error: ADAPTER_SERIAL_DUPLICATE,
    });
    expect(registerAdapter(sara(), { serial: 'ac3-006101', model: 'ALL-CAN300' }).ok).toBe(false);
  });

  it('is Kasper-only', () => {
    expect(registerAdapter(khalid(), { serial: 'AC3-006199', model: 'ALL-CAN300' })).toMatchObject({
      ok: false, error: 'Only Kasper can register adapters.',
    });
  });
});

describe('adapters — fit', () => {
  it('fits a stock adapter to an asset with a tracker and opens the fitting', () => {
    const asset = target(a => a.assetClass === 'truck');
    const adapter = freshAdapter();
    const before = fittedCount();

    const result = fitAdapter(sara(), { adapterId: adapter.id, assetId: asset.id });
    expect(result.ok).toBe(true);
    expect(result.message).toContain(`fitted to ${asset.code}`);
    expect(result.message).toContain('Tier 1');

    const fitted = seed.adapters.find(a => a.id === adapter.id)!;
    expect(fitted.status).toBe('fitted');
    expect(fitted.assetId).toBe(asset.id);
    expect(fittedCount()).toBe(before + 1);

    const updated = seed.assets.find(a => a.id === asset.id)!;
    expect(updated.canProfile.adapter).toBe('ALL-CAN300');
    // Tier 3: the day-one params plus the full CAN set.
    expect(updated.canProfile.supported).toContain('engineHours');
    expect(updated.canProfile.supported).toContain('adBlue');
    expect(updated.canProfile.supported).toContain('gnss');
    expect(updated.canProfile.checkedAt).toBe(new Date(ANCHOR_MS).toISOString());

    const history = fittingHistory(adapter.id);
    expect(history[0]).toMatchObject({ assetId: asset.id, to: null });
    expect(seed.auditEntries.some(e => e.action === 'adapter.fit' && e.assetId === asset.id)).toBe(true);
  });

  it('gives a light vehicle the LVCAN200 defaults (Tier 2, no adBlue)', () => {
    const asset = target(a => a.assetClass === 'light_vehicle');
    const adapter = freshAdapter('LVCAN200');
    const result = fitAdapter(sara(), { adapterId: adapter.id, assetId: asset.id });
    expect(result.ok).toBe(true);
    const updated = seed.assets.find(a => a.id === asset.id)!;
    expect(updated.canProfile.adapter).toBe('LVCAN200');
    expect(updated.canProfile.supported).toContain('coolantTemp');
    expect(updated.canProfile.supported).not.toContain('adBlue');
  });

  it('refuses LVCAN200 on a truck and machinery', () => {
    const asset = target(a => a.assetClass === 'truck');
    const adapter = freshAdapter('LVCAN200');
    expect(fitAdapter(sara(), { adapterId: adapter.id, assetId: asset.id })).toMatchObject({
      ok: false, error: LVCAN_MODEL_ERROR,
    });
    expect(seed.assets.find(a => a.id === asset.id)!.canProfile.adapter).not.toBe('LVCAN200');
  });

  it('needs a tracker on the asset first', () => {
    const bare = seed.assets.find(a => !currentTrackerForAsset(a.id) && !adapterForAsset(a.id))!;
    expect(fitAdapter(sara(), { adapterId: freshAdapter().id, assetId: bare.id })).toMatchObject({
      ok: false, error: `Fit a tracker to ${bare.code} first — CAN adapters need one.`,
    });
  });

  it('keeps one adapter per asset and refuses bad input', () => {
    expect(fitAdapter(sara(), { adapterId: freshAdapter().id, assetId: 'a-ex04' })).toMatchObject({
      ok: false, error: 'EX-04 already has AC3-004123. Remove it first.',
    });
    expect(fitAdapter(sara(), { adapterId: 'a-faulty-1', assetId: 'a-fb12' })).toMatchObject({
      ok: false, error: 'This adapter is flagged faulty.',
    });
    expect(fitAdapter(sara(), { adapterId: 'a-nope', assetId: 'a-fb12' })).toMatchObject({
      ok: false, error: 'Adapter not found.',
    });
    expect(fitAdapter(sara(), { adapterId: freshAdapter().id, assetId: 'a-nope' })).toMatchObject({
      ok: false, error: 'Asset not found.',
    });
    expect(fitAdapter(khalid(), { adapterId: freshAdapter().id, assetId: 'a-fb12' })).toMatchObject({
      ok: false, error: 'Only Kasper can fit adapters.',
    });
  });
});

describe('adapters — remove and faulty', () => {
  it('removing sends the asset back to Tier 1 from now and closes the fitting', () => {
    const asset = target(a => a.assetClass === 'truck');
    const adapter = freshAdapter();
    expect(fitAdapter(sara(), { adapterId: adapter.id, assetId: asset.id }).ok).toBe(true);

    const result = removeAdapter(sara(), adapter.id);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Tier 1 from now');
    expect(seed.adapters.find(a => a.id === adapter.id)).toMatchObject({ status: 'in_stock', assetId: null });

    const updated = seed.assets.find(a => a.id === asset.id)!;
    expect(updated.canProfile.adapter).toBe('none');
    expect(updated.canProfile.supported).not.toContain('adBlue');
    expect(updated.canProfile.notes).toContain('removed');
    const history = fittingHistory(adapter.id);
    expect(history[0].to).not.toBe(null);
    expect(seed.auditEntries.some(e => e.action === 'adapter.remove' && e.assetId === asset.id)).toBe(true);
  });

  it('will not remove an adapter that is not fitted, and only Kasper can try', () => {
    const loose = freshAdapter();
    expect(removeAdapter(sara(), loose.id)).toMatchObject({
      ok: false, error: 'This adapter is not fitted to an asset.',
    });
    expect(removeAdapter(sara(), 'a-nope')).toMatchObject({ ok: false, error: 'Adapter not found.' });
    expect(removeAdapter(khalid(), 'a-ex04')).toMatchObject({
      ok: false, error: 'Only Kasper can remove adapters.',
    });
  });

  it('marking faulty takes it off the asset, keeps the note and the audit trail', () => {
    const asset = target(a => a.assetClass === 'truck');
    const adapter = freshAdapter();
    expect(fitAdapter(sara(), { adapterId: adapter.id, assetId: asset.id }).ok).toBe(true);

    expect(markAdapterFaulty(sara(), adapter.id, '   ')).toMatchObject({
      ok: false, error: 'Add a note saying what is wrong.',
    });

    const result = markAdapterFaulty(sara(), adapter.id, 'no CAN power');
    expect(result.ok).toBe(true);
    expect(result.message).toBe(`${adapter.serial} flagged faulty.`);
    expect(seed.adapters.find(a => a.id === adapter.id)).toMatchObject({ status: 'faulty', assetId: null });
    expect(seed.assets.find(a => a.id === asset.id)!.canProfile.adapter).toBe('none');
    expect(fittingHistory(adapter.id)[0].to).not.toBe(null);

    const entry = seed.auditEntries.find(e => e.action === 'adapter.faulty' && e.assetId === asset.id);
    expect(entry?.reason).toBe('no CAN power');
    expect(entry?.detail).toContain('no CAN power');
  });

  it('can flag a stock adapter faulty without touching any asset', () => {
    const adapter = freshAdapter();
    const result = markAdapterFaulty(ravi(), adapter.id, 'bent connector');
    expect(result.ok).toBe(true);
    expect(seed.adapters.find(a => a.id === adapter.id)).toMatchObject({ status: 'faulty', assetId: null });
    expect(markAdapterFaulty(khalid(), 'a-ex04', 'note')).toMatchObject({
      ok: false, error: 'Only Kasper can flag adapters.',
    });
  });

  it('a removed or faulty adapter can be fitted again later', () => {
    const asset = target(a => a.assetClass === 'truck');
    const adapter = freshAdapter();
    expect(markAdapterFaulty(sara(), adapter.id, 'cable chafed').ok).toBe(true);
    expect(fitAdapter(sara(), { adapterId: adapter.id, assetId: asset.id })).toMatchObject({
      ok: false, error: 'This adapter is flagged faulty.',
    });
    // Registering a replacement and fitting that one works.
    expect(fitAdapter(sara(), { adapterId: freshAdapter().id, assetId: asset.id }).ok).toBe(true);
  });
});
