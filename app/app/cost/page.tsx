'use client';

import React, { useState, useMemo } from 'react';
import { Button, Badge, EmptyState } from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { hasCapability } from '@/server/access';
import type { Session } from '@/domain/types';

function fmtAed(amount: number): string {
  return new Intl.NumberFormat('ar-AE', { style: 'currency', currency: 'AED' }).format(amount);
}

function statusBadge(status: string): React.ReactNode {
  const variants: Record<string, 'green' | 'yellow' | 'red' | 'default'> = {
    paid: 'green',
    part_paid: 'yellow',
    unpaid: 'red',
    overdue: 'red',
    void: 'default',
  };
  return <Badge variant={variants[status] ?? 'default'}>{status}</Badge>;
}

export default function CostPage() {
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  const [collapseInvoices, setCollapseInvoices] = useState(true);
  const [collapseMaintenance, setCollapseMaintenance] = useState(true);

  const canView = hasCapability(session!, 'cost.view');

  const tenantAssets = useMemo(() => {
    if (!session) return [];
    return seed.assets.filter(a => a.ownerTenantId === session.tenantId);
  }, [session]);

  const tenantCostProfiles = useMemo(() => {
    if (!session) return [];
    return seed.costProfiles.filter(c => c.tenantId === session.tenantId);
  }, [session]);

  const tenantInvoices = useMemo(() => {
    if (!session) return [];
    return seed.invoices.filter(inv => inv.customerTenantId === session.tenantId);
  }, [session]);

  const tenantServiceRecords = useMemo(() => {
    if (!session) return [];
    return seed.serviceRecords.filter(sr => sr.tenantId === session.tenantId);
  }, [session]);

  const totalAssetValue = useMemo(() => {
    return tenantCostProfiles.reduce((sum, cp) => sum + cp.purchaseValueAed, 0);
  }, [tenantCostProfiles]);

  const totalMonthlyFinance = useMemo(() => {
    return tenantCostProfiles.reduce((sum, cp) => sum + cp.monthlyFinanceAed, 0);
  }, [tenantCostProfiles]);

  const totalInsurancePerMonth = useMemo(() => {
    return tenantCostProfiles.reduce((sum, cp) => sum + cp.insurancePerMonthAed, 0);
  }, [tenantCostProfiles]);

  const totalMaintenanceCost = useMemo(() => {
    return tenantServiceRecords.reduce((sum, sr) => sum + sr.costAed, 0);
  }, [tenantServiceRecords]);

  const paidInvoices = useMemo(() => {
    return tenantInvoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + inv.totalAed, 0);
  }, [tenantInvoices]);

  const overdueInvoices = useMemo(() => {
    return tenantInvoices.filter(inv => inv.status === 'overdue' || inv.status === 'unpaid').reduce((sum, inv) => sum + inv.totalAed, 0);
  }, [tenantInvoices]);

  if (!session) return null;

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Cost & ROI</h1>
        <p className="text-sm text-grey-500 mt-1">
          Asset value, running costs, invoices, and maintenance spend for your fleet.
        </p>
      </div>

      {phase === 'later' ? (
        <EmptyState title="Not available" description="Cost & ROI is available in the Later phase." />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-surface border border-line rounded-lg p-3">
              <div className="text-xs text-grey-500 font-medium">Total asset value</div>
              <div className="text-lg font-semibold text-ink mt-1">{fmtAed(totalAssetValue)}</div>
              <div className="text-xs text-grey-500 mt-1">{tenantCostProfiles.length} asset{tenantCostProfiles.length !== 1 ? 's' : ''}</div>
            </div>
            <div className="bg-surface border border-line rounded-lg p-3">
              <div className="text-xs text-grey-500 font-medium">Finance / month</div>
              <div className="text-lg font-semibold text-ink mt-1">{fmtAed(totalMonthlyFinance)}</div>
              <div className="text-xs text-grey-500 mt-1">Loan repayments</div>
            </div>
            <div className="bg-surface border border-line rounded-lg p-3">
              <div className="text-xs text-grey-500 font-medium">Insurance / month</div>
              <div className="text-lg font-semibold text-ink mt-1">{fmtAed(totalInsurancePerMonth)}</div>
              <div className="text-xs text-grey-500 mt-1">All assets</div>
            </div>
            <div className="bg-surface border border-line rounded-lg p-3">
              <div className="text-xs text-grey-500 font-medium">Maintenance spend</div>
              <div className="text-lg font-semibold text-ink mt-1">{fmtAed(totalMaintenanceCost)}</div>
              <div className="text-xs text-grey-500 mt-1">{tenantServiceRecords.length} service{tenantServiceRecords.length !== 1 ? 's' : ''}</div>
            </div>
          </div>

          {/* Invoice summary */}
          <div className="bg-surface border border-line rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-sm font-medium text-ink">Invoices</h2>
                <p className="text-xs text-grey-500 mt-0.5">{tenantInvoices.length} invoice{tenantInvoices.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex gap-2">
                <Badge variant="green">{fmtAed(paidInvoices)} paid</Badge>
                <Badge variant="red">{fmtAed(overdueInvoices)} overdue</Badge>
              </div>
            </div>
            {tenantInvoices.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-paper-2 text-grey-500">
                      <th className="px-3 py-2 text-left font-medium">Number</th>
                      <th className="px-3 py-2 text-left font-medium">Kind</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 text-left font-medium">Issued</th>
                      <th className="px-3 py-2 text-left font-medium">Due</th>
                      <th className="px-3 py-2 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantInvoices.map(inv => (
                      <tr key={inv.id} className="bg-paper hover:bg-paper-2">
                        <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{inv.number}</td>
                        <td className="px-3 py-2 border-b border-line text-grey-500">{inv.kind === 'rental' ? 'Rental' : 'GPS subscription'}</td>
                        <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">{fmtAed(inv.totalAed)}</td>
                        <td className="px-3 py-2 border-b border-line text-grey-500">{clock.formatDubaiDate(new Date(inv.issuedAt).getTime())}</td>
                        <td className="px-3 py-2 border-b border-line text-grey-500">{clock.formatDubaiDate(new Date(inv.dueAt).getTime())}</td>
                        <td className="px-3 py-2 border-b border-line text-center">{statusBadge(inv.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Maintenance spend detail */}
          <div className="bg-surface border border-line rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-sm font-medium text-ink">Maintenance & service</h2>
                <p className="text-xs text-grey-500 mt-0.5">{fmtAed(totalMaintenanceCost)} total · {tenantServiceRecords.length} records</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setCollapseMaintenance(!collapseMaintenance)}>
                {collapseMaintenance ? 'Show' : 'Hide'}
              </Button>
            </div>
            {!collapseMaintenance && tenantServiceRecords.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-paper-2 text-grey-500">
                      <th className="px-3 py-2 text-left font-medium">Date</th>
                      <th className="px-3 py-2 text-left font-medium">Asset</th>
                      <th className="px-3 py-2 text-left font-medium">Description</th>
                      <th className="px-3 py-2 text-right font-medium">Hours / km</th>
                      <th className="px-3 py-2 text-right font-medium">Cost (AED)</th>
                      <th className="px-3 py-2 text-left font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantServiceRecords.map(sr => {
                      const asset = seed.assets.find(a => a.id === sr.assetId);
                      return (
                        <tr key={sr.id} className="bg-paper hover:bg-paper-2">
                          <td className="px-3 py-2 border-b border-line text-grey-500">{clock.formatDubaiDate(new Date(sr.doneAt).getTime())}</td>
                          <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{asset?.code ?? '—'}</td>
                          <td className="px-3 py-2 border-b border-line text-grey-700">{sr.notes}</td>
                          <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">{sr.value.toLocaleString('en-AE')} {sr.planId ? 'h' : 'km'}</td>
                          <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">{fmtAed(sr.costAed)}</td>
                          <td className="px-3 py-2 border-b border-line text-grey-500 max-w-[160px] truncate">{sr.notes}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
            Cost & ROI data is sourced from your asset cost profiles, invoices, and service records.
            Numbers are in UAE Dirhams (AED).
          </div>
        </>
      )}
    </div>
  );
}
