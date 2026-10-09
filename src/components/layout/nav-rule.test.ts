// H2.6 — a page under a nav href follows the nav rule. Mark (Site User) gets
// "Page not found" on Certificates and Cost; Omar (Tier 1) has no certificates.
import { describe, it, expect } from 'vitest';
import { db } from '@/server/db';
import { navItemAllowed } from './AppShell';
import type { Session } from '@/domain/types';

const CERTIFICATES = { href: '/app/certificates', capability: 'muc.view', phase: 'phase2' } as const;
const COST = { href: '/app/cost', capability: 'cost.view', phase: 'later' } as const;
const BILLING = { href: '/app/billing', capability: 'billing.view', phase: 'phase2' } as const;

function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId)!;
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: user.siteIds,
    role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

// navItemAllowed takes the full NavItem; these fixtures carry only what the rule reads.
const item = (x: { href: string; capability: string; phase: string }) => ({ ...x, label: x.href, labelKey: x.href, icon: null }) as never;

describe('nav rule for routes (H2.6)', () => {
  it('Mark (Site User) is not allowed on Certificates or Cost', () => {
    const mark = sessionFor('u-mark');
    expect(navItemAllowed(mark, item(CERTIFICATES), 'phase2')).toBe(false);
    expect(navItemAllowed(mark, item(COST), 'later')).toBe(false);
  });

  it('a Tenant Admin with billing rights is allowed on Billing in Phase 2', () => {
    const khalid = sessionFor('u-khalid');
    expect(navItemAllowed(khalid, item(BILLING), 'phase2')).toBe(true);
  });

  it('a Phase 2 page is not allowed on Day 1', () => {
    const khalid = sessionFor('u-khalid');
    expect(navItemAllowed(khalid, item(BILLING), 'day_one')).toBe(false);
  });

  it('a Later page is not allowed before the Later phase', () => {
    const sara = sessionFor('u-sara');
    expect(navItemAllowed(sara, item(COST), 'phase2')).toBe(false);
    expect(navItemAllowed(sara, item(COST), 'later')).toBe(true);
  });
});
