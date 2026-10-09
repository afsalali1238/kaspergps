'use client';

// Billing and payments (spec 11.17). Tabs appear by capability: the owner sees
// what it issued, the customer sees what it received, and every Tenant Admin
// sees Kasper's GPS statements. All amounts are dummy.

import React, { useMemo, useState } from 'react';
import {
  Badge, Button, EmptyState,
} from '@/components/ui';
import { useDb } from '@/server/db';
import { hasCapability } from '@/server/access';
import type { InvoiceView } from '@/server/billing';
import {
  aed, agedReceivables, billingSummary, canPay, canRecordPayment, createInvoiceFromBooking,
  invoiceById, invoiceStatusLabel, invoiceView, issuedInvoices, mucForInvoice, payInvoice,
  receivedInvoices, recordPayment, statementsFor, voidInvoice,
} from '@/server/billing';
import { GPS_SUBSCRIPTION_PER_MONTH } from '@/config/pricing';
import { downloadBoth, downloadPdf, downloadXlsx, type ExportTable } from '@/lib/export';
import * as clock from '@/lib/clock';
import { useT } from '@/i18n';
import { useSession, useSwitches } from '@/hooks';

type TabId = 'issued' | 'received' | 'gps' | 'reports';

function statusBadge(
  status: string,
  t: (key: string, fallback: string) => string
): React.ReactNode {
  const variants: Record<string, 'green' | 'yellow' | 'red' | 'grey'> = {
    paid: 'green', part_paid: 'yellow', unpaid: 'grey', overdue: 'red', void: 'grey',
  };
  const english = invoiceStatusLabel(status as InvoiceView['status']);
  return (
    <Badge variant={variants[status] ?? 'grey'}>
      {t(`billing.status.${status}`, english)}
    </Badge>
  );
}

function formatDay(ts: string | number): string {
  return clock.formatDubaiDate(typeof ts === 'number' ? ts : new Date(ts).getTime());
}

const BASIS_KEYS: Record<string, string> = {
  'Days on hire': 'billing.basis.days_on_hire',
  'ECU': 'billing.basis.ecu',
  'Estimated': 'billing.basis.estimated',
};

function basisLabel(invoice: InvoiceView, t: (key: string, fallback: string) => string): string {
  const bases = [...new Set(invoice.lines.map(l => l.basis))];
  return bases.map(basis => (BASIS_KEYS[basis] ? t(BASIS_KEYS[basis], basis) : basis)).join(' + ');
}

const PAYMENT_METHODS = [
  { id: 'bank_transfer', label: 'Bank transfer' },
  { id: 'cheque', label: 'Cheque' },
  { id: 'cash', label: 'Cash' },
] as const;

export default function BillingPage() {
  const seed = useDb(s => s);
  const t = useT();
  const session = useSession();
  const { phase } = useSwitches();

  const [tab, setTab] = useState<TabId>('received');
  const [version, setVersion] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [payTarget, setPayTarget] = useState<string | null>(null);
  const [payResult, setPayResult] = useState<string | null>(null);
  const [paymentFor, setPaymentFor] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  // Record-payment form
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]['id']>('bank_transfer');
  const [reference, setReference] = useState('');
  const [voidReason, setVoidReason] = useState('');

  // Create-invoice form
  const [createOpen, setCreateOpen] = useState(false);
  const [bookingId, setBookingId] = useState('');
  const [basis, setBasis] = useState<'hourly' | 'daily'>('daily');
  const [rate, setRate] = useState('');
  const [agreed, setAgreed] = useState(false);

  const bump = () => setVersion(v => v + 1);
  const showToast = (tone: 'ok' | 'error', text: string) => {
    setToast({ tone, text });
    setTimeout(() => setToast(null), 5000);
  };

  const issued = useMemo(() => (session ? issuedInvoices(session) : []), [session, version]);
  const received = useMemo(() => (session ? receivedInvoices(session) : []), [session, version]);
  const statements = useMemo(() => (session ? statementsFor(session) : []), [session, version]);

  const billableBookings = useMemo(() => {
    if (!session) return [];
    return seed.bookings.filter(b =>
      b.status !== 'cancelled' &&
      (!session.isKasper ? b.ownerTenantId === session.tenantId : true)
    );
  }, [session, version]);

  if (!session) return null;

  if (phase === 'day_one') {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold text-ink mb-4">{t('billing.title', 'Billing')}</h1>
        <EmptyState title={t('common.not_available', 'Not available')} description={t('billing.phase_gate', 'Billing is available in Phase 2.')} />
      </div>
    );
  }

  if (!hasCapability(session, 'billing.view')) {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold text-ink mb-4">{t('billing.title', 'Billing')}</h1>
        <EmptyState title={t('common.not_available', 'Not available')} description={t('billing.no_capability', 'Your role doesn’t include billing.')} />
      </div>
    );
  }

  const tabs: { id: TabId; key: string; label: string }[] = [
    ...(issued.length > 0 || session.isKasper ? [{ id: 'issued' as TabId, key: 'billing.tabs.issued', label: 'Issued' }] : []),
    ...(received.length > 0 || !session.isKasper ? [{ id: 'received' as TabId, key: 'billing.tabs.received', label: 'Received' }] : []),
    { id: 'gps' as TabId, key: 'billing.tabs.gps', label: 'GPS subscription' },
    ...(!session.isKasper ? [{ id: 'reports' as TabId, key: 'billing.tabs.reports', label: 'Reports' }] : []),
  ];
  const activeTab: TabId = tabs.some(t => t.id === tab) ? tab : tabs[0].id;

  const customers = [...new Set(issued.map(i => i.customerName))].sort();
  const filteredIssued = issued.filter(inv =>
    (!statusFilter || inv.displayStatus === statusFilter) &&
    (!customerFilter || inv.customerName === customerFilter)
  );

  const tenantId = session.tenantId;
  const tenantAssets = seed.assets.filter(a => a.ownerTenantId === tenantId && !a.retiredAt);
  const tierCounts = {
    1: tenantAssets.filter(a => a.canProfile.adapter === 'none').length,
    2: tenantAssets.filter(a => a.canProfile.adapter === 'LVCAN200').length,
    3: tenantAssets.filter(a => a.canProfile.adapter === 'ALL-CAN300').length,
  };
  const previewTotal =
    tierCounts[1] * GPS_SUBSCRIPTION_PER_MONTH.tier1 +
    tierCounts[2] * GPS_SUBSCRIPTION_PER_MONTH.tier2 +
    tierCounts[3] * GPS_SUBSCRIPTION_PER_MONTH.tier3;

  const summary = billingSummary(session, clock.now() - 30 * 86400000, clock.now());
  const ageing = agedReceivables(session);

  const invoiceExport = (): ExportTable => ({
    title: 'Rental invoices issued',
    columns: ['Invoice', 'Customer', 'Asset', 'Booking', 'Basis', 'Issued', 'Due', 'Total AED', 'Paid AED', 'Status'],
    rows: filteredIssued.map(inv => {
      const asset = seed.assets.find(a => a.id === seed.bookings.find(b => b.id === inv.bookingId)?.assetId);
      return [
        inv.number, inv.customerName, asset?.code ?? '—', inv.bookingId ?? '—', basisLabel(inv, t),
        formatDay(inv.issuedAt), formatDay(inv.dueAt), inv.totalAed.toFixed(2), inv.paidAed.toFixed(2),
        invoiceStatusLabel(inv.displayStatus),
      ];
    }),
  });

  const reportsExport = (): ExportTable[] => [
    {
      title: 'Billing summary (last 30 days)',
      columns: ['Issued AED', 'Paid AED', 'Outstanding AED', 'Overdue AED'],
      rows: [[summary.issuedAed.toFixed(2), summary.paidAed.toFixed(2), summary.outstandingAed.toFixed(2), summary.overdueAed.toFixed(2)]],
    },
    {
      title: 'By customer',
      columns: ['Customer', 'Issued AED', 'Outstanding AED'],
      rows: summary.byCustomer.map(r => [r.customerName, r.issuedAed.toFixed(2), r.outstandingAed.toFixed(2)]),
    },
    {
      title: 'Aged receivables',
      columns: ['Bucket', 'Outstanding AED'],
      rows: ageing.map(b => [b.label, b.amountAed.toFixed(2)]),
    },
  ];

  const submitPayment = () => {
    if (!paymentFor) return;
    const result = recordPayment(session, paymentFor, {
      amountAed: Number(amount),
      method,
      reference,
    });
    showToast(result.ok ? 'ok' : 'error', result.ok ? result.message! : result.error!);
    if (result.ok) {
      setPaymentFor(null);
      setAmount('');
      setReference('');
      bump();
    }
  };

  const confirmPay = () => {
    if (!payTarget) return;
    const result = payInvoice(session, payTarget);
    setPayResult(result.ok ? result.message! : null);
    if (!result.ok) showToast('error', result.error!);
    setPayTarget(null);
    bump();
  };

  const submitVoid = (invoiceId: string) => {
    const result = voidInvoice(session, invoiceId, voidReason);
    showToast(result.ok ? 'ok' : 'error', result.ok ? result.message! : result.error!);
    if (result.ok) {
      setVoidReason('');
      bump();
    }
  };

  const submitCreate = () => {
    const booking = seed.bookings.find(b => b.id === bookingId);
    const result = createInvoiceFromBooking(session, {
      bookingId,
      basis,
      rateAed: Number(rate || booking?.rateAed || 0),
      agreedEstimatedHours: agreed,
    });
    showToast(result.ok ? 'ok' : 'error', result.ok ? result.message! : result.error!);
    if (result.ok) {
      setCreateOpen(false);
      setBookingId('');
      setRate('');
      setAgreed(false);
      bump();
    }
  };

  const payInvoiceRow = payTarget ? invoiceView(invoiceById(payTarget)!) : null;
  const paymentInvoice = paymentFor ? invoiceView(invoiceById(paymentFor)!) : null;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-ink">{t('billing.title', 'Billing')}</h1>
          <p className="text-sm text-grey-500 mt-1">
            {t('billing.subtitle', 'Rental invoices and GPS subscription statements. All amounts in AED — Dummy rates.')}
          </p>
        </div>
        {received.length > 0 && (
          <div className="text-xs text-grey-500 bg-paper-2 border border-line rounded-lg px-3 py-2">
            {t('billing.customer_label', 'Customer: {name}', { name: seed.tenants.find(x => x.id === tenantId)?.name ?? '—' })}
          </div>
        )}
      </div>

      {toast && (
        <div className={
          toast.tone === 'ok'
            ? 'text-sm text-ink bg-green/10 border border-green/30 rounded-lg px-3 py-2'
            : 'text-sm text-red bg-red/10 border border-red/30 rounded-lg px-3 py-2'
        }>
          {toast.text}
        </div>
      )}

      <div className="flex gap-1 border-b border-line overflow-x-auto">
        {tabs.map(tabItem => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            className={
              activeTab === tabItem.id
                ? 'px-3 py-2 text-sm text-ink border-b-2 border-yellow -mb-[1px] whitespace-nowrap'
                : 'px-3 py-2 text-sm text-grey-500 hover:text-ink whitespace-nowrap'
            }
          >
            {t(tabItem.key, tabItem.label)}
          </button>
        ))}
      </div>

      {/* ── Issued ─────────────────────────────────────────────────────────── */}
      {activeTab === 'issued' && (
        <div className="space-y-3">
          <div className="bg-surface border border-line rounded-lg p-3 flex items-center gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
            >
              <option value="">{t('billing.all_statuses', 'All statuses')}</option>
              {['unpaid', 'part_paid', 'paid', 'overdue', 'void'].map(s => (
                <option key={s} value={s}>{invoiceStatusLabel(s as InvoiceView['status'])}</option>
              ))}
            </select>
            <select
              value={customerFilter}
              onChange={e => setCustomerFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
            >
              <option value="">{t('billing.all_customers', 'All customers')}</option>
              {customers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex-1" />
            <Button variant="secondary" size="sm" onClick={() => downloadPdf({ fileName: 'kasper-invoices', subtitle: 'Rental invoices issued' }, [invoiceExport()])}>
              {t('reports.pdf', 'PDF')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => downloadXlsx({ fileName: 'kasper-invoices', subtitle: 'Rental invoices issued' }, [invoiceExport()])}>
              {t('reports.excel_short', 'Excel')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(!createOpen)}>{t('billing.actions.create_invoice', 'Create invoice')}</Button>
          </div>

          {createOpen && (
            <div className="bg-surface border border-line rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-medium text-ink">{t('billing.actions.create_from_booking', 'Create an invoice from a booking')}</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                <label className="text-xs text-grey-500">
                  Booking
                  <select
                    value={bookingId}
                    onChange={e => {
                      setBookingId(e.target.value);
                      const b = seed.bookings.find(x => x.id === e.target.value);
                      setRate(b ? String(b.rateAed) : '');
                    }}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  >
                    <option value="">{t('billing.actions.pick_booking', 'Pick a booking…')}</option>
                    {billableBookings.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.reference} · {seed.assets.find(a => a.id === b.assetId)?.code} · {b.renterName ?? 'Outside hirer'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-grey-500">
                  Basis
                  <select
                    value={basis}
                    onChange={e => setBasis(e.target.value as 'hourly' | 'daily')}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  >
                    <option value="daily">{t('billing.basis.days_on_hire', 'Days on hire')}</option>
                    <option value="hourly">{t('billing.basis.hourly', 'Hourly (MUC or estimated hours)')}</option>
                  </select>
                </label>
                <label className="text-xs text-grey-500">
                  Rate (AED)
                  <input
                    type="number"
                    value={rate}
                    onChange={e => setRate(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  />
                </label>
              </div>
              {basis === 'hourly' && (
                <label className="flex items-start gap-2 text-xs text-grey-700">
                  <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 accent-ink" />
                  {t('billing.create_note_estimated', 'Customer has agreed to estimated hours (Tier 1/2 assets bill ignition hours labelled “Estimated — not billing-grade”).')}
                </label>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={submitCreate} disabled={!bookingId}>{t('billing.actions.create_invoice', 'Create invoice')}</Button>
                <Button size="sm" variant="secondary" onClick={() => setCreateOpen(false)}>{t('common.cancel', 'Cancel')}</Button>
              </div>
              <p className="text-xs text-grey-500">
                {t('billing.create_note_vat', 'VAT 5 % is added and the due date is 14 days out. Tier 3 hourly invoices use the booking’s MUC billable hours')}
                {t('billing.create_note_topup', 'and add a minimum-hours top-up line.')}
              </p>
            </div>
          )}

          {filteredIssued.length === 0 ? (
            <EmptyState title={t('billing.no_invoices', 'No invoices')} description={t('billing.nothing_matches', 'Nothing matches those filters yet.')} />
          ) : (
            <div className="bg-surface border border-line rounded-lg overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-paper-2 text-grey-500">
                    {[
                      ['billing.columns.number', 'Invoice'],
                      ['billing.columns.customer', 'Customer'],
                      ['billing.columns.asset', 'Asset'],
                      ['billing.columns.booking', 'Booking'],
                      ['billing.columns.basis', 'Basis'],
                      ['billing.columns.total', 'Total'],
                      ['billing.columns.due', 'Due'],
                      ['billing.columns.status', 'Status'],
                      ['billing.columns.actions', 'Actions'],
                    ].map(([key, label]) => (
                      <th key={key} className="px-3 py-2 text-left font-medium whitespace-nowrap">{t(key, label)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredIssued.map(inv => {
                    const booking = seed.bookings.find(b => b.id === inv.bookingId);
                    const asset = seed.assets.find(a => a.id === booking?.assetId);
                    const isOpen = inv.displayStatus !== 'paid' && inv.displayStatus !== 'void';
                    return (
                      <tr key={inv.id} className="bg-paper hover:bg-paper-2 align-top">
                        <td className="px-3 py-2 border-b border-line font-mono text-grey-700 whitespace-nowrap">{inv.number}</td>
                        <td className="px-3 py-2 border-b border-line text-grey-700">{inv.customerName}</td>
                        <td className="px-3 py-2 border-b border-line font-mono text-grey-500">{asset?.code ?? '—'}</td>
                        <td className="px-3 py-2 border-b border-line font-mono text-grey-500">
                          {inv.bookingId ? (
                            <a className="underline" href={`/app/bookings`}>{booking?.reference ?? inv.bookingId}</a>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 border-b border-line text-grey-700">{basisLabel(inv, t)}</td>
                        <td className="px-3 py-2 border-b border-line font-mono text-ink">
                          {aed(inv.totalAed)}
                          {inv.paidAed > 0 && inv.balanceAed > 0 && (
                            <div className="text-grey-500">{t('billing.outstanding_line', '{amount} outstanding', { amount: aed(inv.balanceAed) })}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 border-b border-line font-mono text-grey-500 whitespace-nowrap">{formatDay(inv.dueAt)}</td>
                        <td className="px-3 py-2 border-b border-line">{statusBadge(inv.displayStatus, t)}</td>
                        <td className="px-3 py-2 border-b border-line">
                          <div className="flex flex-col gap-1">
                            {isOpen && canRecordPayment(session, inv) && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setPaymentFor(paymentFor === inv.id ? null : inv.id);
                                  setAmount(inv.balanceAed.toFixed(2));
                                  setReference('');
                                }}
                              >
                                {t('billing.actions.record_payment', 'Record payment')}
                              </Button>
                            )}
                            {isOpen && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const reason = window.prompt(`Why is ${inv.number} being voided?`);
                                  if (reason === null) return;
                                  setVoidReason(reason);
                                  submitVoid(inv.id);
                                }}
                              >
                                {t('billing.actions.void_invoice', 'Void')}
                              </Button>
                            )}
                            {inv.status === 'paid' && <span className="text-grey-400">{t('billing.settled', 'Settled')}</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {paymentInvoice && (
            <div className="bg-surface border border-line rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-medium text-ink">{t('billing.record_on', 'Record a payment on {number}', { number: paymentInvoice.number })}</h2>
              <p className="text-xs text-grey-500">
                {t('billing.still_owed', '{amount} still owed. A payment over the balance is refused.', { amount: aed(paymentInvoice.balanceAed) })}
              </p>
              <div className="grid sm:grid-cols-4 gap-3">
                <label className="text-xs text-grey-500">
                  {t('billing.payment.amount', 'Amount (AED)')}
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink" />
                </label>
                <label className="text-xs text-grey-500">
                  {t('billing.payment.date', 'Date')}
                  <input type="date" defaultValue={clock.dubaiToIso(clock.now()).slice(0, 10)} className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink" />
                </label>
                <label className="text-xs text-grey-500">
                  {t('billing.payment.method', 'Method')}
                  <select value={method} onChange={e => setMethod(e.target.value as typeof method)} className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </label>
                <label className="text-xs text-grey-500">
                  {t('billing.payment.reference', 'Reference')}
                  <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="BT-2026-…" className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink" />
                </label>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={submitPayment}>{t('billing.actions.save_payment', 'Save payment')}</Button>
                <Button size="sm" variant="secondary" onClick={() => setPaymentFor(null)}>{t('common.cancel', 'Cancel')}</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Received ───────────────────────────────────────────────────────── */}
      {activeTab === 'received' && (
        <div className="space-y-3">
          {payResult && (
            <div className="text-sm text-ink bg-green/10 border border-green/30 rounded-lg px-3 py-2">{payResult}</div>
          )}
          {received.length === 0 ? (
            <EmptyState title={t('billing.nothing_received', 'Nothing received')} description={t('billing.nothing_received_hint', 'No invoices are addressed to your company.')} />
          ) : (
            <div className="bg-surface border border-line rounded-lg overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-paper-2 text-grey-500">
                    {[
                      ['billing.columns.number', 'Invoice'],
                      ['billing.columns.from', 'From'],
                      ['billing.columns.asset', 'Asset'],
                      ['billing.columns.basis', 'Basis'],
                      ['billing.columns.total', 'Total'],
                      ['billing.columns.due', 'Due'],
                      ['billing.columns.status', 'Status'],
                      ['billing.columns.actions', 'Actions'],
                    ].map(([key, label]) => (
                      <th key={key} className="px-3 py-2 text-left font-medium whitespace-nowrap">{t(key, label)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {received.map(inv => {
                    const booking = seed.bookings.find(b => b.id === inv.bookingId);
                    const asset = seed.assets.find(a => a.id === booking?.assetId);
                    const muc = mucForInvoice(inv);
                    const issuer = inv.issuerTenantId === 'kasper' ? 'Kasper' : (seed.tenants.find(t => t.id === inv.issuerTenantId)?.name ?? inv.issuerTenantId);
                    const isOpen = inv.displayStatus !== 'paid' && inv.displayStatus !== 'void';
                    return (
                      <tr key={inv.id} className="bg-paper hover:bg-paper-2">
                        <td className="px-3 py-2 border-b border-line font-mono text-grey-700 whitespace-nowrap">{inv.number}</td>
                        <td className="px-3 py-2 border-b border-line text-grey-700">{issuer}</td>
                        <td className="px-3 py-2 border-b border-line font-mono text-grey-500">
                          {asset?.code ?? '—'}
                          {muc && (
                            <a href={`/verify/${muc.number}`} className="block text-grey-500 underline" title={t('billing.actions.check_muc', 'Check the hours on the certificate')}>
                              {muc.number}
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-2 border-b border-line text-grey-700">{basisLabel(inv, t)}</td>
                        <td className="px-3 py-2 border-b border-line font-mono text-ink">{aed(inv.totalAed)}</td>
                        <td className="px-3 py-2 border-b border-line font-mono text-grey-500 whitespace-nowrap">
                          {formatDay(inv.dueAt)}
                          {inv.displayStatus === 'overdue' && <span className="text-red ml-1">{t('billing.status.overdue', 'Overdue')}</span>}
                        </td>
                        <td className="px-3 py-2 border-b border-line">{statusBadge(inv.displayStatus, t)}</td>
                        <td className="px-3 py-2 border-b border-line">
                          {isOpen && canPay(session, inv) ? (
                            <Button size="sm" variant="yellow" onClick={() => setPayTarget(inv.id)}>
                              {t('billing.actions.pay', 'Pay {amount}', { amount: aed(inv.balanceAed) })}
                            </Button>
                          ) : inv.status === 'paid' ? (
                            <span className="text-grey-400">{t('billing.status.paid', 'Paid')}</span>
                          ) : (
                            <span className="text-grey-400">—</span>
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
      )}

      {/* ── GPS subscription ───────────────────────────────────────────────── */}
      {activeTab === 'gps' && (
        <div className="space-y-3">
          {statements.length > 0 && (
            <div className="bg-surface border border-line rounded-lg overflow-x-auto">
              <div className="px-3 py-2 border-b border-line text-xs text-grey-500">{t('billing.statements_from_kasper', 'Statements from Kasper')}</div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-paper-2 text-grey-500">
                    {['Statement', 'Lines', 'Total', 'Due', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {statements.map(inv => (
                    <tr key={inv.id} className="bg-paper hover:bg-paper-2">
                      <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{inv.number}</td>
                      <td className="px-3 py-2 border-b border-line text-grey-700">
                        {inv.lines.map(l => `${l.description} — ${aed(l.amountAed)}`).join(' · ') || '—'}
                      </td>
                      <td className="px-3 py-2 border-b border-line font-mono text-ink">{aed(inv.totalAed)}</td>
                      <td className="px-3 py-2 border-b border-line font-mono text-grey-500 whitespace-nowrap">{formatDay(inv.dueAt)}</td>
                      <td className="px-3 py-2 border-b border-line">{statusBadge(inv.displayStatus, t)}</td>
                      <td className="px-3 py-2 border-b border-line">
                        {inv.displayStatus !== 'paid' && inv.displayStatus !== 'void' ? (
                          <Button size="sm" variant="yellow" onClick={() => setPayTarget(inv.id)}>Pay {aed(inv.balanceAed)}</Button>
                        ) : (
                          <span className="text-grey-400">{inv.status === 'paid' ? 'Paid' : '—'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-surface border border-line rounded-lg p-4">
            <h2 className="text-sm font-medium text-ink mb-1">{t('billing.subscription_title', 'This month’s subscription (not issued yet)')}</h2>
            <p className="text-xs text-grey-500 mb-3">
              Dummy rates: AED {GPS_SUBSCRIPTION_PER_MONTH.tier1}/T1 · {GPS_SUBSCRIPTION_PER_MONTH.tier2}/T2 · {GPS_SUBSCRIPTION_PER_MONTH.tier3}/T3 per tracker-month, plus 5 % VAT.
              Kasper issues the statement at the end of the month.
            </p>
            <div className="grid sm:grid-cols-4 gap-3 text-sm">
              {([1, 2, 3] as const).map(tier => (
                <div key={tier}>
                  <div className="text-xs text-grey-500">Tier {tier} trackers ({tierCounts[tier]})</div>
                  <div className="text-ink font-medium">
                    {tierCounts[tier] > 0 ? aed(tierCounts[tier] * GPS_SUBSCRIPTION_PER_MONTH[`tier${tier}` as 'tier1']) : '—'}
                  </div>
                </div>
              ))}
              <div>
                <div className="text-xs text-grey-500">{t('billing.total_excl_vat', 'Total (excl. VAT)')}</div>
                <div className="text-ink font-medium">{aed(previewTotal)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reports ────────────────────────────────────────────────────────── */}
      {activeTab === 'reports' && (
        <div className="space-y-3">
          <div className="bg-surface border border-line rounded-lg p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <h2 className="text-sm font-medium text-ink">{t('billing.summary_title', 'Billing summary — last 30 days')}</h2>
              <Button size="sm" variant="secondary" onClick={() => downloadBoth({ fileName: 'kasper-billing-summary', subtitle: 'Billing summary and aged receivables' }, reportsExport())}>
                {t('billing.actions.download_both', 'Download PDF + Excel')}
              </Button>
            </div>
            <div className="grid sm:grid-cols-4 gap-3 text-sm">
              {[
                ['Issued', summary.issuedAed], ['Paid', summary.paidAed],
                ['Outstanding', summary.outstandingAed], ['Overdue', summary.overdueAed],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <div className="text-xs text-grey-500">{label}</div>
                  <div className="text-ink font-medium">{aed(Number(value))}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-line rounded-lg p-4">
            <h2 className="text-sm font-medium text-ink mb-3">{t('billing.by_customer', 'By customer')}</h2>
            {summary.byCustomer.length === 0 ? (
              <p className="text-sm text-grey-500">{t('billing.nothing_issued', 'Nothing issued in this period.')}</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-paper-2 text-grey-500">
                    <th className="px-3 py-2 text-left font-medium">{t('billing.summary.customer', 'Customer')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('billing.summary.issued', 'Issued')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('billing.summary.outstanding', 'Outstanding')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byCustomer.map(r => (
                    <tr key={r.customerName} className="bg-paper">
                      <td className="px-3 py-2 border-b border-line text-grey-700">{r.customerName}</td>
                      <td className="px-3 py-2 border-b border-line text-right font-mono text-ink">{aed(r.issuedAed)}</td>
                      <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">{aed(r.outstandingAed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-surface border border-line rounded-lg p-4">
            <h2 className="text-sm font-medium text-ink mb-3">{t('billing.aged_receivables', 'Aged receivables')}</h2>
            <div className="grid sm:grid-cols-4 gap-3 text-sm">
              {ageing.map(b => (
                <div key={b.label}>
                  <div className="text-xs text-grey-500">{b.label}</div>
                  <div className="text-ink font-medium">{b.amountAed > 0 ? aed(b.amountAed) : '—'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pay confirmation (simulated) */}
      {payInvoiceRow && (
        <div className="fixed inset-0 flex items-center justify-center bg-ink/50 z-50">
          <div className="bg-surface border border-line rounded-lg p-4 max-w-sm w-full mx-4">
            <h3 className="text-sm font-medium text-ink mb-2">{t('billing.pay.title', 'Pay this invoice?')}</h3>
            <p className="text-xs text-grey-500 mb-4">
              Pay {aed(payInvoiceRow.balanceAed)} to {payInvoiceRow.issuerTenantId === 'kasper' ? 'Kasper' : (seed.tenants.find(t => t.id === payInvoiceRow.issuerTenantId)?.name ?? payInvoiceRow.issuerTenantId)}?
              This is a demo; no money moves.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setPayTarget(null)}>Cancel</Button>
              <Button size="sm" variant="yellow" onClick={confirmPay}>{t('billing.pay.confirm', 'Confirm payment')}</Button>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
        <strong className="text-ink">{t('billing.dummy_rates', 'Dummy rates:')}</strong> GPS subscription AED {GPS_SUBSCRIPTION_PER_MONTH.tier1}/{GPS_SUBSCRIPTION_PER_MONTH.tier2}/{GPS_SUBSCRIPTION_PER_MONTH.tier3} per tracker-month by tier.
        VAT {5} %. Payments are simulated — no money moves.
      </div>
    </div>
  );
}
