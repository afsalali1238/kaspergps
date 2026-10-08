'use client';

import React, { useState, useMemo } from 'react';
import { Button, Badge, EmptyState } from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';
import type { Tenant } from '@/domain/types';

function formatInvoicePeriod(issuedAt: string | number): string {
  const d = new Date(typeof issuedAt === 'number' ? issuedAt : issuedAt);
  return d.toLocaleString('en-AE', { month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
}

function tenantTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    vendor: 'Vendor',
    client: 'Client',
    both: 'Vendor + Client',
  };
  return labels[type] ?? type;
}

export default function ConsoleBillingPage() {
  const store = useStore;
  const session = store.getState().session;

  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);

  if (!session || !session.isKasper) {
    return (
      <div className="text-center py-8">
        <EmptyState title="Not available" description="Only Kasper staff can access the console." />
      </div>
    );
  }

  const tenants = useMemo(() => seed.tenants, []);

  const activeTenant = useMemo(() =>
    tenants.find(t => t.id === selectedTenant) ?? tenants[0] ?? null,
    [tenants, selectedTenant]
  );

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Billing</h1>
        <p className="text-sm text-grey-500 mt-1">
          Manage billing and invoices for each tenant.
        </p>
      </div>

      {/* Tenant selector */}
      <div className="bg-surface border border-line rounded-lg p-4">
        <label className="text-xs text-grey-500 font-medium">Tenant</label>
        <select
          className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          value={selectedTenant ?? ''}
          onChange={e => setSelectedTenant(e.target.value || null)}
        >
          {tenants.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Tenant summary */}
      {activeTenant ? (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-3">{activeTenant.name}</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-paper-2 rounded-lg p-3">
              <div className="text-grey-500 text-xs">Type</div>
              <div className="text-ink font-medium mt-1">{tenantTypeLabel(activeTenant.type)}</div>
            </div>
            <div className="bg-paper-2 rounded-lg p-3">
              <div className="text-grey-500 text-xs">Status</div>
              <div className="text-ink font-medium mt-1">
                <Badge variant={activeTenant.status === 'active' ? 'green' : 'yellow'}>{activeTenant.status}</Badge>
              </div>
            </div>
            <div className="bg-paper-2 rounded-lg p-3">
              <div className="text-grey-500 text-xs">Assets</div>
              <div className="text-ink font-medium mt-1">
                {seed.assets.filter(a => a.ownerTenantId === activeTenant.id).length}
              </div>
            </div>
            <div className="bg-paper-2 rounded-lg p-3">
              <div className="text-grey-500 text-xs">Users</div>
              <div className="text-ink font-medium mt-1">
                {seed.users.filter(u => u.tenantId === activeTenant.id).length}
              </div>
            </div>
          </div>

          {/* Invoice list */}
          <div className="mt-4">
            <h3 className="text-xs font-medium text-grey-500 mb-2">Invoices</h3>
            {seed.invoices.filter(inv => inv.customerTenantId === activeTenant.id).length === 0 ? (
              <div className="text-sm text-grey-500 bg-paper-2 rounded-lg p-3 border border-line">
                No invoices yet.
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-paper-2 text-grey-500">
                    <th className="px-3 py-2 text-left font-medium">Invoice</th>
                    <th className="px-3 py-2 text-left font-medium">Period</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {seed.invoices
                    .filter(inv => inv.customerTenantId === activeTenant.id)
                    .map(inv => (
                      <tr key={inv.id} className="bg-paper hover:bg-paper-2">
                        <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{inv.number}</td>
                        <td className="px-3 py-2 border-b border-line text-grey-700">{formatInvoicePeriod(inv.issuedAt)}</td>
                        <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">
                          AED {inv.totalAed.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 border-b border-line">
                          <Badge variant={
                            inv.status === 'paid' ? 'green'
                            : inv.status === 'overdue' ? 'red'
                            : inv.status === 'void' ? 'grey'
                            : 'yellow'
                          }>{inv.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right border-b border-line">
                          {inv.status !== 'paid' && inv.status !== 'void' ? (
                            <Button size="sm" variant="secondary">Record payment</Button>
                          ) : (
                            <span className="text-grey-400 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-lg p-6 text-center text-sm text-grey-500">
          No tenants yet. Create a tenant first.
        </div>
      )}

      <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
        Billing is managed per tenant. Invoices are raised automatically at the end of each billing period.
      </div>
    </div>
  );
}
