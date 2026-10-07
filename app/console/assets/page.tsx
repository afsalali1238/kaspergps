'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Button, Badge, TierChip, EmptyState,
} from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';
import type { Asset } from '@/domain/types';

function adapterLabel(adapter: string): string {
  const labels: Record<string, string> = {
    'none': 'None',
    'LVCAN200': 'LVCAN200',
    'ALL-CAN300': 'ALL-CAN300',
  };
  return labels[adapter] ?? adapter;
}

function assetStatus(asset: Asset): string {
  const pairing = seed.pairings.find(p => p.assetId === asset.id && p.to === null);
  if (!pairing) return 'No tracker';
  const tracker = seed.trackers.find(t => t.id === pairing.trackerId);
  if (!tracker || tracker.stockStatus !== 'paired') return 'No tracker';
  return 'Fitted';
}

function activeBooking(asset: Asset): string | null {
  return seed.bookings.find(b => b.assetId === asset.id && b.status === 'active')?.reference ?? null;
}

export default function AssetsPage() {
  const store = useStore;
  const session = store.getState().session;

  const [tenantFilter, setTenantFilter] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<1 | 2 | 3 | 'all'>('all');
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [noTrackerFilter, setNoTrackerFilter] = useState(false);
  const [retiredFilter, setRetiredFilter] = useState(false);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [_toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const filteredAssets = useMemo(() => {
    return seed.assets.filter(a => {
      if (tenantFilter && a.ownerTenantId !== tenantFilter) return false;
      const tier = a.canProfile.adapter === 'ALL-CAN300' ? 3 : a.canProfile.adapter === 'LVCAN200' ? 2 : 1;
      if (tierFilter !== 'all' && tier !== tierFilter) return false;
      if (classFilter && a.assetClass !== classFilter) return false;
      const hasTracker = assetStatus(a) === 'Fitted';
      if (noTrackerFilter && hasTracker) return false;
      if (retiredFilter && !a.retiredAt) return false;
      return true;
    });
  }, [tenantFilter, tierFilter, classFilter, noTrackerFilter, retiredFilter]);

  const tenantOptions = useMemo(() => seed.tenants, []);
  const classOptions = useMemo(() => [...new Set(seed.assets.map(a => a.assetClass))], []);

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
          <h1 className="text-lg font-semibold text-ink">Assets</h1>
          <p className="text-sm text-grey-500 mt-1">
            Manage assets across all tenants.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>Create asset</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={tenantFilter ?? ''}
          onChange={e => setTenantFilter(e.target.value || null)}
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        >
          <option value="">All tenants</option>
          {tenantOptions.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={tierFilter}
          onChange={e => setTierFilter(e.target.value as 1 | 2 | 3 | 'all')}
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        >
          <option value="all">All tiers</option>
          <option value={1}>Tier 1</option>
          <option value={2}>Tier 2</option>
          <option value={3}>Tier 3</option>
        </select>
        <select
          value={classFilter ?? ''}
          onChange={e => setClassFilter(e.target.value || null)}
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        >
          <option value="">All classes</option>
          {classOptions.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-grey-700">
          <input
            type="checkbox"
            checked={noTrackerFilter}
            onChange={e => setNoTrackerFilter(e.target.checked)}
            className="rounded"
          />
          No tracker
        </label>
        <label className="flex items-center gap-2 text-sm text-grey-700">
          <input
            type="checkbox"
            checked={retiredFilter}
            onChange={e => setRetiredFilter(e.target.checked)}
            className="rounded"
          />
          Retired
        </label>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-3">Create asset</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-grey-500 font-medium">Code</label>
              <input
                type="text"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                placeholder="FB-12"
              />
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Name</label>
              <input
                type="text"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                placeholder="Flatbed trailer truck"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-grey-500 font-medium">Type</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  placeholder="Truck"
                />
              </div>
              <div>
                <label className="text-xs text-grey-500 font-medium">Class</label>
                <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                  <option value="truck">Truck</option>
                  <option value="light_vehicle">Light vehicle</option>
                  <option value="plant">Plant</option>
                  <option value="lifting">Lifting</option>
                  <option value="power">Power</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-grey-500 font-medium">Make</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  placeholder="Mercedes"
                />
              </div>
              <div>
                <label className="text-xs text-grey-500 font-medium">Model</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  placeholder="Actros"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-grey-500 font-medium">Year</label>
                <input
                  type="number"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  placeholder="2017"
                />
              </div>
              <div>
                <label className="text-xs text-grey-500 font-medium">Plate or serial</label>
                <input
                  type="text"
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  placeholder="AK-1234"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Home site</label>
              <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                {seed.sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Owner tenant</label>
              <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                {tenantOptions.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowCreateForm(false)}>Cancel</Button>
              <Button onClick={() => { setShowCreateForm(false); showToast('Asset created'); }}>Create</Button>
            </div>
          </div>
        </div>
      )}

      {/* Assets list */}
      <div className="space-y-2">
        {filteredAssets.map(asset => {
          const tier = asset.canProfile.adapter === 'ALL-CAN300' ? 3 : asset.canProfile.adapter === 'LVCAN200' ? 2 : 1;
          const owner = seed.tenants.find(t => t.id === asset.ownerTenantId);
          const site = seed.sites.find(s => s.id === asset.homeSiteId);
          const booking = activeBooking(asset);
          const status = assetStatus(asset);

          return (
            <div
              key={asset.id}
              className="bg-surface border border-line rounded-lg p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{asset.code}</span>
                    <span className="text-grey-500">— {asset.name}</span>
                    <TierChip tier={tier} />
                    {status === 'No tracker' && <Badge variant="grey">No tracker</Badge>}
                    {asset.retiredAt && <Badge variant="grey">Retired</Badge>}
                  </div>
                  <div className="text-sm text-grey-700 mt-1">
                    {asset.make} {asset.model} {asset.year} · {asset.plateOrSerial}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-grey-500">
                    <span>Owner: {owner?.name}</span>
                    <span>Site: {site?.name}</span>
                    <span>Adapter: {adapterLabel(asset.canProfile.adapter)}</span>
                    {booking && <span className="text-yellow">Booking: {booking}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Link href={`/console/assets/${asset.id}`} className="text-xs px-2 py-1 rounded bg-yellow/10 border border-yellow/30 text-yellow-dark hover:bg-yellow/20">
                    Details
                  </Link>
                  <Link href={`/app/assets/${asset.id}`} className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                    View
                  </Link>
                  <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                    Edit
                  </button>
                  {!asset.retiredAt && (
                    <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                      Transfer
                    </button>
                  )}
                  {!asset.retiredAt && (
                    <button className="text-xs px-2 py-1 rounded bg-red/10 border border-red/30 text-red hover:bg-red/20">
                      Retire
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filteredAssets.length === 0 && (
          <EmptyState
            title="No assets"
            description="No assets match the current filters."
          />
        )}
      </div>
    </div>
  );
}
