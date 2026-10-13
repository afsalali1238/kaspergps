// Billing tab order and default tab (Agent A / U0, PR #29).
//
// The bug: `useState<TabId>('received')` put an owner who issues invoices and
// receives none on an empty Received tab. These tests pin the replacement rule
// against the pure helper and against the real seed data for the three users the
// handoff names.
import { describe, it, expect } from 'vitest';
import { billingTabs, chooseBillingTab, type BillingTabCounts, type BillingTabId } from './billing-tabs';
import { issuedInvoices, receivedInvoices, statementsFor } from '@/server/billing';
import { db } from '@/server/db';
import type { Session } from '@/domain/types';

const ALL: Record<BillingTabId, number> = { issued: 0, received: 0, gps: 0, reports: 0 };

function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId)!;
  return {
    userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

/** Exactly what app/app/billing/page.tsx does, so this is the shipped path. */
function defaultTabFor(userId: string): BillingTabId | undefined {
  const session = sessionFor(userId);
  const counts: BillingTabCounts = {
    issued: issuedInvoices(session).length,
    received: receivedInvoices(session).length,
    gps: statementsFor(session).length,
  };
  const ids = billingTabs(session.isKasper, counts);
  return chooseBillingTab(null, ids, { ...counts, reports: counts.issued });
}

describe('billingTabs', () => {
  it('gives an owner who issues and receives nothing the Issued tab first', () => {
    expect(billingTabs(false, { issued: 4, received: 0, gps: 1 }))
      .toEqual(['issued', 'received', 'gps', 'reports']);
  });

  it('hides Issued from a renter who has issued nothing', () => {
    expect(billingTabs(false, { issued: 0, received: 3, gps: 1 }))
      .toEqual(['received', 'gps', 'reports']);
  });

  it('always offers Kasper the Issued tab and never the Reports summary', () => {
    expect(billingTabs(true, { issued: 0, received: 0, gps: 2 }))
      .toEqual(['issued', 'gps']);
  });

  it('always offers the GPS tab, even with nothing in it', () => {
    expect(billingTabs(false, { issued: 0, received: 0, gps: 0 })).toEqual(['received', 'gps', 'reports']);
  });
});

describe('chooseBillingTab', () => {
  it('opens on the first tab that has content', () => {
    expect(chooseBillingTab(null, ['issued', 'received', 'gps'], { ...ALL, received: 2 })).toBe('received');
    expect(chooseBillingTab(null, ['issued', 'received', 'gps'], { ...ALL, gps: 1 })).toBe('gps');
  });

  it('prefers the tab the visitor picked, even when it is empty', () => {
    expect(chooseBillingTab('received', ['issued', 'received'], { ...ALL, issued: 5 })).toBe('received');
  });

  it('falls back to the first tab when nothing has content', () => {
    expect(chooseBillingTab(null, ['issued', 'gps'], ALL)).toBe('issued');
  });

  it('ignores a picked tab the visitor can no longer see', () => {
    expect(chooseBillingTab('reports', ['issued', 'gps'], { ...ALL, gps: 1 })).toBe('gps');
    expect(chooseBillingTab('reports', ['issued', 'gps'], ALL)).toBe('issued');
  });

  it('returns undefined when there are no tabs at all', () => {
    expect(chooseBillingTab(null, [], ALL)).toBeUndefined();
  });
});

describe('the seeded users land on a tab with something in it', () => {
  it('Khalid (owner, issues invoices, receives none) lands on Issued', () => {
    const session = sessionFor('u-khalid');
    expect(issuedInvoices(session).length).toBeGreaterThan(0);
    expect(receivedInvoices(session)).toHaveLength(0);
    expect(defaultTabFor('u-khalid')).toBe('issued');
  });

  it('Lina (renter with received invoices) lands on Received', () => {
    const session = sessionFor('u-lina');
    expect(receivedInvoices(session).length).toBeGreaterThan(0);
    expect(issuedInvoices(session)).toHaveLength(0);
    expect(defaultTabFor('u-lina')).toBe('received');
  });

  it('Sara (Kasper) lands on Issued', () => {
    expect(defaultTabFor('u-sara')).toBe('issued');
  });
});
