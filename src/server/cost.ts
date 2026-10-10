// Cost & ROI (spec 11.19). Tenant Admin (own assets) and Kasper Admin only —
// renters, Site Users and Kasper Ops never see this screen.
//
// Every cost line carries the basis it came from (ECU / Estimated / From
// invoices / From service log / Dummy rate) and lines with no basis read
// "Not measured", never 0. Rates are dummy; the class-average L/h table is the
// same one the product uses for Tier 1/2 estimates.

import type { Asset, AssetCostProfile, Session } from '@/domain/types';
import { db, append, touch } from '@/server/db';
import { recordAuditForSession } from '@/server/audit';
import { fail, ok, type OpResult } from '@/server/result';

import { ecuHoursAt } from '@/server/muc';
import { estimatedHoursAt } from '@/server/maintenance';
import { CLASS_AVG_FUEL_LPH, DIESEL_PRICE_AED_PER_L } from '@/config/pricing';
// Available shift hours per day for the utilisation figure (spec 11.19).
const SHIFT_HOURS_PER_DAY = 10;

/** Share of the engine hours spent idling, by how the asset behaves (prototype). */
const IDLE_SHARE: Record<Asset['behaviour'], number> = {
  parked: 0.05,
  works_at_site: 0.18,
  drives_between_sites: 0.1,
  stationary_24h: 0,
  light_vehicle_day: 0.12,
};
import * as clock from '@/lib/clock';
import { can } from '@/server/capabilities';

export type CostBasis = 'ECU' | 'ECU (ALL-CAN300)' | 'Estimated' | 'From invoices' | 'From service log' | 'Dummy rate' | 'Not measured';

export type CostPeriod = 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months';

export interface CostSeriesPoint {
  label: string;
  revenueAed: number;
  costAed: number;
}

export interface CostLineView {
  key: 'revenue' | 'fuel' | 'idle' | 'maintenance' | 'fixed' | 'operator';
  label: string;
  amountAed: number | null;
  basis: CostBasis;
  note: string;
}

export interface AssetCostRow {
  asset: Asset;
  profile: AssetCostProfile | null;
  revenueAed: number;
  fuelAed: number | null;
  idleAed: number | null;
  maintenanceAed: number;
  fixedAed: number | null;
  operatorAed: number | null;
  costAed: number;
  marginAed: number;
  marginPct: number | null;
  utilisationPct: number;
  engineHours: number;
  idleHours: number | null;
  lines: CostLineView[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function n2(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthStartMs(year: number, month: number): number {
  return new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+04:00`).getTime();
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function labelFor(period: CostPeriod, year: number, month: number, from: { year: number; month: number }, monthsBack: number): string {
  if (period === 'this_month') return `${MONTH_NAMES[month - 1]} ${year} so far`;
  if (period === 'last_month') return `${MONTH_NAMES[from.month - 1]} ${from.year}`;
  return `Last ${monthsBack} months`;
}

export function periodRange(period: CostPeriod, nowMs: number = clock.now()): { fromMs: number; toMs: number; label: string } {
  const iso = clock.dubaiToIso(nowMs);
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const thisMonthStart = monthStartMs(year, month);
  const toMs = period === 'this_month' ? nowMs : thisMonthStart;
  const monthsBack = period === 'last_3_months' ? 3 : period === 'last_6_months' ? 6 : period === 'last_month' ? 1 : 0;
  const from = addMonths(year, month, -monthsBack);
  const fromMs = period === 'this_month' ? thisMonthStart : monthStartMs(from.year, from.month);
  if (toMs > nowMs) {
    // A period that runs into the future only counts up to now.
    return { fromMs: Math.min(fromMs, nowMs), toMs: nowMs, label: labelFor(period, year, month, from, monthsBack) };
  }
  const label = period === 'this_month'
    ? `${MONTH_NAMES[month - 1]} ${year} so far`
    : period === 'last_month'
      ? `${MONTH_NAMES[from.month - 1]} ${from.year}`
      : `Last ${monthsBack} months`;
  return { fromMs, toMs, label };
}

// ── Rates and inputs ───────────────────────────────────────────────────────────

let dieselPriceAed = DIESEL_PRICE_AED_PER_L;

export function getDieselPrice(): number {
  return dieselPriceAed;
}

export function setDieselPrice(session: Session, priceAed: number): OpResult<number> {
  if (!canViewCost(session)) return fail('Your role can\u2019t change cost inputs.');
  if (!Number.isFinite(priceAed) || priceAed <= 0 || priceAed > 20) return fail('Enter a diesel price between AED 0 and 20.');
  const before = dieselPriceAed;
  dieselPriceAed = Math.round(priceAed * 100) / 100;
  recordAuditForSession(session, {
    action: 'cost.diesel',
    tenantId: session.tenantId ?? undefined,
    detail: `Diesel price ${before} → ${dieselPriceAed} AED/L`,
  });
  return ok(dieselPriceAed, `Diesel price set to AED ${dieselPriceAed.toFixed(2)}/L.`);
}

export function costProfileFor(assetId: string): AssetCostProfile | null {
  return db.getState().costProfiles.find(p => p.assetId === assetId) ?? null;
}

export function canViewCost(session: Session, assetId?: string): boolean {
  return can(session, 'cost.view', assetId);
}

/** Tier 3 assets bill fuel and idle off the ECU; everything else is estimated. */
function isTier3(asset: Asset): boolean {
  return asset.canProfile.adapter === 'ALL-CAN300';
}

/** Class-average burn rate for an asset's type — a dummy rate, disclosed as such (spec 11.19). */
export function burnRateLph(asset: Asset): number {
  return CLASS_AVG_FUEL_LPH[asset.assetClass] ?? CLASS_AVG_FUEL_LPH[asset.type.toLowerCase()] ?? 8;
}

/** Engine hours in a window: the ECU meter on Tier 3, the ignition estimate on Tier 1/2. */
export function engineHoursIn(asset: Asset, fromMs: number, toMs: number): number {
  return isTier3(asset)
    ? Math.max(0, ecuHoursAt(asset, toMs) - ecuHoursAt(asset, fromMs))
    : Math.max(0, estimatedHoursAt(asset, toMs) - estimatedHoursAt(asset, fromMs));
}

/**
 * Idling hours. Tier 3 assets measure idle from the ECU; the prototype models it
 * as a fixed share of the engine hours (the real product counts engine-on,
 * not-moving time). Tier 1/2 trackers can't measure engine load at all.
 */
function idleHoursIn(asset: Asset, fromMs: number, toMs: number): number | null {
  if (!isTier3(asset)) return null;
  return Math.round(engineHoursIn(asset, fromMs, toMs) * IDLE_SHARE[asset.behaviour] * 10) / 10;
}

function costProfileLine(profile: AssetCostProfile | null, fromMs: number, toMs: number): { amountAed: number | null; note: string } {
  if (!profile) return { amountAed: null, note: 'No cost profile yet' };
  const days = Math.max(0, (toMs - fromMs) / 86400000);
  const monthly = profile.monthlyFinanceAed + profile.insurancePerMonthAed;
  return {
    amountAed: n2(monthly * (days / 30.44)),
    note: `Finance + insurance, ${days.toFixed(0)} of 30.4 days pro-rated`,
  };
}

// ── Revenue and maintenance from the logs ──────────────────────────────────────

function bookingAssetId(bookingId: string | undefined): string | null {
  if (!bookingId) return null;
  return db.getState().bookings.find(b => b.id === bookingId)?.assetId ?? null;
}

function rentalRevenue(tenantId: string, assetId: string, fromMs: number, toMs: number): number {
  return n2(db.getState().invoices
    .filter(inv => inv.kind === 'rental' && inv.issuerTenantId === tenantId && inv.status !== 'void')
    .filter(inv => bookingAssetId(inv.bookingId) === assetId)
    .filter(inv => {
      const at = typeof inv.issuedAt === 'number' ? inv.issuedAt : new Date(inv.issuedAt).getTime();
      return at >= fromMs && at < toMs;
    })
    .reduce((sum, inv) => sum + inv.subtotalAed, 0));
}

function maintenanceCost(assetId: string, fromMs: number, toMs: number): number {
  return n2(db.getState().serviceRecords
    .filter(r => r.assetId === assetId)
    .filter(r => {
      const at = typeof r.doneAt === 'number' ? r.doneAt : new Date(r.doneAt).getTime();
      return at >= fromMs && at < toMs;
    })
    .reduce((sum, r) => sum + r.costAed, 0));
}

// ── The fleet view ─────────────────────────────────────────────────────────────

export function costRows(session: Session, fromMs: number, toMs: number): AssetCostRow[] {
  if (!canViewCost(session)) return [];
  const assets = db.getState().assets
    .filter(a => !a.retiredAt)
    .filter(a => canViewCost(session, a.id));

  return assets.map(asset => {
    const profile = costProfileFor(asset.id);
    const engineHours = Math.round(engineHoursIn(asset, fromMs, toMs) * 10) / 10;
    const idleHours = idleHoursIn(asset, fromMs, toMs);
    const rate = burnRateLph(asset);
    const revenueAed = rentalRevenue(asset.ownerTenantId ?? '', asset.id, fromMs, toMs);
    const fuelAed = n2(engineHours * rate * dieselPriceAed);
    const idleAed = idleHours === null ? null : n2(idleHours * rate * dieselPriceAed);
    const maintenanceAed = maintenanceCost(asset.id, fromMs, toMs);
    const fixed = costProfileLine(profile, fromMs, toMs);
    const operatorAed = profile ? n2(engineHours * profile.operatorCostPerHourAed) : null;

    const costAed = n2(fuelAed + (idleAed ?? 0) + maintenanceAed + (fixed.amountAed ?? 0) + (operatorAed ?? 0));
    const marginAed = n2(revenueAed - costAed);
    const days = Math.max(1, (toMs - fromMs) / 86400000);
    const shiftHours = days * SHIFT_HOURS_PER_DAY;

    const lines: CostLineView[] = [
      { key: 'revenue', label: 'Revenue', amountAed: revenueAed, basis: 'From invoices', note: 'Rental invoices issued in the period' },
      {
        key: 'fuel', label: 'Fuel',
        amountAed: fuelAed,
        basis: isTier3(asset) ? 'ECU (ALL-CAN300)' : 'Estimated',
        note: `${engineHours.toLocaleString('en-US')} h × ${rate} L/h (class average — dummy rate) × AED ${dieselPriceAed.toFixed(2)}/L`,
      },
      {
        key: 'idle', label: 'Idle',
        amountAed: idleAed,
        basis: idleAed === null ? 'Not measured' : 'ECU (ALL-CAN300)',
        note: idleAed === null
          ? 'Tier 1/2 trackers don\u2019t report engine load, so idling isn\u2019t measured'
          : `${idleHours} idling h (ECU, modelled) × ${rate} L/h × AED ${dieselPriceAed.toFixed(2)}/L`,
      },
      { key: 'maintenance', label: 'Maintenance', amountAed: maintenanceAed, basis: 'From service log', note: 'Service records logged in the period' },
      { key: 'fixed', label: 'Fixed', amountAed: fixed.amountAed, basis: fixed.amountAed === null ? 'Not measured' : 'Dummy rate', note: fixed.note },
      {
        key: 'operator', label: 'Operator',
        amountAed: operatorAed,
        basis: operatorAed === null ? 'Not measured' : 'Dummy rate',
        note: profile ? `${engineHours.toLocaleString('en-US')} h × AED ${profile.operatorCostPerHourAed}/h` : 'No cost profile yet',
      },
    ];

    return {
      asset, profile, revenueAed, fuelAed, idleAed, maintenanceAed,
      fixedAed: fixed.amountAed, operatorAed, costAed, marginAed,
      marginPct: revenueAed > 0 ? Math.round((marginAed / revenueAed) * 1000) / 10 : null,
      utilisationPct: Math.round((engineHours / shiftHours) * 1000) / 10,
      engineHours, idleHours, lines,
    };
  });
}

export function monthlySeries(asset: Asset, months: number, nowMs: number = clock.now()): CostSeriesPoint[] {
  const iso = clock.dubaiToIso(nowMs);
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const points: CostSeriesPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = addMonths(year, month, -i);
    const fromMs = monthStartMs(start.year, start.month);
    const to = addMonths(start.year, start.month, 1);
    const toMs = Math.min(monthStartMs(to.year, to.month), nowMs);
    const engineHours = engineHoursIn(asset, fromMs, toMs);
    const rate = burnRateLph(asset);
    const idleHours = idleHoursIn(asset, fromMs, toMs) ?? 0;
    const cost = n2(engineHours * rate * dieselPriceAed + idleHours * rate * dieselPriceAed
      + maintenanceCost(asset.id, fromMs, toMs)
      + (costProfileLine(costProfileFor(asset.id), fromMs, toMs).amountAed ?? 0)
      + (costProfileFor(asset.id) ? engineHours * costProfileFor(asset.id)!.operatorCostPerHourAed : 0));
    points.push({
      label: `${MONTH_NAMES[start.month - 1]} ${String(start.year).slice(2)}`,
      revenueAed: rentalRevenue(asset.ownerTenantId ?? '', asset.id, fromMs, toMs),
      costAed: cost,
    });
  }
  return points;
}

export interface RoiView {
  roiPct: number | null;
  paybackMonths: number | null;
  note: string;
}

/**
 * ROI to date = (cumulative revenue − cumulative cost) ÷ purchase value, counted
 * from the asset's first rental invoice — before it started earning there is no
 * basis to compare against, so it reads "Not enough data".
 */
export function roiFor(asset: Asset, nowMs: number = clock.now()): RoiView {
  const profile = costProfileFor(asset.id);
  if (!profile) return { roiPct: null, paybackMonths: null, note: 'Add a cost profile to see ROI' };
  const invoices = db.getState().invoices
    .filter(inv => inv.kind === 'rental' && inv.issuerTenantId === (asset.ownerTenantId ?? '') && inv.status !== 'void')
    .filter(inv => bookingAssetId(inv.bookingId) === asset.id);
  if (invoices.length === 0) return { roiPct: null, paybackMonths: null, note: 'Not enough data — no rental invoices yet' };
  const createdMs = Math.min(...invoices.map(inv => typeof inv.issuedAt === 'number' ? inv.issuedAt : new Date(inv.issuedAt).getTime()));
  const engineHours = engineHoursIn(asset, createdMs, nowMs);
  const idleHours = idleHoursIn(asset, createdMs, nowMs) ?? 0;
  const rate = burnRateLph(asset);
  const monthsSince = Math.max(1, (nowMs - createdMs) / (30.44 * 86400000));
  const variables = engineHours * rate * dieselPriceAed + idleHours * rate * dieselPriceAed
    + engineHours * profile.operatorCostPerHourAed
    + (profile.monthlyFinanceAed + profile.insurancePerMonthAed) * monthsSince;
  const maintenance = maintenanceCost(asset.id, createdMs, nowMs);
  const revenue = rentalRevenue(asset.ownerTenantId ?? '', asset.id, createdMs, nowMs);
  const net = revenue - variables - maintenance;
  const monthlyNet = net / monthsSince;
  return {
    roiPct: Math.round((net / profile.purchaseValueAed) * 1000) / 10,
    paybackMonths: monthlyNet > 0 ? Math.round((profile.purchaseValueAed / monthlyNet) * 10) / 10 : null,
    note: monthlyNet > 0
      ? `At the current rate (AED ${Math.round(monthlyNet).toLocaleString('en-US')}/month), since ${clock.formatDubaiDate(createdMs)}`
      : 'Not enough data — the asset hasn\u2019t earned its running cost yet',
  };
}

// ── Inputs ─────────────────────────────────────────────────────────────────────

export interface CostProfileInput {
  assetId: string;
  purchaseValueAed: number;
  monthlyFinanceAed: number;
  operatorCostPerHourAed: number;
  insurancePerMonthAed: number;
}

export function saveCostProfile(session: Session, input: CostProfileInput): OpResult<AssetCostProfile> {
  if (!canViewCost(session)) return fail('Your role can\u2019t change cost profiles.');
  const asset = db.getState().assets.find(a => a.id === input.assetId);
  if (!asset) return fail('Asset not found.');
  if (!canViewCost(session, asset.id)) return fail('You can only cost your own assets.');
  const values = [input.purchaseValueAed, input.monthlyFinanceAed, input.operatorCostPerHourAed, input.insurancePerMonthAed];
  if (values.some(v => !Number.isFinite(v) || v < 0)) return fail('Cost inputs can\u2019t be negative.');

  const existing = costProfileFor(input.assetId);
  const profile: AssetCostProfile = existing
    ? Object.assign(existing, input)
    : { ...input, tenantId: asset.ownerTenantId ?? '' };
  if (existing) touch('costProfiles');
  else append('costProfiles', profile);

  recordAuditForSession(session, {
    action: 'cost.profile',
    tenantId: asset.ownerTenantId ?? undefined,
    detail: `${asset.code} cost profile: purchase AED ${input.purchaseValueAed.toLocaleString('en-US')}, finance AED ${input.monthlyFinanceAed}/m, operator AED ${input.operatorCostPerHourAed}/h, insurance AED ${input.insurancePerMonthAed}/m`,
  });
  return ok(profile, `${asset.code} cost profile saved.`);
}
