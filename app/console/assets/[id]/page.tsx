'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Button, Badge, EmptyState, Tabs,
  TierChip,
} from '@/components/ui';
import { useDb } from '@/server/api';
import * as clock from '@/lib/clock';
import { useSession } from '@/hooks';

// ── helpers ────────────────────────────────────────────────────────────────────

function formatTs(ts: string | number): string {
  const d = new Date(typeof ts === 'number' ? ts : ts);
  return d.toLocaleString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Dubai',
  });
}

function assetStatusBadge(status: string): React.ReactNode {
  const variants: Record<string, 'green' | 'grey' | 'yellow' | 'red'> = {
    live: 'green',
    idle: 'grey',
    stale: 'yellow',
    offline: 'red',
    unknown: 'yellow',
    no_tracker: 'grey',
  };
  return <Badge variant={variants[status] ?? 'grey'}>{status}</Badge>;
}

// ── page ───────────────────────────────────────────────────────────────────────

export default function ConsoleAssetDetailPage() {
  const seed = useDb(s => s);
  const params = useParams();
  const session = useSession();

  const [activeTab, setActiveTab] = useState('overview');
  const [canChecked, setCanChecked] = useState(false);
  const [canCheckResult, setCanCheckResult] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  const assetId = params.id as string;
  const asset = seed.assets.find(a => a.id === assetId);

  if (!session || !session.isKasper) {
    return (
      <div className="text-center py-8">
        <EmptyState title="Not available" description="Only Kasper staff can access the console." />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="text-center py-8">
        <EmptyState
          title="Asset not found"
          description={`No asset with id "${assetId}".`}
        />
      </div>
    );
  }

  const tenant = seed.tenants.find(t => t.id === asset.ownerTenantId);
  const site = seed.sites.find(s => s.id === asset.homeSiteId);
  const tracker = seed.trackers.find(t => t.stockStatus === 'paired' && seed.pairings.some(p => p.assetId === asset.id && p.trackerId === t.id));
  const bookings = seed.bookings.filter(b => b.assetId === asset.id);
  const activeBookings = bookings.filter(b => b.status === 'active' || b.status === 'scheduled');
  const otherTenants = seed.tenants.filter(t => t.id !== asset.ownerTenantId);

  const runCanCheck = () => {
    setCanChecked(true);
    setCanCheckResult(`CAN check passed at ${formatTs(clock.now())}. Adapter: ${asset.canProfile.adapter}. Supported signals: ${asset.canProfile.supported.join(', ') || 'none'}.`);
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-ink">{asset.code}</h1>
            <TierChip tier={asset.canProfile.adapter === 'ALL-CAN300' ? 3 : asset.canProfile.adapter === 'LVCAN200' ? 2 : 1} />
          </div>
          <p className="text-sm text-grey-500 mt-1">{asset.name}</p>
          <div className="flex gap-2 mt-2">
            <Link href={`/app/assets/${asset.id}`} className="text-xs text-yellow-600 hover:text-yellow font-medium">
              View in app
            </Link>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm">Edit asset</Button>
          <Button variant="danger" size="sm">Retire</Button>
        </div>
      </div>

      {/* Quick facts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-surface border border-line rounded-lg p-3">
          <div className="text-xs text-grey-500">Tenant</div>
          <div className="text-ink font-medium mt-1 text-sm">{tenant?.name ?? '—'}</div>
        </div>
        <div className="bg-surface border border-line rounded-lg p-3">
          <div className="text-xs text-grey-500">Home site</div>
          <div className="text-ink font-medium mt-1 text-sm">{site?.name ?? '—'}</div>
        </div>
        <div className="bg-surface border border-line rounded-lg p-3">
          <div className="text-xs text-grey-500">Class</div>
          <div className="text-ink font-medium mt-1 text-sm">{asset.assetClass}</div>
        </div>
        <div className="bg-surface border border-line rounded-lg p-3">
          <div className="text-xs text-grey-500">Status</div>
          <div className="text-ink font-medium mt-1 text-sm">{assetStatusBadge(asset.status)}</div>
        </div>
        <div className="bg-surface border border-line rounded-lg p-3">
          <div className="text-xs text-grey-500">CAN adapter</div>
          <div className="text-ink font-medium mt-1 text-sm">
            {asset.canProfile.adapter === 'none' ? 'None' : (
              <Badge variant="grey">{asset.canProfile.adapter}</Badge>
            )}
          </div>
        </div>
        <div className="bg-surface border border-line rounded-lg p-3">
          <div className="text-xs text-grey-500">Tracker</div>
          <div className="text-ink font-medium mt-1 text-sm">
            {tracker ? (
              <span className="font-mono text-xs">{tracker.imei}</span>
            ) : (
              <span className="text-grey-400 text-xs">No tracker</span>
            )}
          </div>
        </div>
        <div className="bg-surface border border-line rounded-lg p-3">
          <div className="text-xs text-grey-500">Plate / serial</div>
          <div className="text-ink font-medium mt-1 text-sm font-mono">{asset.plateOrSerial}</div>
        </div>
        <div className="bg-surface border border-line rounded-lg p-3">
          <div className="text-xs text-grey-500">Created</div>
          <div className="text-ink font-medium mt-1 text-sm font-mono">{formatTs(asset.createdAt)}</div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'can', label: 'CAN check' },
        { id: 'transfer', label: 'Transfer' },
        { id: 'bookings', label: 'Bookings' },
      ]} activeId={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      <div className="bg-surface border border-line rounded-lg p-4">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-medium text-grey-500 mb-2">Make & model</h3>
              <div className="bg-paper-2 rounded-lg p-3 border border-line text-sm text-grey-700">
                {asset.make} {asset.model} · {asset.year} · {asset.type}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-medium text-grey-500 mb-2">CAN profile</h3>
              <div className="bg-paper-2 rounded-lg p-3 border border-line text-sm">
                <div className="text-grey-500 text-xs mb-1">Adapter</div>
                <div className="text-ink">{asset.canProfile.adapter === 'none' ? 'No CAN adapter fitted' : asset.canProfile.adapter}</div>
                <div className="text-grey-500 text-xs mt-2 mb-1">Supported signals</div>
                <div className="text-ink">
                  {asset.canProfile.supported.length === 0 ? (
                    <span className="text-grey-400">None</span>
                  ) : (
                    asset.canProfile.supported.map(s => (
                      <span key={s} className="inline-block bg-paper px-2 py-0.5 rounded text-xs font-mono text-grey-700 mr-1 mb-1">
                        {s}
                      </span>
                    ))
                  )}
                </div>
                {asset.canProfile.checkedAt && (
                  <>
                    <div className="text-grey-500 text-xs mt-2 mb-1">Last checked</div>
                    <div className="text-ink text-xs">{formatTs(asset.canProfile.checkedAt)}</div>
                  </>
                )}
                {asset.canProfile.notes && (
                  <>
                    <div className="text-grey-500 text-xs mt-2 mb-1">Notes</div>
                    <div className="text-ink text-xs">{asset.canProfile.notes}</div>
                  </>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-medium text-grey-500 mb-2">Active bookings</h3>
              {activeBookings.length === 0 ? (
                <div className="text-sm text-grey-500 bg-paper-2 rounded-lg p-3 border border-line">
                  No active or scheduled bookings.
                </div>
              ) : (
                <div className="bg-paper-2 rounded-lg p-3 border border-line space-y-2">
                  {activeBookings.map(b => {
                    const site = b.renterSiteId ? seed.sites.find(s => s.id === b.renterSiteId) : null;
                    return (
                      <div key={b.id} className="flex items-center justify-between text-sm">
                        <div>
                          <div className="text-ink font-medium">{b.renterName ?? 'Unknown renter'}</div>
                          <div className="text-grey-500 text-xs">{site?.name ?? 'No site'} · {formatTs(b.start)} — {b.end ? formatTs(b.end) : 'open end'}</div>
                        </div>
                        <Badge variant={b.status === 'active' ? 'green' : 'yellow'}>{b.status}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'can' && (
          <div className="space-y-4">
            <div className="bg-paper-2 rounded-lg p-4 border border-line">
              <h3 className="text-sm font-medium text-ink mb-2">CAN adapter check</h3>
              <p className="text-sm text-grey-500 mb-3">
                Run a live CAN check to verify the adapter is reporting signals correctly.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={runCanCheck}
                  disabled={canChecked}
                >
                  {canChecked ? 'Check done' : 'Run CAN check'}
                </Button>
              </div>
              {canChecked && canCheckResult && (
                <div className="mt-3 bg-green/10 border border-green/30 text-green text-sm px-3 py-2 rounded-lg">
                  {canCheckResult}
                </div>
              )}
            </div>
            <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
              CAN checks are performed by Kasper Ops. The result is recorded against the asset's CAN profile.
              Only Tier 2 and Tier 3 assets (fitted with LVCAN200 or ALL-CAN300) can be checked.
            </div>
          </div>
        )}

        {activeTab === 'transfer' && (
          <div className="space-y-4">
            <div className="bg-paper-2 rounded-lg p-4 border border-line">
              <h3 className="text-sm font-medium text-ink mb-2">Transfer to another tenant</h3>
              <p className="text-sm text-grey-500 mb-3">
                Transferring <strong>{asset.code}</strong> from{' '}
                <strong>{tenant?.name ?? 'Unknown'}</strong> to another tenant.
                The new owner gets full access; the old owner becomes report-only from the transfer date.
              </p>
              {transferring ? (
                <div className="space-y-3">
                  <label className="text-xs text-grey-500 font-medium">Target tenant</label>
                  <select
                    className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    defaultValue=""
                  >
                    <option value="">Select a tenant…</option>
                    {otherTenants.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setTransferring(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setTransferring(true)}
                >
                  Transfer asset
                </Button>
              )}
            </div>
            <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
              Transfers are audited. The old owner's access changes to report-only from the transfer date.
              Active or upcoming bookings must be resolved before a transfer can proceed.
            </div>
          </div>
        )}

        {activeTab === 'bookings' && (
          <div className="space-y-3">
            {bookings.length === 0 ? (
              <div className="text-sm text-grey-500 bg-paper-2 rounded-lg p-4 border border-line">
                No bookings for this asset.
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-paper-2 text-grey-500">
                    <th className="px-3 py-2 text-left font-medium">Renter</th>
                    <th className="px-3 py-2 text-left font-medium">Site</th>
                    <th className="px-3 py-2 text-left font-medium">From</th>
                    <th className="px-3 py-2 text-left font-medium">To</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(b => {
                    const site = b.renterSiteId ? seed.sites.find(s => s.id === b.renterSiteId) : null;
                    return (
                      <tr key={b.id} className="bg-paper hover:bg-paper-2">
                        <td className="px-3 py-2 border-b border-line text-grey-700">{b.renterName ?? '—'}</td>
                        <td className="px-3 py-2 border-b border-line text-grey-700">
                          {site?.name ?? '—'}
                        </td>
                        <td className="px-3 py-2 border-b border-line font-mono text-grey-500">{formatTs(b.start)}</td>
                        <td className="px-3 py-2 border-b border-line font-mono text-grey-500">
                          {b.end ? formatTs(b.end) : '—'}
                        </td>
                        <td className="px-3 py-2 border-b border-line">
                          <Badge variant={
                            b.status === 'active' ? 'green'
                            : b.status === 'scheduled' ? 'yellow'
                            : b.status === 'cancelled' ? 'red'
                            : 'grey'
                          }>{b.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right border-b border-line">
                          {b.status === 'scheduled' && (
                            <div className="flex gap-1 justify-end">
                              <Button variant="secondary" size="sm">Extend</Button>
                              <Button variant="secondary" size="sm">Shorten</Button>
                              <Button variant="danger" size="sm">Cancel</Button>
                            </div>
                          )}
                          {b.status === 'active' && (
                            <Button variant="secondary" size="sm">Close</Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
