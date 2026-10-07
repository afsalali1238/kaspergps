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
  boardFor, canManageMaintenance, createTaskFromFault, currentMeter, logService,
  openTasks, planSnapshot, plansVisibleTo, savePlan, serviceHistory, type PlanSnapshot,
} from '@/server/maintenance';
import { tierForAsset } from '@/domain/features';
import { downloadPdf, downloadXlsx, type ExportTable } from '@/lib/export';

type View = 'board' | 'table';

function stateBadge(state: PlanSnapshot['state']): React.ReactNode {
  if (state === 'overdue') return <Badge variant="red" dot>Overdue</Badge>;
  if (state === 'due_soon') return <Badge variant="amber" dot>Due soon</Badge>;
  return <Badge variant="green" dot>Ok</Badge>;
}

/** Basis chips use the same vocabulary as Cost & ROI. */
function basisChip(snapshot: PlanSnapshot): React.ReactNode {
  if (snapshot.plan.basis === 'days') return <Badge variant="grey">Calendar days</Badge>;
  if (snapshot.plan.basis === 'km') return <SourceLabel source={snapshot.plan.kmSource === 'can' ? 'ECU (ALL-CAN300)' : 'GPS distance'} />;
  if (snapshot.plan.hoursSource === 'estimated') return <SourceLabel source="Estimated" />;
  if (snapshot.asset.canProfile.adapter === 'ALL-CAN300') return <SourceLabel source="ECU" />;
  return <SourceLabel source="ECU · partial" />;
}

function applyCalendarThreshold(snapshot: PlanSnapshot): PlanSnapshot {
  if (snapshot.plan.basis !== 'days') return snapshot;
  const threshold = snapshot.plan.dueSoonAt > 0 && snapshot.plan.dueSoonAt < snapshot.plan.interval
    ? snapshot.plan.dueSoonAt
    : Math.round(snapshot.plan.interval * 0.85);
  const state = snapshot.remaining <= 0 ? 'overdue' : snapshot.current >= threshold ? 'due_soon' : 'ok';
  return { ...snapshot, dueSoonAt: threshold, state };
}

function boardFromSnapshots(snapshots: PlanSnapshot[]): { overdue: PlanSnapshot[]; dueSoon: PlanSnapshot[]; ok: PlanSnapshot[] } {
  const ordered = [...snapshots].sort((a, b) => a.remaining - b.remaining);
  return {
    overdue: ordered.filter(snapshot => snapshot.state === 'overdue'),
    dueSoon: ordered.filter(snapshot => snapshot.state === 'due_soon'),
    ok: ordered.filter(snapshot => snapshot.state === 'ok'),
  };
}

function alertsForBoard(board: { overdue: PlanSnapshot[]; dueSoon: PlanSnapshot[]; ok: PlanSnapshot[] }) {
  const dueSoonLine = (snapshot: PlanSnapshot) => snapshot.unit === 'km'
    ? `${snapshot.asset.code} ${snapshot.plan.name} (${Math.max(0, Math.round(snapshot.remaining)).toLocaleString('en-US')} km left)`
    : snapshot.unit === 'days'
      ? `${snapshot.asset.code} ${snapshot.plan.name} (${clock.formatDubaiDate(snapshot.dueAt ?? clock.now())})`
      : `${snapshot.asset.code} ${snapshot.plan.name} (${Math.max(0, Math.round(snapshot.remaining))} h left)`;
  return [
    ...board.overdue.map(snapshot => ({ state: 'overdue' as const, text: `Maintenance overdue: ${snapshot.asset.code} — ${snapshot.plan.name}` })),
    ...board.dueSoon.map(snapshot => ({ state: 'due_soon' as const, text: `Maintenance due soon: ${dueSoonLine(snapshot)}` })),
  ];
}

export default function MaintenancePage() {
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  const [view, setView] = useState<View>('board');
  const [toast, setToast] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const [logFor, setLogFor] = useState<PlanSnapshot | null>(null);
  const [planForm, setPlanForm] = useState<{ snapshot?: PlanSnapshot } | null>(null);

  const show = (tone: 'ok' | 'error', text: string) => {
    setToast({ tone, text });
    setDataRevision(v => v + 1);
  };

  const ownedAssetIds = useMemo(() => new Set(seed.assets
    .filter(asset => session && (session.isKasper || asset.ownerTenantId === session.tenantId))
    .map(asset => asset.id)), [session]);
  const rawBoard = useMemo(() => session ? boardFor(session) : { overdue: [], dueSoon: [], ok: [] }, [session, dataRevision]);
  const board = useMemo(() => boardFromSnapshots(
    [...rawBoard.overdue, ...rawBoard.dueSoon, ...rawBoard.ok].map(applyCalendarThreshold),
  ), [rawBoard]);
  const alerts = useMemo(() => alertsForBoard(board), [board]);
  const history = useMemo(() => (session ? serviceHistory(session) : []), [session, dataRevision]);
  const tasks = useMemo(() => (session ? openTasks(session).filter(task => ownedAssetIds.has(task.assetId)) : []), [session, ownedAssetIds, dataRevision]);
  const plans = useMemo(() => (session ? plansVisibleTo(session) : []), [session, dataRevision]);

  const canManage = Boolean(session && canManageMaintenance(session));

  if (!session) return null;

  if (phase !== 'later') {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold text-ink mb-4">Maintenance</h1>
        <EmptyState
          title="Not available"
          description="Maintenance scheduling arrives in the Later phase. Switch the demo bar to Later to see the board."
        />
      </div>
    );
  }

  const faultCodes = seed.alerts.filter(a =>
    a.type === 'fault_code' && !a.closedAt && a.assetId
    && ownedAssetIds.has(a.assetId) && visibleAssetIds(session).includes(a.assetId)
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
          <h1 className="text-lg font-semibold text-ink">Maintenance</h1>
          <p className="text-sm text-grey-500 mt-1">
            Service plans by engine hours, distance or date — with the service history behind them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={exportBoth}>Excel</Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadPdf({ fileName: 'kasper-maintenance', subtitle: 'Service plans and history' }, [planTable, historyTable])}
          >
            PDF
          </Button>
          {canManage && <Button size="sm" onClick={() => setPlanForm({})}>New plan</Button>}
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
          <h2 className="text-xs font-medium text-grey-500">Alerts</h2>
          {alerts.map(a => (
            <div key={a.text} className="text-sm flex items-center gap-2">
              <Badge variant={a.state === 'overdue' ? 'red' : 'amber'} dot>
                {a.state === 'overdue' ? 'Overdue' : 'Due soon'}
              </Badge>
              <span className="text-grey-700">{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Fault-code tasks */}
      {faultCodes.length > 0 && (
        <div className="bg-surface border border-line rounded-lg p-3 space-y-2">
          <h2 className="text-xs font-medium text-grey-500">Fault codes needing a service task</h2>
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
                  Create service task
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Open one-off tasks */}
      {tasks.length > 0 && (
        <div className="bg-yellow/5 border border-yellow-dark/30 rounded-lg p-3 space-y-2">
          <h2 className="text-xs font-medium text-grey-500">Open tasks</h2>
          {tasks.map(t => {
            const asset = seed.assets.find(a => a.id === t.assetId);
            const plan = plans.find(p => p.assetId === t.assetId);
            const snapshot = plan && asset ? planSnapshot(plan, asset) : null;
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-grey-700">
                  <span className="font-medium text-ink">{asset?.code}</span> · {t.title}
                </span>
                {canManage && snapshot && (
                  <Button variant="secondary" size="sm" onClick={() => setLogFor(snapshot)}>Log service</Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Board / table toggle */}
      <div className="flex items-center gap-2">
        <Button variant={view === 'board' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('board')}>Board</Button>
        <Button variant={view === 'table' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('table')}>Table</Button>
        <span className="text-xs text-grey-500 ml-auto">{plans.length} plan{plans.length === 1 ? '' : 's'}</span>
      </div>

      {view === 'board' ? (
        <div className="grid gap-3 md:grid-cols-3">
          {([
            ['overdue', 'Overdue', 'text-red'],
            ['dueSoon', 'Due soon', 'text-amber-dark'],
            ['ok', 'Ok', 'text-green'],
          ] as const).map(([key, label]) => (
            <div key={key} className="space-y-2">
              <h2 className={clsx('text-sm font-medium', label === 'Overdue' ? 'text-red' : label === 'Due soon' ? 'text-amber-dark' : 'text-green')}>
                {label} ({board[key].length})
              </h2>
              {board[key].length === 0 && (
                <div className="text-xs text-grey-500 bg-surface border border-line rounded-lg px-3 py-4">Nothing here.</div>
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
                    {stateBadge(s.state)}
                  </div>
                  <div className="text-sm text-grey-700">{s.headline}</div>
                  <div className="flex items-center gap-2">
                    {basisChip(s)}
                    {s.onHire && <span className="text-[11px] text-grey-500">{s.onHire}</span>}
                  </div>
                  {canManage && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={() => setLogFor(s)}>Log service</Button>
                      <Button variant="secondary" size="sm" onClick={() => setPlanForm({ snapshot: s })}>Edit plan</Button>
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
                <th className="px-3 py-2 text-left font-medium">Asset</th>
                <th className="px-3 py-2 text-left font-medium">Plan</th>
                <th className="px-3 py-2 text-left font-medium">Basis</th>
                <th className="px-3 py-2 text-right font-medium">Reading</th>
                <th className="px-3 py-2 text-right font-medium">Due</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
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
                  <td className="px-3 py-2 border-b border-line">{stateBadge(s.state)}</td>
                  <td className="px-3 py-2 border-b border-line text-right">
                    {canManage && (
                      <div className="flex gap-1 justify-end">
                        <Button variant="secondary" size="sm" onClick={() => setLogFor(s)}>Log service</Button>
                        <Button variant="ghost" size="sm" onClick={() => setPlanForm({ snapshot: s })}>Edit</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {plans.length === 0 && (
                <tr className="bg-paper">
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-grey-500">
                    No service plans yet. {canManage ? 'Create one with "New plan".' : 'Ask your company admin to set them up.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Service history */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-ink">Service history</h2>
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper-2 text-grey-500">
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Asset</th>
                <th className="px-3 py-2 text-right font-medium">Reading</th>
                <th className="px-3 py-2 text-left font-medium">Notes</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
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
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-grey-500">No services logged yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-grey-500">PDF and Excel exports include the plans and this history.</p>
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
  const [doneAt, setDoneAt] = useState(clock.dubaiToIso(clock.now()).slice(0, 10));
  const [value, setValue] = useState(String(meter.value));
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useState('');
  const task = openTasks(session).find(t => t.assetId === asset.id);

  return (
    <Sheet open onClose={onClose} title={`Log service — ${asset.code}`} width="md">
      <div className="space-y-4">
        <div className="text-sm text-grey-700">
          {plan.name} · {plan.basis === 'days'
            ? <Badge variant="grey">Calendar days</Badge>
            : <SourceLabel source={plan.basis === 'km'
              ? (plan.kmSource === 'can' ? 'ECU (ALL-CAN300)' : 'GPS distance')
              : plan.hoursSource === 'estimated' ? 'Estimated' : 'ECU'} inline />}
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
          {plan.basis === 'days' ? 'Calendar value (days since last service)' : `Meter reading (${plan.basis === 'km' ? 'km' : 'hours'})`} — {meter.source}
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            inputMode="decimal"
            className="block mt-1 w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          />
          <span className="text-[11px] text-grey-500">{plan.basis === 'days' ? 'Prefilled from the current calendar value.' : 'Prefilled from the current meter — edit it if the reading differs.'}</span>
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
              const meterValue = Number(value);
              const costValue = Number(cost);
              if (!doneAt) {
                onResult('error', 'Choose the service date.');
                return;
              }
              if (value.trim() === '' || !Number.isFinite(meterValue) || meterValue < 0) {
                onResult('error', 'Enter a non-negative meter reading.');
                return;
              }
              if (cost.trim() === '' || !Number.isFinite(costValue) || costValue < 0) {
                onResult('error', 'Enter the service cost. Use 0 only when the service had no cost.');
                return;
              }
              const result = logService(session, {
                planId: plan.id,
                doneAt: new Date(`${doneAt}T12:00:00+04:00`).getTime(),
                value: meterValue,
                notes,
                costAed: costValue,
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
  const initialAssetId = snapshot?.asset.id ?? owned[0]?.id ?? '';
  const initialAsset = seed.assets.find(asset => asset.id === initialAssetId);
  const defaultBasis: MaintenancePlan['basis'] = initialAsset && tierForAsset(initialAsset) === 1 ? 'days' : 'engine_hours';
  const [assetId, setAssetId] = useState(initialAssetId);
  const [name, setName] = useState(snapshot?.plan.name ?? '');
  const [basis, setBasis] = useState<MaintenancePlan['basis']>(snapshot?.plan.basis ?? defaultBasis);
  const [interval, setInterval] = useState(String(snapshot?.plan.interval ?? ''));
  const [lastDoneValue, setLastDoneValue] = useState(String(snapshot?.plan.lastDoneValue ?? ''));
  const lastDoneMs = snapshot
    ? (typeof snapshot.plan.lastDoneAt === 'number' ? snapshot.plan.lastDoneAt : new Date(snapshot.plan.lastDoneAt).getTime())
    : clock.now();
  const [lastDoneAt, setLastDoneAt] = useState(clock.dubaiToIso(lastDoneMs).slice(0, 10));
  const initialDueSoonPercent = snapshot && snapshot.plan.interval > 0
    ? snapshot.plan.basis === 'days'
      ? (snapshot.dueSoonAt / snapshot.plan.interval) * 100
      : ((snapshot.dueSoonAt - snapshot.plan.lastDoneValue) / snapshot.plan.interval) * 100
    : 80;
  const [dueSoonPercent, setDueSoonPercent] = useState(String(Math.min(95, Math.max(51, Math.round(initialDueSoonPercent)))));

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
            onChange={e => {
              const nextAssetId = e.target.value;
              const nextAsset = seed.assets.find(item => item.id === nextAssetId);
              setAssetId(nextAssetId);
              if (nextAsset && tierForAsset(nextAsset) === 1 && basis === 'engine_hours') setBasis('days');
            }}
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
            <option value="engine_hours" disabled={tier === 1}>Engine hours{tier === 1 ? ' (not available)' : ''}</option>
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
        <label className="text-xs text-grey-500 block">
          Due soon threshold (% of interval)
          <input
            type="number"
            min={51}
            max={95}
            value={dueSoonPercent}
            onChange={event => setDueSoonPercent(event.target.value)}
            className="block mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-grey-700 focus:border-ink focus:outline-none"
          />
          <span className="mt-1 block text-[11px] text-grey-500">The warning starts after this share of the interval has been used.</span>
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
          Choose a due-soon threshold from 51% to 95% of the interval. {tier === 1 ? 'A tracker-only asset can only be planned by distance or days.' : ''}
        </p>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              if (tier === 1 && basis === 'engine_hours') {
                onResult('error', 'Tier 1 assets use distance or calendar days for service plans.');
                return;
              }
              const thresholdPercent = Number(dueSoonPercent);
              if (!Number.isFinite(thresholdPercent) || thresholdPercent < 51 || thresholdPercent > 95) {
                onResult('error', 'Choose a due-soon threshold from 51% to 95%.');
                return;
              }
              const intervalValue = Number(interval);
              const lastReadingValue = Number(lastDoneValue);
              if (interval.trim() === '' || !Number.isFinite(intervalValue) || intervalValue <= 0) {
                onResult('error', 'Enter an interval greater than zero.');
                return;
              }
              if (lastDoneValue.trim() === '' || !Number.isFinite(lastReadingValue) || lastReadingValue < 0) {
                onResult('error', 'Enter a non-negative last service reading.');
                return;
              }
              if (!lastDoneAt) {
                onResult('error', 'Choose the date of the last service.');
                return;
              }
              const dueSoonAt = basis === 'days'
                ? intervalValue * thresholdPercent / 100
                : lastReadingValue + intervalValue * thresholdPercent / 100;
              const result = savePlan(session, {
                id: snapshot?.plan.id,
                assetId,
                name,
                basis,
                hoursSource: hoursSource as 'ecu' | 'estimated' | undefined,
                kmSource: kmSource as 'can' | 'gps' | undefined,
                interval: intervalValue,
                dueSoonAt,
                lastDoneAt: new Date(`${lastDoneAt}T12:00:00+04:00`).getTime(),
                lastDoneValue: lastReadingValue,
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
