'use client';

import React, { useState } from 'react';
import {
  Button, Badge, EmptyState, Tabs,
} from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';
import { useT } from '@/lib/useT';
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

const STATUS_KEYS: Record<string, string> = {
  paid: 'billing.statuses.paid',
  part_paid: 'billing.statuses.partPaid',
  unpaid: 'billing.statuses.unpaid',
  overdue: 'billing.statuses.overdue',
  void: 'billing.statuses.void',
};

const STATUS_VARIANTS: Record<string, 'green' | 'yellow' | 'red' | 'grey'> = {
  paid: 'green',
  part_paid: 'yellow',
  unpaid: 'grey',
  overdue: 'red',
  void: 'grey',
};

function statusBadge(status: string, t: (key: string, fallback: string) => string): React.ReactNode {
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? 'grey'}>
      {t(STATUS_KEYS[status] ?? '', status)}
    </Badge>
  );
}

export default function BillingPage() {
  const store = useStore;
  const { t } = useT();
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;
  const [payConfirm, setPayConfirm] = useState<string | null>(null);

  if (!session) return null;

  if (phase === 'day_one') {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold text-ink mb-4">{t('billing.title', 'Billing')}</h1>
        <EmptyState
          title={t('billing.notAvailable', 'Not available')}
          description={t('billing.phase2', 'Billing is available in Phase 2.')}
        />
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
        <h1 className="text-lg font-semibold text-ink">{t('billing.title', 'Billing')}</h1>
        <p className="text-sm text-grey-500 mt-1">{t('billing.subtitle', 'Rental invoices and GPS subscription statements. All amounts in AED. Dummy rates apply.')}</p>
      </div>

      <Tabs
        tabs={[
          { id: 'issued', label: t('billing.tabs.issued', 'Issued') },
          { id: 'received', label: t('billing.tabs.received', 'Received') },
          { id: 'gps', label: t('billing.tabs.gpsSubscription', 'GPS subscription') },
        ]}
        activeId="issued"
        onChange={() => {}}
      />

      {/* Issued invoices */}
      <div className="bg-surface border border-line rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-ink">{t('billing.issuedInvoices', 'Rental invoices issued')}</h2>
          <Button variant="secondary" size="sm">{t('billing.createInvoice', 'Create invoice')}</Button>
        </div>
        {issuedInvoices.length === 0 ? (
          <div className="text-sm text-grey-500 bg-paper-2 rounded-lg p-4 border border-line">
            {t('billing.emptyIssued', 'No invoices issued yet.')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">{t('billing.columns.invoice', 'Invoice')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('billing.columns.customer', 'Customer')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('billing.columns.total', 'Total')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('billing.columns.issued', 'Issued')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('billing.columns.due', 'Due')}</th>
                  <th className="px-3 py-2 text-center font-medium">{t('billing.columns.status', 'Status')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('billing.columns.actions', 'Actions')}</th>
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
                      {statusBadge(inv.status, t)}
                    </td>
                    <td className="px-3 py-2 text-right border-b border-line">
                      {inv.status !== 'paid' && inv.status !== 'void' && (
                        <Button size="sm" variant="secondary">{t('billing.recordPayment', 'Record payment')}</Button>
                      )}
                      {inv.status === 'paid' && (
                        <span className="text-grey-400 text-xs">{t('billing.done', 'Done')}</span>
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
          <h2 className="text-sm font-medium text-ink">{t('billing.receivedInvoices', 'Invoices received')}</h2>
          <span className="text-xs text-grey-500">
            {t('billing.customerLabel', 'Customer')}: {seed.tenants.find(x => x.id === myTenantId)?.name ?? t('billing.unknown', 'Unknown')}
          </span>
        </div>
        {receivedInvoices.length === 0 ? (
          <div className="text-sm text-grey-500 bg-paper-2 rounded-lg p-4 border border-line">
            {t('billing.emptyReceived', 'No invoices received.')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">{t('billing.columns.invoice', 'Invoice')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('billing.columns.issuer', 'Issuer')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('billing.columns.total', 'Total')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('billing.columns.issued', 'Issued')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('billing.columns.due', 'Due')}</th>
                  <th className="px-3 py-2 text-center font-medium">{t('billing.columns.status', 'Status')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('billing.columns.actions', 'Actions')}</th>
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
                        {isOverdue && <span className="text-red text-xs ml-1">{t('billing.overdueTag', 'Overdue')}</span>}
                      </td>
                      <td className="px-3 py-2 border-b border-line text-center">
                        {statusBadge(inv.status, t)}
                      </td>
                      <td className="px-3 py-2 text-right border-b border-line">
                        {inv.status === 'unpaid' || inv.status === 'part_paid' ? (
                          <Button size="sm" variant="yellow" onClick={() => handlePay(inv.id)}>
                            {t('billing.payAmount', `Pay ${fmtAed(inv.totalAed)}`, { amount: fmtAed(inv.totalAed) })}
                          </Button>
                        ) : (
                          <span className="text-grey-400 text-xs">{t('billing.paidTag', 'Paid')}</span>
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
            <h3 className="text-sm font-medium text-ink mb-2">{t('billing.payInvoice', 'Pay invoice?')}</h3>
            <p className="text-xs text-grey-500 mb-4">
              {t('billing.payConfirmBody', 'This is a demo. No money moves. You are confirming payment of {amount} to {customer}.', {
                amount: fmtAed(seed.invoices.find(i => i.id === payConfirm)?.totalAed ?? 0),
                customer: seed.invoices.find(i => i.id === payConfirm)?.customerName ?? t('billing.unknown', 'Unknown'),
              })}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setPayConfirm(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button size="sm" variant="yellow" onClick={confirmPay}>
                {t('billing.confirmPayment', 'Confirm payment')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* GPS subscription */}
      <div className="bg-surface border border-line rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-ink">{t('billing.gpsStatements', 'GPS subscription statements')}</h2>
          <Button variant="secondary" size="sm">{t('billing.download', 'Download')}</Button>
        </div>
        <p className="text-xs text-grey-500 mb-3">
          {t('billing.gpsNote', 'Monthly GPS tracker subscription from Kasper. Paid by the tenant. Dummy rates: AED 75/T1 · 110/T2 · 165/T3 per tracker-month.')}
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
                  <div className="text-xs text-grey-500">{t('billing.tierTrackers', `Tier 1 trackers (${t1})`, { tier: 1, count: t1 })}</div>
                  <div className="text-ink font-medium">{t1 > 0 ? fmtAed(t1 * 75) : '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-grey-500">{t('billing.tierTrackers', `Tier 2 trackers (${t2})`, { tier: 2, count: t2 })}</div>
                  <div className="text-ink font-medium">{t2 > 0 ? fmtAed(t2 * 110) : '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-grey-500">{t('billing.tierTrackers', `Tier 3 trackers (${t3})`, { tier: 3, count: t3 })}</div>
                  <div className="text-ink font-medium">{t3 > 0 ? fmtAed(t3 * 165) : '—'}</div>
                </div>
              </div>
              <div className="border-t border-line pt-3 flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{t('billing.total', 'Total')}</span>
                <span className="text-sm font-mono text-ink font-medium">{fmtAed(total)}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="yellow">{t('billing.statuses.unpaid', 'Unpaid')}</Badge>
                <span className="text-xs text-grey-500">{t('billing.dueByEndOfMonth', 'Due by end of month')}</span>
              </div>
              {total > 0 && (
                <div className="mt-3">
                  <Button size="sm" variant="yellow" onClick={() => handlePay('gps')}>
                    {t('billing.payAmount', `Pay ${fmtAed(total)}`, { amount: fmtAed(total) })}
                  </Button>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
        <strong className="text-ink">{t('billing.dummyRatesLabel', 'Dummy rates:')}</strong> {t('billing.dummyRatesBody', 'GPS subscription AED 75/T1 · 110/T2 · 165/T3 per tracker-month. VAT 5%. All amounts are dummy values for the prototype.')}
      </div>
    </div>
  );
}
