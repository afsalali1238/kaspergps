'use client';

import React, { useMemo, useState } from 'react';
import { Badge, Button, EmptyState, SourceLabel } from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { isAssetVisible } from '@/server/access';
import { can } from '@/server/capabilities';
import { hasFeature } from '@/domain/features';
import { MAINT_DUE_SOON_DAYS, MAINT_DUE_SOON_PCT } from '@/config/thresholds';
import { getReadingForAsset, getReadingsForAsset } from '@/server/telemetry/simulator';
import type { Asset, MaintenancePlan, Reading, ServiceRecord } from '@/domain/types';

type DueState = 'overdue' | 'due_soon' | 'on_track' | 'not_measured';
type PlanState = {
  plan: MaintenancePlan;
  asset: Asset;
  currentValue: number | null;
  basisLabel: 'ECU' | 'Estimated' | 'GPS distance' | 'Days on hire' | 'Not measured';
  dueState: DueState;
  dueAt: number | null;
  remaining: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_PCT = MAINT_DUE_SOON_PCT / 100;
const DUE_SOON_DAYS = MAINT_DUE_SOON_DAYS;

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

function buildPlanState(plan: MaintenancePlan, asset: Asset, now: number, readings: Reading[]): PlanState {
  if (plan.basis === 'days') {
    const elapsed = Math.max(0, (now - toMillis(plan.lastDoneAt)) / DAY_MS);
    const remaining = plan.interval - elapsed;
    const dueSoonWindow = Math.max(plan.interval * DUE_SOON_PCT, DUE_SOON_DAYS);
    const dueState: DueState = remaining < 0 ? 'overdue' : remaining <= dueSoonWindow ? 'due_soon' : 'on_track';
    return { plan, asset, currentValue: elapsed, basisLabel: 'Days on hire', dueState, dueAt: plan.interval, remaining };
  }

  if (plan.basis === 'km') {
    const latest = getReadingForAsset(asset);
    const current = plan.kmSource === 'can' ? latest?.canOdometerKm : latest?.gnssOdometerKm;
    const measured = current !== undefined && Number.isFinite(current);
    if (!measured) return { plan, asset, currentValue: null, basisLabel: 'Not measured', dueState: 'not_measured', dueAt: plan.lastDoneValue + plan.interval, remaining: null };
    const dueAt = plan.lastDoneValue + plan.interval;
    const remaining = dueAt - current;
    const dueState: DueState = current > dueAt ? 'overdue' : remaining <= plan.interval * DUE_SOON_PCT ? 'due_soon' : 'on_track';
    return { plan, asset, currentValue: current, basisLabel: plan.kmSource === 'can' ? 'ECU' : 'GPS distance', dueState, dueAt, remaining };
  }

  const latest = getReadingForAsset(asset);
  if (plan.hoursSource === 'ecu') {
    const current = latest?.engineHours;
    if (current === undefined || !Number.isFinite(current)) {
      return { plan, asset, currentValue: null, basisLabel: 'Not measured', dueState: 'not_measured', dueAt: plan.lastDoneValue + plan.interval, remaining: null };
    }
    const dueAt = plan.lastDoneValue + plan.interval;
    const remaining = dueAt - current;
    const dueState: DueState = current > dueAt ? 'overdue' : remaining <= plan.interval * DUE_SOON_PCT ? 'due_soon' : 'on_track';
    return { plan, asset, currentValue: current, basisLabel: 'ECU', dueState, dueAt, remaining };
  }

  if (!hasFeature(asset, 'hours.ignition')) {
    return { plan, asset, currentValue: null, basisLabel: 'Not measured', dueState: 'not_measured', dueAt: plan.lastDoneValue + plan.interval, remaining: null };
  }
  const elapsedDays = Math.max(0, (now - toMillis(plan.lastDoneAt)) / DAY_MS);
  const sampledDays = Math.max(1, Math.min(7, elapsedDays));
  const estimatedSinceService = (ignitionHours(readings) / sampledDays) * elapsedDays;
  const current = plan.lastDoneValue + estimatedSinceService;
  const dueAt = plan.lastDoneValue + plan.interval;
  const remaining = dueAt - current;
  const dueState: DueState = current > dueAt ? 'overdue' : remaining <= plan.interval * DUE_SOON_PCT ? 'due_soon' : 'on_track';
  return { plan, asset, currentValue: current, basisLabel: 'Estimated', dueState, dueAt, remaining };
}

function stateBadge(state: DueState): { label: string; variant: 'red' | 'yellow' | 'green' | 'grey' } {
  if (state === 'overdue') return { label: 'Overdue', variant: 'red' };
  if (state === 'due_soon') return { label: 'Due soon', variant: 'yellow' };
  if (state === 'on_track') return { label: 'On track', variant: 'green' };
  return { label: 'Not measured', variant: 'grey' };
}

function currentDisplay(state: PlanState): string {
  if (state.currentValue === null) return 'Not measured';
  if (state.plan.basis === 'days') return `${state.currentValue.toFixed(0)} days`;
  return state.plan.basis === 'km' ? `${state.currentValue.toLocaleString('en-AE', { maximumFractionDigits: 0 })} km` : `${state.currentValue.toLocaleString('en-AE', { maximumFractionDigits: 1 })} h`;
}

function dueDisplay(state: PlanState): string {
  if (state.remaining === null) return 'Not measured';
  if (state.plan.basis === 'days') return state.remaining < 0 ? `${Math.abs(state.remaining).toFixed(0)} days overdue` : `${state.remaining.toFixed(0)} days remaining`;
  const unit = state.plan.basis === 'km' ? 'km' : 'h';
  return state.remaining < 0 ? `${Math.abs(state.remaining).toFixed(0)} ${unit} overdue` : `${state.remaining.toFixed(0)} ${unit} remaining`;
}

export default function MaintenancePage() {
  const session = useStore(state => state.session);
  const phase = useStore(state => state.demoSwitches.phase);
  const now = clock.now();
  const [revision, setRevision] = useState(0);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [serviceValue, setServiceValue] = useState('');
  const [serviceCost, setServiceCost] = useState('');
  const [serviceNotes, setServiceNotes] = useState('');
  const [notice, setNotice] = useState('');

  const visibleAssets = useMemo(() => {
    if (!session || !can(session, 'maintenance.view')) return [];
    return seed.assets.filter(asset => {
      if (asset.retiredAt || !isAssetVisible(session, asset.id)) return false;
      return session.isKasper || asset.ownerTenantId === session.tenantId;
    });
  }, [session]);
  const visibleAssetIds = useMemo(() => new Set(visibleAssets.map(asset => asset.id)), [visibleAssets]);
  const planStates = useMemo(() => {
    return seed.maintenancePlans
      .filter(plan => visibleAssetIds.has(plan.assetId))
      .flatMap(plan => {
        const asset = visibleAssets.find(item => item.id === plan.assetId);
        if (!asset) return [];
        const from = now - 7 * DAY_MS;
        const readings = getReadingsForAsset(asset, from, now);
        return [buildPlanState(plan, asset, now, readings)];
      })
      .sort((a, b) => {
        const order: Record<DueState, number> = { overdue: 0, due_soon: 1, on_track: 2, not_measured: 3 };
        return order[a.dueState] - order[b.dueState] || a.asset.code.localeCompare(b.asset.code);
      });
  }, [now, revision, visibleAssetIds, visibleAssets]);
  const activeState = planStates.find(state => state.plan.id === activePlanId);
  const canManage = Boolean(session && phase === 'later' && can(session, 'maintenance.manage'));

  const openServiceForm = (state: PlanState) => {
    if (!session || phase !== 'later' || !can(session, 'maintenance.manage', state.asset.id) || !isAssetVisible(session, state.asset.id) || (!session.isKasper && state.asset.ownerTenantId !== session.tenantId)) {
      setNotice('You cannot log service for this asset.');
      return;
    }
    setActivePlanId(state.plan.id);
    setServiceValue(state.currentValue === null || state.plan.basis === 'days' ? '' : String(Number(state.currentValue.toFixed(1))));
    setServiceCost('');
    setServiceNotes('');
    setNotice('');
  };

  const saveService = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || phase !== 'later' || !activeState || !can(session, 'maintenance.manage', activeState.asset.id) || !isAssetVisible(session, activeState.asset.id) || (!session.isKasper && activeState.asset.ownerTenantId !== session.tenantId)) {
      setNotice('You cannot log service for this asset.');
      return;
    }
    const cost = Number(serviceCost || '0');
    const value = activeState.plan.basis === 'days' ? 0 : Number(serviceValue);
    if (!Number.isFinite(cost) || cost < 0 || (activeState.plan.basis !== 'days' && (!Number.isFinite(value) || value < 0))) {
      setNotice('Enter a valid service value and cost.');
      return;
    }
    const at = clock.now();
    const plan = seed.maintenancePlans.find(item => item.id === activeState.plan.id);
    if (!plan) {
      setNotice('This service plan is no longer available.');
      return;
    }
    plan.lastDoneAt = at;
    plan.lastDoneValue = value;
    const dueSoonMargin = plan.basis === 'days' ? Math.max(plan.interval * DUE_SOON_PCT, DUE_SOON_DAYS) : plan.interval * DUE_SOON_PCT;
    plan.dueSoonAt = value + plan.interval - dueSoonMargin;
    const recordId = `sr-${String(seed.serviceRecords.length + 1).padStart(3, '0')}`;
    const record: ServiceRecord = {
      id: recordId,
      planId: plan.id,
      assetId: plan.assetId,
      tenantId: plan.tenantId,
      doneAt: at,
      value,
      notes: serviceNotes.trim(),
      costAed: cost,
      createdBy: session.userId,
    };
    seed.serviceRecords.push(record);
    const sequence = seed.auditEntries.length + 1;
    seed.auditEntries.push({
      id: `au-${String(sequence).padStart(3, '0')}`,
      at,
      actorUserId: session.userId,
      action: 'maintenance.service.log',
      tenantId: plan.tenantId,
      assetId: plan.assetId,
      detail: `Service logged for ${activeState.asset.code}: ${plan.name}`,
    });
    setActivePlanId(null);
    setNotice(`Service logged. ${plan.name} is reset from ${clock.formatDubaiDate(at)}.`);
    setRevision(current => current + 1);
  };

  if (!session) return null;
  if (phase !== 'later') {
    return <div className="space-y-4"><h1 className="text-lg font-semibold text-ink">Maintenance</h1><EmptyState title="Not available" description="Maintenance is available in the Later phase." /></div>;
  }
  if (!can(session, 'maintenance.view')) {
    return <EmptyState title="Access denied" description="You do not have permission to view maintenance plans." />;
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold text-ink">Maintenance</h1>
        <p className="mt-1 text-sm text-grey-500">Due soon means within 10% of the interval or 14 days. Past due is marked overdue.</p>
      </header>

      {notice && <p role="status" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-grey-700">{notice}</p>}

      {planStates.length === 0 ? (
        <EmptyState title="No maintenance plans" description="There are no maintenance plans for assets you can manage." />
      ) : (
        <section className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr className="border-b border-line bg-paper-2 text-left text-xs text-grey-500"><th className="px-3 py-2">Asset</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2">Basis</th><th className="px-3 py-2">Current</th><th className="px-3 py-2">Due</th><th className="px-3 py-2">State</th><th className="px-3 py-2">Action</th></tr></thead>
              <tbody className="divide-y divide-line">
                {planStates.map(state => {
                  const badge = stateBadge(state.dueState);
                  return (
                    <tr key={state.plan.id}>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-medium text-ink">{state.asset.code}</td>
                      <td className="px-3 py-2 text-ink">{state.plan.name}</td>
                      <td className="px-3 py-2"><SourceLabel source={state.basisLabel} /></td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{currentDisplay(state)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-grey-700">{dueDisplay(state)}</td>
                      <td className="px-3 py-2"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                      <td className="px-3 py-2"><Button type="button" size="sm" variant="secondary" disabled={!canManage} onClick={() => openServiceForm(state)} title={canManage ? undefined : 'You do not have permission to log service'}>Log service</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeState && canManage && (
        <form onSubmit={saveService} className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Log service · {activeState.asset.code}</h2>
            <p className="mt-1 text-xs text-grey-500">Saving the service record resets this plan from now.</p>
          </div>
          {activeState.plan.basis !== 'days' && (
            <label className="block text-xs font-medium text-grey-500">
              Current {activeState.plan.basis === 'km' ? 'odometer (km)' : 'engine hours'}
              <input type="number" min="0" step="0.1" required value={serviceValue} onChange={event => setServiceValue(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink" />
            </label>
          )}
          <label className="block text-xs font-medium text-grey-500">
            Cost (AED)
            <input type="number" min="0" step="0.01" value={serviceCost} onChange={event => setServiceCost(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink" />
          </label>
          <label className="block text-xs font-medium text-grey-500">
            Service notes
            <textarea value={serviceNotes} onChange={event => setServiceNotes(event.target.value)} rows={3} maxLength={300} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink" />
          </label>
          <div className="flex gap-2">
            <Button type="submit">Save service</Button>
            <Button type="button" variant="secondary" onClick={() => setActivePlanId(null)}>Cancel</Button>
          </div>
        </form>
      )}

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">Recent service records</h2>
        {seed.serviceRecords.filter(record => visibleAssetIds.has(record.assetId)).length === 0 ? (
          <p className="mt-2 text-sm text-grey-500">No service records are available.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {seed.serviceRecords.filter(record => visibleAssetIds.has(record.assetId)).slice().sort((a, b) => toMillis(b.doneAt) - toMillis(a.doneAt)).slice(0, 10).map(record => {
              const asset = seed.assets.find(item => item.id === record.assetId);
              return <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span className="text-grey-700"><span className="font-mono text-ink">{asset?.code ?? 'Asset'}</span> · {record.notes || 'Service logged'}</span><span className="font-mono text-xs text-grey-500">{clock.formatDubaiDateTime(toMillis(record.doneAt))} · AED {record.costAed.toFixed(2)}</span></li>;
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
