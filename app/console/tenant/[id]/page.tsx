'use client';

import React, { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Button, Badge, EmptyState, Tabs, Panel,
} from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';

// ── helpers ────────────────────────────────────────────────────────────────────

function formatInvoicePeriod(issuedAt: string | number): string {
  const d = new Date(typeof issuedAt === 'number' ? issuedAt : issuedAt);
  return d.toLocaleString('en-AE', { month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
}

function formatTs(ts: string | number): string {
  const d = new Date(typeof ts === 'number' ? ts : ts);
  return d.toLocaleDateString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Dubai',
  });
}

function tenantTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    vendor: 'Vendor',
    client: 'Client',
    both: 'Vendor + Client',
  };
  return labels[type] ?? type;
}

function hardwareMix(tenantId: string): string {
  const assets = seed.assets.filter(a => a.ownerTenantId === tenantId);
  const t1 = assets.filter(a => a.canProfile.adapter === 'none' || a.canProfile.adapter === 'LVCAN200').length;
  const t3 = assets.filter(a => a.canProfile.adapter === 'ALL-CAN300').length;
  return `T1 ${t1} · T3 ${t3}`;
}

// ── Tab components ─────────────────────────────────────────────────────────────

function TenantOverview({ tenantId }: { tenantId: string }) {
  const tenant = seed.tenants.find(t => t.id === tenantId);
  const assets = seed.assets.filter(a => a.ownerTenantId === tenantId);
  const trackers = useMemo(() =>
    seed.trackers.filter(t => t.stockStatus === 'paired')
      .filter(t => {
        const pairing = seed.pairings.find(p => p.trackerId === t.id);
        if (!pairing) return false;
        const asset = seed.assets.find(a => a.id === pairing.assetId);
        return asset ? asset.ownerTenantId === tenantId : false;
      }),
    [tenantId]
  );
  const users = seed.users.filter(u => u.tenantId === tenantId);
  const openRequests = seed.assets.filter(a => a.ownerTenantId === tenantId && !a.canProfile.adapter);
  const bookings = seed.bookings.filter(b => b.ownerTenantId === tenantId);
  const activeBookings = bookings.filter(b => b.status === 'active' || b.status === 'scheduled');

  if (!tenant) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Type', value: tenantTypeLabel(tenant.type) },
          { label: 'Status', value: <Badge variant={tenant.status === 'active' ? 'green' : 'yellow'}>{tenant.status}</Badge> },
          { label: 'Assets', value: assets.length },
          { label: 'Trackers', value: trackers.length },
          { label: 'Users', value: users.length },
          { label: 'Open requests', value: openRequests.length },
          { label: 'Active bookings', value: activeBookings.length },
          { label: 'Hardware mix', value: hardwareMix(tenant.id) },
        ].map(stat => (
          <div key={stat.label} className="bg-surface border border-line rounded-lg p-3">
            <div className="text-xs text-grey-500">{stat.label}</div>
            <div className="text-ink font-semibold mt-1 text-sm">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Recent activity */}
      <div>
        <h3 className="text-xs font-medium text-grey-500 mb-2">Recent assets</h3>
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-paper-2 text-grey-500">
                <th className="px-3 py-2 text-left font-medium">Code</th>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Class</th>
                <th className="px-3 py-2 text-left font-medium">CAN</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {assets.slice(0, 8).map(a => (
                <tr key={a.id} className="bg-paper hover:bg-paper-2">
                  <td className="px-3 py-2 border-b border-line font-mono text-ink font-medium">{a.code}</td>
                  <td className="px-3 py-2 border-b border-line text-grey-700">{a.name}</td>
                  <td className="px-3 py-2 border-b border-line text-grey-500">{a.assetClass}</td>
                  <td className="px-3 py-2 border-b border-line">
                    {a.canProfile.adapter === 'none' ? (
                      <span className="text-grey-400">None</span>
                    ) : (
                      <Badge variant="grey">{a.canProfile.adapter}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b border-line">
                    <Badge variant={
                      a.status === 'live' ? 'green'
                      : a.status === 'offline' ? 'red'
                      : a.status === 'unknown' ? 'yellow'
                      : 'grey'
                    }>{a.status}</Badge>
                  </td>
                  <td className="px-3 py-2 border-b border-line font-mono text-grey-500">{formatTs(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
        Tenant overview shows the overall health and hardware mix of this tenant's fleet.
      </div>
    </div>
  );
}

function TenantSites({ tenantId }: { tenantId: string }) {
  const sites = seed.sites.filter(s => s.tenantId === tenantId);
  const assets = seed.assets.filter(a => a.ownerTenantId === tenantId);
  const users = seed.users.filter(u => u.tenantId === tenantId);

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-paper-2 text-grey-500">
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Location</th>
              <th className="px-3 py-2 text-right font-medium">Radius</th>
              <th className="px-3 py-2 text-right font-medium">Assets</th>
              <th className="px-3 py-2 text-left font-medium">Users</th>
            </tr>
          </thead>
          <tbody>
            {sites.map(s => (
              <tr key={s.id} className="bg-paper hover:bg-paper-2">
                <td className="px-3 py-2 border-b border-line text-grey-700 font-medium">{s.name}</td>
                <td className="px-3 py-2 border-b border-line font-mono text-grey-500">
                  {s.center.lat.toFixed(4)}, {s.center.lng.toFixed(4)}
                </td>
                <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">{s.radiusM}m</td>
                <td className="px-3 py-2 border-b border-line text-right">
                  {assets.filter(a => a.homeSiteId === s.id).length}
                </td>
                <td className="px-3 py-2 border-b border-line text-grey-700">
                  {users.filter(u => u.siteIds.includes(s.id)).map(u => u.name).join(', ') || '—'}
                </td>
              </tr>
            ))}
            {sites.length === 0 && (
              <tr className="bg-paper">
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-grey-500">
                  No sites configured for this tenant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TenantUsers({ tenantId }: { tenantId: string }) {
  const users = seed.users.filter(u => u.tenantId === tenantId);
  const sites = seed.sites.filter(s => s.tenantId === tenantId);
  const activeAdmins = users.filter(u => u.role === 'tenant_admin' && u.status === 'active');

  return (
    <div className="space-y-4">
      {activeAdmins.length < 1 && users.length > 0 && (
        <div className="bg-yellow/10 border border-yellow/30 text-yellow-dark text-sm px-4 py-3 rounded-lg">
          Every company needs at least one Tenant Admin.
        </div>
      )}

      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-paper-2 text-grey-500">
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Email</th>
              <th className="px-3 py-2 text-left font-medium">Role</th>
              <th className="px-3 py-2 text-left font-medium">Sites</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="bg-paper hover:bg-paper-2">
                <td className="px-3 py-2 border-b border-line text-grey-700 font-medium">{u.name}</td>
                <td className="px-3 py-2 border-b border-line font-mono text-grey-500">{u.email}</td>
                <td className="px-3 py-2 border-b border-line">
                  <Badge variant={u.role === 'tenant_admin' ? 'default' : 'grey'}>
                    {u.role === 'tenant_admin' ? 'Tenant Admin' : 'Site User'}
                  </Badge>
                </td>
                <td className="px-3 py-2 border-b border-line text-grey-700 text-xs">
                  {u.siteIds.map(sid => {
                    const s = seed.sites.find(si => si.id === sid);
                    return s?.name ?? sid;
                  }).join(', ') || '—'}
                </td>
                <td className="px-3 py-2 border-b border-line">
                  <Badge variant={u.status === 'active' ? 'green' : u.status === 'invited' ? 'yellow' : 'grey'}>
                    {u.status}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right border-b border-line">
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" size="sm">Edit</Button>
                    {u.status === 'active' ? (
                      <Button variant="danger" size="sm">Deactivate</Button>
                    ) : (
                      <Button variant="secondary" size="sm">Reactivate</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr className="bg-paper">
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-grey-500">
                  No users for this tenant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TenantAssets({ tenantId }: { tenantId: string }) {
  const assets = seed.assets.filter(a => a.ownerTenantId === tenantId);
  const sites = seed.sites.filter(s => s.tenantId === tenantId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-grey-500">Assets ({assets.length})</h3>
        <Button size="sm">Add asset</Button>
      </div>

      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-paper-2 text-grey-500">
              <th className="px-3 py-2 text-left font-medium">Code</th>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Class</th>
              <th className="px-3 py-2 text-left font-medium">CAN adapter</th>
              <th className="px-3 py-2 text-left font-medium">Home site</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">View</th>
            </tr>
          </thead>
          <tbody>
            {assets.map(a => {
              const site = seed.sites.find(s => s.id === a.homeSiteId);
              return (
                <tr key={a.id} className="bg-paper hover:bg-paper-2">
                  <td className="px-3 py-2 border-b border-line font-mono text-ink font-medium">{a.code}</td>
                  <td className="px-3 py-2 border-b border-line text-grey-700">{a.name}</td>
                  <td className="px-3 py-2 border-b border-line text-grey-500">{a.assetClass}</td>
                  <td className="px-3 py-2 border-b border-line">
                    {a.canProfile.adapter === 'none' ? (
                      <span className="text-grey-400">None</span>
                    ) : (
                      <Badge variant="grey">{a.canProfile.adapter}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-grey-700">
                    {site?.name ?? '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-line">
                    <Badge variant={
                      a.status === 'live' ? 'green'
                      : a.status === 'offline' ? 'red'
                      : a.status === 'unknown' ? 'yellow'
                      : a.status === 'no_tracker' ? 'grey'
                      : 'grey'
                    }>{a.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right border-b border-line">
                    <Link href={`/app/assets/${a.id}`} className="text-yellow-600 hover:text-yellow font-medium text-xs">
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
            {assets.length === 0 && (
              <tr className="bg-paper">
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-grey-500">
                  No assets for this tenant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TenantBookings({ tenantId }: { tenantId: string }) {
  const bookings = seed.bookings.filter(b => b.ownerTenantId === tenantId);
  const assets = seed.assets.filter(a => a.ownerTenantId === tenantId);

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-paper-2 text-grey-500">
              <th className="px-3 py-2 text-left font-medium">Asset</th>
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
              const asset = assets.find(a => a.id === b.assetId);
              const renter = seed.users.find(u => u.id === b.renterName);
              return (
                <tr key={b.id} className="bg-paper hover:bg-paper-2">
                  <td className="px-3 py-2 border-b border-line font-mono text-grey-700">
                    {asset?.code ?? '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-grey-700">
                    {renter?.name ?? '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-grey-700">
                    {b.renterSiteId ? seed.sites.find(s => s.id === b.renterSiteId)?.name ?? b.renterSiteId : '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-line font-mono text-grey-500">
                    {formatTs(b.start)}
                  </td>
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
                    <div className="flex gap-1 justify-end">
                      <Button variant="secondary" size="sm">Extend</Button>
                      <Button variant="secondary" size="sm">Shorten</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {bookings.length === 0 && (
              <tr className="bg-paper">
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-grey-500">
                  No bookings for this tenant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TenantBillingTab({ tenantId }: { tenantId: string }) {
  const tenant = seed.tenants.find(t => t.id === tenantId);
  const invoices = seed.invoices.filter(inv => inv.customerTenantId === tenantId);

  if (!tenant) return null;

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded-lg p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-paper-2 rounded-lg p-3">
            <div className="text-xs text-grey-500">Tenant</div>
            <div className="text-ink font-medium mt-1">{tenant.name}</div>
          </div>
          <div className="bg-paper-2 rounded-lg p-3">
            <div className="text-xs text-grey-500">Outstanding</div>
            <div className="text-ink font-medium mt-1">
              AED {invoices.filter(i => i.status === 'unpaid' || i.status === 'part_paid' || i.status === 'overdue')
                .reduce((s, i) => s + i.totalAed, 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-paper-2 text-grey-500">
              <th className="px-3 py-2 text-left font-medium">Invoice</th>
              <th className="px-3 py-2 text-left font-medium">Period</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-right font-medium">Paid</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id} className="bg-paper hover:bg-paper-2">
                <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{inv.number}</td>
                <td className="px-3 py-2 border-b border-line text-grey-700">{formatInvoicePeriod(inv.issuedAt)}</td>
                <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">
                  AED {inv.totalAed.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">
                  AED {inv.totalAed.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2 border-b border-line">
                  <Badge variant={
                    inv.status === 'paid' ? 'green'
                    : inv.status === 'overdue' ? 'red'
                    : inv.status === 'void' ? 'grey'
                    : inv.status === 'part_paid' ? 'yellow'
                    : 'grey'
                  }>{inv.status}</Badge>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr className="bg-paper">
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-grey-500">
                  No invoices for this tenant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TenantAuditTab({ tenantId }: { tenantId: string }) {
  const entries = seed.tenants
    .flatMap(t => [
      { id: `a-${t.id}-create`, person: 'Kasper Admin', action: 'create', at: t.createdAt, detail: `Tenant created: ${t.name}` },
    ])
    .concat(
      seed.assets
        .filter(a => a.ownerTenantId === tenantId)
        .flatMap(a => [
          { id: `a-${a.id}-create`, person: 'Kasper Admin', action: 'create', at: a.createdAt, detail: `Asset created: ${a.code}` },
        ])
    )
    .sort((a, b) => {
      const ta = typeof a.at === 'number' ? a.at : new Date(a.at).getTime();
      const tb = typeof b.at === 'number' ? b.at : new Date(b.at).getTime();
      return tb - ta;
    });

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-paper-2 text-grey-500">
              <th className="px-3 py-2 text-left font-medium">When</th>
              <th className="px-3 py-2 text-left font-medium">Person</th>
              <th className="px-3 py-2 text-left font-medium">Action</th>
              <th className="px-3 py-2 text-left font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id} className="bg-paper hover:bg-paper-2">
                <td className="px-3 py-2 border-b border-line font-mono text-grey-500 whitespace-nowrap">
                  {formatTs(e.at)}
                </td>
                <td className="px-3 py-2 border-b border-line text-grey-700">{e.person}</td>
                <td className="px-3 py-2 border-b border-line"><Badge>{e.action}</Badge></td>
                <td className="px-3 py-2 border-b border-line text-grey-700">{e.detail}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr className="bg-paper">
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-grey-500">
                  No audit entries for this tenant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────────────────────

const tenantTabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'sites', label: 'Sites' },
  { id: 'users', label: 'Users' },
  { id: 'assets', label: 'Assets' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'billing', label: 'Billing' },
  { id: 'audit', label: 'Audit' },
];

export default function TenantPage() {
  const params = useParams();
  const store = useStore;
  const session = store.getState().session;

  const [activeTab, setActiveTab] = useState('overview');

  const tenantId = params.id as string;
  const tenant = seed.tenants.find(t => t.id === tenantId);

  if (!session || !session.isKasper) {
    return (
      <div className="text-center py-8">
        <EmptyState title="Not available" description="Only Kasper staff can access the console." />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="text-center py-8">
        <EmptyState
          title="Tenant not found"
          description={`No tenant with id "${tenantId}".`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">{tenant.name}</h1>
          <p className="text-sm text-grey-500 mt-1">
            Tenant details and management. Changes here are audited.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm">Edit tenant</Button>
          {tenant.status === 'active' ? (
            <Button variant="danger" size="sm">Suspend</Button>
          ) : (
            <Button variant="secondary" size="sm">Unsuspend</Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tenantTabs} activeId={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      <div className="bg-surface border border-line rounded-lg p-4">
        {activeTab === 'overview' && <TenantOverview tenantId={tenantId} />}
        {activeTab === 'sites' && <TenantSites tenantId={tenantId} />}
        {activeTab === 'users' && <TenantUsers tenantId={tenantId} />}
        {activeTab === 'assets' && <TenantAssets tenantId={tenantId} />}
        {activeTab === 'bookings' && <TenantBookings tenantId={tenantId} />}
        {activeTab === 'billing' && <TenantBillingTab tenantId={tenantId} />}
        {activeTab === 'audit' && <TenantAuditTab tenantId={tenantId} />}
      </div>
    </div>
  );
}
