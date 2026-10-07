// Cost & ROI (spec 11.19): period maths, every cost line's basis, the ROI and
// payback figures, visibility and the editable inputs.
import { describe, it, expect } from 'vitest';
import {
  canViewCost, costProfileFor, costRows, getDieselPrice, monthlySeries, periodRange, roiFor,
  saveCostProfile, setDieselPrice,
} from './cost';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import type { Session } from '@/domain/types';

function sessionFor(userId: string): Session {
  const user = seed.users.find(u => u.id === userId)!;
  return {
    userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

const sara = () => sessionFor('u-sara');       // Kasper Admin
const ravi = () => sessionFor('u-ravi');       // Kasper Ops — never sees cost
const khalid = () => sessionFor('u-khalid');   // Emirates Earthmovers Admin
const mark = () => sessionFor('u-mark');       // Gulf Lift Site User — never sees cost
const asset = (id: string) => seed.assets.find(a => a.id === id)!;
const lastMonth = () => periodRange('last_month');
const auditFor = (action: string, needle: string) =>
  seed.auditEntries.find(e => e.action === action && e.detail.includes(needle));

describe('cost — periods', () => {
  it('gives Dubai months and never runs past the clock', () => {
    const now = clock.now();
    const last = periodRange('last_month', now);
    expect(last.label).toBe('Sep 2026');
    expect(clock.dubaiToIso(last.fromMs).slice(0, 10)).toBe('2026-09-01');
    expect(clock.dubaiToIso(last.toMs).slice(0, 10)).toBe('2026-10-01');
    const current = periodRange('this_month', now);
    expect(current.label).toBe('Oct 2026 so far');
    expect(current.toMs).toBe(now);
    expect(periodRange('last_3_months', now).label).toBe('Last 3 months');
    // Jumping the demo clock forward a month moves the periods with it.
    clock.setOffsetMs(31 * 86400000);
    expect(periodRange('last_month').label).toBe('Oct 2026');
    clock.resetOffset();
  });
});

describe('cost — the fleet view', () => {
  it('is Tenant Admin and Kasper Admin only', () => {
    expect(canViewCost(sara())).toBe(true);
    expect(canViewCost(khalid())).toBe(true);
    expect(canViewCost(ravi())).toBe(false);
    expect(canViewCost(mark())).toBe(false);
    const { fromMs, toMs } = lastMonth();
    expect(costRows(ravi(), fromMs, toMs)).toEqual([]);
    expect(costRows(mark(), fromMs, toMs)).toEqual([]);
    // A company only sees its own assets.
    expect(costRows(khalid(), fromMs, toMs).every(r => r.asset.ownerTenantId === 't-emirates')).toBe(true);
  });

  it('prices fuel, idle, maintenance, fixed and operator costs with a labelled basis', () => {
    const { fromMs, toMs } = lastMonth();
    const ex04 = costRows(khalid(), fromMs, toMs).find(r => r.asset.id === 'a-ex04')!;
    expect(ex04.revenueAed).toBe(83250);           // Sep rental invoices
    expect(ex04.engineHours).toBe(270);            // 30 days × 9 h, ECU
    expect(ex04.fuelAed).toBe(13176);              // 270 h × 16 L/h × 3.05
    expect(ex04.idleHours).toBe(48.6);             // 18 % of the engine hours (modelled)
    expect(ex04.utilisationPct).toBe(90);          // 270 h ÷ (30 × 10 h shift)
    expect(ex04.maintenanceAed).toBe(0);
    expect(ex04.lines.find(l => l.key === 'fuel')!.basis).toBe('ECU (ALL-CAN300)');
    expect(ex04.lines.find(l => l.key === 'revenue')!.basis).toBe('From invoices');
    expect(ex04.lines.find(l => l.key === 'maintenance')!.basis).toBe('From service log');
    expect(ex04.lines.find(l => l.key === 'fixed')!.basis).toBe('Dummy rate');
    expect(ex04.lines.find(l => l.key === 'fuel')!.note).toContain('dummy rate');
    expect(ex04.marginAed).toBe(Math.round((ex04.revenueAed - ex04.costAed) * 100) / 100);

    // Tier 1/2 assets show "Not measured" for idle, never 0.
    const tp21 = costRows(sara(), fromMs, toMs).find(r => r.asset.id === 'a-tp21')!;
    expect(tp21.revenueAed).toBe(6600); // TP-21 earned in September
    expect(tp21.idleAed).toBeNull();
    expect(tp21.lines.find(l => l.key === 'idle')!.basis).toBe('Not measured');
    expect(tp21.lines.find(l => l.key === 'fuel')!.basis).toBe('Estimated');
    // No cost profile yet → fixed and operator are "Not measured", not 0.
    expect(costProfileFor('a-tp21')).toBeNull();
    expect(tp21.fixedAed).toBeNull();
    expect(tp21.operatorAed).toBeNull();
    expect(tp21.lines.find(l => l.key === 'fixed')!.note).toBe('No cost profile yet');
    const fb14 = costRows(sara(), fromMs, toMs).find(r => r.asset.id === 'a-fb14')!;
    expect(fb14.maintenanceAed).toBe(2200); // FB-14 was serviced last month
    // A profile pro-rates finance + insurance over the period's days.
    const ex04Fixed = ex04.fixedAed!;
    expect(ex04Fixed).toBeGreaterThan(5800);
    expect(ex04Fixed).toBeLessThan(6000);
  });

  it('draws six months of revenue against cost', () => {
    const series = monthlySeries(asset('a-ex04'), 6);
    expect(series).toHaveLength(6);
    expect(series.map(p => p.label)).toEqual(['May 26', 'Jun 26', 'Jul 26', 'Aug 26', 'Sep 26', 'Oct 26']);
    expect(series[4].revenueAed).toBe(83250);
    expect(series[5].costAed).toBeGreaterThan(0); // the current month so far
    expect(series.every(p => p.costAed >= 0)).toBe(true);
  });
});

describe('cost — ROI and inputs', () => {
  it('measures ROI from the first invoice and estimates payback', () => {
    const roi = roiFor(asset('a-ex04'));
    expect(roi.roiPct).toBeGreaterThan(0);
    expect(roi.paybackMonths).toBeGreaterThan(0);
    expect(roi.paybackMonths).toBeLessThan(24);
    expect(roi.note).toContain('At the current rate');
    // Assets that never earned anything say so instead of inventing a number.
    const idle = roiFor(asset('a-fb14'));
    expect(idle.roiPct).toBeNull();
    expect(idle.paybackMonths).toBeNull();
    expect(idle.note).toBe('Not enough data — no rental invoices yet');
    // …and one with no cost profile asks for it first.
    expect(roiFor(asset('a-pu31')).note).toBe('Add a cost profile to see ROI');
  });

  it('saves a cost profile for an owned asset and audits it', () => {
    const result = saveCostProfile(mark(), {
      assetId: 'a-cr02', purchaseValueAed: 1, monthlyFinanceAed: 1, operatorCostPerHourAed: 1, insurancePerMonthAed: 1,
    });
    expect(result.error).toBe('Your role can\u2019t change cost profiles.');

    const saved = saveCostProfile(khalid(), {
      assetId: 'a-ex04', purchaseValueAed: 430000, monthlyFinanceAed: 5100, operatorCostPerHourAed: 88, insurancePerMonthAed: 820,
    });
    expect(saved.ok).toBe(true);
    expect(costProfileFor('a-ex04')!.purchaseValueAed).toBe(430000);
    expect(auditFor('cost.profile', 'EX-04 cost profile: purchase AED 430,000')).toBeTruthy();
    expect(saveCostProfile(khalid(), {
      assetId: 'a-cr02', purchaseValueAed: 1, monthlyFinanceAed: 1, operatorCostPerHourAed: 1, insurancePerMonthAed: 1,
    }).error).toBe('You can only cost your own assets.');
    expect(saveCostProfile(khalid(), {
      assetId: 'a-nope', purchaseValueAed: 1, monthlyFinanceAed: 1, operatorCostPerHourAed: 1, insurancePerMonthAed: 1,
    }).error).toBe('Asset not found.');
    expect(saveCostProfile(sara(), {
      assetId: 'a-ex04', purchaseValueAed: -5, monthlyFinanceAed: 1, operatorCostPerHourAed: 1, insurancePerMonthAed: 1,
    }).error).toBe('Cost inputs can\u2019t be negative.');
  });

  it('lets the owner change the diesel price', () => {
    expect(getDieselPrice()).toBe(3.05);
    expect(setDieselPrice(mark(), 3.2).error).toBe('Your role can\u2019t change cost inputs.');
    expect(setDieselPrice(sara(), 0).error).toBe('Enter a diesel price between AED 0 and 20.');
    expect(setDieselPrice(sara(), 3.4).ok).toBe(true);
    expect(getDieselPrice()).toBe(3.4);
    expect(auditFor('cost.diesel', 'Diesel price 3.05 → 3.4 AED/L')).toBeTruthy();
    setDieselPrice(sara(), 3.05);
  });
});
