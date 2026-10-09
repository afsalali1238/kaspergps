'use client';

import React, { useMemo, useState } from 'react';
import {
  Button, Badge, EmptyState, TierChip,
} from '@/components/ui';
import { useDb, assetsWithoutTracker, currentPairingForTracker, markTrackerFaulty, pairingHistory, pairTracker, pairingTargetsFor, registerTracker, retireTracker, unpairTracker, updateTrackerSettings } from '@/server/api';
import type { Asset, Tracker, TrackerSleepMode } from '@/domain/types';
import * as clock from '@/lib/clock';
import { isValidIccid, isValidImei, ICCID_ERROR, IMEI_ERROR } from '@/domain/tracker-id';
import { useSession } from '@/hooks';

function stockStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    in_stock: 'In stock',
    paired: 'Paired',
    faulty: 'Faulty',
    retired: 'Retired',
  };
  return labels[status] ?? status;
}

function statusBadgeVariant(status: string): 'default' | 'green' | 'red' | 'grey' {
  if (status === 'paired') return 'green';
  if (status === 'faulty') return 'red';
  if (status === 'retired') return 'grey';
  return 'default';
}

function tierOf(asset: Asset): 1 | 2 | 3 {
  if (asset.canProfile.adapter === 'ALL-CAN300') return 3;
  if (asset.canProfile.adapter === 'LVCAN200') return 2;
  return 1;
}

function fmtDay(ts: string | number | null): string {
  if (ts === null) return 'now';
  const ms = typeof ts === 'number' ? ts : new Date(ts).getTime();
  return clock.formatDubaiDate(ms);
}

function currentAssetFor(tracker: Tracker, assets: readonly Asset[]): Asset | null {
  const pairing = currentPairingForTracker(tracker.id);
  if (pairing) return assets.find(a => a.id === pairing.assetId) ?? null;
  if (tracker.assetId) return assets.find(a => a.id === tracker.assetId) ?? null;
  return null;
}

const SLEEP_MODES: TrackerSleepMode[] = ['off', 'deep', 'gps'];

export default function TrackersPage() {
  const seed = useDb(s => s);
  const session = useSession();

  const [stockFilter, setStockFilter] = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [version, setVersion] = useState(0);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showRegisterManyForm, setShowRegisterManyForm] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const showToast = (kind: 'ok' | 'error', message: string) => {
    setToast({ kind, text: message });
    setTimeout(() => setToast(null), 4000);
  };
  const refresh = () => setVersion(v => v + 1);

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

  const filteredTrackers = seed.trackers.filter(t => {
    if (stockFilter && t.stockStatus !== stockFilter) return false;
    if (tenantFilter) {
      const asset = currentAssetFor(t, seed.assets);
      const tenant = asset ? seed.tenants.find(x => x.id === asset.ownerTenantId)?.name : null;
      if (tenant !== tenantFilter) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!t.imei.toLowerCase().includes(q) && !t.simIccid.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const stockOptions = ['in_stock', 'paired', 'faulty', 'retired'];
  const tenantOptions = (() => {
    const tenants = new Set<string>();
    seed.trackers.forEach(t => {
      const asset = currentAssetFor(t, seed.assets);
      const tenant = asset ? seed.tenants.find(x => x.id === asset.ownerTenantId)?.name : null;
      if (tenant) tenants.add(tenant);
    });
    return [...tenants];
  })();

  return (
    <div className="space-y-4 p-4" key={version}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Trackers</h1>
          <p className="text-sm text-grey-500 mt-1">
            Manage trackers and SIMs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowRegisterManyForm(!showRegisterManyForm)}>Register many</Button>
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>Register one</Button>
        </div>
      </div>

      {toast && (
        <div
          className={
            toast.kind === 'ok'
              ? 'fixed bottom-4 right-4 bg-ink text-paper px-4 py-2 rounded-lg shadow-lg text-sm z-50'
              : 'fixed bottom-4 right-4 bg-red text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50'
          }
        >
          {toast.text}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={stockFilter ?? ''}
          onChange={e => setStockFilter(e.target.value || null)}
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        >
          <option value="">All statuses</option>
          {stockOptions.map(s => (
            <option key={s} value={s}>{stockStatusLabel(s)}</option>
          ))}
        </select>
        <select
          value={tenantFilter ?? ''}
          onChange={e => setTenantFilter(e.target.value || null)}
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        >
          <option value="">All tenants</option>
          {tenantOptions.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search IMEI or SIM..."
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        />
      </div>

      {showCreateForm && (
        <RegisterOneForm
          onCancel={() => setShowCreateForm(false)}
          onDone={message => { setShowCreateForm(false); showToast('ok', message); refresh(); }}
          onError={message => showToast('error', message)}
        />
      )}

      {showRegisterManyForm && (
        <RegisterManyForm
          onCancel={() => setShowRegisterManyForm(false)}
          onDone={message => { setShowRegisterManyForm(false); showToast('ok', message); refresh(); }}
          onError={message => showToast('error', message)}
        />
      )}

      {/* Trackers list */}
      <div className="space-y-2">
        {filteredTrackers.map(tracker => (
          <TrackerRow
            key={tracker.id}
            tracker={tracker}
            onToast={showToast}
            onChanged={refresh}
          />
        ))}
        {filteredTrackers.length === 0 && (
          <EmptyState
            title="No trackers"
            description="No trackers match the current filters."
          />
        )}
      </div>
    </div>
  );
}

// ── Register one ──────────────────────────────────────────────────────────────

function RegisterOneForm({ onCancel, onDone, onError }: {
  onCancel: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const session = useSession()!;
  const [imei, setImei] = useState('');
  const [simIccid, setSimIccid] = useState('');
  const [firmware, setFirmware] = useState('03.29.00.Rev.03');
  const [ping, setPing] = useState('60');
  const [sleepMode, setSleepMode] = useState<TrackerSleepMode>('off');

  const imeiError = imei && (!/^\d{15}$/.test(imei) || !isValidImei(imei)) ? IMEI_ERROR : null;
  const simError = simIccid && !isValidIccid(simIccid) ? ICCID_ERROR : null;

  return (
    <div className="bg-surface border border-line rounded-lg p-4">
      <h2 className="text-sm font-medium text-ink mb-3">Register tracker</h2>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-grey-500 font-medium">IMEI (15 digits)</label>
          <input
            type="text"
            value={imei}
            onChange={e => setImei(e.target.value.replace(/\D/g, '').slice(0, 15))}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink font-mono"
            placeholder="352093001234567"
          />
          {imeiError && <div className="text-xs text-red mt-1">{imeiError}</div>}
        </div>
        <div>
          <label className="text-xs text-grey-500 font-medium">SIM ICCID (19–20 digits starting with 89)</label>
          <input
            type="text"
            value={simIccid}
            onChange={e => setSimIccid(e.target.value.replace(/\D/g, '').slice(0, 20))}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink font-mono"
            placeholder="89012345678901234567"
          />
          {simError && <div className="text-xs text-red mt-1">{simError}</div>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-grey-500 font-medium">Firmware</label>
            <input
              type="text"
              value={firmware}
              onChange={e => setFirmware(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
            />
          </div>
          <div>
            <label className="text-xs text-grey-500 font-medium">Ping interval (s)</label>
            <input
              type="number"
              min={30}
              max={300}
              value={ping}
              onChange={e => setPing(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
            />
          </div>
          <div>
            <label className="text-xs text-grey-500 font-medium">Sleep mode</label>
            <select
              value={sleepMode}
              onChange={e => setSleepMode(e.target.value as TrackerSleepMode)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
            >
              {SLEEP_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button
            onClick={() => {
              const result = registerTracker(session, {
                imei,
                simIccid,
                firmware,
                pingIntervalSec: Number(ping),
                sleepMode,
              });
              if (result.ok) onDone(result.message ?? 'Tracker registered.');
              else onError(result.error ?? 'Could not register the tracker.');
            }}
          >
            Register
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Register many ─────────────────────────────────────────────────────────────

interface PreviewRow {
  line: string;
  imei: string;
  simIccid: string;
  error: string | null;
  added?: boolean;
}

function previewRows(text: string, registered: readonly { imei: string }[]): PreviewRow[] {
  const seen = new Set<string>();
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const [rawImei = '', rawSim = ''] = line.split(/[,\t]/).map(s => s.trim());
      const imei = rawImei.replace(/\D/g, '');
      const simIccid = rawSim.replace(/\D/g, '');
      let error: string | null = null;
      if (!/^\d{15}$/.test(imei) || !isValidImei(imei)) error = IMEI_ERROR;
      else if (registered.some(t => t.imei === imei)) error = 'Already registered.';
      else if (seen.has(imei)) error = 'Duplicate in this file.';
      else if (!isValidIccid(simIccid)) error = ICCID_ERROR;
      if (!error) seen.add(imei);
      return { line, imei, simIccid, error };
    });
}

function RegisterManyForm({ onCancel, onDone, onError }: {
  onCancel: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const session = useSession()!;
  const [text, setText] = useState('');
  const trackerRows = useDb(s => s.trackers);
  const rows = useMemo(() => previewRows(text, trackerRows), [text, trackerRows]);
  const validCount = rows.filter(r => !r.error).length;
  const skipped = rows.length - validCount;

  const downloadTemplate = () => {
    const blob = new Blob(['IMEI,SIM\n352093001234561,89012345678901234561\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trackers-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-surface border border-line rounded-lg p-4">
      <h2 className="text-sm font-medium text-ink mb-3">Register many trackers</h2>
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-grey-500 font-medium">Paste IMEI,SIM lines (one per line)</label>
            <button
              className="text-xs text-yellow-600 hover:text-yellow font-medium"
              onClick={downloadTemplate}
            >
              Download template CSV
            </button>
          </div>
          <textarea
            rows={6}
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink font-mono"
            placeholder={'352093001234561,89012345678901234561\n352093001234562,89012345678901234562'}
          />
        </div>

        {rows.length > 0 && (
          <div className="border border-line rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-paper-2 text-xs text-grey-500 border-b border-line">
              {validCount} ready · {skipped} skipped
            </div>
            <table className="w-full text-xs border-collapse">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.line}-${i}`} className="bg-paper">
                    <td className="px-3 py-1.5 border-b border-line w-6">
                      {r.error ? <span className="text-red">✕</span> : <span className="text-green">✓</span>}
                    </td>
                    <td className="px-3 py-1.5 border-b border-line font-mono text-grey-700">{r.imei || '—'}</td>
                    <td className="px-3 py-1.5 border-b border-line font-mono text-grey-500">{r.simIccid || '—'}</td>
                    <td className="px-3 py-1.5 border-b border-line text-red">{r.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button
            disabled={validCount === 0}
            onClick={() => {
              let added = 0;
              let failed = 0;
              for (const r of rows) {
                if (r.error) continue;
                const result = registerTracker(session, { imei: r.imei, simIccid: r.simIccid });
                if (result.ok) added += 1;
                else failed += 1;
              }
              if (added === 0) {
                onError('Nothing was added — fix the errors and try again.');
                return;
              }
              onDone(`${added} added · ${skipped + failed} skipped`);
            }}
          >
            Import valid rows
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── A tracker row with its actions and history ────────────────────────────────

function TrackerRow({ tracker, onToast, onChanged }: {
  tracker: Tracker;
  onToast: (kind: 'ok' | 'error', text: string) => void;
  onChanged: () => void;
}) {
  const seed = useDb(s => s);
  const session = useSession()!;
  const [panel, setPanel] = useState<'none' | 'pair' | 'move' | 'faulty' | 'settings' | 'history'>('none');
  const [faultyNote, setFaultyNote] = useState('');
  const [ping, setPing] = useState(String(tracker.pingIntervalSec));
  const [sleepMode, setSleepMode] = useState<TrackerSleepMode>(tracker.sleepMode);

  const asset = currentAssetFor(tracker, seed.assets);
  const tenant = asset ? seed.tenants.find(t => t.id === asset.ownerTenantId) : null;
  const history = pairingHistory(tracker.id);

  const run = (result: { ok: boolean; error?: string; message?: string }) => {
    if (result.ok) {
      onToast('ok', result.message ?? 'Done.');
      setPanel('none');
      onChanged();
    } else {
      onToast('error', result.error ?? 'Could not do that.');
    }
  };

  return (
    <div className="bg-surface border border-line rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink font-mono">{tracker.imei}</span>
            <Badge variant={statusBadgeVariant(tracker.stockStatus)}>
              {stockStatusLabel(tracker.stockStatus)}
            </Badge>
            {tracker.flaggedForSupport && <Badge variant="amber">Support</Badge>}
          </div>
          <div className="text-sm text-grey-700 mt-1">
            SIM: {tracker.simIccid}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-grey-500 flex-wrap">
            <span>Firmware: {tracker.firmware}</span>
            <span>Ping: {tracker.pingIntervalSec}s</span>
            <span>Sleep: {tracker.sleepMode}</span>
            {asset && (
              <span className="flex items-center gap-1.5">
                Asset: {asset.code} — {asset.name}
                <TierChip tier={tierOf(asset)} />
              </span>
            )}
            {tenant && <span>Tenant: {tenant.name}</span>}
          </div>
          {tracker.flaggedForSupport && (
            <div className="text-xs text-grey-500 mt-1">
              Flagged by {seed.users.find(u => u.id === tracker.flaggedForSupport!.by)?.name ?? tracker.flaggedForSupport.by}
              {': '}{tracker.flaggedForSupport.note}
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-wrap justify-end max-w-[22rem]">
          {tracker.stockStatus === 'in_stock' && (
            <button
              className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
              onClick={() => setPanel(panel === 'pair' ? 'none' : 'pair')}
            >
              Pair
            </button>
          )}
          {tracker.stockStatus === 'paired' && (
            <>
              <button
                className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                onClick={() => setPanel(panel === 'move' ? 'none' : 'move')}
              >
                Move
              </button>
              <button
                className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                onClick={() => run(unpairTracker(session, tracker.id))}
              >
                Unpair
              </button>
              <button
                className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                onClick={() => { setPanel(panel === 'faulty' ? 'none' : 'faulty'); setFaultyNote(''); }}
              >
                Mark faulty
              </button>
            </>
          )}
          {tracker.stockStatus !== 'paired' && (
            <button
              className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
              onClick={() => run(retireTracker(session, tracker.id))}
            >
              Retire
            </button>
          )}
          <button
            className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
            onClick={() => { setPanel(panel === 'settings' ? 'none' : 'settings'); setPing(String(tracker.pingIntervalSec)); setSleepMode(tracker.sleepMode); }}
          >
            Settings
          </button>
          <button
            className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
            onClick={() => setPanel(panel === 'history' ? 'none' : 'history')}
          >
            History ({history.length})
          </button>
        </div>
      </div>

      {(panel === 'pair' || panel === 'move') && (
        <AssetPicker
          title={panel === 'pair'
            ? `Pair ${tracker.imei} to an asset`
            : `Move ${tracker.imei}`}
          hint={panel === 'pair'
            ? 'The asset becomes Unknown until the first fix (2–5 minutes).'
            : `History before now stays with ${asset?.code ?? 'the old asset'}.`}
          assets={panel === 'pair' ? assetsWithoutTracker() : pairingTargetsFor(tracker.id)}
          onCancel={() => setPanel('none')}
          onConfirm={assetId => run(pairTracker(session, tracker.id, assetId))}
        />
      )}

      {panel === 'faulty' && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={faultyNote}
              onChange={e => setFaultyNote(e.target.value)}
              placeholder="What is wrong? (e.g. intermittent GSM)"
              className="flex-1 min-w-[16rem] px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
            />
            <Button variant="danger" size="sm" onClick={() => run(markTrackerFaulty(session, tracker.id, faultyNote))}>
              Mark faulty
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPanel('none')}>Cancel</Button>
          </div>
          <p className="text-xs text-grey-500 mt-2">
            A paired tracker comes off its asset when it is flagged, and the asset goes back to No tracker.
          </p>
        </div>
      )}

      {panel === 'settings' && (
        <div className="mt-3 border-t border-line pt-3 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-grey-500 font-medium">Ping interval (30–300 s)</label>
              <input
                type="number"
                min={30}
                max={300}
                value={ping}
                onChange={e => setPing(e.target.value)}
                className="w-32 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Sleep mode</label>
              <select
                value={sleepMode}
                onChange={e => setSleepMode(e.target.value as TrackerSleepMode)}
                className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              >
                {SLEEP_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <Button
              size="sm"
              onClick={() => run(updateTrackerSettings(session, tracker.id, {
                pingIntervalSec: Number(ping),
                sleepMode,
              }))}
            >
              Save settings
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPanel('none')}>Cancel</Button>
          </div>
        </div>
      )}

      {panel === 'history' && (
        <div className="mt-3 border-t border-line pt-3">
          {history.length === 0 ? (
            <div className="text-xs text-grey-500">This tracker has never been paired.</div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-grey-500">
                  <th className="py-1 text-left font-medium">Asset</th>
                  <th className="py-1 text-left font-medium">From</th>
                  <th className="py-1 text-left font-medium">To</th>
                </tr>
              </thead>
              <tbody>
                {history.map(p => {
                  const a = seed.assets.find(x => x.id === p.assetId);
                  return (
                    <tr key={p.id}>
                      <td className="py-1 font-mono text-grey-700">{a?.code ?? p.assetId}</td>
                      <td className="py-1 text-grey-500">{fmtDay(p.from)}</td>
                      <td className="py-1 text-grey-500">{p.to === null ? 'now' : fmtDay(p.to)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Asset picker (pair / move) ────────────────────────────────────────────────

function AssetPicker({ title, hint, assets, onCancel, onConfirm }: {
  title: string;
  hint: string;
  assets: Asset[];
  onCancel: () => void;
  onConfirm: (assetId: string) => void;
}) {
  const seed = useDb(s => s);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(assets[0]?.id ?? null);

  const results = assets.filter(a => {
    if (!query) return true;
    const q = query.toLowerCase();
    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
  });
  const pickedAsset = assets.find(a => a.id === picked) ?? null;

  return (
    <div className="mt-3 border-t border-line pt-3 space-y-3">
      <div className="text-sm font-medium text-ink">{title}</div>
      <p className="text-xs text-grey-500">{hint}</p>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search code or name across tenants…"
        className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
      />
      <div className="max-h-48 overflow-y-auto border border-line rounded-lg divide-y divide-line">
        {results.length === 0 && (
          <div className="p-3 text-xs text-grey-500">No assets with no tracker match that search.</div>
        )}
        {results.map(a => (
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
            <TierChip tier={tierOf(a)} />
          </button>
        ))}
      </div>
      {pickedAsset && (
        <div className="bg-paper-2 border border-line rounded-lg p-3 text-xs text-grey-700">
          Pair to <span className="font-mono">{pickedAsset.code}</span> — owned by{' '}
          <span className="font-medium">{seed.tenants.find(t => t.id === pickedAsset.ownerTenantId)?.name}</span>,
          tier <TierChip tier={tierOf(pickedAsset)} />
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={!picked} onClick={() => picked && onConfirm(picked)}>
          Confirm
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
