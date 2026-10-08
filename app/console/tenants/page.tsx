'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { db, useDb } from '@/server/db';
import { useStore } from '@/store';
import { createTenant } from '@/server/tenants';
import type { Tenant } from '@/domain/types';

function tenantTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    vendor: 'Vendor',
    client: 'Client',
    both: 'Vendor + Client',
  };
  return labels[type] ?? type;
}

function hardwareMix(tenant: Tenant): string {
  const assets = db.getState().assets.filter(a => a.ownerTenantId === tenant.id);
  const t1 = assets.filter(a => a.canProfile.adapter === 'none' || a.canProfile.adapter === 'LVCAN200').length;
  const t2 = assets.filter(a => a.canProfile.adapter === 'ALL-CAN300').length;
  return `T1 ${t1} · T3 ${t2}`;
}

export default function TenantsPage() {
  const seed = useDb(s => s);
  const store = useStore;
  const session = store.getState().session;

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<Tenant['type']>('client');

  const tenants = seed.tenants;

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

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
          <h1 className="text-lg font-semibold text-ink">Tenants</h1>
          <p className="text-sm text-grey-500 mt-1">
            Manage vendor and client tenants.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>Create tenant</Button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-ink text-paper px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-3">Create tenant</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-grey-500 font-medium">Name</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                placeholder="Company name"
              />
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Type</label>
              <select
                value={newType}
                onChange={e => setNewType(e.target.value as Tenant['type'])}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              >
                <option value="vendor">Vendor</option>
                <option value="client">Client</option>
                <option value="both">Vendor + Client</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Trade licence no. (optional)</label>
              <input
                type="text"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                placeholder="Licence number"
              />
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">First tenant admin</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <input
                  type="text"
                  className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  placeholder="Name"
                />
                <input
                  type="email"
                  className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  placeholder="Email"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowCreateForm(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  const result = createTenant(session, { name: newName, type: newType });
                  if (result.ok) {
                    setShowCreateForm(false);
                    setNewName('');
                    showToast(result.message ?? 'Tenant created');
                  } else {
                    showToast(result.error ?? 'Could not create the tenant.');
                  }
                }}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tenants list */}
      <div className="space-y-2">
        {tenants.map(tenant => (
          <div
            key={tenant.id}
            className="bg-surface border border-line rounded-lg p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{tenant.name}</span>
                  <Badge variant="grey">{tenantTypeLabel(tenant.type)}</Badge>
                  {tenant.status === 'suspended' && (
                    <Badge variant="red">Suspended</Badge>
                  )}
                </div>
                <div className="text-sm text-grey-700 mt-1">
                  {tenant.status}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-grey-500">
                  <span>Hardware: {hardwareMix(tenant)}</span>
                  <span>Assets: {seed.assets.filter(a => a.ownerTenantId === tenant.id).length}</span>
                  <span>Trackers: {seed.trackers.filter(t => t.assetId && seed.assets.find(a => a.id === t.assetId)?.ownerTenantId === tenant.id).length}</span>
                  <span>Users: {seed.users.filter(u => u.tenantId === tenant.id).length}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <Link href={`/console/tenants/${tenant.id}`} className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                  Edit
                </Link>
                {tenant.status !== 'suspended' && (
                  <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                    Suspend
                  </button>
                )}
                {tenant.status === 'suspended' && (
                  <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                    Unsuspend
                  </button>
                )}
                {tenant.status === 'active' && (
                  <button className="text-xs px-2 py-1 rounded bg-red/10 border border-red/30 text-red hover:bg-red/20">
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
