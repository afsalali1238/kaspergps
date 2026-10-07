'use client';

import React, { useMemo } from 'react';
import { EmptyState, SourceLabel } from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { isAssetVisible } from '@/server/access';
import { can } from '@/server/capabilities';
import { hasFeature, tierForAsset } from '@/domain/features';
import { CLASS_AVG_FUEL_LPH, DIESEL_PRICE_AED_PER_L, GPS_SUBSCRIPTION_PER_MONTH } from '@/config/pricing';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import type { Asset, Reading } from '@/domain/types';

type CostBasis = 'ECU' | 'Estimated' | 'From invoices' | 'From service log' | 'Dummy rate' | 'Not measured';
type CostLine = { asset: Asset; item: string; amountAed: number | null; basis: CostBasis; detail: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function toMillis(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : new Date(value).getTime();
}

function ignitionHours(readings: Reading[]): number {
  let milliseconds = 0;
  for (let index = 1; index < readings.length; index += 1) {
    const previous = readings[index - 1];
    const next = readings[index];
    const gap = toMillis(next.deviceTime) - toMillis(previous.deviceTime);
    if (previous.ignition && gap > 0 && gap <= 15 * 60 * 1000) milliseconds += gap;
  }
  return milliseconds / 3_600_000;
}

function averageFuelRate(asset: Asset): number | undefined {
  const type = `${asset.type} ${asset.model} ${asset.assetClass}`.toLowerCase();
  const candidates: [string, number][] = [
    ['excavator', CLASS_AVG_FUEL_LPH.excavator],
    ['wheel loader', CLASS_AVG_FUEL_LPH.loader],
    ['loader', CLASS_AVG_FUEL_LPH.loader],
    ['dozer', CLASS_AVG_FUEL_LPH.dozer],
    ['bulldozer', CLASS_AVG_FUEL_LPH.dozer],
    ['grader', CLASS_AVG_FUEL_LPH.grader],
    ['crane', CLASS_AVG_FUEL_LPH.crane],
    ['generator', CLASS_AVG_FUEL_LPH.generator],
    ['truck', CLASS_AVG_FUEL_LPH.truck],
    ['pickup', CLASS_AVG_FUEL_LPH.pickup],
    ['van', CLASS_AVG_FUEL_LPH.light_vehicle],
  ];
  const found = candidates.find(([name]) => type.includes(name));
  if (found) return found[1];
  if (asset.assetClass === 'light_vehicle') return CLASS_AVG_FUEL_LPH.light_vehicle;
  return undefined;
}

function fuelLine(asset: Asset, readings: Reading[], hours: number): CostLine {
  const usage = readings.map(reading => reading.fuelUsedL).filter((value): value is number => value !== undefined && Number.isFinite(value));
  const measuredUsage = usage.length > 1 ? Math.max(0, usage[usage.length - 1] - usage[0]) : null;
  if (hasFeature(asset, 'fuel.used') && measuredUsage !== null) {
    return {
      asset,
      item: 'Fuel',
      amountAed: measuredUsage * DIESEL_PRICE_AED_PER_L,
      basis: 'ECU',
      detail: `${measuredUsage.toFixed(1)} L × AED ${DIESEL_PRICE_AED_PER_L.toFixed(2)}/L`,
    };
  }
  if (tierForAsset(asset) === 1 || measuredUsage === null) {
    const rate = averageFuelRate(asset);
    if (rate && hours > 0) {
      const litres = rate * hours;
      return {
        asset,
        item: 'Fuel',
        amountAed: litres * DIESEL_PRICE_AED_PER_L,
        basis: 'Estimated',
        detail: `${litres.toFixed(1)} L estimated from ${hours.toFixed(1)} ignition hours`,
      };
    }
    return { asset, item: 'Fuel', amountAed: null, basis: 'Not measured', detail: 'No measured fuel or usable usage estimate for this period' };
  }
  return {
    asset,
    item: 'Fuel',
    amountAed: measuredUsage * DIESEL_PRICE_AED_PER_L,
    basis: 'ECU',
    detail: `${measuredUsage.toFixed(1)} L × AED ${DIESEL_PRICE_AED_PER_L.toFixed(2)}/L`,
  };
}

function costLinesForAsset(asset: Asset, now: number): CostLine[] {
  const from = now - 7 * DAY_MS;
  const readings = getReadingsForAsset(asset, from, now);
  const hours = ignitionHours(readings);
  const profile = seed.costProfiles.find(item => item.assetId === asset.id && (sessionTenantMatches(item.tenantId, asset)));
  const tier = tierForAsset(asset);
  const monthlySubscription = tier === 1 ? GPS_SUBSCRIPTION_PER_MONTH.tier1 : tier === 2 ? GPS_SUBSCRIPTION_PER_MONTH.tier2 : GPS_SUBSCRIPTION_PER_MONTH.tier3;
  const billingDays = Math.min(30, Math.max(1, (now - from) / DAY_MS));
  const lines: CostLine[] = [
    {
      asset,
      item: 'GPS subscription',
      amountAed: monthlySubscription * billingDays / 30,
      basis: 'Dummy rate',
      detail: `Tier ${tier} subscription rate, prorated for ${billingDays.toFixed(0)} days`,
    },
    fuelLine(asset, readings, hours),
  ];

  if (profile) {
    lines.push({
      asset,
      item: 'Operator time',
      amountAed: hours > 0 ? hours * profile.operatorCostPerHourAed : null,
      basis: hours > 0 ? 'Dummy rate' : 'Not measured',
      detail: hours > 0 ? `${hours.toFixed(1)} estimated ignition hours × AED ${profile.operatorCostPerHourAed}/h` : 'No ignition hours in the selected period',
    });
    lines.push({ asset, item: 'Finance', amountAed: profile.monthlyFinanceAed * billingDays / 30, basis: 'Dummy rate', detail: `${billingDays.toFixed(0)} days of monthly finance cost` });
    lines.push({ asset, item: 'Insurance', amountAed: profile.insurancePerMonthAed * billingDays / 30, basis: 'Dummy rate', detail: `${billingDays.toFixed(0)} days of monthly insurance cost` });
  } else {
    for (const item of ['Operator time', 'Finance', 'Insurance']) {
      lines.push({ asset, item, amountAed: null, basis: 'Not measured', detail: 'No cost profile is available' });
    }
  }

  const records = seed.serviceRecords.filter(record =>
    record.assetId === asset.id && toMillis(record.doneAt) >= from && toMillis(record.doneAt) <= now
  );
  lines.push({
    asset,
    item: 'Service work',
    amountAed: records.length ? records.reduce((sum, record) => sum + record.costAed, 0) : 0,
    basis: 'From service log',
    detail: records.length ? `${records.length} service record${records.length === 1 ? '' : 's'}` : 'No service records in this period',
  });

  const bookingIds = new Set(seed.bookings.filter(booking => booking.assetId === asset.id).map(booking => booking.id));
  const invoices = seed.invoices.filter(invoice => invoice.bookingId && bookingIds.has(invoice.bookingId) && toMillis(invoice.issuedAt) >= from && toMillis(invoice.issuedAt) <= now);
  lines.push({
    asset,
    item: 'Invoice total',
    amountAed: invoices.length ? invoices.reduce((sum, invoice) => sum + invoice.totalAed, 0) : 0,
    basis: 'From invoices',
    detail: invoices.length ? `${invoices.length} related invoice${invoices.length === 1 ? '' : 's'}` : 'No related invoices in this period',
  });
  return lines;
}

function sessionTenantMatches(profileTenantId: string, asset: Asset): boolean {
  return profileTenantId === asset.ownerTenantId;
}

function formatAed(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'Not measured' : `AED ${value.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CostPage() {
  const session = useStore(state => state.session);
  const phase = useStore(state => state.demoSwitches.phase);
  const now = clock.now();
  const visibleAssets = useMemo(() => {
    if (!session || !can(session, 'cost.view')) return [];
    return seed.assets.filter(asset => {
      if (asset.retiredAt || !isAssetVisible(session, asset.id) || !can(session, 'asset.view', asset.id)) return false;
      return session.isKasper || asset.ownerTenantId === session.tenantId;
    });
  }, [session]);
  const lines = useMemo(() => visibleAssets.flatMap(asset => costLinesForAsset(asset, now)), [now, visibleAssets]);
  const measuredTotal = lines.reduce((sum, line) => sum + (line.amountAed ?? 0), 0);

  if (!session) return null;
  if (phase !== 'later') {
    return <div className="space-y-4"><h1 className="text-lg font-semibold text-ink">Cost &amp; ROI</h1><EmptyState title="Not available" description="Cost & ROI is available in the Later phase." /></div>;
  }
  if (!can(session, 'cost.view')) {
    return <EmptyState title="Access denied" description="You do not have permission to view cost information." />;
  }
  if (visibleAssets.length === 0) {
    return <div className="space-y-4"><h1 className="text-lg font-semibold text-ink">Cost &amp; ROI</h1><EmptyState title="No asset costs" description="No owned assets with cost information are available to you." /></div>;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Cost &amp; ROI</h1>
          <p className="mt-1 text-sm text-grey-500">Cost lines for the last 7 days. Estimates and dummy rates are labelled.</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-grey-500">Total of available lines</div>
          <div className="font-mono text-lg font-semibold text-ink">AED {measuredTotal.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-paper-2 text-left text-xs text-grey-500">
                <th className="px-3 py-2">Asset</th>
                <th className="px-3 py-2">Cost line</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Basis</th>
                <th className="px-3 py-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((line, index) => (
                <tr key={`${line.asset.id}-${line.item}-${index}`}>
                  <td className="whitespace-nowrap px-3 py-2"><span className="font-mono font-medium text-ink">{line.asset.code}</span><span className="ml-2 text-grey-500">{line.asset.name}</span></td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">{line.item}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-ink">{formatAed(line.amountAed)}</td>
                  <td className="whitespace-nowrap px-3 py-2"><SourceLabel source={line.basis} /></td>
                  <td className="px-3 py-2 text-xs text-grey-500">{line.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-grey-500">Fuel and operator estimates use ignition data where available. No Tier 1 fuel cost is shown as zero.</p>
    </div>
  );
}
