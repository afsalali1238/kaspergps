'use client';

// Console → Billing (spec 11.17). Kasper Admin only: every tenant's GPS
// statements and all rental invoices, read-only. Actions: generate last
// month's statements, record payments on statements, void a statement.
// Opening an invoice is audited.

import React, { useMemo, useState } from 'react';
import { Badge, Button, EmptyState } from '@/components/ui';
import { useDb } from '@/server/db';
import { hasCapability } from '@/server/access';
import {
  aed, canRecordPayment, generateStatement, invoiceStatusLabel, invoiceView, issuedInvoices,
  lastMonthStatements, paidTotal, paymentsFor, recordStatementPayment, statementById,
  voidStatement,
} from '@/server/billing';
import { recordAuditForSession } from '@/server/audit';
import { downloadBoth, type ExportTable } from '@/lib/export';
import * as clock from '@/lib/clock';
import { useSession } from '@/hooks';

type StatementRow = ReturnType<typeof lastMonthStatements>[number];

function statusBadge(status: string): React.ReactNode {
  const variants: Record<string, 'green' | 'yellow' | 'red' | 'grey'> = {
    paid: 'green', part_paid: 'yellow', unpaid: 'yellow', overdue: 'red', void: 'grey',
  };
  return <Badge variant={variants[status] ?? 'grey'}>{invoiceStatusLabel(status as 'unpaid')}</Badge>;
}

function formatDay(ts: string | number): string {
  return clock.formatDubaiDate(typeof ts === 'number' ? ts : new Date(ts).getTime());
}

export default function ConsoleBillingPage() {
  const seed = useDb(s => s);
  const session = useSession();

  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [paymentFor, setPaymentFor] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'bank_transfer' | 'cheque' | 'cash'>('bank_transfer');
  const [reference, setReference] = useState('');
  const [openInvoice, setOpenInvoice] = useState<string | null>(null);

  const bump = () => setVersion(v => v + 1);
  const showToast = (tone: 'ok' | 'error', text: string) => {
    setToast({ tone, text });
    setTimeout(() => setToast(null), 5000);
  };

  const statements = useMemo(() => lastMonthStatements(), [version]);
  const rentalInvoices = useMemo(
    () => (session ? issuedInvoices(session).filter(i => i.kind === 'rental') : []),
    [session, version]
  );

  if (!session || !hasCapability(session, 'console.billing.view')) {
    return (
      <div className="text-center py-8">
        <EmptyState title="Not available" description="Billing is for Kasper Admin — Ops can't see it." />
      </div>
    );
  }

  const generateAll = () => {
    let created = 0;
    let skipped = 0;
    for (const statement of statements) {
      if (statement.invoiceId || statement.totalAed <= 0) {
        skipped++;
        continue;
      }
      const result = generateStatement(session, statement.tenantId);
      if (result.ok) created++;
      else skipped++;
    }
    showToast('ok', `${created} statement${created === 1 ? '' : 's'} generated · ${skipped} skipped`);
    bump();
  };

  const generateOne = (tenantId: string) => {
    const result = generateStatement(session, tenantId);
    showToast(result.ok ? 'ok' : 'error', result.ok ? result.message! : result.error!);
    bump();
  };

  const submitStatementPayment = () => {
    if (!paymentFor) return;
    const result = recordStatementPayment(session, paymentFor, {
      amountAed: Number(amount), method, reference,
    });
    showToast(result.ok ? 'ok' : 'error', result.ok ? result.message! : result.error!);
    if (result.ok) {
      setPaymentFor(null);
      setAmount('');
      setReference('');
      bump();
    }
  };

  const submitVoid = (statementId: string) => {
    const reason = window.prompt('Why is this statement being voided?');
    if (reason === null) return;
    const result = voidStatement(session, statementId, reason);
    showToast(result.ok ? 'ok' : 'error', result.ok ? result.message! : result.error!);
    bump();
  };

  const openRow = (invoiceId: string) => {
    const next = openInvoice === invoiceId ? null : invoiceId;
    setOpenInvoice(next);
    if (next) {
      const invoice = rentalInvoices.find(i => i.id === next);
      recordAuditForSession(session, {
        action: 'invoice.view',
        tenantId: invoice?.issuerTenantId === 'kasper' ? undefined : invoice?.issuerTenantId,
        detail: `Opened ${invoice?.number ?? next} in the console`,
      });
    }
  };

  const statementExport = (): ExportTable => ({
    title: 'GPS statements',
    columns: ['Statement', 'Tenant', 'Month', 'T1', 'T2', 'T3', 'Subtotal', 'VAT', 'Total', 'Paid', 'Status'],
    rows: statements.map((s: StatementRow) => {
      const invoice = s.invoiceId ? statementById(s.invoiceId) : null;
      return [
        invoice?.number ?? '—', s.tenantName, s.monthLabel,
        s.lines.find(l => l.tier === 1)?.count ?? 0,
        s.lines.find(l => l.tier === 2)?.count ?? 0,
        s.lines.find(l => l.tier === 3)?.count ?? 0,
        s.subtotalAed.toFixed(2), s.vatAed.toFixed(2), s.totalAed.toFixed(2),
        s.paidAed.toFixed(2), invoiceStatusLabel(s.status),
      ];
    }),
  });

  const paymentStatement = paymentFor ? statementById(paymentFor) : null;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-ink">Billing</h1>
          <p className="text-sm text-grey-500 mt-1">
            Every tenant’s GPS statements and all rental invoices. Read-only except statement payments — Kasper Ops can’t see this page.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => downloadBoth({ fileName: 'kasper-gps-statements', subtitle: 'GPS subscription statements' }, [statementExport()])}>
            Export PDF + Excel
          </Button>
          <Button size="sm" onClick={generateAll}>Generate last month’s statements</Button>
        </div>
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

      {/* GPS statements */}
      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">GPS statements</h2>
          <span className="text-xs text-grey-500">
            Dummy rates: AED 75/T1 · 110/T2 · 165/T3 per tracker-month, plus VAT
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-paper-2 text-grey-500">
                {['Statement', 'Tenant', 'Month', 'Lines', 'Total', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statements.map((s: StatementRow) => {
                const invoice = s.invoiceId ? statementById(s.invoiceId) : null;
                const view = invoice ? invoiceView(invoice) : null;
                return (
                  <tr key={s.tenantId} className="bg-paper hover:bg-paper-2 align-top">
                    <td className="px-3 py-2 border-b border-line font-mono text-grey-700 whitespace-nowrap">
                      {invoice?.number ?? <span className="text-grey-400">not issued</span>}
                    </td>
                    <td className="px-3 py-2 border-b border-line text-grey-700">{s.tenantName}</td>
                    <td className="px-3 py-2 border-b border-line text-grey-500 whitespace-nowrap">{s.monthLabel}</td>
                    <td className="px-3 py-2 border-b border-line text-grey-700">
                      {s.lines.filter(l => l.count > 0).map(l => `T${l.tier} × ${l.count}`).join(' · ') || '—'}
                    </td>
                    <td className="px-3 py-2 border-b border-line font-mono text-ink">
                      {s.totalAed > 0 ? aed(s.totalAed) : '—'}
                      {view && view.paidAed > 0 && view.balanceAed > 0 && (
                        <div className="text-grey-500">{aed(view.balanceAed)} outstanding</div>
                      )}
                    </td>
                    <td className="px-3 py-2 border-b border-line">{statusBadge(view ? view.displayStatus : s.status)}</td>
                    <td className="px-3 py-2 border-b border-line">
                      <div className="flex flex-wrap gap-1">
                        {!invoice && s.totalAed > 0 && (
                          <Button size="sm" variant="secondary" onClick={() => generateOne(s.tenantId)}>Generate</Button>
                        )}
                        {view && view.displayStatus !== 'paid' && view.displayStatus !== 'void' && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setPaymentFor(view.id);
                                setAmount(view.balanceAed.toFixed(2));
                                setReference('');
                              }}
                            >
                              Record payment
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => submitVoid(view.id)}>Void</Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Statement payment form */}
      {paymentStatement && (
        <div className="bg-surface border border-line rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-medium text-ink">Record a payment on {paymentStatement.number}</h2>
          <p className="text-xs text-grey-500">
            {aed(paymentStatement.totalAed - paidTotal(paymentStatement.id))} still owed. A payment over the balance is refused.
          </p>
          <div className="grid sm:grid-cols-4 gap-3">
            <label className="text-xs text-grey-500">
              Amount (AED)
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink" />
            </label>
            <label className="text-xs text-grey-500">
              Date
              <input type="date" defaultValue={clock.dubaiToIso(clock.now()).slice(0, 10)} className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink" />
            </label>
            <label className="text-xs text-grey-500">
              Method
              <select value={method} onChange={e => setMethod(e.target.value as typeof method)} className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                <option value="bank_transfer">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
              </select>
            </label>
            <label className="text-xs text-grey-500">
              Reference
              <input type="text" value={reference} onChange={e => setReference(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink" />
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={submitStatementPayment}>Save payment</Button>
            <Button size="sm" variant="secondary" onClick={() => setPaymentFor(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Rental invoices (read-only) */}
      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-line">
          <h2 className="text-sm font-medium text-ink">Rental invoices</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-paper-2 text-grey-500">
                {['Invoice', 'Issuer', 'Customer', 'Issued', 'Total', 'Status', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rentalInvoices.map(inv => {
                const issuer = seed.tenants.find(t => t.id === inv.issuerTenantId)?.name ?? inv.issuerTenantId;
                return (
                  <React.Fragment key={inv.id}>
                    <tr className="bg-paper hover:bg-paper-2">
                      <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{inv.number}</td>
                      <td className="px-3 py-2 border-b border-line text-grey-700">{issuer}</td>
                      <td className="px-3 py-2 border-b border-line text-grey-700">{inv.customerName}</td>
                      <td className="px-3 py-2 border-b border-line font-mono text-grey-500 whitespace-nowrap">{formatDay(inv.issuedAt)}</td>
                      <td className="px-3 py-2 border-b border-line font-mono text-ink">{aed(inv.totalAed)}</td>
                      <td className="px-3 py-2 border-b border-line">{statusBadge(inv.displayStatus)}</td>
                      <td className="px-3 py-2 border-b border-line">
                        <Button size="sm" variant="ghost" onClick={() => openRow(inv.id)}>
                          {openInvoice === inv.id ? 'Hide' : 'Open'}
                        </Button>
                      </td>
                    </tr>
                    {openInvoice === inv.id && (
                      <tr className="bg-paper-2">
                        <td colSpan={7} className="px-3 py-3 border-b border-line">
                          <div className="text-grey-700">
                            {inv.lines.map((l, i) => (
                              <div key={i} className="flex justify-between gap-3">
                                <span>{l.description} <span className="text-grey-500">· {l.basis}</span></span>
                                <span className="font-mono">{l.quantity} {l.unit} × {aed(l.rateAed)} = {aed(l.amountAed)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between gap-3 mt-2 pt-2 border-t border-line">
                              <span>Subtotal · VAT 5 % · Total</span>
                              <span className="font-mono">{aed(inv.subtotalAed)} · {aed(inv.vatAed)} · <strong>{aed(inv.totalAed)}</strong></span>
                            </div>
                            <div className="mt-2 text-grey-500">
                              {paymentsFor(inv.id).length === 0
                                ? 'No payments recorded.'
                                : paymentsFor(inv.id).map(p => `${formatDay(p.at)} — ${aed(p.amountAed)} (${p.method}, ${p.reference})`).join(' · ')}
                              {canRecordPayment(session, inv) && inv.displayStatus !== 'paid' && inv.displayStatus !== 'void' && (
                                <span> · The owner records payments on rental invoices.</span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
        Statements are generated month by month and are per tenant. Rental invoices are read-only here; opening one writes an audit entry.
      </div>
    </div>
  );
}
