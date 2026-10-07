'use client';

import React, { useState, useMemo } from 'react';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';
import type { CanAdapter } from '@/domain/types';

function adapterModelLabel(model: string): string {
  const labels: Record<string, string> = {
    'LVCAN200': 'LVCAN200',
    'ALL-CAN300': 'ALL-CAN300',
  };
  return labels[model] ?? model;
}

function getFittedAsset(adapter: CanAdapter): string | null {
  return seed.assets.find(a => a.canProfile.adapter === adapter.serial)?.code ?? null;
}

function getTenant(adapter: CanAdapter): string | null {
  const asset = seed.assets.find(a => a.canProfile.adapter === adapter.serial);
  if (!asset) return null;
  return seed.tenants.find(t => t.id === asset.ownerTenantId)?.name ?? null;
}

export default function AdaptersPage() {
  const store = useStore;
  const session = store.getState().session;

  const [modelFilter, setModelFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const filteredAdapters = useMemo(() => {
    return seed.adapters.filter(a => {
      if (modelFilter && a.model !== modelFilter) return false;
      const fittedAsset = getFittedAsset(a);
      const status = fittedAsset ? 'fitted' : 'in_stock';
      if (statusFilter && status !== statusFilter) return false;
      if (searchQuery && !a.serial.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [modelFilter, statusFilter, searchQuery]);

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

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">CAN adapters</h1>
          <p className="text-sm text-grey-500 mt-1">
            Manage CAN adapters and fittings.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>Register adapter</Button>
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
        </select>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search serial..."
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        />
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-3">Register adapter</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-grey-500 font-medium">Serial</label>
              <input
                type="text"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                placeholder="CAN-001"
              />
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Model</label>
              <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                <option value="LVCAN200">LVCAN200 (light vehicles)</option>
                <option value="ALL-CAN300">ALL-CAN300 (trucks & machinery)</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowCreateForm(false)}>Cancel</Button>
              <Button onClick={() => { setShowCreateForm(false); showToast('Adapter registered'); }}>Register</Button>
            </div>
          </div>
        </div>
      )}

      {/* Adapters list */}
      <div className="space-y-2">
        {filteredAdapters.map(adapter => {
          const fittedAsset = getFittedAsset(adapter);
          const tenant = getTenant(adapter);
          const status = fittedAsset ? 'fitted' : 'in_stock';

          return (
            <div
              key={adapter.id}
              className="bg-surface border border-line rounded-lg p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink font-mono">{adapter.serial}</span>
                    <Badge variant={adapter.model === 'ALL-CAN300' ? 'yellow' : 'ink'}>
                      {adapterModelLabel(adapter.model)}
                    </Badge>
                    <Badge variant={status === 'fitted' ? 'green' : 'default'}>
                      {status === 'fitted' ? 'Fitted' : 'In stock'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-grey-500">
                    {fittedAsset && <span>Fitted to: {fittedAsset}</span>}
                    {tenant && <span>Tenant: {tenant}</span>}
                    {adapter.fittedAt && <span>Fitted: {new Date(adapter.fittedAt).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  {status === 'in_stock' && (
                    <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                      Fit to asset
                    </button>
                  )}
                  {status === 'fitted' && (
                    <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                      Remove
                    </button>
                  )}
                  {status === 'fitted' && (
                    <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                      Mark faulty
                    </button>
                  )}
                </div>
              </div>
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
    </div>
  );
}
