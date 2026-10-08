// Rental invoices, payments and GPS subscription statements (spec 11.17).
//
// Money rules: VAT 5 %, due in 14 days, hourly invoices on Tier 3 use the MUC's
// billable hours, Tier 1/2 hourly invoices use ignition hours labelled
// "Estimated — not billing-grade", daily invoices count started days. A payment
// over the outstanding balance is refused.

import type {
  Asset, Invoice, InvoiceLine, InvoiceStatus, Muc, Payment, PaymentMethod, Session,
} from '@/domain/types';
import { db, append, nextNumber, touch } from '@/server/db';
import { recordAuditForSession } from '@/server/audit';
import { fail, ok, type OpResult } from '@/server/result';
import { hasCapability } from '@/server/access';
import { isBillingGradeHours, tierForAsset } from '@/domain/features';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { INVOICE_DUE_DAYS, VAT_PCT } from '@/config/thresholds';
import { GPS_SUBSCRIPTION_PER_MONTH } from '@/config/pricing';
import * as clock from '@/lib/clock';

const DAY = 86400000;
/** Dummy minimum billable hours per day on hire (spec 11.17). */
export const MIN_HOURS_PER_DAY = 8;

function n2(n: number): number {
  return Math.round(n * 100) / 100;
}

function ms(v: string | number): number {
  return typeof v === 'number' ? v : new Date(v).getTime();
}

export function aed(amount: number): string {
  return `AED ${n2(amount).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Reading invoices ──────────────────────────────────────────────────────────

export interface InvoiceView extends Invoice {
  paidAed: number;
  balanceAed: number;
  /** `overdue` is computed: past due and not settled. */
  displayStatus: InvoiceStatus;
}

export function paymentsFor(invoiceId: string): Payment[] {
  return db.getState().payments.filter(p => p.invoiceId === invoiceId).sort((a, b) => ms(a.at) - ms(b.at));
}

export function paidTotal(invoiceId: string): number {
  return n2(paymentsFor(invoiceId).reduce((sum, p) => sum + p.amountAed, 0));
}

export function invoiceView(invoice: Invoice, nowMs: number = clock.now()): InvoiceView {
  const paidAed = paidTotal(invoice.id);
  const balanceAed = n2(Math.max(0, invoice.totalAed - paidAed));
  let displayStatus: InvoiceStatus = invoice.status;
  if (invoice.status !== 'paid' && invoice.status !== 'void' && nowMs > ms(invoice.dueAt)) {
    displayStatus = 'overdue';
  }
  return { ...invoice, paidAed, balanceAed, displayStatus };
}

export function canRecordPayment(session: Session, invoice: Invoice): boolean {
  if (!hasCapability(session, 'billing.recordPayment')) return false;
  if (session.isKasper) return true;
  return invoice.issuerTenantId === session.tenantId;
}

export function canPay(session: Session, invoice: Invoice): boolean {
  if (!hasCapability(session, 'billing.pay')) return false;
  return invoice.customerTenantId !== null && invoice.customerTenantId === session.tenantId;
}

export function invoiceById(id: string): Invoice | null {
  return db.getState().invoices.find(i => i.id === id) ?? null;
}

export function invoiceByNumber(number: string): Invoice | null {
  return db.getState().invoices.find(i => i.number === number) ?? null;
}

/** Invoices the session can see, newest first (spec 11.17 capability table). */
export function issuedInvoices(session: Session): InvoiceView[] {
  if (!hasCapability(session, 'billing.view')) return [];
  const nowMs = clock.now();
  return db.getState().invoices
    .filter(inv => (session.isKasper ? true : inv.issuerTenantId === session.tenantId) && inv.kind === 'rental')
    .map(inv => invoiceView(inv, nowMs))
    .sort((a, b) => ms(b.issuedAt) - ms(a.issuedAt));
}

export function receivedInvoices(session: Session): InvoiceView[] {
  if (!hasCapability(session, 'billing.view') || session.isKasper) return [];
  const nowMs = clock.now();
  return db.getState().invoices
    .filter(inv => inv.customerTenantId === session.tenantId)
    .map(inv => invoiceView(inv, nowMs))
    .sort((a, b) => ms(b.issuedAt) - ms(a.issuedAt));
}

export function mucForInvoice(invoice: Invoice): Muc | null {
  if (!invoice.mucId) return null;
  return db.getState().mucs.find(m => m.id === invoice.mucId) ?? null;
}

// ── Payments ──────────────────────────────────────────────────────────────────

export interface PaymentInput {
  amountAed: number;
  at?: string | number;
  method: PaymentMethod;
  reference?: string;
}

/** Record a payment on an invoice the session issued (spec 11.17). */
export function recordPayment(session: Session, invoiceId: string, input: PaymentInput): OpResult<Payment> {
  const invoice = invoiceById(invoiceId);
  if (!invoice) return fail('Invoice not found.');
  if (!canRecordPayment(session, invoice)) {
    return fail(session.isKasper ? 'You can\u2019t record payments on this invoice.' : 'Only the company that issued the invoice can record a payment on it.');
  }
  const amount = n2(input.amountAed);
  if (!Number.isFinite(amount) || amount <= 0) return fail('Enter an amount greater than zero.');
  if (invoice.status === 'void') return fail('This invoice is void — nothing is owed.');
  if (invoice.status === 'paid') return fail('This invoice is already paid in full.');

  const balance = n2(invoice.totalAed - paidTotal(invoice.id));
  if (amount > balance) return fail(`This is more than the ${aed(balance)} still owed.`);
  if (!input.method) return fail('Pick a payment method.');

  const paymentNo = nextNumber('pay-', db.getState().payments, 100);
  const payment: Payment = {
    id: `pay-${paymentNo}`,
    invoiceId: invoice.id,
    at: input.at !== undefined ? input.at : new Date(clock.now()).toISOString(),
    amountAed: amount,
    method: input.method,
    reference: input.reference?.trim() || `Payment ${paymentNo}`,
    recordedBy: session.userId,
  };
  append('payments', payment);

  const remaining = n2(balance - amount);
  invoice.status = remaining <= 0 ? 'paid' : 'part_paid';
  touch('invoices');

  recordAuditForSession(session, {
    action: 'invoice.payment',
    tenantId: session.tenantId ?? undefined,
    detail: `${aed(amount)} recorded against ${invoice.number} (${invoice.customerName}) — ${remaining <= 0 ? 'paid in full' : `${aed(remaining)} outstanding`}`,
  });

  return ok(payment, `${aed(amount)} recorded. ${remaining <= 0 ? 'Paid in full.' : `${aed(remaining)} still owed.`}`);
}

export interface PayInput {
  reference?: string;
}

/** Simulated online payment by the customer (spec 11.17). No money moves. */
export function payInvoice(session: Session, invoiceId: string, input: PayInput = {}): OpResult<Payment> {
  const invoice = invoiceById(invoiceId);
  if (!invoice) return fail('Invoice not found.');
  if (!canPay(session, invoice)) return fail('This invoice isn\u2019t addressed to your company.');
  if (invoice.status === 'void') return fail('This invoice is void — nothing is owed.');
  if (invoice.status === 'paid') return fail('This invoice is already paid.');

  const balance = n2(invoice.totalAed - paidTotal(invoice.id));
  const paymentNo = nextNumber('pay-', db.getState().payments, 100);
  const payment: Payment = {
    id: `pay-${paymentNo}`,
    invoiceId: invoice.id,
    at: new Date(clock.now()).toISOString(),
    amountAed: balance,
    method: 'simulated_online',
    reference: input.reference?.trim() || `Online ${paymentNo}`,
    recordedBy: session.userId,
  };
  append('payments', payment);
  invoice.status = 'paid';
  touch('invoices');

  recordAuditForSession(session, {
    action: 'invoice.pay',
    tenantId: session.tenantId ?? undefined,
    detail: `${invoice.number} paid in full (${aed(balance)}) — simulated online payment`,
  });

  return ok(payment, `Paid ${aed(balance)}. This is a demo; no money moved.`);
}

export function voidInvoice(session: Session, invoiceId: string, reason: string): OpResult<Invoice> {
  const invoice = invoiceById(invoiceId);
  if (!invoice) return fail('Invoice not found.');
  if (!canRecordPayment(session, invoice)) return fail('Only the company that issued the invoice can void it.');
  if (invoice.status === 'void') return fail('This invoice is already void.');
  if (invoice.status === 'paid') return fail('A paid invoice can\u2019t be voided — credit it instead.');
  if (reason.trim().length < 10) return fail('Give a reason of at least 10 characters.');

  invoice.status = 'void';
  touch('invoices');
  recordAuditForSession(session, {
    action: 'invoice.void',
    tenantId: session.tenantId ?? undefined,
    detail: `${invoice.number} voided (${invoice.customerName})`,
    reason: reason.trim(),
  });
  return ok(invoice, `${invoice.number} voided.`);
}

// ── Creating rental invoices ──────────────────────────────────────────────────

export interface CreateInvoiceInput {
  bookingId: string;
  basis: 'hourly' | 'daily';
  rateAed: number;
  /** Required for hourly Tier 1/2 invoices (spec 11.17). */
  agreedEstimatedHours?: boolean;
  issuedAt?: string | number;
}

/** Ignition hours in a period, from the readings (Tier 1/2 estimate). */
export function estimatedIgnitionHours(asset: Asset, fromMs: number, toMs: number): number {
  const readings = getReadingsForAsset(asset, fromMs, toMs);
  let hours = 0;
  for (let i = 1; i < readings.length; i++) {
    const gapH = (ms(readings[i].deviceTime) - ms(readings[i - 1].deviceTime)) / 3600000;
    if (gapH <= 0 || gapH > 1) continue;
    if (readings[i].ignition) hours += gapH;
  }
  return Math.round(hours * 10) / 10;
}

function initialsFor(name: string): string {
  return name
    .replace(/[^A-Za-z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('');
}

export function createInvoiceFromBooking(session: Session, input: CreateInvoiceInput): OpResult<Invoice> {
  const booking = db.getState().bookings.find(b => b.id === input.bookingId);
  if (!booking) return fail('Booking not found.');
  const asset = db.getState().assets.find(a => a.id === booking.assetId);
  if (!asset) return fail('Asset not found.');

  const isOwner = asset.ownerTenantId === session.tenantId;
  if (!session.isKasper && !isOwner) return fail('Only the asset owner can invoice a rental.');
  if (!hasCapability(session, 'billing.recordPayment')) return fail('Your role can\u2019t create invoices.');
  if (asset.retiredAt) return fail('This asset is retired.');

  const fromMs = ms(booking.start);
  const toMs = ms(booking.end);
  const days = Math.max(1, Math.ceil((toMs - fromMs) / DAY));
  const rate = n2(input.rateAed);
  if (!Number.isFinite(rate) || rate <= 0) return fail('Enter a rate greater than zero.');

  let lines: InvoiceLine[];
  let mucId: string | undefined;

  if (input.basis === 'daily') {
    const amount = n2(days * rate);
    lines = [{
      description: `${asset.code} — daily rate × ${days} ${days === 1 ? 'day' : 'days'}`,
      basis: 'Days on hire', quantity: days, unit: 'day', rateAed: rate, amountAed: amount,
    }];
  } else {
    const tier = tierForAsset(asset);
    if (tier === 3 && isBillingGradeHours(asset)) {
      const muc = db.getState().mucs.find(m =>
        m.assetId === asset.id &&
        !m.voidedAt &&
        ms(m.periodFrom) <= fromMs &&
        ms(m.periodTo) >= toMs - DAY
      );
      if (!muc) return fail('Issue the certificate first — hourly billing on this asset uses the MUC billable hours.');
      mucId = muc.id;
      const hours = muc.payload.billableHours;
      lines = [{
        description: `${asset.code} — hourly rate (ECU hours)`, 
        basis: 'ECU', quantity: hours, unit: 'h', rateAed: rate, amountAed: n2(hours * rate),
      }];
      const minimumHours = n2(days * MIN_HOURS_PER_DAY);
      const topUp = n2(Math.max(0, minimumHours - hours));
      if (topUp > 0) {
        lines.push({
          description: `Minimum hours top-up (${MIN_HOURS_PER_DAY} h/day × ${days} days − actual)`,
          basis: 'Days on hire', quantity: topUp, unit: 'h', rateAed: rate, amountAed: n2(topUp * rate),
        });
      }
    } else {
      if (!input.agreedEstimatedHours) {
        return fail('Tier 1 and 2 hours are estimated — the customer must agree to estimated hours first.');
      }
      const hours = estimatedIgnitionHours(asset, fromMs, toMs);
      if (hours <= 0) return fail('No ignition hours in that period — nothing to bill hourly.');
      lines = [{
        description: `${asset.code} — hourly rate, ignition hours (Estimated — not billing-grade)`,
        basis: 'Estimated', quantity: hours, unit: 'h', rateAed: rate, amountAed: n2(hours * rate),
      }];
    }
  }

  const subtotalAed = n2(lines.reduce((sum, l) => sum + l.amountAed, 0));
  const vatAed = n2(subtotalAed * (VAT_PCT / 100));
  const issuer = db.getState().tenants.find(t => t.id === asset.ownerTenantId);
  const customer = db.getState().tenants.find(t => t.id === booking.renterTenantId);
  const issuedAt = input.issuedAt ?? new Date(clock.now()).toISOString();

  const invoiceNo = nextNumber('inv-', db.getState().invoices, 4200);
  const invoice: Invoice = {
    id: `inv-${invoiceNo}`,
    number: `INV-${initialsFor(issuer?.name ?? 'Kasper')}-${invoiceNo}`,
    kind: 'rental',
    issuerTenantId: asset.ownerTenantId,
    customerTenantId: booking.renterTenantId,
    customerName: customer?.name ?? booking.renterName ?? 'Outside hirer',
    bookingId: booking.id,
    mucId,
    lines,
    subtotalAed,
    vatAed,
    totalAed: n2(subtotalAed + vatAed),
    issuedAt,
    dueAt: ms(issuedAt) + INVOICE_DUE_DAYS * DAY,
    status: 'unpaid',
  };
  append('invoices', invoice);

  recordAuditForSession(session, {
    action: 'invoice.create',
    tenantId: asset.ownerTenantId,
    assetId: asset.id,
    bookingId: booking.id,
    detail: `${invoice.number} issued to ${invoice.customerName} — ${aed(invoice.totalAed)} (${input.basis === 'daily' ? 'days on hire' : lines[0].basis === 'ECU' ? 'MUC hours' : 'estimated hours'})`,
  });

  return ok(invoice, `${invoice.number} issued — ${aed(invoice.totalAed)} including VAT.`);
}

// ── GPS subscription statements ───────────────────────────────────────────────

export interface StatementLine {
  tier: 1 | 2 | 3;
  count: number;
  rateAed: number;
  amountAed: number;
}

export interface TenantStatement {
  tenantId: string;
  tenantName: string;
  monthLabel: string;
  lines: StatementLine[];
  subtotalAed: number;
  vatAed: number;
  totalAed: number;
  status: InvoiceStatus;
  /** Set when a statement has been generated for the tenant and month. */
  invoiceId?: string;
  paidAed: number;
}

function tierCounts(tenantId: string): { tier: 1 | 2 | 3; count: number; rateAed: number }[] {
  const assets = db.getState().assets.filter(a => a.ownerTenantId === tenantId && !a.retiredAt);
  const t1 = assets.filter(a => tierForAsset(a) === 1).length;
  const t2 = assets.filter(a => tierForAsset(a) === 2).length;
  const t3 = assets.filter(a => tierForAsset(a) === 3).length;
  return [
    { tier: 1, count: t1, rateAed: GPS_SUBSCRIPTION_PER_MONTH.tier1 },
    { tier: 2, count: t2, rateAed: GPS_SUBSCRIPTION_PER_MONTH.tier2 },
    { tier: 3, count: t3, rateAed: GPS_SUBSCRIPTION_PER_MONTH.tier3 },
  ];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 2026" for any instant in that Dubai month. */
function monthLabelFor(atMs: number): string {
  const [year, month] = clock.dubaiToIso(atMs).slice(0, 7).split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

/** 10:00 Dubai on the 1st of last month (the statement period). */
function lastMonthStartMs(nowMs: number): number {
  const [year, month] = clock.dubaiToIso(nowMs).slice(0, 7).split('-').map(Number);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return ms(`${prevYear}-${String(prevMonth).padStart(2, '0')}-01T10:00:00+04:00`);
}

function statementNumber(tenantName: string, monthLabel: string): string {
  return `GPS-${monthLabel.replace(' ', '-')}-${initialsFor(tenantName)}`;
}

function statementFor(tenantId: string, monthAtMs: number, nowMs: number): TenantStatement {
  const tenant = db.getState().tenants.find(t => t.id === tenantId);
  const tenantName = tenant?.name ?? tenantId;
  const monthLabel = monthLabelFor(monthAtMs);
  const lines: StatementLine[] = tierCounts(tenantId).map(t => ({
    ...t, amountAed: n2(t.count * t.rateAed),
  }));
  const subtotalAed = n2(lines.reduce((sum, l) => sum + l.amountAed, 0));
  const vatAed = n2(subtotalAed * (VAT_PCT / 100));
  const generated = db.getState().invoices.find(inv =>
    inv.kind === 'gps_subscription' && inv.customerTenantId === tenantId &&
    inv.number === statementNumber(tenantName, monthLabel)
  );
  const view = generated ? invoiceView(generated, nowMs) : null;
  return {
    tenantId,
    tenantName,
    monthLabel,
    lines,
    subtotalAed,
    vatAed,
    totalAed: n2(subtotalAed + vatAed),
    status: view ? view.displayStatus : 'unpaid',
    invoiceId: generated?.id,
    paidAed: view?.paidAed ?? 0,
  };
}

/** Last month's statements for every tenant (Kasper console, spec 11.17). */
export function lastMonthStatements(nowMs: number = clock.now()): TenantStatement[] {
  const atMs = lastMonthStartMs(nowMs);
  return db.getState().tenants
    .map(t => statementFor(t.id, atMs, nowMs))
    .sort((a, b) => a.tenantName.localeCompare(b.tenantName));
}

/** Generate (idempotently) last month's statement for one tenant. */
export function generateStatement(session: Session, tenantId: string): OpResult<Invoice> {
  if (!hasCapability(session, 'console.billing.manage')) return fail('Only Kasper Admin can generate statements.');
  const tenant = db.getState().tenants.find(t => t.id === tenantId);
  if (!tenant) return fail('Tenant not found.');
  const statement = lastMonthStatements().find(s => s.tenantId === tenantId);
  if (!statement) return fail('Tenant not found.');
  if (statement.invoiceId) return fail(`${tenant.name} already has a ${statement.monthLabel} statement.`);
  if (statement.totalAed <= 0) return fail(`${tenant.name} has no trackers, so there is nothing to bill.`);

  const atMs = clock.now();

  const lines: InvoiceLine[] = statement.lines
    .filter(l => l.count > 0)
    .map(l => ({
      description: `GPS subscription · Tier ${l.tier} × ${l.count} tracker-month${l.count === 1 ? '' : 's'}`,
      basis: `Tracker · Tier ${l.tier}` as InvoiceLine['basis'],
      quantity: l.count, unit: 'tracker-month', rateAed: l.rateAed, amountAed: l.amountAed,
    }));

  const invoiceNo = nextNumber('inv-', db.getState().invoices, 4200);
  const invoice: Invoice = {
    id: `inv-${invoiceNo}`,
    number: statementNumber(tenant.name, statement.monthLabel),
    kind: 'gps_subscription',
    issuerTenantId: 'kasper',
    customerTenantId: tenantId,
    customerName: tenant.name,
    lines,
    subtotalAed: statement.subtotalAed,
    vatAed: statement.vatAed,
    totalAed: statement.totalAed,
    issuedAt: atMs,
    dueAt: atMs + INVOICE_DUE_DAYS * DAY,
    status: 'unpaid',
  };
  append('invoices', invoice);

  recordAuditForSession(session, {
    action: 'statement.generate',
    tenantId,
    detail: `${invoice.number} generated for ${tenant.name} — ${aed(invoice.totalAed)}`,
  });

  return ok(invoice, `${invoice.number} generated — ${aed(invoice.totalAed)}.`);
}

/** Statements addressed to the session's own company (customer side). */
export function statementsFor(session: Session): InvoiceView[] {
  if (!session.tenantId) return [];
  return db.getState().invoices
    .filter(inv => inv.kind === 'gps_subscription' && inv.customerTenantId === session.tenantId)
    .map(inv => invoiceView(inv))
    .sort((a, b) => ms(b.issuedAt) - ms(a.issuedAt));
}

export function statementById(id: string): Invoice | null {
  const invoice = invoiceById(id);
  return invoice && invoice.kind === 'gps_subscription' ? invoice : null;
}

/** Record a payment on a GPS statement (Kasper Admin, spec 11.17). */
export function recordStatementPayment(session: Session, statementId: string, input: PaymentInput): OpResult<Payment> {
  if (!hasCapability(session, 'console.billing.manage')) return fail('Only Kasper Admin can record payments on statements.');
  const statement = statementById(statementId);
  if (!statement) return fail('Statement not found.');
  const balance = n2(statement.totalAed - paidTotal(statement.id));
  if (statement.status === 'void') return fail('This statement is void — nothing is owed.');
  const amount = n2(input.amountAed);
  if (!Number.isFinite(amount) || amount <= 0) return fail('Enter an amount greater than zero.');
  if (amount > balance) return fail(`This is more than the ${aed(balance)} still owed.`);

  const paymentNo = nextNumber('pay-', db.getState().payments, 100);
  const payment: Payment = {
    id: `pay-${paymentNo}`,
    invoiceId: statement.id,
    at: input.at ?? new Date(clock.now()).toISOString(),
    amountAed: amount,
    method: input.method,
    reference: input.reference?.trim() || `Statement ${paymentNo}`,
    recordedBy: session.userId,
  };
  append('payments', payment);
  statement.status = n2(balance - amount) <= 0 ? 'paid' : 'part_paid';
  touch('invoices');
  recordAuditForSession(session, {
    action: 'statement.payment',
    tenantId: statement.customerTenantId ?? undefined,
    detail: `${aed(amount)} recorded against ${statement.number} (${statement.customerName})`,
  });
  return ok(payment, `${aed(amount)} recorded against ${statement.number}.`);
}

export function voidStatement(session: Session, statementId: string, reason: string): OpResult<Invoice> {
  if (!hasCapability(session, 'console.billing.manage')) return fail('Only Kasper Admin can void statements.');
  const statement = statementById(statementId);
  if (!statement) return fail('Statement not found.');
  if (statement.status === 'void') return fail('This statement is already void.');
  if (statement.status === 'paid') return fail('A paid statement can\u2019t be voided.');
  if (reason.trim().length < 10) return fail('Give a reason of at least 10 characters.');
  statement.status = 'void';
  touch('invoices');
  recordAuditForSession(session, {
    action: 'statement.void',
    tenantId: statement.customerTenantId ?? undefined,
    detail: `${statement.number} voided (${statement.customerName})`,
    reason: reason.trim(),
  });
  return ok(statement, `${statement.number} voided.`);
}

// ── Reports (spec 11.17) ──────────────────────────────────────────────────────

export interface BillingSummary {
  issuedAed: number;
  paidAed: number;
  outstandingAed: number;
  overdueAed: number;
  byCustomer: { customerName: string; issuedAed: number; outstandingAed: number }[];
}

export function billingSummary(session: Session, fromMs: number, toMs: number): BillingSummary {
  const invoices = issuedInvoices(session).filter(inv => ms(inv.issuedAt) >= fromMs && ms(inv.issuedAt) <= toMs);
  const byCustomer = new Map<string, { issuedAed: number; outstandingAed: number }>();
  let issuedAed = 0;
  let paidAed = 0;
  let outstandingAed = 0;
  let overdueAed = 0;
  for (const inv of invoices) {
    if (inv.status === 'void') continue;
    issuedAed += inv.totalAed;
    paidAed += inv.paidAed;
    outstandingAed += inv.balanceAed;
    if (inv.displayStatus === 'overdue') overdueAed += inv.balanceAed;
    const row = byCustomer.get(inv.customerName) ?? { issuedAed: 0, outstandingAed: 0 };
    row.issuedAed += inv.totalAed;
    row.outstandingAed += inv.balanceAed;
    byCustomer.set(inv.customerName, row);
  }
  return {
    issuedAed: n2(issuedAed),
    paidAed: n2(paidAed),
    outstandingAed: n2(outstandingAed),
    overdueAed: n2(overdueAed),
    byCustomer: [...byCustomer.entries()]
      .map(([customerName, v]) => ({ customerName, issuedAed: n2(v.issuedAed), outstandingAed: n2(v.outstandingAed) }))
      .sort((a, b) => b.outstandingAed - a.outstandingAed),
  };
}

export interface AgeingBucket {
  label: string;
  amountAed: number;
}

/** Aged receivables: 0–30 / 31–60 / 61–90 / 90+ days (spec 11.17). */
export function agedReceivables(session: Session, nowMs: number = clock.now()): AgeingBucket[] {
  const buckets: AgeingBucket[] = [
    { label: '0–30 days', amountAed: 0 },
    { label: '31–60 days', amountAed: 0 },
    { label: '61–90 days', amountAed: 0 },
    { label: '90+ days', amountAed: 0 },
  ];
  for (const inv of issuedInvoices(session)) {
    if (inv.status === 'void' || inv.balanceAed <= 0) continue;
    const ageDays = Math.floor((nowMs - ms(inv.issuedAt)) / DAY);
    const index = ageDays <= 30 ? 0 : ageDays <= 60 ? 1 : ageDays <= 90 ? 2 : 3;
    buckets[index].amountAed = n2(buckets[index].amountAed + inv.balanceAed);
  }
  return buckets;
}

/**
 * Overdue invoices for the issuer's bell (Phase 2 alert type
 * `invoice_overdue`): "Invoice INV-EE-0415 is overdue (6 days)".
 */
export function overdueInvoiceAlerts(session: Session, nowMs: number = clock.now()): { invoiceId: string; text: string }[] {
  return issuedInvoices(session)
    .filter(inv => inv.displayStatus === 'overdue' && inv.balanceAed > 0)
    .map(inv => {
      const days = Math.max(1, Math.floor((nowMs - ms(inv.dueAt)) / DAY));
      return { invoiceId: inv.id, text: `Invoice ${inv.number} is overdue (${days} ${days === 1 ? 'day' : 'days'})` };
    });
}

export function invoiceStatusLabel(status: InvoiceStatus): string {
  const labels: Record<InvoiceStatus, string> = {
    unpaid: 'Unpaid',
    part_paid: 'Part-paid',
    paid: 'Paid',
    overdue: 'Overdue',
    void: 'Void',
  };
  return labels[status];
}
