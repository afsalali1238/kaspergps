'use client';

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import {
  Button, Badge, EmptyState, Sheet, SourceLabel,
} from '@/components/ui';
import {
  canViewCost, costRows, getDieselPrice, monthlySeries, periodRange, roiFor, saveCostProfile,
  setDieselPrice, type AssetCostRow, type CostPeriod,
} from '@/server/cost';
import { downloadPdf, downloadXlsx, type ExportTable } from '@/lib/export';
import { useT } from '@/i18n';
import { useSession, useSwitches } from '@/hooks';

const PERIODS: { id: CostPeriod; label: string }[] = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_3_months', label: 'Last 3 months' },
  { id: 'last_6_months', label: 'Last 6 months' },
];

type SortKey = 'code' | 'revenueAed' | 'fuelAed' | 'idleAed' | 'maintenanceAed' | 'fixedAed' | 'operatorAed' | 'costAed' | 'marginAed' | 'marginPct' | 'utilisationPct';

const money = (value: number | null) => (value === null ? null : Math.round(value).toLocaleString('en-US'));

function Amount({ value }: { value: number | null }) {
  const t = useT();
  if (value === null) return <span className="text-grey-500 italic text-xs">{t('common.not_measured', 'Not measured')}</span>;
  return <span className="font-mono text-grey-700">{value.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>;
}

export default function CostPage() {
  const t = useT();
  const session = useSession();
  const { phase } = useSwitches();

  const [period, setPeriod] = useState<CostPeriod>('last_month');
  const [sortKey, setSortKey] = useState<SortKey>('marginAed');
  const [sortAsc, setSortAsc] = useState(false);
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [, setVersion] = useState(0);

  const show = (tone: 'ok' | 'error', text: string) => {
    setToast({ tone, text });
    setVersion(v => v + 1);
  };

  const range = useMemo(() => periodRange(period), [period]);
  const rows = useMemo(
    () => (session && canViewCost(session) ? costRows(session, range.fromMs, range.toMs) : []),
    [session, range.fromMs, range.toMs],
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

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    revenue: acc.revenue + r.revenueAed,
    cost: acc.cost + r.costAed,
    fuel: acc.fuel + (r.fuelAed ?? 0),
    idle: acc.idle + (r.idleAed ?? 0),
    maintenance: acc.maintenance + r.maintenanceAed,
    fixed: acc.fixed + (r.fixedAed ?? 0),
    operator: acc.operator + (r.operatorAed ?? 0),
  }), { revenue: 0, cost: 0, fuel: 0, idle: 0, maintenance: 0, fixed: 0, operator: 0 }), [rows]);

  if (!session) return null;

  if (phase !== 'later') {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold text-ink mb-4">{t('cost.title', 'Cost & ROI')}</h1>
        <EmptyState
          title={t('cost.not_available', 'Not available')}
          description={t('cost.phase_description', 'Cost & ROI arrives in the Later phase. Switch the demo bar to Later to see it.')}
        />
      </div>
    );
  }

  // Renters, Site Users and Kasper Ops never see this page (spec 11.19).
  if (!canViewCost(session)) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="text-sm font-semibold text-ink">{t('common.page_not_found', 'Page not found')}</div>
          <div className="text-sm text-grey-500 mt-1">{t('cost.not_for_role', "This page isn't available for your role.")}</div>
        </div>
      </div>
    );
  }

  const openRow = sorted.find(r => r.asset.id === openAssetId) ?? null;

  const fleetTable: ExportTable = {
    title: `Cost & ROI — ${range.label}`,
    columns: ['Asset', 'Revenue', 'Fuel', 'Idle', 'Maintenance', 'Fixed', 'Operator', 'Total cost', 'Margin', 'Margin %', 'Utilisation %'],
    rows: sorted.map(r => [
      r.asset.code, money(r.revenueAed) ?? 'Not measured', money(r.fuelAed) ?? 'Not measured',
      money(r.idleAed) ?? 'Not measured', money(r.maintenanceAed) ?? '0', money(r.fixedAed) ?? 'Not measured',
      money(r.operatorAed) ?? 'Not measured', money(r.costAed) ?? '0', money(r.marginAed) ?? '0',
      r.marginPct === null ? '—' : r.marginPct, r.utilisationPct,
    ]),
  };
  const fleetMeta = { fileName: 'kasper-cost-roi', subtitle: `Fleet view · ${range.label} · dummy rates` };

  const header = (label: string, key: SortKey, align: 'left' | 'right' = 'right') => (
    <th className={clsx('px-3 py-2 font-medium', align === 'left' ? 'text-start' : 'text-end')}>
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
            <h1 className="text-lg font-semibold text-ink">{t('cost.title', 'Cost & ROI')}</h1>
            <Badge variant="grey">{t('cost.draft_tag', 'Draft')}</Badge>
          </div>
          <p className="text-sm text-grey-500 mt-1">
            {t('cost.subtitle', 'What each asset earned and what it cost to run. Rates are dummy; every line says where its number came from.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => downloadXlsx(fleetMeta, [fleetTable])}>{t('cost.excel', 'Excel')}</Button>
          <Button variant="secondary" size="sm" onClick={() => downloadPdf(fleetMeta, [fleetTable])}>{t('cost.pdf', 'PDF')}</Button>
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
            {t(`cost.${p.id}`, p.label)}
          </Button>
        ))}
        <span className="text-xs text-grey-500 ms-auto">{range.label} · diesel AED {getDieselPrice().toFixed(2)}/L (dummy)</span>
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
              {header(t('cost.columns.asset', 'Asset'), 'code', 'left')}
              {header(t('cost.columns.revenue', 'Revenue'), 'revenueAed')}
              {header(t('cost.columns.fuel', 'Fuel'), 'fuelAed')}
              {header(t('cost.columns.idle', 'Idle'), 'idleAed')}
              {header(t('cost.columns.maintenance', 'Maintenance'), 'maintenanceAed')}
              {header(t('cost.columns.fixed', 'Fixed'), 'fixedAed')}
              {header(t('cost.columns.operator', 'Operator'), 'operatorAed')}
              {header(t('cost.columns.total_cost', 'Total cost'), 'costAed')}
              {header(t('cost.columns.margin', 'Margin'), 'marginAed')}
              {header(t('cost.columns.margin_pct', 'Margin %'), 'marginPct')}
              {header(t('cost.columns.utilisation', 'Utilisation'), 'utilisationPct')}
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
                  <SourceLabel source={r.lines.find(l => l.key === 'fuel')!.basis === 'ECU (ALL-CAN300)' ? 'ECU (ALL-CAN300)' : 'Estimated'} className="mt-0.5" />
                </td>
                <td className="px-3 py-2 border-b border-line text-right">
                  <div><Amount value={r.idleAed} /></div>
                  <SourceLabel source={r.idleAed === null ? 'Not measured' : 'ECU (ALL-CAN300)'} className="mt-0.5" />
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
                <td className="px-3 py-2 border-b border-line text-right font-mono text-ink">
                  {money(r.costAed)}
                </td>
                <td className={clsx('px-3 py-2 border-b border-line text-right font-mono', r.marginAed < 0 ? 'text-red' : 'text-green')}>
                  {money(r.marginAed)}
                </td>
                <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">
                  {r.marginPct === null ? '—' : `${r.marginPct}%`}
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
                <td className="px-3 py-2 text-right font-mono">{money(totals.cost)}</td>
                <td className={clsx('px-3 py-2 text-right font-mono', totals.revenue - totals.cost < 0 ? 'text-red' : 'text-green')}>
                  {money(totals.revenue - totals.cost)}
                </td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-grey-500">
        Click an asset for its six-month chart, ROI and cost inputs. Lines with no basis read “Not measured”, never 0.
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

type Session = NonNullable<ReturnType<typeof useSession>>;

function AssetCostSheet({ row, session, onClose, onResult }: {
  row: AssetCostRow;
  session: Session;
  onClose: () => void;
  onResult: (tone: 'ok' | 'error', text: string) => void;
}) {
  const t = useT();
  const asset = row.asset;
  const roi = roiFor(asset);
  const series = monthlySeries(asset, 6);
  const max = Math.max(1, ...series.map(p => Math.max(p.revenueAed, p.costAed)));
  const profile = row.profile;
  const [purchaseValue, setPurchaseValue] = useState(String(profile?.purchaseValueAed ?? ''));
  const [finance, setFinance] = useState(String(profile?.monthlyFinanceAed ?? ''));
  const [operatorRate, setOperatorRate] = useState(String(profile?.operatorCostPerHourAed ?? ''));
  const [insurance, setInsurance] = useState(String(profile?.insurancePerMonthAed ?? ''));
  const [diesel, setDiesel] = useState(String(getDieselPrice()));

  return (
    <Sheet open onClose={onClose} title={t('cost.roi_drawer_title', `ROI — ${asset.code}`).replace('{code}', asset.code)} width="lg">
      <div className="space-y-5">
        {/* Six-month chart */}
        <div>
          <h2 className="text-sm font-medium text-ink mb-2">{t('cost.roi_cumulative', 'Revenue vs cost — last 6 months')}</h2>
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
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-red/50 rounded-sm" /> Cost</span>
          </div>
        </div>

        {/* ROI */}
        <div className="bg-surface border border-line rounded-lg p-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-grey-500">{t('cost.roi_percentage', 'ROI to date')}</div>
            <div className="text-lg font-semibold text-ink">
              {roi.roiPct === null ? t('cost.not_enough_data', 'Not enough data') : `${roi.roiPct}%`}
            </div>
          </div>
          <div>
            <div className="text-xs text-grey-500">{t('cost.roi_payback', 'Payback estimate')}</div>
            <div className="text-lg font-semibold text-ink">
              {roi.paybackMonths === null ? t('cost.not_enough_data', 'Not enough data') : t('cost.roi_payback_months', `${roi.paybackMonths} months`).replace('{months}', String(roi.paybackMonths))}
            </div>
          </div>
          <p className="col-span-2 text-[11px] text-grey-500">{roi.note}</p>
        </div>

        {/* Cost lines */}
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-line text-sm font-medium text-ink">{t('cost.columns.total_cost', 'Cost lines')}</div>
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
                <td className="px-3 py-2 font-medium text-ink">Margin</td>
                <td className={clsx('px-3 py-2 text-right font-mono', row.marginAed < 0 ? 'text-red' : 'text-green')}>
                  {money(row.marginAed)}
                </td>
                <td className="px-3 py-2 text-grey-500" colSpan={2}>
                  {row.marginPct === null ? 'No revenue in this period' : `${row.marginPct}% of revenue`}
                  {' · '}utilisation {row.utilisationPct}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-ink">{t('cost.roi_edit_profile', 'Cost inputs')}</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-grey-500 block">
              {t('cost.roi_profile_purchase', 'Purchase value (AED)')}
              <input value={purchaseValue} onChange={e => setPurchaseValue(e.target.value)} inputMode="decimal"
                className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink" />
            </label>
            <label className="text-xs text-grey-500 block">
              {t('cost.roi_profile_finance', 'Finance per month (AED)')}
              <input value={finance} onChange={e => setFinance(e.target.value)} inputMode="decimal"
                className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink" />
            </label>
            <label className="text-xs text-grey-500 block">
              {t('cost.roi_profile_operator', 'Operator rate (AED/h)')}
              <input value={operatorRate} onChange={e => setOperatorRate(e.target.value)} inputMode="decimal"
                className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink" />
            </label>
            <label className="text-xs text-grey-500 block">
              {t('cost.roi_profile_insurance', 'Insurance per month (AED)')}
              <input value={insurance} onChange={e => setInsurance(e.target.value)} inputMode="decimal"
                className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink" />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Button
              size="sm"
              onClick={() => {
                const result = saveCostProfile(session, {
                  assetId: asset.id,
                  purchaseValueAed: Number(purchaseValue || 0),
                  monthlyFinanceAed: Number(finance || 0),
                  operatorCostPerHourAed: Number(operatorRate || 0),
                  insurancePerMonthAed: Number(insurance || 0),
                });
                onResult(result.ok ? 'ok' : 'error', result.ok ? t('cost.roi_profile_saved', result.message!) : result.error!);
              }}
            >
              {t('cost.roi_profile_save', 'Save cost profile')}
            </Button>
            <label className="text-xs text-grey-500">
              Diesel price (AED/L, company setting)
              <span className="flex items-center gap-2 mt-1">
                <input value={diesel} onChange={e => setDiesel(e.target.value)} inputMode="decimal"
                  className="w-24 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink" />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const result = setDieselPrice(session, Number(diesel));
                    onResult(result.ok ? 'ok' : 'error', result.ok ? result.message! : result.error!);
                  }}
                >
                  Set price
                </Button>
              </span>
            </label>
          </div>
          <p className="text-[11px] text-grey-500">
            {t('cost.roi_calc', 'Purchase value drives ROI and payback; finance and insurance are pro-rated to the period. All rates are dummy.')}
          </p>
        </div>

        <div className="flex gap-2">
          <Link href={`/app/assets/${asset.id}`}>
            <Button variant="secondary" size="sm">{t('common.open', 'Open asset')}</Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={onClose}>{t('common.close', 'Close')}</Button>
        </div>
      </div>
    </Sheet>
  );
}
