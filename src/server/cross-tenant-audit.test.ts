// H2.9 — Kasper staff opening a tenant's asset writes asset.view.crossTenant,
// at most once per user per asset per hour.
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/server/db';
import { getAsset, signInAs } from '@/server/api';
import { recordCrossTenantView, CROSS_TENANT_WINDOW_MS } from '@/server/audit';
import * as clock from '@/lib/clock';
import type { Session } from '@/domain/types';

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

const crossTenantEntries = (assetId: string, actor: string) =>
  db.getState().auditEntries.filter(e =>
    e.action === 'asset.view.crossTenant' && e.assetId === assetId && e.actorUserId === actor);

describe('cross-tenant audit', () => {
  beforeEach(() => {
    // Start from a clean window: the seed has an older Sara view of EX-04.
    db.setState?.({ ...db.getState(), auditEntries: db.getState().auditEntries.filter(e => e.action !== 'asset.view.crossTenant') });
  });

  it('a Kasper view of another company\'s asset writes one entry', async () => {
    const sara = sessionFor('u-sara');
    const before = crossTenantEntries('a-ex04', 'u-sara').length;
    const r = await getAsset(sara, 'a-ex04');
    expect(r.success).toBe(true);
    expect(crossTenantEntries('a-ex04', 'u-sara').length).toBe(before + 1);
  });

  it('opening the same asset twice within an hour writes one entry', async () => {
    const sara = sessionFor('u-sara');
    const before = crossTenantEntries('a-ex04', 'u-sara').length;
    await getAsset(sara, 'a-ex04');
    await getAsset(sara, 'a-ex04');
    expect(crossTenantEntries('a-ex04', 'u-sara').length).toBe(before + 1);
  });

  it('after the hour window, the next view is recorded again', () => {
    const sara = sessionFor('u-sara');
    const asset = db.getState().assets.find(a => a.id === 'a-ex04')!;
    const realNow = clock.now();
    const first = recordCrossTenantView(sara, asset);
    expect(first).not.toBeNull();
    // Age the stored entry past the window instead of moving the clock.
    const aged = new Date(realNow - CROSS_TENANT_WINDOW_MS - 1000).toISOString();
    db.setState?.({
      ...db.getState(),
      auditEntries: db.getState().auditEntries.map(e => (e.id === first!.id ? { ...e, at: aged } : e)),
    });
    expect(recordCrossTenantView(sara, asset)).not.toBeNull();
  });

  it('a tenant user viewing their own asset writes nothing', async () => {
    const omar = sessionFor('u-omar');
    const before = db.getState().auditEntries.length;
    await getAsset(omar, 'a-fb12');
    expect(db.getState().auditEntries.length).toBe(before);
  });

  it('signInAs is still available for the sign-in path', () => {
    expect(signInAs('u-sara').success).toBe(true);
  });
});
