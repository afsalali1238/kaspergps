'use client';

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import {
  Button, Badge, EmptyState, Sheet, SourceLabel,
} from '@/components/ui';
import { useStore } from '@/store';
import {
  canViewCost, costRows, getDieselPrice, monthlySeries, periodRange, roiFor, saveCostProfile, setDieselPrice,
  type AssetCostRow, type CostPeriod,
} from '@/server/cost';
import { downloadPdf, downloadXlsx, type ExportTable } from '@/lib/export';
import { companyDieselPriceStorageKey, DEFAULT_DIESEL_PRICE_AED_PER_L, parseDieselPrice } from '@/domain/cost';

const PERIODS: { id: CostPeriod; label: string }[] = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_3_months', label: 'Last 3 months' },
  { id: 'last_6_months', label: 'Last 6 months' },
];

type SortKey = 'code' | 'revenueAed' | 'fuelAed' | 'idleAed' | 'maintenanceAed' | 'fixedAed' | 'operatorAed' | 'costAed' | 'marginAed' | 'marginPct' | 'utilisationPct';

const money = (value: number | null) => (value === null ? null : Math.round(value).toLocaleString('en-US'));
const hasUnmeasuredOptionalCost = (row: AssetCostRow) => row.lines.some(line =>
  ['idle', 'fixed', 'operator'].includes(line.key) && line.amountAed === null,
);

function Amount({ value }: { value: number | null }) {
  if (value === null) return <span className="text-grey-500 italic text-xs">Not measured</span>;
  return <span className="font-mono text-grey-700">{value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>;
}

export default function CostPage() {
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  const [period, setPeriod] = useState<CostPeriod>('last_month');
  const [sortKey, setSortKey] = useState<SortKey>('marginAed');
  const [sortAsc, setSortAsc] = useState(false);
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const [priceReady, setPriceReady] = useState(false);

  const show = (tone: 'ok' | 'error', text: string) => {
    setToast({ tone, text });
    setDataRevision(v => v + 1);
  };

  React.useEffect(() => {
    if (!session || !canViewCost(session) || typeof window === 'undefined') return;
    try {
      const storedPrice = parseDieselPrice(window.localStorage.getItem(companyDieselPriceStorageKey(session.tenantId)));
      const companyPrice = storedPrice ?? DEFAULT_DIESEL_PRICE_AED_PER_L;
      if (getDieselPrice() !== companyPrice) {
        const result = setDieselPrice(session, companyPrice);
        if (result.ok) setDataRevision(v => v + 1);
      }
    } catch {
      // Fall back to the published dummy rate if browser storage is blocked.
      if (getDieselPrice() !== DEFAULT_DIESEL_PRICE_AED_PER_L) {
        const result = setDieselPrice(session, DEFAULT_DIESEL_PRICE_AED_PER_L);
        if (result.ok) setDataRevision(v => v + 1);
      }
    } finally {
      setPriceReady(true);
    }
  }, [session]);

  const range = useMemo(() => periodRange(period), [period]);
  const rows = useMemo(
    () => (session && canViewCost(session) ? costRows(session, range.fromMs, range.toMs) : []),
    [session, range.fromMs, range.toMs, dataRevision],
  );

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const av = sortKey === 'code' ? a.asset.code : a[sortKey as Exclude<SortKey, 'code'>];
      const bv = sortKey === 'code' ? b.asset.code : b[sortKey as Exclude<SortKey, 'code'>];
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av ?? '').localeCompare(String(bv ?? '')) * (sortAsc ? 1 : -1);
      }
      const an = av ?? Number.NEGATIVE_INFINITY;
      const bn = bv ?? Number.NEGATIVE_INFINITY;
      return (an === bn ? 0 : an < bn ? -1 : 1) * (sortAsc ? 1 : -1);
    });
    return list;
  }, [rows, sortKey, sortAsc]);

  const totals = useMemo(() => {
    const sumOptional = (values: (number | null)[]) => values.some(value => value === null)
      ? null
      : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const revenue = rows.reduce((sum, row) => sum + row.revenueAed, 0);
    const cost = rows.reduce((sum, row) => sum + row.costAed, 0);
    return {
      revenue,
      cost,
      fuel: sumOptional(rows.map(row => row.fuelAed)),
      idle: sumOptional(rows.map(row => row.idleAed)),
      maintenance: rows.reduce((sum, row) => sum + row.maintenanceAed, 0),
      fixed: sumOptional(rows.map(row => row.fixedAed)),
      operator: sumOptional(rows.map(row => row.operatorAed)),
      margin: revenue - cost,
      hasUnmeasuredCosts: rows.some(hasUnmeasuredOptionalCost),
    };
  }, [rows]);

  if (!session) return null;

  if (phase !== 'later') {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold text-ink mb-4">Cost &amp; ROI</h1>
        <EmptyState
          title="Not available"
          description="Cost & ROI arrives in the Later phase. Switch the demo bar to Later to see it."
        />
      </div>
    );
  }

  // Renters, Site Users and Kasper Ops never see this page (spec 11.19).
  if (!canViewCost(session)) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="text-sm font-semibold text-ink">Page not found</div>
          <div className="text-sm text-grey-500 mt-1">This page isn&apos;t available for your role.</div>
        </div>
      </div>
    );
  }

  if (!priceReady) {
    return <div className="p-4 text-sm text-grey-500">Loading cost inputs…</div>;
  }

  const openRow = sorted.find(r => r.asset.id === openAssetId) ?? null;

  const fleetTable: ExportTable = {
    title: `Cost & ROI — ${range.label}`,
    columns: ['Asset', 'Revenue', 'Fuel', 'Idle', 'Maintenance', 'Fixed', 'Operator', 'Known cost total*', 'Known margin*', 'Margin %*', 'Utilisation %'],
    rows: sorted.map(r => [
      r.asset.code, money(r.revenueAed) ?? 'Not measured', money(r.fuelAed) ?? 'Not measured',
      money(r.idleAed) ?? 'Not measured', money(r.maintenanceAed) ?? '0', money(r.fixedAed) ?? 'Not measured',
      money(r.operatorAed) ?? 'Not measured', `${money(r.costAed) ?? '0'}${hasUnmeasuredOptionalCost(r) ? '*' : ''}`,
      `${money(r.marginAed) ?? '0'}${hasUnmeasuredOptionalCost(r) ? '*' : ''}`,
      r.marginPct === null ? '—' : `${r.marginPct}${hasUnmeasuredOptionalCost(r) ? '*' : ''}`, r.utilisationPct,
    ]),
  };
  const fleetMeta = { fileName: 'kasper-cost-roi', subtitle: `Fleet view · ${range.label} · dummy rates · * Known totals exclude Not measured lines` };

  const header = (label: string, key: SortKey, align: 'left' | 'right' = 'right') => (
    <th className={clsx('px-3 py-2 font-medium', align === 'left' ? 'text-left' : 'text-right')}>
      <button
        className="hover:text-ink"
        onClick={() => {
          if (sortKey === key) setSortAsc(!sortAsc);
          else { setSortKey(key); setSortAsc(false); }
        }}
      >
        {label}{sortKey === key && (sortAsc ? ' ↑' : ' ↓')}
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-ink">Cost &amp; ROI</h1>
            <Badge variant="grey">Draft</Badge>
          </div>
            <p className="mt-1 text-sm text-grey-500">
              Planning estimates only — not billing-grade. Every cost line shows its basis.
            </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => downloadXlsx(fleetMeta, [fleetTable])}>Excel</Button>
          <Button variant="secondary" size="sm" onClick={() => downloadPdf(fleetMeta, [fleetTable])}>PDF</Button>
        </div>
      </div>

      {/* Period picker — last month by default */}
      <div className="flex items-center gap-2 flex-wrap">
        {PERIODS.map(p => (
          <Button
            key={p.id}
            size="sm"
            variant={period === p.id ? 'primary' : 'secondary'}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </Button>
        ))}
        <span className="ml-auto flex items-center gap-2 text-xs text-grey-500">{range.label} · diesel AED {getDieselPrice().toFixed(2)}/L (dummy) <Link href="/app/settings" className="underline underline-offset-2 hover:text-ink">Change in Settings</Link></span>
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

      {/* Fleet view */}
      <div className="bg-surface border border-line rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-paper-2 text-grey-500">
              {header('Asset', 'code', 'left')}
              {header('Revenue', 'revenueAed')}
              {header('Fuel', 'fuelAed')}
              {header('Idle', 'idleAed')}
              {header('Maintenance', 'maintenanceAed')}
              {header('Fixed', 'fixedAed')}
              {header('Operator', 'operatorAed')}
              {header('Known cost', 'costAed')}
              {header('Known margin*', 'marginAed')}
              {header('Margin %*', 'marginPct')}
              {header('Utilisation', 'utilisationPct')}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr
                key={r.asset.id}
                className="bg-paper hover:bg-paper-2 cursor-pointer"
                onClick={() => setOpenAssetId(r.asset.id)}
              >
                <td className="px-3 py-2 border-b border-line">
                  <div className="font-medium text-ink">{r.asset.code}</div>
                  <div className="text-grey-500">{r.asset.name}</div>
                </td>
                <td className="px-3 py-2 border-b border-line text-right">
                  <div><Amount value={r.revenueAed} /></div>
                  <SourceLabel source="From invoices" className="mt-0.5" />
                </td>
                <td className="px-3 py-2 border-b border-line text-right">
                  <div><Amount value={r.fuelAed} /></div>
                  <SourceLabel source={r.lines.find(l => l.key === 'fuel')?.basis ?? 'Not measured'} className="mt-0.5" />
                </td>
                <td className="px-3 py-2 border-b border-line text-right">
                  <div><Amount value={r.idleAed} /></div>
                  <SourceLabel source={r.lines.find(l => l.key === 'idle')?.basis ?? 'Not measured'} className="mt-0.5" />
                </td>
                <td className="px-3 py-2 border-b border-line text-right">
                  <div><Amount value={r.maintenanceAed} /></div>
                  <SourceLabel source="From service log" className="mt-0.5" />
                </td>
                <td className="px-3 py-2 border-b border-line text-right">
                  <div><Amount value={r.fixedAed} /></div>
                  <SourceLabel source={r.fixedAed === null ? 'Not measured' : 'Dummy rate'} className="mt-0.5" />
                </td>
                <td className="px-3 py-2 border-b border-line text-right">
                  <div><Amount value={r.operatorAed} /></div>
                  <SourceLabel source={r.operatorAed === null ? 'Not measured' : 'Dummy rate'} className="mt-0.5" />
                </td>
                <td className="px-3 py-2 border-b border-line text-right font-mono text-ink" title="Measured and estimated amounts only; Not measured lines are excluded.">
                  {money(r.costAed)}{hasUnmeasuredOptionalCost(r) ? '*' : ''}
                  {hasUnmeasuredOptionalCost(r) && <div className="text-[10px] font-sans text-grey-500">Known costs</div>}
                </td>
                <td className={clsx('px-3 py-2 border-b border-line text-right font-mono', r.marginAed < 0 ? 'text-red' : 'text-green')} title="Known margin before any Not measured costs.">
                  {money(r.marginAed)}{hasUnmeasuredOptionalCost(r) ? '*' : ''}
                </td>
                <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700" title={hasUnmeasuredOptionalCost(r) ? 'Known margin percentage before Not measured costs.' : undefined}>
                  {r.marginPct === null ? '—' : `${r.marginPct}%${hasUnmeasuredOptionalCost(r) ? '*' : ''}`}
                </td>
                <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">{r.utilisationPct}%</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr className="bg-paper">
                <td colSpan={11} className="px-3 py-8 text-center text-sm text-grey-500">
                  No assets to cost yet.
                </td>
              </tr>
            )}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr className="bg-paper-2 text-ink font-medium">
                <td className="px-3 py-2">Totals ({sorted.length} assets)</td>
                <td className="px-3 py-2 text-right font-mono">{money(totals.revenue)}</td>
                <td className="px-3 py-2 text-right font-mono">{money(totals.fuel)}</td>
                <td className="px-3 py-2 text-right font-mono">{money(totals.idle)}</td>
                <td className="px-3 py-2 text-right font-mono">{money(totals.maintenance)}</td>
                <td className="px-3 py-2 text-right font-mono">{money(totals.fixed)}</td>
                <td className="px-3 py-2 text-right font-mono">{money(totals.operator)}</td>
                <td className="px-3 py-2 text-right font-mono" title="Known costs only; Not measured lines are excluded.">{money(totals.cost)}{totals.hasUnmeasuredCosts ? '*' : ''}</td>
                <td className={clsx('px-3 py-2 text-right font-mono', totals.margin < 0 ? 'text-red' : 'text-green')} title="Known margin before any Not measured costs.">
                  {money(totals.margin)}{totals.hasUnmeasuredCosts ? '*' : ''}
                </td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-grey-500">
        Click an asset for its six-month chart, ROI and cost inputs. Lines with no basis read “Not measured”, never 0. An asterisk marks known costs and margin before unmeasured lines are included.
      </p>

      {openRow && (
        <AssetCostSheet
          row={openRow}
          onClose={() => setOpenAssetId(null)}
          onResult={show}
          session={session}
        />
      )}
    </div>
  );
}

// ── Asset view ─────────────────────────────────────────────────────────────────

type Session = NonNullable<ReturnType<typeof useStore.getState>['session']>;

function AssetCostSheet({ row, session, onClose, onResult }: {
  row: AssetCostRow;
  session: Session;
  onClose: () => void;
  onResult: (tone: 'ok' | 'error', text: string) => void;
}) {
  const asset = row.asset;
  const roi = roiFor(asset);
  const series = monthlySeries(asset, 6);
  const max = Math.max(1, ...series.map(p => Math.max(p.revenueAed, p.costAed)));
  const profile = row.profile;
  const hasUnmeasuredCosts = hasUnmeasuredOptionalCost(row);
  const roiHasPurchaseValue = Boolean(profile && profile.purchaseValueAed > 0);
  const roiNote = profile && profile.purchaseValueAed <= 0
    ? 'Add a purchase value greater than AED 0 to calculate ROI.'
    : roi.note;
  const [purchaseValue, setPurchaseValue] = useState(String(profile?.purchaseValueAed ?? ''));
  const [finance, setFinance] = useState(String(profile?.monthlyFinanceAed ?? ''));
  const [operatorRate, setOperatorRate] = useState(String(profile?.operatorCostPerHourAed ?? ''));
  const [insurance, setInsurance] = useState(String(profile?.insurancePerMonthAed ?? ''));

  return (
    <Sheet open onClose={onClose} title={`${asset.code} · ${asset.name}`} width="lg">
      <div className="space-y-5">
        {/* Six-month chart */}
        <div>
          <h2 className="text-sm font-medium text-ink mb-2">Revenue vs known cost* — last 6 months</h2>
          <div className="flex items-end gap-3 h-32">
            {series.map(p => (
              <div key={p.label} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                <div className="flex items-end gap-0.5 h-full">
                  <div
                    className="w-3 bg-green/60 rounded-t"
                    style={{ height: `${(p.revenueAed / max) * 100}%` }}
                    title={`Revenue ${p.revenueAed.toLocaleString('en-US')}`}
                  />
                  <div
                    className="w-3 bg-red/50 rounded-t"
                    style={{ height: `${(p.costAed / max) * 100}%` }}
                    title={`Cost ${p.costAed.toLocaleString('en-US')}`}
                  />
                </div>
                <span className="text-[10px] text-grey-500">{p.label}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 text-[11px] text-grey-500 mt-2">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-green/60 rounded-sm" /> Revenue</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-red/50 rounded-sm" /> Known cost*</span>
          </div>
          <p className="mt-1 text-[11px] text-grey-500">* Known costs omit lines marked Not measured.</p>
        </div>

        {/* ROI */}
        <div className="bg-surface border border-line rounded-lg p-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-grey-500">ROI to date{hasUnmeasuredCosts ? '*' : ''}</div>
            <div className="text-lg font-semibold text-ink">
              {roi.roiPct === null || !roiHasPurchaseValue ? 'Not enough data' : `${roi.roiPct}%${hasUnmeasuredCosts ? '*' : ''}`}
            </div>
          </div>
          <div>
            <div className="text-xs text-grey-500">Payback estimate{hasUnmeasuredCosts ? '*' : ''}</div>
            <div className="text-lg font-semibold text-ink">
              {roi.paybackMonths === null || !roiHasPurchaseValue ? 'Not enough data' : `${roi.paybackMonths} months${hasUnmeasuredCosts ? '*' : ''}`}
            </div>
          </div>
          <p className="col-span-2 text-[11px] text-grey-500">{roiNote}{hasUnmeasuredCosts ? ' * Known ROI and payback exclude lines marked Not measured.' : ''}</p>
        </div>

        {/* Cost lines */}
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-line text-sm font-medium text-ink">Cost lines</div>
          <table className="w-full text-xs">
            <tbody>
              {row.lines.map(line => (
                <tr key={line.key} className="bg-paper">
                  <td className="px-3 py-2 border-b border-line text-grey-700">{line.label}</td>
                  <td className="px-3 py-2 border-b border-line text-right">
                    <Amount value={line.amountAed} />
                  </td>
                  <td className="px-3 py-2 border-b border-line">
                    <SourceLabel source={line.basis} />
                  </td>
                  <td className="px-3 py-2 border-b border-line text-grey-500">{line.note}</td>
                </tr>
              ))}
              <tr className="bg-paper-2">
                <td className="px-3 py-2 font-medium text-ink">{hasUnmeasuredCosts ? 'Known margin*' : 'Margin'}</td>
                <td className={clsx('px-3 py-2 text-right font-mono', row.marginAed < 0 ? 'text-red' : 'text-green')}>
                  {money(row.marginAed)}{hasUnmeasuredCosts ? '*' : ''}
                </td>
                <td className="px-3 py-2 text-grey-500" colSpan={2}>
                  {row.marginPct === null ? 'No revenue in this period' : `${row.marginPct}%${hasUnmeasuredCosts ? '*' : ''} of revenue`}
                  {' · '}utilisation {row.utilisationPct}%{hasUnmeasuredCosts ? ' · excludes Not measured costs' : ''}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-ink">Cost inputs {profile ? '' : '— this asset has no profile yet'}</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-grey-500 block">
              Purchase value (AED)
              <input value={purchaseValue} onChange={e => setPurchaseValue(e.target.value)} inputMode="decimal"
                className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink" />
            </label>
            <label className="text-xs text-grey-500 block">
              Finance per month (AED)
              <input value={finance} onChange={e => setFinance(e.target.value)} inputMode="decimal"
                className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink" />
            </label>
            <label className="text-xs text-grey-500 block">
              Operator rate (AED/h)
              <input value={operatorRate} onChange={e => setOperatorRate(e.target.value)} inputMode="decimal"
                className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink" />
            </label>
            <label className="text-xs text-grey-500 block">
              Insurance per month (AED)
              <input value={insurance} onChange={e => setInsurance(e.target.value)} inputMode="decimal"
                className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink" />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Button
              size="sm"
              onClick={() => {
                const rawValues = [purchaseValue, finance, operatorRate, insurance];
                if (rawValues.some(value => value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0)) {
                  onResult('error', 'Enter a non-negative value for each cost input. Use 0 when there is no cost.');
                  return;
                }
                const result = saveCostProfile(session, {
                  assetId: asset.id,
                  purchaseValueAed: Number(purchaseValue),
                  monthlyFinanceAed: Number(finance),
                  operatorCostPerHourAed: Number(operatorRate),
                  insurancePerMonthAed: Number(insurance),
                });
                onResult(result.ok ? 'ok' : 'error', result.ok ? result.message! : result.error!);
              }}
            >
              Save cost profile
            </Button>
            <Link href="/app/settings" className="text-xs text-grey-700 underline underline-offset-2 hover:text-ink">Diesel price in Settings</Link>
          </div>
          <p className="text-[11px] text-grey-500">
            Purchase value drives ROI and payback; finance and insurance are pro-rated to the period. All rates are dummy. The chart excludes lines marked Not measured.
          </p>
        </div>

        <div className="flex gap-2">
          <Link href={`/app/assets/${asset.id}`}>
            <Button variant="secondary" size="sm">Open asset</Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Sheet>
  );
}
