'use client';

import React, { useState, useMemo } from 'react';
import { Button, Badge, EmptyState } from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { hasCapability } from '@/server/access';
import type { MaintenancePlan, ServiceRecord } from '@/domain/types';

function fmtValue(value: number, basis: string): string {
  if (basis === 'km') return `${value.toLocaleString('en-AE')} km`;
  if (basis === 'days') return `${value.toLocaleString('en-AE')} days`;
  return `${value.toLocaleString('en-AE')} h`;
}

function dueStatus(plan: MaintenancePlan): 'overdue' | 'due_soon' | 'on_track' {
  const now = clock.now();
  const lastDoneMs = typeof plan.lastDoneAt === 'number' ? plan.lastDoneAt : new Date(plan.lastDoneAt).getTime();
  const elapsed = now - lastDoneMs;
  const intervalMs = plan.interval * (plan.basis === 'days' ? 86400000 : 1);
  const consumedRatio = elapsed / intervalMs;
  if (consumedRatio >= 1) return 'overdue';
  if (consumedRatio >= 0.8) return 'due_soon';
  return 'on_track';
}

function dueBadge(status: 'overdue' | 'due_soon' | 'on_track'): React.ReactNode {
  const variants = { overdue: 'red', due_soon: 'yellow', on_track: 'green' };
  const labels = { overdue: 'Overdue', due_soon: 'Due soon', on_track: 'On track' };
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}

export default function MaintenancePage() {
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  const [collapsePlans, setCollapsePlans] = useState(true);
  const [collapseService, setCollapseService] = useState(true);

  const canView = hasCapability(session!, 'maintenance.view');

  const tenantPlans = useMemo(() => {
    if (!session) return [];
    return seed.maintenancePlans.filter(p => p.tenantId === session.tenantId);
  }, [session]);

  const tenantServiceRecords = useMemo(() => {
    if (!session) return [];
    return seed.serviceRecords.filter(sr => sr.tenantId === session.tenantId);
  }, [session]);

  const tenantAlerts = useMemo(() => {
    if (!session) return [];
    return seed.alerts.filter(a =>
      a.tenantId === session.tenantId &&
      (a.type === 'maintenance_due' || a.type === 'maintenance_overdue')
    );
  }, [session]);

  const overdueCount = useMemo(() => {
    return tenantPlans.filter(p => dueStatus(p) === 'overdue').length;
  }, [tenantPlans]);

  const dueSoonCount = useMemo(() => {
    return tenantPlans.filter(p => dueStatus(p) === 'due_soon').length;
  }, [tenantPlans]);

  if (!session) return null;

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Maintenance</h1>
        <p className="text-sm text-grey-500 mt-1">
          Service plans, upcoming due dates, and maintenance history for your assets.
        </p>
      </div>

      {phase === 'later' ? (
        <EmptyState title="Not available" description="Maintenance is available in the Later phase." />
      ) : (
        <>
          {/* Alert banner */}
          {tenantAlerts.length > 0 && (
            <div className="space-y-2">
              {tenantAlerts.map(alert => (
                <div key={alert.id} className="bg-surface border border-line rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={alert.type === 'maintenance_overdue' ? 'red' : 'yellow'}>
                          {alert.type === 'maintenance_overdue' ? 'Overdue' : 'Due soon'}
                        </Badge>
                        <span className="font-medium text-ink text-sm">{alert.detail}</span>
                      </div>
                      <div className="text-xs text-grey-500 mt-1">
                        {clock.formatDubaiDateTime(new Date(alert.openedAt).getTime())}
                      </div>
                    </div>
                    <Button variant="secondary" size="sm">View</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Plan summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface border border-line rounded-lg p-3">
              <div className="text-xs text-grey-500 font-medium">Active plans</div>
              <div className="text-lg font-semibold text-ink mt-1">{tenantPlans.length}</div>
            </div>
            <div className="bg-surface border border-line rounded-lg p-3">
              <div className="text-xs text-grey-500 font-medium">Due soon</div>
              <div className="text-lg font-semibold text-yellow-dark mt-1">{dueSoonCount}</div>
            </div>
            <div className="bg-surface border border-line rounded-lg p-3">
              <div className="text-xs text-grey-500 font-medium">Overdue</div>
              <div className="text-lg font-semibold text-red mt-1">{overdueCount}</div>
            </div>
          </div>

          {/* Maintenance plans */}
          <div className="bg-surface border border-line rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-sm font-medium text-ink">Service plans</h2>
                <p className="text-xs text-grey-500 mt-0.5">{tenantPlans.length} active plan{tenantPlans.length !== 1 ? 's' : ''}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setCollapsePlans(!collapsePlans)}>
                {collapsePlans ? 'Show' : 'Hide'}
              </Button>
            </div>
            {!collapsePlans && tenantPlans.length > 0 ? (
              <div className="space-y-2">
                {tenantPlans.map(plan => {
                  const asset = seed.assets.find(a => a.id === plan.assetId);
                  const status = dueStatus(plan);
                  const lastDoneMs = typeof plan.lastDoneAt === 'number' ? plan.lastDoneAt : new Date(plan.lastDoneAt).getTime();
                  return (
                    <div key={plan.id} className="bg-paper border border-line rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink text-sm">{plan.name}</span>
                            {dueBadge(status)}
                          </div>
                          <div className="text-xs text-grey-500 mt-1">
                            {asset?.code} — {asset?.name}
                          </div>
                          <div className="text-xs text-grey-500 mt-0.5">
                            Every {plan.interval.toLocaleString('en-AE')} {plan.basis} · source: {plan.hoursSource ?? plan.kmSource ?? '—'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-mono text-ink">{fmtValue(plan.dueSoonAt, plan.basis)}</div>
                          <div className="text-xs text-grey-500">due at</div>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-4 text-xs text-grey-500">
                        <span>Last done: {clock.formatDubaiDate(lastDoneMs)}</span>
                        <span>At: {fmtValue(plan.lastDoneValue, plan.basis)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-4 text-center text-sm text-grey-500">
                {tenantPlans.length === 0 ? 'No service plans for this tenant.' : 'Collapse to hide plans.'}
              </div>
            )}
          </div>

          {/* Service records */}
          <div className="bg-surface border border-line rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-sm font-medium text-ink">Service history</h2>
                <p className="text-xs text-grey-500 mt-0.5">Past service events</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setCollapseService(!collapseService)}>
                {collapseService ? 'Show' : 'Hide'}
              </Button>
            </div>
            {!collapseService && tenantServiceRecords.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-paper-2 text-grey-500">
                      <th className="px-3 py-2 text-left font-medium">Date</th>
                      <th className="px-3 py-2 text-left font-medium">Asset</th>
                      <th className="px-3 py-2 text-left font-medium">Plan</th>
                      <th className="px-3 py-2 text-right font-medium">Reading</th>
                      <th className="px-3 py-2 text-right font-medium">Cost (AED)</th>
                      <th className="px-3 py-2 text-left font-medium">Done by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantServiceRecords.map(sr => {
                      const asset = seed.assets.find(a => a.id === sr.assetId);
                      const user = seed.users.find(u => u.id === sr.createdBy);
                      return (
                        <tr key={sr.id} className="bg-paper hover:bg-paper-2">
                          <td className="px-3 py-2 border-b border-line text-grey-500">{clock.formatDubaiDate(new Date(sr.doneAt).getTime())}</td>
                          <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{asset?.code ?? '—'}</td>
                          <td className="px-3 py-2 border-b border-line text-grey-700">{sr.notes}</td>
                          <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">{sr.value.toLocaleString('en-AE')}</td>
                          <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">{sr.costAed.toLocaleString('en-AE')}</td>
                          <td className="px-3 py-2 border-b border-line text-grey-500">{user?.name ?? sr.createdBy}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-4 text-center text-sm text-grey-500">
                {tenantServiceRecords.length === 0 ? 'No service records yet.' : 'Collapse to hide history.'}
              </div>
            )}
          </div>

          <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
            Maintenance plans are triggered by engine hours (ECU), GPS odometer, or CAN odometer.
            Overdue alerts are raised when the current reading passes the plan's interval.
          </div>
        </>
      )}
    </div>
  );
}
