'use client';

import React, { useState } from 'react';
import {
  Button, Badge, EmptyState, Tabs,
} from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';
import * as clock from '@/lib/clock';

function formatTs(ts: string | number): string {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  return new Date(t).toLocaleString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Dubai',
  });
}

function fmtAed(amount: number): string {
  return `AED ${amount.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`;
}

function statusBadge(status: string): React.ReactNode {
  const variants: Record<string, 'green' | 'yellow' | 'red' | 'grey'> = {
    paid: 'green',
    part_paid: 'yellow',
    unpaid: 'grey',
    overdue: 'red',
    void: 'grey',
  };
  return <Badge variant={variants[status] ?? 'grey'}>{status}</Badge>;
}

export default function BillingPage() {
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;
  const [payConfirm, setPayConfirm] = useState<string | null>(null);

  if (!session) return null;

  if (phase === 'day_one') {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold text-ink mb-4">Billing</h1>
        <EmptyState title="Not available" description="Billing is available in Phase 2." />
      </div>
    );
  }

  const myTenantId = session.tenantId;
  const isKasper = session.isKasper;

  const issuedInvoices = seed.invoices.filter(inv =>
    inv.issuerTenantId === myTenantId || (isKasper && inv.kind === 'rental')
  );

  const receivedInvoices = seed.invoices.filter(inv => inv.customerTenantId === myTenantId);

  const handlePay = (invId: string) => setPayConfirm(invId);
  const confirmPay = () => setPayConfirm(null);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Billing</h1>
        <p className="text-sm text-grey-500 mt-1">
          Rental invoices and GPS subscription statements. All amounts in AED. Dummy rates apply.
        </p>
      </div>

      <Tabs
        tabs={[
          { id: 'issued', label: 'Issued' },
          { id: 'received', label: 'Received' },
          { id: 'gps', label: 'GPS subscription' },
        ]}
        activeId="issued"
        onChange={() => {}}
      />

      {/* Issued invoices */}
      <div className="bg-surface border border-line rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-ink">Rental invoices issued</h2>
          <Button variant="secondary" size="sm">Create invoice</Button>
        </div>
        {issuedInvoices.length === 0 ? (
          <div className="text-sm text-grey-500 bg-paper-2 rounded-lg p-4 border border-line">
            No invoices issued yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">Invoice</th>
                  <th className="px-3 py-2 text-left font-medium">Customer</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">Issued</th>
                  <th className="px-3 py-2 text-right font-medium">Due</th>
                  <th className="px-3 py-2 text-center font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {issuedInvoices.map(inv => (
                  <tr key={inv.id} className="bg-paper hover:bg-paper-2">
                    <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{inv.number}</td>
                    <td className="px-3 py-2 border-b border-line text-grey-700">{inv.customerName}</td>
                    <td className="px-3 py-2 border-b border-line text-right font-mono text-ink font-medium">
                      {fmtAed(inv.totalAed)}
                    </td>
                    <td className="px-3 py-2 border-b border-line text-right text-xs font-mono text-grey-500">
                      {formatTs(inv.issuedAt).split(',')[0]}
                    </td>
                    <td className="px-3 py-2 border-b border-line text-right text-xs font-mono text-grey-500">
                      {formatTs(inv.dueAt).split(',')[0]}
                    </td>
                    <td className="px-3 py-2 border-b border-line text-center">
                      {statusBadge(inv.status)}
                    </td>
                    <td className="px-3 py-2 text-right border-b border-line">
                      {inv.status !== 'paid' && inv.status !== 'void' && (
                        <Button size="sm" variant="secondary">Record payment</Button>
                      )}
                      {inv.status === 'paid' && (
                        <span className="text-grey-400 text-xs">Done</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Received invoices */}
      <div className="bg-surface border border-line rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-ink">Invoices received</h2>
          <span className="text-xs text-grey-500">
            Customer: {seed.tenants.find(t => t.id === myTenantId)?.name ?? 'Unknown'}
          </span>
        </div>
        {receivedInvoices.length === 0 ? (
          <div className="text-sm text-grey-500 bg-paper-2 rounded-lg p-4 border border-line">
            No invoices received.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">Invoice</th>
                  <th className="px-3 py-2 text-left font-medium">Issuer</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">Issued</th>
                  <th className="px-3 py-2 text-right font-medium">Due</th>
                  <th className="px-3 py-2 text-center font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {receivedInvoices.map(inv => {
                  const issuer = seed.tenants.find(t => t.id === inv.issuerTenantId) ?? { name: 'Kasper' };
                  const isOverdue = typeof inv.dueAt === 'number' && clock.now() > inv.dueAt
                    && (inv.status === 'unpaid' || inv.status === 'part_paid');
                  return (
                    <tr key={inv.id} className="bg-paper hover:bg-paper-2">
                      <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{inv.number}</td>
                      <td className="px-3 py-2 border-b border-line text-grey-700">{issuer.name}</td>
                      <td className="px-3 py-2 border-b border-line text-right font-mono text-ink font-medium">
                        {fmtAed(inv.totalAed)}
                      </td>
                      <td className="px-3 py-2 border-b border-line text-right text-xs font-mono text-grey-500">
                        {formatTs(inv.issuedAt).split(',')[0]}
                      </td>
                      <td className="px-3 py-2 border-b border-line text-right text-xs font-mono text-grey-500">
                        {formatTs(inv.dueAt).split(',')[0]}
                        {isOverdue && <span className="text-red text-xs ml-1">Overdue</span>}
                      </td>
                      <td className="px-3 py-2 border-b border-line text-center">
                        {statusBadge(inv.status)}
                      </td>
                      <td className="px-3 py-2 text-right border-b border-line">
                        {inv.status === 'unpaid' || inv.status === 'part_paid' ? (
                          <Button size="sm" variant="yellow" onClick={() => handlePay(inv.id)}>
                            Pay AED {fmtAed(inv.totalAed).replace('AED ', '')}
                          </Button>
                        ) : (
                          <span className="text-grey-400 text-xs">Paid</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pay confirmation modal */}
      {payConfirm && (
        <div className="fixed inset-0 flex items-center justify-center bg-ink/50 z-50">
          <div className="bg-surface border border-line rounded-lg p-4 max-w-sm w-full mx-4">
            <h3 className="text-sm font-medium text-ink mb-2">Pay invoice?</h3>
            <p className="text-xs text-grey-500 mb-4">
              This is a demo. No money moves. You are confirming payment of{' '}
              {fmtAed(seed.invoices.find(i => i.id === payConfirm)?.totalAed ?? 0)} to{' '}
              {seed.invoices.find(i => i.id === payConfirm)?.customerName ?? 'Unknown'}.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setPayConfirm(null)}>Cancel</Button>
              <Button size="sm" variant="yellow" onClick={confirmPay}>Confirm payment</Button>
            </div>
          </div>
        </div>
      )}

      {/* GPS subscription */}
      <div className="bg-surface border border-line rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-ink">GPS subscription statements</h2>
          <Button variant="secondary" size="sm">Download</Button>
        </div>
        <p className="text-xs text-grey-500 mb-3">
          Monthly GPS tracker subscription from Kasper. Paid by the tenant. Dummy rates: AED 75/T1 · 110/T2 · 165/T3 per tracker-month.
        </p>
        {(() => {
          const tenantAssets = seed.assets.filter(a => a.ownerTenantId === myTenantId);
          const t1 = tenantAssets.filter(a => a.canProfile.adapter === 'none').length;
          const t2 = tenantAssets.filter(a => a.canProfile.adapter === 'LVCAN200').length;
          const t3 = tenantAssets.filter(a => a.canProfile.adapter === 'ALL-CAN300').length;
          const total = t1 * 75 + t2 * 110 + t3 * 165;
          return (
            <div className="bg-paper-2 rounded-lg p-4 border border-line">
              <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                <div>
                  <div className="text-xs text-grey-500">Tier 1 trackers ({t1})</div>
                  <div className="text-ink font-medium">{t1 > 0 ? fmtAed(t1 * 75) : '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-grey-500">Tier 2 trackers ({t2})</div>
                  <div className="text-ink font-medium">{t2 > 0 ? fmtAed(t2 * 110) : '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-grey-500">Tier 3 trackers ({t3})</div>
                  <div className="text-ink font-medium">{t3 > 0 ? fmtAed(t3 * 165) : '—'}</div>
                </div>
              </div>
              <div className="border-t border-line pt-3 flex items-center justify-between">
                <span className="text-sm font-medium text-ink">Total</span>
                <span className="text-sm font-mono text-ink font-medium">{fmtAed(total)}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="yellow">Unpaid</Badge>
                <span className="text-xs text-grey-500">Due by end of month</span>
              </div>
              {total > 0 && (
                <div className="mt-3">
                  <Button size="sm" variant="yellow" onClick={() => handlePay('gps')}>
                    Pay AED {fmtAed(total).replace('AED ', '')}
                  </Button>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
        <strong className="text-ink">Dummy rates:</strong> GPS subscription AED 75/T1 · 110/T2 · 165/T3 per tracker-month. VAT 5%. All amounts are dummy values for the prototype.
      </div>
    </div>
  );
}
