'use client';

import React, { useState, useMemo } from 'react';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';
import type { Tracker } from '@/domain/types';

function stockStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    'in_stock': 'In stock',
    'paired': 'Paired',
    'faulty': 'Faulty',
    'retired': 'Retired',
  };
  return labels[status] ?? status;
}

function getPairedAsset(tracker: Tracker): string | null {
  if (!tracker.assetId) return null;
  const asset = seed.assets.find(a => a.id === tracker.assetId);
  return asset ? `${asset.code} — ${asset.name}` : null;
}

function getTenant(tracker: Tracker): string | null {
  const asset = seed.assets.find(a => a.id === tracker.assetId);
  if (!asset) return null;
  return seed.tenants.find(t => t.id === asset.ownerTenantId)?.name ?? null;
}

export default function TrackersPage() {
  const store = useStore;
  const session = store.getState().session;

  const [stockFilter, setStockFilter] = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showRegisterManyForm, setShowRegisterManyForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const filteredTrackers = useMemo(() => {
    return seed.trackers.filter(t => {
      if (stockFilter && t.stockStatus !== stockFilter) return false;
      const tenant = getTenant(t);
      if (tenantFilter && tenant !== tenantFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!t.imei.toLowerCase().includes(q) && !t.simIccid.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [stockFilter, tenantFilter, searchQuery]);

  const stockOptions = ['in_stock', 'paired', 'faulty', 'retired'];
  const tenantOptions = useMemo(() => {
    const tenants = new Set<string>();
    seed.trackers.forEach(t => {
      const tenant = getTenant(t);
      if (tenant) tenants.add(tenant);
    });
    return [...tenants];
  }, []);

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

  return (
    <div className="space-y-4 p-4">
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-ink text-paper px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
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

      {/* Register one form */}
      {showCreateForm && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-3">Register tracker</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-grey-500 font-medium">IMEI (15 digits)</label>
              <input
                type="text"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                placeholder="352093001234567"
              />
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">SIM ICCID (19-20 digits starting with 89)</label>
              <input
                type="text"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                placeholder="89012345678901234567"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-grey-500 font-medium">Firmware</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  defaultValue="03.29.00.Rev.03"
                />
              </div>
              <div>
                <label className="text-xs text-grey-500 font-medium">Ping interval (s)</label>
                <input
                  type="number"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  defaultValue="60"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowCreateForm(false)}>Cancel</Button>
              <Button onClick={() => { setShowCreateForm(false); showToast('Tracker registered'); }}>Register</Button>
            </div>
          </div>
        </div>
      )}

      {/* Register many form */}
      {showRegisterManyForm && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-3">Register many trackers</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-grey-500 font-medium">Paste IMEI,SIM lines (one per line)</label>
              <textarea
                rows={6}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink font-mono"
                placeholder={"352093001234567,89012345678901234567\n352093001234568,89012345678901234568"}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowRegisterManyForm(false)}>Cancel</Button>
              <Button onClick={() => { setShowRegisterManyForm(false); showToast('18 added · 2 skipped'); }}>Import valid rows</Button>
            </div>
          </div>
        </div>
      )}

      {/* Trackers list */}
      <div className="space-y-2">
        {filteredTrackers.map(tracker => {
          const asset = getPairedAsset(tracker);
          const tenant = getTenant(tracker);

          return (
            <div
              key={tracker.id}
              className="bg-surface border border-line rounded-lg p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink font-mono">{tracker.imei}</span>
                    <Badge variant={tracker.stockStatus === 'paired' ? 'green' : tracker.stockStatus === 'faulty' ? 'red' : tracker.stockStatus === 'retired' ? 'grey' : 'default'}>
                      {stockStatusLabel(tracker.stockStatus)}
                    </Badge>
                  </div>
                  <div className="text-sm text-grey-700 mt-1">
                    SIM: {tracker.simIccid}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-grey-500">
                    <span>Firmware: {tracker.firmware}</span>
                    <span>Ping: {tracker.pingIntervalSec}s</span>
                    <span>Sleep: {tracker.sleepMode}</span>
                    {asset && <span>Asset: {asset}</span>}
                    {tenant && <span>Tenant: {tenant}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  {tracker.stockStatus === 'in_stock' && (
                    <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                      Pair
                    </button>
                  )}
                  {tracker.stockStatus === 'paired' && (
                    <>
                      <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                        Move
                      </button>
                      <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                        Unpair
                      </button>
                    </>
                  )}
                  {tracker.stockStatus === 'paired' && (
                    <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                      Mark faulty
                    </button>
                  )}
                  {tracker.stockStatus !== 'paired' && (
                    <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                      Retire
                    </button>
                  )}
                  {tracker.stockStatus === 'paired' && (
                    <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                      Settings
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
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
