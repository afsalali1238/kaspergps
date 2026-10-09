'use client';

import React, { useState } from 'react';
import {
  Button, Badge, EmptyState, TierChip,
} from '@/components/ui';
import { useDb } from '@/server/db';
import * as clock from '@/lib/clock';
import type { Asset, CanAdapter } from '@/domain/types';
import {
  ADAPTER_SERIAL_DUPLICATE, LVCAN_MODEL_ERROR, adapterForAsset, fittedAssetFor,
  fittingHistory, markAdapterFaulty, modelFitsAsset, registerAdapter, removeAdapter, fitAdapter,
  stockAdapters,
} from '@/server/adapters';
import { currentTrackerForAsset } from '@/server/trackers';
import { useSession } from '@/hooks';

function adapterModelLabel(model: string): string {
  return model;
}

function statusWords(adapter: CanAdapter): string {
  if (adapter.status === 'fitted') return 'Fitted';
  if (adapter.status === 'faulty') return 'Faulty';
  if (adapter.status === 'retired') return 'Retired';
  return 'In stock';
}

function tierOf(asset: Asset): 1 | 2 | 3 {
  if (asset.canProfile.adapter === 'ALL-CAN300') return 3;
  if (asset.canProfile.adapter === 'LVCAN200') return 2;
  return 1;
}

export default function AdaptersPage() {
  const seed = useDb(s => s);
  const session = useSession();

  const [modelFilter, setModelFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [version, setVersion] = useState(0);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [fittingAdapterId, setFittingAdapterId] = useState<string | null>(null);
  const [faultyAdapterId, setFaultyAdapterId] = useState<string | null>(null);
  const [faultyNote, setFaultyNote] = useState('');
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const showToast = (kind: 'ok' | 'error', message: string) => {
    setToast({ kind, text: message });
    setTimeout(() => setToast(null), 4000);
  };
  const run = (result: { ok: boolean; error?: string; message?: string }) => {
    if (result.ok) {
      showToast('ok', result.message ?? 'Done.');
      setFittingAdapterId(null);
      setFaultyAdapterId(null);
      setFaultyNote('');
      setVersion(v => v + 1);
    } else {
      showToast('error', result.error ?? 'Could not do that.');
    }
  };

  const filteredAdapters = seed.adapters.filter(a => {
    if (modelFilter && a.model !== modelFilter) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    if (searchQuery && !a.serial.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const modelOptions = ['LVCAN200', 'ALL-CAN300'];

  if (!session || !session.isKasper) {
    return (
      <div className="text-center py-8">
        <EmptyState
          title="Not available"
          description="Only Kasper staff can access the console."
        />
      </div>
    );
  }

  const fittedCount = seed.adapters.filter(a => a.status === 'fitted').length;
  const stockCount = seed.adapters.filter(a => a.status === 'in_stock').length;

  return (
    <div className="space-y-4 p-4" key={version}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">CAN adapters</h1>
          <p className="text-sm text-grey-500 mt-1">
            {fittedCount} fitted · {stockCount} in stock · fittings are dated, so the tier changes from the fitting time only.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>Register adapter</Button>
      </div>

      {toast && (
        <div
          className={
            toast.kind === 'ok'
              ? 'bg-green/10 border border-green/30 text-green text-sm px-4 py-2 rounded-lg'
              : 'bg-red/10 border border-red/30 text-red text-sm px-4 py-2 rounded-lg'
          }
        >
          {toast.text}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={modelFilter ?? ''}
          onChange={e => setModelFilter(e.target.value || null)}
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        >
          <option value="">All models</option>
          {modelOptions.map(m => (
            <option key={m} value={m}>{adapterModelLabel(m)}</option>
          ))}
        </select>
        <select
          value={statusFilter ?? ''}
          onChange={e => setStatusFilter(e.target.value || null)}
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        >
          <option value="">All statuses</option>
          <option value="in_stock">In stock</option>
          <option value="fitted">Fitted</option>
          <option value="faulty">Faulty</option>
          <option value="retired">Retired</option>
        </select>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search serial..."
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        />
      </div>

      {showCreateForm && (
        <RegisterAdapterForm
          serials={seed.adapters.map(a => a.serial)}
          onCancel={() => setShowCreateForm(false)}
          onDone={message => { setShowCreateForm(false); showToast('ok', message); setVersion(v => v + 1); }}
          onError={message => showToast('error', message)}
        />
      )}

      {/* Adapters list */}
      <div className="space-y-2">
        {filteredAdapters.map(adapter => {
          const asset = fittedAssetFor(adapter);
          const tenant = asset ? seed.tenants.find(t => t.id === asset.ownerTenantId) : null;
          const history = fittingHistory(adapter.id);

          return (
            <div key={adapter.id} className="bg-surface border border-line rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink font-mono">{adapter.serial}</span>
                    <Badge variant={adapter.model === 'ALL-CAN300' ? 'yellow' : 'ink'}>
                      {adapterModelLabel(adapter.model)}
                    </Badge>
                    <Badge
                      variant={
                        adapter.status === 'fitted' ? 'green' :
                        adapter.status === 'faulty' ? 'red' :
                        adapter.status === 'retired' ? 'grey' : 'default'
                      }
                    >
                      {statusWords(adapter)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-grey-500 flex-wrap">
                    {asset && (
                      <span className="flex items-center gap-1.5">
                        Fitted to: {asset.code} — {asset.name} <TierChip tier={tierOf(asset)} />
                      </span>
                    )}
                    {tenant && <span>Tenant: {tenant.name}</span>}
                    {adapter.fittedAt && (
                      <span>
                        Fitted: {clock.formatDubaiDate(new Date(adapter.fittedAt).getTime())}
                      </span>
                    )}
                    {history.length > 0 && (
                      <span>
                        Fitting history: {history.map(h => `${seed.assets.find(a => a.id === h.assetId)?.code ?? h.assetId} (${clock.formatDubaiDate(new Date(h.from).getTime())}${h.to ? ` → ${clock.formatDubaiDate(new Date(h.to).getTime())}` : ' → now'})`).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap justify-end max-w-[18rem]">
                  {adapter.status === 'in_stock' && (
                    <button
                      className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                      onClick={() => setFittingAdapterId(fittingAdapterId === adapter.id ? null : adapter.id)}
                    >
                      Fit to asset
                    </button>
                  )}
                  {adapter.status === 'fitted' && (
                    <>
                      <button
                        className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                        onClick={() => run(removeAdapter(session, adapter.id))}
                      >
                        Remove
                      </button>
                      <button
                        className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                        onClick={() => { setFaultyAdapterId(faultyAdapterId === adapter.id ? null : adapter.id); setFaultyNote(''); }}
                      >
                        Mark faulty
                      </button>
                    </>
                  )}
                </div>
              </div>

              {fittingAdapterId === adapter.id && (
                <FitPicker
                  adapter={adapter}
                  onCancel={() => setFittingAdapterId(null)}
                  onConfirm={assetId => run(fitAdapter(session, { adapterId: adapter.id, assetId }))}
                />
              )}

              {faultyAdapterId === adapter.id && (
                <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={faultyNote}
                    onChange={e => setFaultyNote(e.target.value)}
                    placeholder="What is wrong? (e.g. no CAN power)"
                    className="flex-1 min-w-[16rem] px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  />
                  <Button variant="danger" size="sm" onClick={() => run(markAdapterFaulty(session, adapter.id, faultyNote))}>
                    Mark faulty
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setFaultyAdapterId(null)}>Cancel</Button>
                </div>
              )}
            </div>
          );
        })}
        {filteredAdapters.length === 0 && (
          <EmptyState
            title="No adapters"
            description="No adapters match the current filters."
          />
        )}
      </div>

      <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
        <strong className="text-ink">Fitting a CAN adapter</strong> changes the asset&apos;s tier from the fitting time only —
        earlier history stays Tier 1 and CAN readings start at the fit. LVCAN200 is for light vehicles; trucks and machinery need ALL-CAN300.
        Removing one drops the asset back to Tier 1 from that moment, and earlier CAN data stays visible with its source label.
      </div>
    </div>
  );
}

// ── Register ──────────────────────────────────────────────────────────────────

function RegisterAdapterForm({ serials, onCancel, onDone, onError }: {
  serials: string[];
  onCancel: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const session = useSession()!;
  const [serial, setSerial] = useState('');
  const [model, setModel] = useState<CanAdapter['model']>('ALL-CAN300');

  const serialError = serial.length > 0 && !/^(AC3|LV2)-\d{6}$/i.test(serial.trim())
    ? 'Serial must look like AC3-006101 (ALL-CAN300) or LV2-002201 (LVCAN200).'
    : serials.some(s => s.toUpperCase() === serial.trim().toUpperCase())
      ? ADAPTER_SERIAL_DUPLICATE
      : null;

  return (
    <div className="bg-surface border border-line rounded-lg p-4">
      <h2 className="text-sm font-medium text-ink mb-3">Register adapter</h2>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-grey-500 font-medium">Serial</label>
          <input
            type="text"
            value={serial}
            onChange={e => setSerial(e.target.value.toUpperCase())}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink font-mono"
            placeholder="AC3-006103"
          />
          {serialError && <div className="text-xs text-red mt-1">{serialError}</div>}
        </div>
        <div>
          <label className="text-xs text-grey-500 font-medium">Model</label>
          <select
            value={model}
            onChange={e => setModel(e.target.value as CanAdapter['model'])}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          >
            <option value="LVCAN200">LVCAN200 (light vehicles)</option>
            <option value="ALL-CAN300">ALL-CAN300 (trucks &amp; machinery)</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button
            disabled={Boolean(serialError) || serial.length === 0}
            onClick={() => {
              const result = registerAdapter(session, { serial, model });
              if (result.ok) onDone(result.message ?? 'Adapter registered.');
              else onError(result.error ?? 'Could not register the adapter.');
            }}
          >
            Register
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Fit ───────────────────────────────────────────────────────────────────────

function FitPicker({ adapter, onCancel, onConfirm }: {
  adapter: CanAdapter;
  onCancel: () => void;
  onConfirm: (assetId: string) => void;
}) {
  const seed = useDb(s => s);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  // The CAN check default: every param the adapter supports.
  const candidates = seed.assets.filter(a => {
    if (adapterForAsset(a.id)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
  });
  const pickedAsset = seed.assets.find(a => a.id === picked) ?? null;
  const pickedHasTracker = pickedAsset ? Boolean(currentTrackerForAsset(pickedAsset.id)) : false;
  const modelOk = pickedAsset ? modelFitsAsset(adapter.model, pickedAsset) : true;

  return (
    <div className="mt-3 border-t border-line pt-3 space-y-3">
      <div className="text-sm font-medium text-ink">Fit {adapter.serial} to an asset</div>
      <p className="text-xs text-grey-500">
        The asset needs a tracker. The CAN check opens with the adapter&apos;s defaults; the tier changes from the fitting time only.
      </p>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search code or name…"
        className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
      />
      <div className="max-h-48 overflow-y-auto border border-line rounded-lg divide-y divide-line">
        {candidates.length === 0 && (
          <div className="p-3 text-xs text-grey-500">No asset without an adapter matches that search.</div>
        )}
        {candidates.map(a => (
          <button
            key={a.id}
            onClick={() => setPicked(a.id)}
            className={
              picked === a.id
                ? 'w-full text-left px-3 py-2 text-xs bg-paper-2 flex items-center gap-2'
                : 'w-full text-left px-3 py-2 text-xs bg-paper hover:bg-paper-2 flex items-center gap-2'
            }
          >
            <span className="font-mono text-grey-700">{a.code}</span>
            <span className="text-grey-500">{a.name}</span>
            <span className="text-grey-500">· {seed.tenants.find(t => t.id === a.ownerTenantId)?.name}</span>
            <span className="text-grey-500">· {a.assetClass.replace('_', ' ')}</span>
            <TierChip tier={tierOf(a)} />
          </button>
        ))}
      </div>
      {pickedAsset && (
        <div
          className={
            !modelOk
              ? 'bg-red/10 border border-red/30 text-red text-xs rounded-lg p-3'
              : !pickedHasTracker
                ? 'bg-amber/10 border border-amber/30 text-amber-dark text-xs rounded-lg p-3'
                : 'bg-paper-2 border border-line text-xs text-grey-700 rounded-lg p-3'
          }
        >
          {!modelOk
            ? LVCAN_MODEL_ERROR
            : !pickedHasTracker
              ? `${pickedAsset.code} has no tracker — fit one first.`
              : `Fit to ${pickedAsset.code} (tier ${tierOf(pickedAsset)} → tier ${adapter.model === 'ALL-CAN300' ? 3 : 2}), owned by ${seed.tenants.find(t => t.id === pickedAsset.ownerTenantId)?.name}.`}
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={!picked || !modelOk || !pickedHasTracker} onClick={() => picked && onConfirm(picked)}>
          Fit and open the CAN check
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
      <div className="text-xs text-grey-500">
        {stockAdapters(adapter.model).length} {adapterModelLabel(adapter.model)} in stock right now.
      </div>
    </div>
  );
}
