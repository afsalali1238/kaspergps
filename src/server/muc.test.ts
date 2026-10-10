// MUC tests (spec 11.16): canonical payload stability, seal, void/reissue, tamper detection.
import { describe, it, expect } from 'vitest';
import {
  canonicalMucPayload, ecuHoursAt, getMucByNumber, getMucVerifyStatus,
  issueMuc, nextMucNumber, reissueMuc, sealMucPayload, tamperWithMuc, verifyMucSeal, voidMuc,
} from './muc';
import { db } from '@/server/db';
import { hasFeature } from '@/domain/features';
import type { MucPayload, Session } from '@/domain/types';
import * as clock from '@/lib/clock';

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

const khalid = () => sessionFor('u-khalid'); // Emirates Tenant Admin
const sara = () => sessionFor('u-sara'); // Kasper Admin
const ravi = () => sessionFor('u-ravi'); // Kasper Ops

describe('muc — canonical payload', () => {
  it('is stable regardless of key order', () => {
    const payload = db.getState().mucs[0].payload;
    const shuffled = {
      source: payload.source,
      gaps: payload.gaps,
      billableHours: payload.billableHours,
      version: payload.version,
      days: payload.days,
      closingHoursEcu: payload.closingHoursEcu,
      openingHoursEcu: payload.openingHoursEcu,
      periodTo: payload.periodTo,
      periodFrom: payload.periodFrom,
      renter: payload.renter,
      owner: payload.owner,
      asset: payload.asset,
      gapRule: payload.gapRule,
    } as MucPayload;
    expect(canonicalMucPayload(shuffled)).toBe(canonicalMucPayload(payload));
  });

  it('fixes numbers to one decimal and times to ISO UTC', () => {
    const payload: MucPayload = {
      ...db.getState().mucs[0].payload,
      openingHoursEcu: 7900.04,
      closingHoursEcu: 8350.06,
      billableHours: 450.02,
      periodFrom: '2026-09-01T00:00:00+04:00',
      periodTo: 1759257540000,
      days: [{ date: '1 Sep', engineHours: 8.04, workingHours: 6.06, idlingHours: 1.98, gapMinutes: 12.4 }],
      gaps: [],
    };
    const canonical = JSON.parse(canonicalMucPayload(payload));
    expect(canonical.openingHoursEcu).toBe(7900.0);
    expect(canonical.closingHoursEcu).toBe(8350.1);
    expect(canonical.billableHours).toBe(450.0);
    expect(canonical.periodFrom).toBe('2026-08-31T20:00:00.000Z');
    expect(canonical.periodTo).toBe(new Date(1759257540000).toISOString());
    expect(canonical.days[0].engineHours).toBe(8.0);
    expect(canonical.days[0].gapMinutes).toBe(12);
  });

  it('produces the same seal for the same data', async () => {
    const payload = db.getState().mucs[0].payload;
    expect(await sealMucPayload(payload)).toBe(await sealMucPayload(JSON.parse(JSON.stringify(payload))));
  });
});

describe('muc — seeded certificates', () => {
  it('every seeded certificate matches its seal', async () => {
    for (const muc of db.getState().mucs) {
      expect(await verifyMucSeal(muc)).toBe(true);
    }
  });

  it('reports sealed certificates as valid and voided ones as voided', async () => {
    const sealed = db.getState().mucs.find(m => m.status === 'sealed')!;
    const voided = db.getState().mucs.find(m => m.status === 'voided')!;
    expect(await getMucVerifyStatus(sealed)).toBe('valid');
    expect(await getMucVerifyStatus(voided)).toBe('voided');
  });

  it('finds a certificate by number, and null when unknown', () => {
    const muc = db.getState().mucs[0];
    expect(getMucByNumber(muc.number)?.id).toBe(muc.id);
    expect(getMucByNumber('MUC-1999-01-XX-99-99')).toBeNull();
  });

  it('detects tampering: one changed number breaks the seal', async () => {
    const muc = db.getState().mucs.find(m => m.status === 'sealed')!;
    const original = muc.payload.billableHours;
    const result = tamperWithMuc(muc.number);
    expect(result.ok).toBe(true);
    expect(await verifyMucSeal(muc)).toBe(false);
    expect(await getMucVerifyStatus(muc)).toBe('tampered');
    muc.payload.billableHours = original; // restore
    expect(await verifyMucSeal(muc)).toBe(true);
  });
});

describe('muc — issuing', () => {
  it('refuses when the asset is not Tier 3 with ECU hours', async () => {
    const tier1 = db.getState().assets.find(a => a.canProfile.adapter === 'none')!;
    const result = await issueMuc(sessionFor('u-omar'), { assetId: tier1.id, periodFrom: clock.now() - 40 * 86400000, periodTo: clock.now() - 10 * 86400000 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ALL-CAN300');
  });

  it('refuses a renter, a Site User and Kasper Ops', async () => {
    const asset = db.getState().assets.find(a => a.canProfile.adapter === 'ALL-CAN300')!;
    const window = { assetId: asset.id, periodFrom: clock.now() - 40 * 86400000, periodTo: clock.now() - 10 * 86400000 };
    const lina = sessionFor('u-lina'); // Marina (a renter of some Emirates assets)
    expect((await issueMuc(lina, window)).ok).toBe(false);
    expect((await issueMuc(sessionFor('u-mark'), window)).ok).toBe(false);
    expect((await issueMuc(ravi(), window)).ok).toBe(false);
  });

  it('refuses a future period', async () => {
    const asset = db.getState().assets.find(a => a.canProfile.adapter === 'ALL-CAN300')!;
    const result = await issueMuc(sara(), {
      assetId: asset.id,
      periodFrom: clock.now() + 86400000,
      periodTo: clock.now() + 10 * 86400000,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('past periods');
  });

  it('issues a sealed certificate for a past period and audits it', { timeout: 30000 }, async () => {
    const asset = db.getState().assets.find(a => a.code === 'WL-03')!; // works at its site, Tier 3
    expect(hasFeature(asset, 'muc')).toBe(true);
    const before = db.getState().mucs.length;
    const periodFrom = new Date('2026-09-05T00:00:00+04:00').getTime();
    const periodEnd = new Date('2026-09-28T00:00:00+04:00').getTime();
    const result = await issueMuc(khalid(), {
      assetId: asset.id,
      periodFrom,
      periodTo: periodEnd,
    });
    expect(result.ok).toBe(true);
    const muc = result.data!;
    expect(db.getState().mucs.length).toBe(before + 1);
    expect(muc.number).toBe('MUC-2026-09-WL-03-03');
    expect(muc.payload.billableHours).toBeGreaterThan(0);
    expect(muc.payload.closingHoursEcu - muc.payload.openingHoursEcu).toBeCloseTo(muc.payload.billableHours, 1);
    expect(await verifyMucSeal(muc)).toBe(true);
    expect(db.getState().auditEntries.some(e => e.action === 'muc.issue' && e.detail.includes(muc.number))).toBe(true);

    // A second certificate for the same period is refused.
    const again = await issueMuc(khalid(), { assetId: asset.id, periodFrom, periodTo: periodEnd });
    expect(again.ok).toBe(false);
    expect(again.error).toContain('already exists');
  });

  it('numbers certificates sequentially per asset and month', () => {
    const template = db.getState().mucs[0];
    const existing = [
      { ...template, number: 'MUC-2026-09-WL-03-01' },
      { ...template, number: 'MUC-2026-09-WL-03-02' },
    ];
    expect(nextMucNumber('WL-03', new Date('2026-09-15T10:00:00+04:00').getTime(), existing)).toBe('MUC-2026-09-WL-03-03');
    expect(nextMucNumber('EX-04', new Date('2026-11-02T10:00:00+04:00').getTime(), existing)).toBe('MUC-2026-11-EX-04-01');
  });

  it('voids with a reason and refuses a short one', { timeout: 30000 }, async () => {
    const asset = db.getState().assets.find(a => a.code === 'BD-02')!;
    expect(hasFeature(asset, 'muc')).toBe(true);
    const periodEnd = clock.now() - 2 * 86400000;
    const issued = await issueMuc(khalid(), { assetId: asset.id, periodFrom: periodEnd - 5 * 86400000, periodTo: periodEnd });
    expect(issued.ok).toBe(true);
    const muc = issued.data!;

    expect((await voidMuc(khalid(), muc.number, 'short')).ok).toBe(false);
    const voided = await voidMuc(khalid(), muc.number, 'Wrong period — extended by two days');
    expect(voided.ok).toBe(true);
    expect(muc.status).toBe('voided');
    expect(muc.voidReason).toContain('Wrong period');

    // Cannot void twice.
    expect((await voidMuc(khalid(), muc.number, 'Trying again with a reason')).ok).toBe(false);
  });

  it('reissues a voided certificate at -02 with a fresh seal', { timeout: 30000 }, async () => {
    const asset = db.getState().assets.find(a => a.code === 'GN-01')!;
    const periodEnd = clock.now() - 4 * 86400000;
    const issued = await issueMuc(sara(), { assetId: asset.id, periodFrom: periodEnd - 6 * 86400000, periodTo: periodEnd });
    expect(issued.ok).toBe(true);
    const first = issued.data!;

    // A sealed certificate must be voided first.
    expect((await reissueMuc(sara(), first.number, 'Recomputing for the corrected period')).ok).toBe(false);

    await voidMuc(sara(), first.number, 'Wrong period — booking extended');
    const reissued = await reissueMuc(sara(), first.number, 'Recomputing for the correct period');
    expect(reissued.ok).toBe(true);
    const second = reissued.data!;
    expect(second.number).toBe(`${first.number.slice(0, -2)}02`);
    expect(second.replacesMucId).toBe(first.id);
    expect(first.replacesMucId).toBe(second.id);
    expect(await verifyMucSeal(second)).toBe(true);

    const replacement = getMucByNumber(second.number)!;
    expect(replacement.status).toBe('sealed');
    expect(db.getState().auditEntries.some(e => e.action === 'muc.reissue')).toBe(true);
  });
});

describe('muc — ECU hours model', () => {
  it('is deterministic and monotonic per asset', () => {
    const asset = db.getState().assets.find(a => a.code === 'EX-04')!;
    const t = clock.now();
    expect(ecuHoursAt(asset, t)).toBe(ecuHoursAt(asset, t));
    expect(ecuHoursAt(asset, t + 86400000)).toBeGreaterThan(ecuHoursAt(asset, t));
  });
});
