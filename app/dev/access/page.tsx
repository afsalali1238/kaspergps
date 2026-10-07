'use client';

import React, { useState, useMemo } from 'react';
import clsx from 'clsx';
import { Badge, Table, Panel, PanelHeader } from '@/components/ui';
import type { Capability } from '@/server/capabilities';
import { seed } from '@/server/seed/data';
import { hasCapability, isAssetVisible, getRelationship } from '@/server/access';

import type { Session } from '@/domain/types';

const CAPS = [
  { id: 'asset.view', label: 'View assets' },
  { id: 'asset.viewHistory', label: 'View asset history' },
  { id: 'asset.viewTelemetry', label: 'View asset telemetry' },
  { id: 'asset.edit', label: 'Edit asset' },
  { id: 'report.run', label: 'Run reports' },
  { id: 'link.create', label: 'Create tracking link' },
  { id: 'link.revoke', label: 'Revoke tracking link' },
  { id: 'grant.endEarly', label: 'End access early' },
  { id: 'alert.view', label: 'View alerts' },
  { id: 'alert.acknowledge', label: 'Acknowledge alerts' },
  { id: 'users.manage', label: 'Manage users' },
  { id: 'sites.manage', label: 'Manage sites' },
  { id: 'console.tenants.view', label: 'View tenants (console)' },
  { id: 'console.tenants.manage', label: 'Manage tenants' },
  { id: 'console.assets.manage', label: 'Manage assets' },
  { id: 'console.trackers.view', label: 'View trackers' },
  { id: 'console.trackers.manage', label: 'Manage trackers' },
  { id: 'console.trackers.configure', label: 'Configure trackers' },
  { id: 'console.audit.view', label: 'View audit log' },
  { id: 'label.view', label: 'View labels' },
  { id: 'label.manage', label: 'Manage labels' },
  { id: 'geofence.view', label: 'View geofences' },
  { id: 'geofence.manage', label: 'Manage geofences' },
  { id: 'playback.view', label: 'Trip playback' },
  { id: 'report.schedule', label: 'Schedule reports' },
  { id: 'maintenance.view', label: 'View maintenance' },
  { id: 'maintenance.manage', label: 'Manage maintenance' },
  { id: 'cost.view', label: 'View cost & ROI' },
  { id: 'muc.view', label: 'View MUCs' },
  { id: 'muc.issue', label: 'Issue MUC' },
  { id: 'muc.void', label: 'Void MUC' },
  { id: 'billing.view', label: 'View billing' },
  { id: 'billing.recordPayment', label: 'Record payment' },
  { id: 'billing.pay', label: 'Pay invoice' },
  { id: 'console.billing.view', label: 'View billing (console)' },
  { id: 'console.billing.manage', label: 'Manage billing' },
  { id: 'asset.create', label: 'Create asset' },
  { id: 'asset.retire', label: 'Retire asset' },
  { id: 'tracker.request', label: 'Request tracker' },
  { id: 'console.assets.transfer', label: 'Transfer asset' },
  { id: 'console.adapters.manage', label: 'Manage CAN adapters' },
  { id: 'console.bookings.view', label: 'View bookings' },
  { id: 'console.bookings.manage', label: 'Manage bookings' },
  { id: 'console.staff.manage', label: 'Manage Kasper staff' },
  { id: 'console.import', label: 'Import data' },
];

type CapRow = typeof CAPS[0];

interface VisibleAssetRow {
  id: string;
  code: string;
  name: string;
  relationship: string;
  tier: number;
  window: { start: string; end: string } | null;
}

function TierChip({ tier }: { tier: number }) {
  return (
    <span className={clsx(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border',
      tier === 1 ? 'bg-paper border-line text-grey-700' :
      tier === 2 ? 'bg-yellow/10 border-yellow-dark/40 text-ink' :
      'bg-ink/10 border-ink/20 text-ink font-semibold'
    )}>
      T{tier}
    </span>
  );
}

export default function DevAccessPage() {
  const [selectedUserIdx, setSelectedUserIdx] = useState(0);
  const [capabilityQuery, setCapabilityQuery] = useState('');

  const selectedUser = seed.users[selectedUserIdx];
  const session: Session = {
    userId: selectedUser.id,
    user: selectedUser,
    tenantId: selectedUser.tenantId,
    siteIds: selectedUser.siteIds,
    role: selectedUser.role,
    isKasper: selectedUser.role === 'kasper_admin' || selectedUser.role === 'kasper_ops',
  };

  const filteredCaps = capabilityQuery
    ? CAPS.filter(c => c.label.toLowerCase().includes(capabilityQuery.toLowerCase()) || c.id.toLowerCase().includes(capabilityQuery.toLowerCase()))
    : CAPS;

  const visibleAssetList = useMemo(() => {
    return seed.assets
      .filter(a => isAssetVisible(session, a.id))
      .map(a => {
        const rel = getRelationship(session, a.id);
        const booking = seed.bookings.find(b => b.assetId === a.id && b.renterTenantId === session.tenantId);
        return {
          id: a.id,
          code: a.code,
          name: a.name,
          relationship: rel,
          tier: a.canProfile.adapter === 'ALL-CAN300' ? 3 : a.canProfile.adapter === 'LVCAN200' ? 2 : 1,
          window: booking ? { start: new Date(booking.start).toISOString(), end: new Date(booking.end).toISOString() } : null,
        };
      });
  }, [session]);

  return (
    <div className="min-h-screen bg-bg p-6 overflow-x-hidden">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink">Access Explorer — Demo View</h1>
          <p className="text-sm text-grey-500 mt-1">Read-only. Shows what any user can see at any simulated time — does not bypass permissions.</p>
        </div>

        <Panel>
          <PanelHeader
            title="User"
            subtitle="Pick any user to see their capabilities and visible assets"
          >
            <select
              value={selectedUserIdx}
              onChange={e => setSelectedUserIdx(Number(e.target.value))}
              className="w-80 px-3 py-2 text-sm bg-paper border border-line rounded-lg focus:outline-none focus:border-ink"
            >
              {seed.users.map((u, i) => (
                <option key={u.id} value={i}>
                  {u.name} · {u.role.replace('_', ' ')} {u.tenantId ? `· ${seed.tenants.find(t => t.id === u.tenantId)?.name}` : ''}
                </option>
              ))}
            </select>
          </PanelHeader>
          <div className="grid grid-cols-2 gap-2 text-sm mt-3">
            <div className="bg-paper rounded p-2">
              <div className="text-grey-500 text-xs">Role</div>
              <div className="font-medium capitalize">{session.role.replace('_', ' ')}</div>
            </div>
            <div className="bg-paper rounded p-2">
              <div className="text-grey-500 text-xs">Company</div>
              <div className="font-medium">{session.tenantId ? seed.tenants.find(t => t.id === session.tenantId)?.name ?? '—' : 'Kasper'}</div>
            </div>
          </div>
        </Panel>

        <Panel className="mt-4">
          <PanelHeader
            title="Capabilities"
            subtitle={`${filteredCaps.filter(c => hasCapability(session, c.id as Capability)).length} of ${filteredCaps.length} available`}
          >
            <input
              type="text"
              value={capabilityQuery}
              onChange={e => setCapabilityQuery(e.target.value)}
              placeholder="Search capabilities…"
              className="w-48 px-2 py-1 text-xs bg-paper border border-line rounded focus:outline-none focus:border-ink"
            />
          </PanelHeader>
          <Table
            keyField="id"
            columns={[
              { key: 'id', header: 'Capability', width: '200px', render: (r: CapRow) => <span className="font-mono text-xs text-ink">{r.id}</span> },
              { key: 'label', header: 'Label', render: (r: CapRow) => <span className="text-sm">{r.label}</span> },
              { key: 'has', header: 'Allowed', width: '80px', align: 'center', render: (r: CapRow) => hasCapability(session, r.id as Capability) ? <Badge variant="green">✓</Badge> : <Badge variant="red">✕</Badge> },
            ]}
            rows={filteredCaps}
          />
        </Panel>

        <Panel className="mt-4">
          <PanelHeader
            title="Visible assets"
            subtitle={`${visibleAssetList.length} assets at this time`}
          />
          {visibleAssetList.length === 0 ? (
            <p className="text-sm text-grey-500 py-4 text-center">This user can&apos;t see any assets at this time.</p>
          ) : (
            <Table
              keyField="id"
              columns={[
                { key: 'code', header: 'Code', width: '70px', render: (r: VisibleAssetRow) => <span className="font-mono text-sm font-medium">{r.code}</span> },
                { key: 'name', header: 'Asset', render: (r: VisibleAssetRow) => <span className="text-sm">{r.name}</span> },
                { key: 'relationship', header: 'Relationship', width: '110px', render: (r: VisibleAssetRow) => (
                  <Badge variant={
                    r.relationship === 'kasper' ? 'ink' :
                    r.relationship === 'owner' ? 'green' :
                    r.relationship === 'renter' ? 'yellow' : 'grey'
                  }>
                    {r.relationship}
                  </Badge>
                )},
                { key: 'tier', header: 'Tier', width: '50px', align: 'center', render: (r: VisibleAssetRow) => <TierChip tier={r.tier} /> },
                { key: 'window', header: 'Window (UTC)', render: (r: VisibleAssetRow) => r.window ? (
                  <span className="text-xs text-grey-500">{r.window.start.slice(0, 10)} → {r.window.end.slice(0, 10)}</span>
                ) : (
                  <span className="text-xs text-grey-500">—</span>
                )},
              ]}
              rows={visibleAssetList}
            />
          )}
        </Panel>

        <div className="mt-6 p-3 bg-paper/50 border border-line rounded text-xs text-grey-500">
          ⚠️ This is a demo view. It is visible to the demo runner even when the current user can&apos;t see access data. In the product, access checks are enforced server-side via <code>src/server/api.ts</code>.
        </div>
      </div>
    </div>
  );
}
