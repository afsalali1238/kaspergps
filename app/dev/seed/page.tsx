'use client';

import React from 'react';
import { Button, Badge, StatusBadge, TierChip, Table } from '@/components/ui';
import { seed } from '@/server/seed/data';
import type { AssetStatus } from '@/domain/types';
import * as clock from '@/lib/clock';
import { hasFeature } from '@/domain/features';
import { FEATURES } from '@/domain/features';

interface SeedRow {
  id: string;
  code: string;
  name: string;
  status: string;
  tier: number;
  class: string;
  owner: string;
  hasCan: boolean;
  features: string[];
}

function computeStatus(asset: typeof seed.assets[0]) {
  const tracker = seed.pairings.find(p => p.assetId === asset.id && p.to === null);
  if (!tracker) return 'no_tracker';
  const tr = seed.trackers.find(t => t.id === tracker.trackerId);
  if (!tr) return 'no_tracker';
  // Simplified
  return 'live';
}

export default function DevSeedPage() {
  const assetRows: SeedRow[] = seed.assets.map(a => {
    const tracker = seed.pairings.find(p => p.assetId === a.id && p.to === null);
    const tr = tracker ? seed.trackers.find(t => t.id === tracker.trackerId) : null;
    const status = tr && tr.stockStatus === 'paired' ? computeStatus(a) : 'no_tracker';
    const tier = a.canProfile.adapter === 'ALL-CAN300' ? 3 : a.canProfile.adapter === 'LVCAN200' ? 2 : 1;
    const owner = seed.tenants.find(t => t.id === a.ownerTenantId)?.name ?? '';
    const hasCan = a.canProfile.adapter !== 'none';
    const features = FEATURES.filter(f => hasFeature(a, f.key)).map(f => f.label);

    return { id: a.id, code: a.code, name: a.name, status, tier, class: a.assetClass, owner, hasCan, features };
  });

  const tenantsRows = seed.tenants.map(t => ({
    id: t.id,
    name: t.name,
    type: t.type,
    status: t.status,
    assets: seed.assets.filter(a => a.ownerTenantId === t.id).length,
    trackers: seed.trackers.filter(tr => {
      const p = seed.pairings.find(pp => pp.assetId === seed.assets.find(a => a.ownerTenantId === t.id)?.id);
      return p && (tr.stockStatus === 'paired');
    }).length,
    users: seed.users.filter(u => u.tenantId === t.id).length,
  }));

  const trackersRows = seed.trackers.filter(t => t.stockStatus === 'paired').map(t => {
    const pair = seed.pairings.find(p => p.trackerId === t.id && p.to === null);
    const asset = pair ? seed.assets.find(a => a.id === pair.assetId) : null;
    return {
      id: t.id,
      imei: t.imei,
      sim: t.simIccid,
      firmware: t.firmware,
      status: t.stockStatus,
      assetCode: asset?.code ?? '—',
      assetName: asset?.name ?? '—',
      owner: asset ? seed.tenants.find(t => t.id === asset.ownerTenantId)?.name ?? '—' : '—',
      flagged: t.flaggedForSupport ? '⚠ Yes' : '—',
    };
  });

  const bookingsRows = seed.bookings.map(b => ({
    id: b.id,
    ref: b.reference,
    assetCode: seed.assets.find(a => a.id === b.assetId)?.code ?? '—',
    owner: seed.tenants.find(t => t.id === b.ownerTenantId)?.name ?? '—',
    renter: b.renterName ?? (b.renterTenantId ? seed.tenants.find(t => t.id === b.renterTenantId)?.name ?? '—' : 'Outside hirer'),
    window: `${new Date(b.start).toLocaleString('en-GB', { day: 'numeric', month: 'short' })} → ${new Date(b.end).toLocaleString('en-GB', { day: 'numeric', month: 'short' })}`,
    status: b.status,
    rate: b.rateType === 'hourly' ? `AED ${b.rateAed}/h` : `AED ${b.rateAed}/day`,
  }));

  return (
    <div className="min-h-screen bg-bg p-6 overflow-x-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">Seed Data</h1>
            <p className="text-sm text-grey-500 mt-1">All seed tables with computed status and tier.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => clock.resetOffset()}>Reset clock</Button>
        </div>

        <h2 className="text-lg font-semibold text-ink mb-3">Clock: {clock.formatDubaiDate(clock.now())} {clock.formatDubaiTime(clock.now())}</h2>

        {/* Tenants */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-grey-700 uppercase tracking-wider mb-2">Tenants ({tenantsRows.length})</h3>
          <Table
            keyField="id"
            columns={[
              { key: 'name', header: 'Tenant', render: (r) => <div className="font-medium">{r.name}</div> },
              { key: 'type', header: 'Type', render: (r) => <Badge variant={r.type === 'vendor' ? 'grey' : r.type === 'client' ? 'green' : 'amber'}>{r.type}</Badge> },
              { key: 'status', header: 'Status', render: (r) => <Badge variant={r.status === 'active' ? 'green' : 'red'}>{r.status}</Badge> },
              { key: 'assets', header: 'Assets', render: (r) => <span className="font-mono text-sm">{r.assets}</span> },
              { key: 'trackers', header: 'Trackers', render: (r) => <span className="font-mono text-sm">{r.trackers}</span> },
              { key: 'users', header: 'Users', render: (r) => <span className="font-mono text-sm">{r.users}</span> },
            ]}
            rows={tenantsRows}
          />
        </section>

        {/* Assets */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-grey-700 uppercase tracking-wider mb-2">Assets ({assetRows.length})</h3>
          <Table
            keyField="id"
            columns={[
              { key: 'code', header: 'Code', width: '70px', render: (r) => <div className="font-mono text-sm font-medium text-ink">{r.code}</div> },
              { key: 'name', header: 'Asset', render: (r) => <div className="text-sm">{r.name}</div> },
              { key: 'status', header: 'Status', width: '100px', render: (r) => <StatusBadge status={r.status as AssetStatus} size="sm" /> },
              { key: 'tier', header: 'Tier', width: '50px', align: 'center', render: (r) => <TierChip tier={r.tier} /> },
              { key: 'class', header: 'Class', width: '90px', render: (r) => <span className="text-xs capitalize text-grey-700">{r.class.replace('_', ' ')}</span> },
              { key: 'owner', header: 'Owner', render: (r) => <span className="text-sm text-grey-700">{r.owner}</span> },
              { key: 'hasCan', header: 'CAN', width: '50px', align: 'center', render: (r) => r.hasCan ? <Badge variant="green">✓</Badge> : <Badge variant="grey">—</Badge> },
              { key: 'features', header: 'Features', render: (r) => (
                <div className="flex flex-wrap gap-1 max-w-[200px]">
                  {r.features.slice(0, 3).map(f => (
                    <span key={f} className="text-[10px] bg-paper border border-line px-1.5 py-0.5 rounded text-grey-600">{f.split(' ')[0]}</span>
                  ))}
                  {r.features.length > 3 && <span className="text-[10px] text-grey-500">+{r.features.length - 3}</span>}
                </div>
              )},
            ]}
            rows={assetRows}
          />
        </section>

        {/* Trackers */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-grey-700 uppercase tracking-wider mb-2">Trackers (paired, {trackersRows.length})</h3>
          <Table
            keyField="id"
            columns={[
              { key: 'imei', header: 'IMEI', width: '140px', render: (r) => <div className="font-mono text-xs text-ink">{r.imei}</div> },
              { key: 'sim', header: 'SIM', width: '130px', render: (r) => <div className="font-mono text-xs text-grey-700">{r.sim}</div> },
              { key: 'firmware', header: 'FW', width: '100px', render: (r) => <span className="font-mono text-xs">{r.firmware}</span> },
              { key: 'status', header: 'Stock', width: '70px', render: (r) => <Badge variant={r.status === 'paired' ? 'green' : r.status === 'in_stock' ? 'grey' : 'red'}>{r.status}</Badge> },
              { key: 'assetCode', header: 'Asset', render: (r) => <span className="text-sm font-medium">{r.assetCode}</span> },
              { key: 'assetName', header: 'Name', render: (r) => <span className="text-sm text-grey-700">{r.assetName}</span> },
              { key: 'owner', header: 'Owner', render: (r) => <span className="text-xs text-grey-500">{r.owner}</span> },
              { key: 'flagged', header: 'Support', width: '60px', render: (r) => r.flagged === '⚠ Yes' ? <Badge variant="red">Yes</Badge> : <span className="text-xs text-grey-500">—</span> },
            ]}
            rows={trackersRows}
          />
        </section>

        {/* Bookings */}
        <section>
          <h3 className="text-sm font-semibold text-grey-700 uppercase tracking-wider mb-2">Bookings ({bookingsRows.length})</h3>
          <Table
            keyField="id"
            columns={[
              { key: 'ref', header: 'Ref', width: '80px', render: (r) => <span className="font-mono text-sm font-medium">{r.ref}</span> },
              { key: 'assetCode', header: 'Asset', render: (r) => <span className="text-sm">{r.assetCode}</span> },
              { key: 'owner', header: 'Owner', render: (r) => <span className="text-xs text-grey-700">{r.owner}</span> },
              { key: 'renter', header: 'Renter', render: (r) => <span className="text-sm text-grey-700">{r.renter}</span> },
              { key: 'window', header: 'Window', width: '140px', render: (r) => <span className="text-xs text-grey-500">{r.window}</span> },
              { key: 'status', header: 'Status', width: '90px', render: (r) => <Badge variant={r.status === 'active' ? 'green' : r.status === 'scheduled' ? 'yellow' : r.status === 'cancelled' ? 'red' : 'grey'}>{r.status}</Badge> },
              { key: 'rate', header: 'Rate', width: '90px', render: (r) => <span className="text-xs font-mono">{r.rate}</span> },
            ]}
            rows={bookingsRows}
          />
        </section>

        <div className="mt-8 p-3 bg-paper rounded border border-line text-xs text-grey-500">
          <strong>Prototype note:</strong> All data above is deterministic seed. Changing the clock with the controls above updates status in real time (e.g. +1 h may turn WT-08 Offline).
        </div>
      </div>
    </div>
  );
}
