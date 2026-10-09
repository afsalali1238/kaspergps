// Rental invoices, payments and GPS statements (spec 11.17).
// Money rules: VAT 5 %, due +14 days, MUC hours on Tier 3, estimated ignition
// hours on Tier 1/2, daily basis counts started days, over-payment refused.
import { describe, it, expect } from 'vitest';
import {
  aed, agedReceivables, billingSummary, createInvoiceFromBooking, estimatedIgnitionHours,
  generateStatement, invoiceById, invoiceStatusLabel, invoiceView, issuedInvoices,
  lastMonthStatements, overdueInvoiceAlerts, paidTotal, payInvoice, paymentsFor,
  receivedInvoices, recordPayment, recordStatementPayment, statementsFor, voidInvoice,
  voidStatement, MIN_HOURS_PER_DAY,
} from './billing';
import { seed } from '@/server/seed/data';
import { VAT_PCT } from '@/config/thresholds';
import * as clock from '@/lib/clock';
import type { Session } from '@/domain/types';

function sessionFor(userId: string, role?: Session['role']): Session {
  const user = seed.users.find(u => u.id === userId)!;
  return {
    userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds,
    role: role ?? user.role,
    isKasper: (role ?? user.role) === 'kasper_admin' || (role ?? user.role) === 'kasper_ops',
  };
}

const omar = () => sessionFor('u-omar');      // Al Noor Admin (issuer of INV-AN-*)
const khalid = () => sessionFor('u-khalid');  // Emirates Earthmovers Admin
const lina = () => sessionFor('u-lina');      // Marina Builders Admin (customer)
const sara = () => sessionFor('u-sara');      // Kasper Admin
const ravi = () => sessionFor('u-ravi');      // Kasper Ops

const money = (n: number) => `AED ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

describe('billing — invoices and balances', () => {
  it('computes paid, balance and overdue from the payment rows', () => {
    const part = invoiceById('inv-0207')!;
    const view = invoiceView(part);
    expect(view.paidAed).toBe(38304);
    expect(view.balanceAed).toBe(part.totalAed - 38304);
    expect(view.displayStatus).toBe('part_paid');

    // Seeded as overdue and unpaid in full.
    const overdue = invoiceView(invoiceById('inv-0415')!);
    expect(overdue.displayStatus).toBe('overdue');
    expect(overdue.balanceAed).toBe(overdue.totalAed);
    expect(paidTotal('inv-0415')).toBe(0);

    expect(invoiceStatusLabel('part_paid')).toBe('Part-paid');
    expect(aed(4200)).toBe('AED 4,200.00');
  });

  it('shows each side only what it may see', () => {
    // Emirates Earthmovers issued INV-EE-*; Al Noor issued INV-AN-*.
    expect(issuedInvoices(khalid()).map(i => i.number)).toEqual(expect.arrayContaining(['INV-EE-0412', 'INV-EE-0415']));
    expect(issuedInvoices(khalid()).some(i => i.number.startsWith('INV-AN'))).toBe(false);
    expect(receivedInvoices(lina()).map(i => i.number)).toEqual(expect.arrayContaining(['INV-EE-0415']));
    // Kasper Admin sees the rental invoices; the customer side stays empty for Kasper.
    expect(issuedInvoices(sara()).length).toBeGreaterThanOrEqual(5);
    expect(receivedInvoices(sara())).toEqual([]);
    // Ops has no billing at all.
    expect(issuedInvoices(ravi())).toEqual([]);
  });
});

describe('billing — recording payments', () => {
  it('refuses a payment bigger than the balance', () => {
    const invoice = invoiceById('inv-0098')!; // AED 6,930 unpaid
    expect(invoice.status).toBe('unpaid');
    const over = recordPayment(omar(), invoice.id, { amountAed: invoice.totalAed + 1, method: 'bank_transfer' });
    expect(over.ok).toBe(false);
    expect(over.error).toBe(`This is more than the ${aed(invoice.totalAed)} still owed.`);
  });

  it('records a part-payment and then refuses to overpay the rest', () => {
    const invoice = invoiceById('inv-0098')!;
    const part = recordPayment(omar(), invoice.id, { amountAed: 500, method: 'cash', reference: 'Cash — Marina' });
    expect(part.ok).toBe(true);
    expect(part.message).toContain(`${money(6430)} still owed.`);
    expect(invoiceById('inv-0098')!.status).toBe('part_paid');
    expect(paymentsFor(invoice.id).at(-1)!.amountAed).toBe(500);
    expect(paymentsFor(invoice.id).at(-1)!.recordedBy).toBe('u-omar');

    const tooMuch = recordPayment(omar(), invoice.id, { amountAed: 7000, method: 'cash' });
    expect(tooMuch.ok).toBe(false);
    expect(tooMuch.error).toBe(`This is more than the ${aed(6430)} still owed.`);

    const rest = recordPayment(omar(), invoice.id, { amountAed: 6430, method: 'bank_transfer' });
    expect(rest.ok).toBe(true);
    expect(invoiceById('inv-0098')!.status).toBe('paid');
    expect(recordPayment(omar(), invoice.id, { amountAed: 1, method: 'cash' }).error).toBe('This invoice is already paid in full.');
  });

  it('keeps the issuing company in charge of recording payments', () => {
    const invoice = invoiceById('inv-0098')!;
    const wrongCompany = recordPayment(khalid(), invoice.id, { amountAed: 10, method: 'cash' });
    expect(wrongCompany.ok).toBe(false);
    expect(wrongCompany.error).toContain('issued the invoice');
    // Ops has no billing.recordPayment capability at all.
    expect(recordPayment(ravi(), invoice.id, { amountAed: 10, method: 'cash' }).ok).toBe(false);
    expect(recordPayment(omar(), invoice.id, { amountAed: 0, method: 'cash' }).error).toBe('Enter an amount greater than zero.');
  });
});

describe('billing — the customer pays', () => {
  it('lets the customer pay a simulated invoice in full', () => {
    const invoice = invoiceById('inv-0415')!; // Emirates → Marina, overdue
    const result = payInvoice(lina(), invoice.id, { reference: 'Card ending 4242' });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('no money moved');
    const payment = result.data!;
    expect(payment.method).toBe('simulated_online');
    expect(payment.amountAed).toBe(invoice.totalAed);
    expect(invoiceById('inv-0415')!.status).toBe('paid');
    expect(payInvoice(lina(), invoice.id).error).toBe('This invoice is already paid.');
  });

  it('refuses a payer the invoice is not addressed to', () => {
    const result = payInvoice(khalid(), 'inv-0412');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('addressed to your company');
  });
});

describe('billing — voiding', () => {
  it('needs a reason and never voids a paid invoice', () => {
    const unpaid = invoiceById('inv-0207')!; // part-paid, Gulf Lift issued
    const short = voidInvoice(sessionFor('u-priya'), unpaid.id, 'wrong');
    expect(short.error).toBe('Give a reason of at least 10 characters.');

    const paid = voidInvoice(omar(), 'inv-0091', 'Duplicate issue in the prototype');
    expect(paid.error).toContain('can\u2019t be voided');
  });

  it('voids an unpaid invoice with a reason and audits it', () => {
    const invoice = invoiceById('inv-0415')!;
    // inv-0415 was settled by the paying test above; start from a fresh invoice.
    const fresh = createInvoiceFromBooking(omar(), { bookingId: 'b-1008', basis: 'daily', rateAed: 1100 });
    expect(fresh.ok).toBe(true);
    const created = fresh.data!;
    const voided = voidInvoice(omar(), created.id, 'Wrong rate on the booking');
    expect(voided.ok).toBe(true);
    expect(invoiceById(created.id)!.status).toBe('void');
    const entry = seed.auditEntries.find(e => e.action === 'invoice.void' && e.detail.includes(created.number));
    expect(entry?.reason).toBe('Wrong rate on the booking');
    expect(invoiceById(invoice.id)!.number).toBe('INV-EE-0415');
  });
});

describe('billing — invoices from bookings', () => {
  it('bills daily bookings by started days, VAT and due date', () => {
    const result = createInvoiceFromBooking(sessionFor('u-priya'), { bookingId: 'b-1002', basis: 'daily', rateAed: 3500 });
    expect(result.ok).toBe(true);
    const invoice = result.data!;
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.lines[0].basis).toBe('Days on hire');
    expect(invoice.lines[0].quantity).toBe(15); // 14 days hire, each started day counts
    expect(invoice.subtotalAed).toBe(52500);
    expect(invoice.vatAed).toBe(2625);
    expect(invoice.totalAed).toBe(55125);
    expect(invoice.number).toMatch(/^INV-GL-\d+$/);
    const dueDays = (Number(invoice.dueAt) - new Date(invoice.issuedAt as string).getTime()) / 86400000;
    expect(dueDays).toBe(14);
    expect(invoice.status).toBe('unpaid');
  });

  it('uses the MUC billable hours for Tier 3 hourly invoices', () => {
    const result = createInvoiceFromBooking(khalid(), { bookingId: 'b-0981', basis: 'hourly', rateAed: 185 });
    expect(result.ok).toBe(true);
    const invoice = result.data!;
    expect(invoice.mucId).toBe('muc-ex04-sep');
    expect(invoice.lines[0].basis).toBe('ECU');
    expect(invoice.lines[0].quantity).toBe(450);
    expect(invoice.subtotalAed).toBe(83250);
    // 19 days on hire need 152 h minimum — the ECU hours already beat it, so no top-up line.
    expect(invoice.lines).toHaveLength(1);
    expect(MIN_HOURS_PER_DAY).toBe(8);
  });

  it('asks for the certificate first when there is no MUC for the period', () => {
    const result = createInvoiceFromBooking(khalid(), { bookingId: 'b-1001', basis: 'hourly', rateAed: 185 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Issue the certificate first');
  });

  it('needs the customer to agree before estimated hours are billed', () => {
    // TP-21 is Tier 1 and worked 26 Sep – 1 Oct (booking b-1008).
    const asset = seed.assets.find(a => a.id === 'a-tp21')!;
    const booking = seed.bookings.find(b => b.id === 'b-1008')!;
    const hours = estimatedIgnitionHours(asset, Number(booking.start), Number(booking.end));
    expect(hours).toBeGreaterThan(0);

    const refused = createInvoiceFromBooking(sessionFor('u-omar'), { bookingId: 'b-1008', basis: 'hourly', rateAed: 1100 });
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain('estimated');

    const agreed = createInvoiceFromBooking(sessionFor('u-omar'), {
      bookingId: 'b-1008', basis: 'hourly', rateAed: 1100, agreedEstimatedHours: true,
    });
    expect(agreed.ok).toBe(true);
    expect(agreed.data!.lines[0].basis).toBe('Estimated');
    expect(agreed.data!.lines[0].quantity).toBe(hours);
    expect(agreed.data!.subtotalAed).toBe(Math.round(hours * 1100 * 100) / 100);
    expect(agreed.data!.vatAed).toBe(Math.round(hours * 1100 * 5) / 100);
  });

  it('keeps invoicing to the owner (and Kasper)', () => {
    const notOwner = createInvoiceFromBooking(omar(), { bookingId: 'b-1002', basis: 'daily', rateAed: 3500 });
    expect(notOwner.ok).toBe(false);
    expect(notOwner.error).toContain('asset owner');
    const ops = createInvoiceFromBooking(ravi(), { bookingId: 'b-1002', basis: 'daily', rateAed: 3500 });
    expect(ops.ok).toBe(false);
    expect(createInvoiceFromBooking(sessionFor('u-priya'), { bookingId: 'b-1002', basis: 'daily', rateAed: 0 }).error).toBe('Enter a rate greater than zero.');
    expect(createInvoiceFromBooking(sessionFor('u-priya'), { bookingId: 'b-9999', basis: 'daily', rateAed: 10 }).error).toBe('Booking not found.');
  });
});

describe('billing — GPS statements', () => {
  it('builds last month’s statements per tenant by tier', () => {
    const statements = lastMonthStatements();
    expect(statements.length).toBe(seed.tenants.length);
    const gulflift = statements.find(s => s.tenantId === 't-gulflift')!;
    expect(gulflift.totalAed).toBeGreaterThan(0);
    expect(gulflift.lines.reduce((sum, l) => sum + l.amountAed, 0)).toBe(gulflift.subtotalAed);
    expect(gulflift.status).toBe('unpaid');
    // Dummy rates: 75 / 110 / 165 per tracker-month (config/pricing.ts).
    for (const line of gulflift.lines) {
      expect([75, 110, 165]).toContain(line.rateAed);
      expect(line.amountAed).toBe(line.count * line.rateAed);
    }
  });

  it('generates a statement once, then refuses a duplicate', () => {
    const first = generateStatement(sara(), 't-gulflift');
    expect(first.ok).toBe(true);
    const statement = first.data!;
    expect(statement.number).toMatch(/^GPS-[A-Z][a-z]{2}-\d{4}-GL$/);
    expect(statement.kind).toBe('gps_subscription');
    expect(statement.issuerTenantId).toBe('kasper');

    const again = generateStatement(sara(), 't-gulflift');
    expect(again.ok).toBe(false);
    expect(again.error).toContain('already has a');

    // The statement now shows as generated for that tenant.
    const statementRow = lastMonthStatements().find(s => s.tenantId === 't-gulflift')!;
    expect(statementRow.invoiceId).toBe(statement.id);
    expect(statementsFor(sessionFor('u-priya'))).toHaveLength(1);
    expect(statementsFor(khalid())).toEqual([]);
  });

  it('keeps statements for Kasper Admin and refuses an amount over the balance', () => {
    expect(generateStatement(ravi(), 't-alnoor').ok).toBe(false);
    const statement = statementsFor(sessionFor('u-priya'))[0];
    const over = recordStatementPayment(sara(), statement.id, { amountAed: statement.totalAed + 10, method: 'bank_transfer' });
    expect(over.error).toBe(`This is more than the ${aed(statement.totalAed)} still owed.`);
    const part = recordStatementPayment(sara(), statement.id, { amountAed: 100, method: 'bank_transfer' });
    expect(part.ok).toBe(true);
    expect(invoiceById(statement.id)!.status).toBe('part_paid');
    expect(recordStatementPayment(ravi(), statement.id, { amountAed: 1, method: 'cash' }).ok).toBe(false);

    const short = voidStatement(sara(), statement.id, 'mistake');
    expect(short.error).toBe('Give a reason of at least 10 characters.');
    const voided = voidStatement(sara(), statement.id, 'Wrong tracker list for September');
    expect(voided.ok).toBe(true);
    expect(recordStatementPayment(sara(), statement.id, { amountAed: 1, method: 'cash' }).error).toContain('void');
  });
});

describe('billing — reports and alerts', () => {
  it('summarises what was issued, paid and outstanding', () => {
    const summary = billingSummary(khalid(), 0, Number.MAX_SAFE_INTEGER);
    expect(summary.issuedAed).toBeGreaterThan(0);
    expect(summary.paidAed).toBeGreaterThan(0);
    expect(summary.outstandingAed).toBeGreaterThanOrEqual(0);
    expect(summary.byCustomer.length).toBeGreaterThan(0);
    expect(summary.byCustomer[0].outstandingAed).toBeGreaterThanOrEqual(summary.byCustomer.at(-1)!.outstandingAed);
  });

  it('ages receivables and warns the issuer about overdue invoices', () => {
    const buckets = agedReceivables(khalid());
    expect(buckets.map(b => b.label)).toEqual(['0–30 days', '31–60 days', '61–90 days', '90+ days']);
    expect(buckets.reduce((sum, b) => sum + b.amountAed, 0)).toBeGreaterThan(0);
    // Emirates has an overdue invoice until the demo pays it; the text names the number.
    const alerts = overdueInvoiceAlerts(khalid());
    for (const alert of alerts) {
      expect(alert.text).toMatch(/^Invoice INV-EE-\d+ is overdue \(\d+ days?\)$/);
    }
  });
});

// ── Reconciliation ────────────────────────────────────────────────────────────
// The money invariant the whole screen rests on: an invoice is worth its lines,
// its payments plus its balance are its total, and the reports are the sum of
// the invoices they were built from. These run over whatever the seed and the
// tests above have produced, so they also catch a mutation that breaks the tie.

describe('billing — reconciliation', () => {
  const allIssued = () => {
    const byId = new Map<string, ReturnType<typeof issuedInvoices>[number]>();
    for (const who of [khalid(), omar(), sara()]) {
      for (const inv of issuedInvoices(who)) byId.set(inv.id, inv);
    }
    return [...byId.values()];
  };

  it('every invoice is its payments plus its balance', () => {
    const invoices = allIssued();
    expect(invoices.length).toBeGreaterThan(0);
    // Guard the loop below: an invariant over an empty or uniform set proves
    // nothing, so the shapes that must exist in the demo data are named here.
    expect(invoices.some(i => i.paidAed > 0 && i.balanceAed > 0)).toBe(true);   // part-paid
    expect(invoices.some(i => i.displayStatus === 'paid')).toBe(true);          // settled
    expect(invoices.some(i => i.paidAed === 0 && i.balanceAed > 0)).toBe(true); // untouched

    for (const inv of invoices) {
      const paid = paymentsFor(inv.id).reduce((sum, p) => sum + p.amountAed, 0);
      expect(inv.paidAed).toBeCloseTo(paid, 2);
      expect(inv.paidAed + inv.balanceAed).toBeCloseTo(inv.totalAed, 2);
      expect(inv.balanceAed).toBeGreaterThanOrEqual(0);
      expect(inv.paidAed).toBeLessThanOrEqual(inv.totalAed + 0.005);

      if (inv.displayStatus === 'paid') expect(inv.balanceAed).toBe(0);
      if (inv.status === 'unpaid') {
        expect(inv.paidAed).toBe(0);
        expect(inv.balanceAed).toBeCloseTo(inv.totalAed, 2);
      }
      // A void invoice is never part of what is owed, and is never settled.
      if (inv.status === 'void') expect(inv.paidAed).toBe(0);
    }
  });

  it('the issuer and the customer see the same money on the same invoice', () => {
    const issuer = issuedInvoices(khalid());
    const payer = receivedInvoices(lina());
    const shared = issuer.filter(inv => payer.some(p => p.id === inv.id));
    expect(shared.length).toBeGreaterThan(0);

    for (const inv of shared) {
      const other = payer.find(p => p.id === inv.id)!;
      expect(other.totalAed).toBe(inv.totalAed);
      expect(other.paidAed).toBe(inv.paidAed);
      expect(other.balanceAed).toBe(inv.balanceAed);
      expect(other.displayStatus).toBe(inv.displayStatus);
    }
  });

  it('the summary is the sum of the invoices in its window', () => {
    const session = khalid();
    const from = clock.now() - 365 * 86_400_000;
    const to = clock.now() + 86_400_000;
    const summary = billingSummary(session, from, to);
    const inWindow = issuedInvoices(session).filter(inv =>
      inv.status !== 'void' && new Date(inv.issuedAt).getTime() >= from && new Date(inv.issuedAt).getTime() <= to
    );

    const sum = (pick: (i: (typeof inWindow)[number]) => number) =>
      Math.round(inWindow.reduce((total, inv) => total + pick(inv), 0) * 100) / 100;

    expect(summary.issuedAed).toBeCloseTo(sum(i => i.totalAed), 2);
    expect(summary.paidAed).toBeCloseTo(sum(i => i.paidAed), 2);
    expect(summary.outstandingAed).toBeCloseTo(sum(i => i.balanceAed), 2);
    expect(summary.paidAed + summary.outstandingAed).toBeCloseTo(summary.issuedAed, 2);

    // Paid and outstanding can never exceed what was issued per customer either.
    const perCustomer = summary.byCustomer.reduce(
      (acc, row) => ({
        issued: acc.issued + row.issuedAed,
        outstanding: acc.outstanding + row.outstandingAed,
      }),
      { issued: 0, outstanding: 0 },
    );
    expect(perCustomer.issued).toBeCloseTo(summary.issuedAed, 2);
    expect(perCustomer.outstanding).toBeCloseTo(summary.outstandingAed, 2);
  });

  it('the ageing buckets lose nothing on the way to receivables', () => {
    const session = omar();
    const outstanding = issuedInvoices(session)
      .filter(inv => inv.status !== 'void' && inv.balanceAed > 0)
      .reduce((sum, inv) => sum + inv.balanceAed, 0);
    const aged = agedReceivables(session).reduce((sum, b) => sum + b.amountAed, 0);
    expect(aged).toBeCloseTo(outstanding, 2);
  });

  it('taking an invoice out of the books takes exactly its total and its balance', () => {
    const issuer = omar();
    const target = issuedInvoices(issuer).find(i => i.status === 'unpaid' && i.balanceAed > 0)!;
    const from = clock.now() - 365 * 86_400_000;
    const to = clock.now() + 86_400_000;
    const before = billingSummary(issuer, from, to);

    const voided = voidInvoice(issuer, target.id, 'Duplicate of AN-0097');
    expect(voided.ok).toBe(true);

    const after = billingSummary(issuer, from, to);
    expect(after.issuedAed).toBeCloseTo(before.issuedAed - target.totalAed, 2);
    expect(after.outstandingAed).toBeCloseTo(before.outstandingAed - target.balanceAed, 2);

    const view = invoiceById(target.id)!;
    expect(view.status).toBe('void');
    // A void invoice never carries payments and never enters the ageing table.
    expect(paidTotal(target.id)).toBe(0);
    expect(agedReceivables(issuer).reduce((sum, b) => sum + b.amountAed, 0))
      .toBeCloseTo(after.outstandingAed, 2);
  });

  it('a GPS statement is its tier lines with VAT, and matches the invoice it becomes', () => {
    const statements = lastMonthStatements();
    if (!statements.some(s => s.invoiceId)) {
      // Generate one here rather than rely on the earlier test having done it.
      const pending = statements.find(s => !s.invoiceId && s.totalAed > 0)!;
      expect(generateStatement(sara(), pending.tenantId).ok).toBe(true);
    }
    expect(lastMonthStatements().some(s => s.invoiceId)).toBe(true);

    for (const statement of lastMonthStatements()) {
      const subtotal = Math.round(statement.lines.reduce((sum, l) => sum + l.amountAed, 0) * 100) / 100;
      expect(statement.subtotalAed).toBeCloseTo(subtotal, 2);
      for (const line of statement.lines) {
        expect(line.amountAed).toBeCloseTo(line.count * line.rateAed, 2);
      }
      expect(statement.totalAed).toBeCloseTo(subtotal * (1 + VAT_PCT / 100), 2);

      if (statement.invoiceId) {
        const invoice = invoiceById(statement.invoiceId)!;
        expect(invoice.kind).toBe('gps_subscription');
        expect(invoice.totalAed).toBeCloseTo(statement.totalAed, 2);
        expect(statement.paidAed).toBeCloseTo(paidTotal(invoice.id), 2);
      }
    }
  });
});
