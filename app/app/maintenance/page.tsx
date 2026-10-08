'use client';

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import {
  Button, Badge, EmptyState, Sheet, SourceLabel,
} from '@/components/ui';
import { useStore } from '@/store';
import type { MaintenancePlan } from '@/domain/types';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { visibleAssetIds } from '@/server/access';
import {
  boardFor, canManageMaintenance, createTaskFromFault, currentMeter, logService, maintenanceAlerts,
  openTasks, planSnapshot, plansVisibleTo, savePlan, serviceHistory, type PlanSnapshot,
} from '@/server/maintenance';
import { tierForAsset } from '@/domain/features';
import { downloadPdf, downloadXlsx, type ExportTable } from '@/lib/export';
import { useT } from '@/i18n';

type View = 'board' | 'table';

function stateBadge(state: PlanSnapshot['state'], t: (key: string, fallback: string) => string): React.ReactNode {
  if (state === 'overdue') return <Badge variant="red" dot>{t('maintenance.overdue', 'Overdue')}</Badge>;
  if (state === 'due_soon') return <Badge variant="amber" dot>{t('maintenance.due_soon', 'Due soon')}</Badge>;
  return <Badge variant="green" dot>{t('maintenance.ok', 'Ok')}</Badge>;
}

/** Basis chips use the same vocabulary as Cost & ROI. */
function basisChip(snapshot: PlanSnapshot): React.ReactNode {
  if (snapshot.plan.basis === 'days') return <SourceLabel source="Days on hire" />;
  if (snapshot.plan.basis === 'km') return <SourceLabel source={snapshot.plan.kmSource === 'can' ? 'ECU (ALL-CAN300)' : 'GPS distance'} />;
  if (snapshot.plan.hoursSource === 'estimated') return <SourceLabel source="Estimated" />;
  if (snapshot.asset.canProfile.adapter === 'ALL-CAN300') return <SourceLabel source="ECU" />;
  return <SourceLabel source="ECU · partial" />;
}

export default function MaintenancePage() {
  const t = useT();
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  const [view, setView] = useState<View>('board');
  const [toast, setToast] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [, setVersion] = useState(0);
  const [logFor, setLogFor] = useState<PlanSnapshot | null>(null);
  const [planForm, setPlanForm] = useState<{ snapshot?: PlanSnapshot } | null>(null);

  const show = (tone: 'ok' | 'error', text: string) => {
    setToast({ tone, text });
    setVersion(v => v + 1);
  };

  const board = useMemo(() => (session ? boardFor(session) : { overdue: [], dueSoon: [], ok: [] }), [session, setVersion]);
  const alerts = useMemo(() => (session ? maintenanceAlerts(session) : []), [session]);
  const history = useMemo(() => (session ? serviceHistory(session) : []), [session]);
  const tasks = useMemo(() => (session ? openTasks(session) : []), [session]);
  const plans = useMemo(() => (session ? plansVisibleTo(session) : []), [session]);

  const canManage = Boolean(session && canManageMaintenance(session));

  if (!session) return null;

  if (phase !== 'later') {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold text-ink mb-4">{t('maintenance.title', 'Maintenance')}</h1>
        <EmptyState
          title={t('maintenance.not_available', 'Not available')}
          description={t('maintenance.phase_description', 'Maintenance scheduling arrives in the Later phase. Switch the demo bar to Later to see the board.')}
        />
      </div>
    );
  }

  const faultCodes = seed.alerts.filter(a =>
    a.type === 'fault_code' && !a.closedAt && a.assetId && visibleAssetIds(session).includes(a.assetId)
  );

  const planTable: ExportTable = {
    title: 'Service plans',
    columns: ['Asset', 'Plan', 'Basis', 'Reading', 'Due', 'Status', 'Headline'],
    rows: [...board.overdue, ...board.dueSoon, ...board.ok].map(s => [
      s.asset.code, s.plan.name, s.plan.basis.replace('_', ' '), s.current, s.due, s.state.replace('_', ' '), s.headline,
    ]),
  };

  const historyTable: ExportTable = {
    title: 'Service history',
    columns: ['Date', 'Asset', 'Reading', 'Notes', 'Cost (AED)'],
    rows: history.map(r => [
      clock.formatDubaiDate(new Date(r.doneAt).getTime()),
      seed.assets.find(a => a.id === r.assetId)?.code ?? r.assetId,
      r.value, r.notes, r.costAed,
    ]),
  };

  const exportBoth = () => {
    downloadXlsx({ fileName: 'kasper-maintenance', subtitle: 'Service plans and history' }, [planTable, historyTable]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-ink">{t('maintenance.title', 'Maintenance')}</h1>
          <p className="text-sm text-grey-500 mt-1">
            {t('maintenance.subtitle', 'Service plans by engine hours, distance or date — with the service history behind them.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={exportBoth}>{t('maintenance.excel', 'Excel')}</Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadPdf({ fileName: 'kasper-maintenance', subtitle: 'Service plans and history' }, [planTable, historyTable])}
          >
            {t('maintenance.pdf', 'PDF')}
          </Button>
          {canManage && <Button size="sm" onClick={() => setPlanForm({})}>{t('maintenance.new_plan', 'New plan')}</Button>}
        </div>
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

      {/* Alerts (Later) */}
      {alerts.length > 0 && (
        <div className="bg-surface border border-line rounded-lg p-3 space-y-1">
          <h2 className="text-xs font-medium text-grey-500">{t('maintenance.alerts', 'Alerts')}</h2>
          {alerts.map(a => (
            <div key={a.text} className="text-sm flex items-center gap-2">
              <Badge variant={a.state === 'overdue' ? 'red' : 'amber'} dot>
                {a.state === 'overdue' ? t('maintenance.overdue', 'Overdue') : t('maintenance.due_soon', 'Due soon')}
              </Badge>
              <span className="text-grey-700">{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Fault-code tasks */}
      {faultCodes.length > 0 && (
        <div className="bg-surface border border-line rounded-lg p-3 space-y-2">
          <h2 className="text-xs font-medium text-grey-500">{t('maintenance.fault_codes', 'Fault codes needing a service task')}</h2>
          {faultCodes.map(a => (
            <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-grey-700">
                <span className="font-medium text-ink">{seed.assets.find(x => x.id === a.assetId)?.code}</span> · {a.detail}
              </span>
              {canManage && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const result = createTaskFromFault(session, a.id);
                    show(result.ok ? 'ok' : 'error', result.ok ? result.message! : result.error!);
                  }}
                >
                  {t('maintenance.create_task', 'Create service task')}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Open one-off tasks */}
      {tasks.length > 0 && (
        <div className="bg-yellow/5 border border-yellow-dark/30 rounded-lg p-3 space-y-2">
          <h2 className="text-xs font-medium text-grey-500">{t('maintenance.open_tasks', 'Open tasks')}</h2>
          {tasks.map(task => {
            const asset = seed.assets.find(a => a.id === task.assetId);
            const plan = plans.find(p => p.assetId === task.assetId);
            const snapshot = plan ? planSnapshot(plan, asset!) : null;
            return (
              <div key={task.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-grey-700">
                  <span className="font-medium text-ink">{asset?.code}</span> · {task.title}
                </span>
                {canManage && snapshot && (
                  <Button variant="secondary" size="sm" onClick={() => setLogFor(snapshot)}>{t('maintenance.log_service', 'Log service')}</Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Board / table toggle */}
      <div className="flex items-center gap-2">
        <Button variant={view === 'board' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('board')}>{t('maintenance.board', 'Board')}</Button>
        <Button variant={view === 'table' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('table')}>{t('maintenance.table', 'Table')}</Button>
        <span className="text-xs text-grey-500 ms-auto">{t('maintenance.plans_count', '{count} plans', { count: plans.length })}</span>
      </div>

      {view === 'board' ? (
        <div className="grid gap-3 md:grid-cols-3">
          {([
            ['overdue', 'maintenance.overdue', 'Overdue', 'text-red'],
            ['dueSoon', 'maintenance.due_soon', 'Due soon', 'text-amber-dark'],
            ['ok', 'maintenance.ok', 'Ok', 'text-green'],
          ] as const).map(([key, labelKey, fallback, tone]) => (
            <div key={key} className="space-y-2">
              <h2 className={clsx('text-sm font-medium', tone)}>
                {t(labelKey, fallback)} ({board[key].length})
              </h2>
              {board[key].length === 0 && (
                <div className="text-xs text-grey-500 bg-surface border border-line rounded-lg px-3 py-4">{t('maintenance.nothing_here', 'Nothing here.')}</div>
              )}
              {board[key].map(s => (
                <div key={s.plan.id} className="bg-surface border border-line rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-ink">
                        <Link className="hover:underline" href={`/app/assets/${s.asset.id}`}>{s.asset.code}</Link>
                        <span className="text-grey-500 font-normal"> · {s.asset.name}</span>
                      </div>
                      <div className="text-xs text-grey-500">{s.plan.name}</div>
                    </div>
                    {stateBadge(s.state, t)}
                  </div>
                  <div className="text-sm text-grey-700">{s.headline}</div>
                  <div className="flex items-center gap-2">
                    {basisChip(s)}
                    {s.onHire && <span className="text-[11px] text-grey-500">{s.onHire}</span>}
                  </div>
                  {canManage && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={() => setLogFor(s)}>{t('maintenance.log_service', 'Log service')}</Button>
                      <Button variant="secondary" size="sm" onClick={() => setPlanForm({ snapshot: s })}>{t('maintenance.edit_plan', 'Edit plan')}</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper-2 text-grey-500">
                <th className="px-3 py-2 text-start font-medium">{t('maintenance.columns.asset', 'Asset')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('maintenance.columns.plan', 'Plan')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('maintenance.columns.basis', 'Basis')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('maintenance.reading', 'Reading')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('maintenance.due', 'Due')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('maintenance.columns.status', 'Status')}</th>
                <th className="px-3 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {[...board.overdue, ...board.dueSoon, ...board.ok].map(s => (
                <tr key={s.plan.id} className="bg-paper hover:bg-paper-2">
                  <td className="px-3 py-2 border-b border-line font-medium text-ink">{s.asset.code}</td>
                  <td className="px-3 py-2 border-b border-line text-grey-700">{s.plan.name}</td>
                  <td className="px-3 py-2 border-b border-line">{basisChip(s)}</td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">
                    {s.unit === 'days' ? `${s.current} d` : `${s.current.toLocaleString('en-US')} ${s.unit}`}
                  </td>
                  <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-500">
                    {s.unit === 'days' ? `${s.due} d` : `${s.due.toLocaleString('en-US')} ${s.unit}`}
                  </td>
                  <td className="px-3 py-2 border-b border-line">{stateBadge(s.state, t)}</td>
                  <td className="px-3 py-2 border-b border-line text-right">
                    {canManage && (
                      <div className="flex gap-1 justify-end">
                        <Button variant="secondary" size="sm" onClick={() => setLogFor(s)}>{t('maintenance.log_service', 'Log service')}</Button>
                        <Button variant="ghost" size="sm" onClick={() => setPlanForm({ snapshot: s })}>{t('common.edit', 'Edit')}</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {plans.length === 0 && (
                <tr className="bg-paper">
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-grey-500">
                    {t('maintenance.no_plans', 'No service plans yet.')}{' '}
                    {canManage
                      ? t('maintenance.no_plans_admin', 'Create one with "New plan".')
                      : t('maintenance.no_plans_ask', 'Ask your company admin to set them up.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Service history */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-ink">{t('maintenance.service_history', 'Service history')}</h2>
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper-2 text-grey-500">
                <th className="px-3 py-2 text-start font-medium">{t('maintenance.date', 'Date')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('maintenance.columns.asset', 'Asset')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('maintenance.reading', 'Reading')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('maintenance.notes', 'Notes')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('maintenance.cost', 'Cost')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map(r => {
                const asset = seed.assets.find(a => a.id === r.assetId);
                const plan = seed.maintenancePlans.find(p => p.id === r.planId);
                return (
                  <tr key={r.id} className="bg-paper hover:bg-paper-2">
                    <td className="px-3 py-2 border-b border-line text-grey-700">{clock.formatDubaiDate(new Date(r.doneAt).getTime())}</td>
                    <td className="px-3 py-2 border-b border-line text-ink font-medium">{asset?.code ?? r.assetId}</td>
                    <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">
                      {plan?.basis === 'days' ? '—' : r.value.toLocaleString('en-US')}
                    </td>
                    <td className="px-3 py-2 border-b border-line text-grey-700">{r.notes}</td>
                    <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">
                      AED {r.costAed.toLocaleString('en-US')}
                    </td>
                  </tr>
                );
              })}
              {history.length === 0 && (
                <tr className="bg-paper">
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-grey-500">{t('maintenance.no_history', 'No services logged yet.')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-grey-500">{t('maintenance.export_hint', 'PDF and Excel exports include the plans and this history.')}</p>
      </div>

      {logFor && (
        <LogServiceSheet
          snapshot={logFor}
          onClose={() => setLogFor(null)}
          onResult={(tone, text) => { show(tone, text); if (tone === 'ok') setLogFor(null); }}
          session={session}
        />
      )}

      {planForm && (
        <PlanSheet
          snapshot={planForm.snapshot}
          onClose={() => setPlanForm(null)}
          onResult={(tone, text) => { show(tone, text); if (tone === 'ok') setPlanForm(null); }}
          session={session}
        />
      )}
    </div>
  );
}

// ── Log service ────────────────────────────────────────────────────────────────

type Session = NonNullable<ReturnType<typeof useStore.getState>['session']>;

function LogServiceSheet({ snapshot, session, onClose, onResult }: {
  snapshot: PlanSnapshot;
  session: Session;
  onClose: () => void;
  onResult: (tone: 'ok' | 'error', text: string) => void;
}) {
  const plan = snapshot.plan;
  const asset = snapshot.asset;
  const meter = currentMeter(plan, asset);
  const [doneAt, setDoneAt] = useState(new Date(clock.now()).toISOString().slice(0, 10));
  const [value, setValue] = useState(String(meter.value));
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useState('');
  const task = openTasks(session).find(t => t.assetId === asset.id);

  return (
    <Sheet open onClose={onClose} title={`Log service — ${asset.code}`} width="md">
      <div className="space-y-4">
        <div className="text-sm text-grey-700">
          {plan.name} · <SourceLabel source={plan.basis === 'km'
            ? (plan.kmSource === 'can' ? 'ECU (ALL-CAN300)' : 'GPS distance')
            : plan.hoursSource === 'estimated' ? 'Estimated' : 'ECU'} inline />
        </div>
        <p className="text-xs text-grey-500">
          Logging a service resets the plan: the reading you enter here becomes the new starting point.
        </p>
        <label className="text-xs text-grey-500 block">
          Date
          <input
            type="date"
            value={doneAt}
            onChange={e => setDoneAt(e.target.value)}
            className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          />
        </label>
        <label className="text-xs text-grey-500 block">
          Meter reading ({plan.basis === 'km' ? 'km' : plan.hoursSource ? 'hours' : 'km'}) — {meter.source}
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            inputMode="decimal"
            className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          />
          <span className="text-[11px] text-grey-500">Prefilled from the current reading — edit it if the hour meter reads differently.</span>
        </label>
        <label className="text-xs text-grey-500 block">
          Notes
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="What was done?"
            className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          />
        </label>
        <label className="text-xs text-grey-500 block">
          Cost (AED)
          <input
            value={cost}
            onChange={e => setCost(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          />
        </label>
        {task && (
          <p className="text-xs text-grey-500">
            This closes the open task “{task.title}”.
          </p>
        )}
        <div className="flex gap-2">
          <Button
            onClick={() => {
              const result = logService(session, {
                planId: plan.id,
                doneAt: new Date(`${doneAt}T12:00:00+04:00`).getTime(),
                value: Number(value),
                notes,
                costAed: Number(cost || 0),
                taskId: task?.id,
              });
              onResult(result.ok ? 'ok' : 'error', result.ok ? result.message! : result.error!);
            }}
          >
            Log service
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Sheet>
  );
}

// ── Plan form ──────────────────────────────────────────────────────────────────

function PlanSheet({ snapshot, session, onClose, onResult }: {
  snapshot?: PlanSnapshot;
  session: Session;
  onClose: () => void;
  onResult: (tone: 'ok' | 'error', text: string) => void;
}) {
  const owned = seed.assets.filter(a => session.isKasper || a.ownerTenantId === session.tenantId);
  const [assetId, setAssetId] = useState(snapshot?.asset.id ?? owned[0]?.id ?? '');
  const [name, setName] = useState(snapshot?.plan.name ?? '');
  const [basis, setBasis] = useState<MaintenancePlan['basis']>(snapshot?.plan.basis ?? 'engine_hours');
  const [interval, setInterval] = useState(String(snapshot?.plan.interval ?? ''));
  const [lastDoneValue, setLastDoneValue] = useState(String(snapshot?.plan.lastDoneValue ?? ''));
  const lastDoneMs = snapshot
    ? (typeof snapshot.plan.lastDoneAt === 'number' ? snapshot.plan.lastDoneAt : new Date(snapshot.plan.lastDoneAt).getTime())
    : clock.now();
  const [lastDoneAt, setLastDoneAt] = useState(new Date(lastDoneMs).toISOString().slice(0, 10));

  const asset = seed.assets.find(a => a.id === assetId);
  const tier = asset ? tierForAsset(asset) : 1;
  const canUseEcu = Boolean(asset && asset.canProfile.adapter === 'ALL-CAN300' && asset.canProfile.supported.includes('engineHours'));
  const canUseCanOdometer = Boolean(asset && asset.canProfile.supported.includes('canOdometer'));
  const hoursSource = basis === 'engine_hours' ? (canUseEcu ? 'ecu' : 'estimated') : undefined;
  const kmSource = basis === 'km' ? (canUseCanOdometer ? 'can' : 'gps') : undefined;

  return (
    <Sheet open onClose={onClose} title={snapshot ? `Edit plan — ${snapshot.asset.code}` : 'New service plan'} width="md">
      <div className="space-y-4">
        <label className="text-xs text-grey-500 block">
          Asset
          <select
            value={assetId}
            onChange={e => setAssetId(e.target.value)}
            disabled={Boolean(snapshot)}
            className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          >
            {owned.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-grey-500 block">
          Plan name
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. 500 h service"
            className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          />
        </label>
        <label className="text-xs text-grey-500 block">
          Basis
          <select
            value={basis}
            onChange={e => setBasis(e.target.value as typeof basis)}
            className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          >
            <option value="engine_hours">Engine hours</option>
            <option value="km">Distance</option>
            <option value="days">Days (calendar)</option>
          </select>
        </label>
        {basis === 'engine_hours' && (
          <p className="text-[11px] text-grey-500">
            {canUseEcu
              ? 'ECU hours — billing-grade, from the ALL-CAN300 adapter.'
              : 'Estimated (ignition hours) — this asset has no CAN bus. Estimated hours drift; check the hour meter at each service.'}
          </p>
        )}
        {basis === 'km' && (
          <p className="text-[11px] text-grey-500">
            {canUseCanOdometer ? 'CAN odometer — read off the bus.' : 'GPS distance — this asset has no CAN odometer, so distance is estimated from positions.'}
          </p>
        )}
        <label className="text-xs text-grey-500 block">
          Interval ({basis === 'days' ? 'days' : basis === 'km' ? 'km' : 'hours'})
          <input
            value={interval}
            onChange={e => setInterval(e.target.value)}
            inputMode="decimal"
            className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-grey-500 block">
            Last done at (reading)
            <input
              value={lastDoneValue}
              onChange={e => setLastDoneValue(e.target.value)}
              inputMode="decimal"
              className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
            />
          </label>
          <label className="text-xs text-grey-500 block">
            Last done date
            <input
              type="date"
              value={lastDoneAt}
              onChange={e => setLastDoneAt(e.target.value)}
              className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
            />
          </label>
        </div>
        <p className="text-[11px] text-grey-500">
          Due soon starts at 80 % of the interval unless you set your own threshold. {tier === 1 ? 'A tracker-only asset can only be planned by distance or days.' : ''}
        </p>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              const result = savePlan(session, {
                id: snapshot?.plan.id,
                assetId,
                name,
                basis,
                hoursSource: hoursSource as 'ecu' | 'estimated' | undefined,
                kmSource: kmSource as 'can' | 'gps' | undefined,
                interval: Number(interval),
                lastDoneAt: new Date(`${lastDoneAt}T12:00:00+04:00`).getTime(),
                lastDoneValue: Number(lastDoneValue || 0),
              });
              onResult(result.ok ? 'ok' : 'error', result.ok ? result.message! : result.error!);
            }}
          >
            {snapshot ? 'Save plan' : 'Create plan'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Sheet>
  );
}
