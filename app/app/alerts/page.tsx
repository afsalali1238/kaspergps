'use client';

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Badge, Button, EmptyState } from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { isAssetVisible, getRelationship, rentalWindow } from '@/server/access';
import { can } from '@/server/capabilities';
import { hasFeature, featurePhase } from '@/domain/features';
import type { Alert, AlertType, Asset, Session } from '@/domain/types';

type AlertFilter = 'open' | 'acknowledged' | 'all';

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  offline: 'Offline',
  power_cut: 'Power cut',
  low_battery: 'Low battery',
  towing: 'Towing',
  overspeed: 'Over speed',
  harsh_driving: 'Harsh driving',
  fuel_drop: 'Fuel drop',
  fault_code: 'Fault code',
  geofence_enter: 'Geofence enter',
  geofence_exit: 'Geofence exit',
  after_hours_move: 'After-hours move',
  maintenance_due: 'Maintenance due',
  maintenance_overdue: 'Maintenance overdue',
  invoice_overdue: 'Invoice overdue',
};

const ALERT_FEATURES: Partial<Record<AlertType, string>> = {
  offline: 'alerts.offline',
  power_cut: 'alerts.power',
  low_battery: 'alerts.power',
  towing: 'alerts.towing',
  overspeed: 'trips',
  harsh_driving: 'driving.events',
  fuel_drop: 'alerts.fuelDrop',
  fault_code: 'faults',
  geofence_enter: 'geofence.events',
  geofence_exit: 'geofence.events',
  after_hours_move: 'geofence.events',
};

function toMillis(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : new Date(value).getTime();
}

function isOpen(alert: Alert): boolean {
  return !alert.closedAt && !alert.acknowledgedAt;
}

function maintenanceAlertSupported(asset: Asset, type: AlertType): boolean {
  const plans = seed.maintenancePlans.filter(plan => plan.assetId === asset.id);
  return plans.some(plan => {
    if (plan.basis === 'days') return true;
    if (plan.basis === 'km') return plan.kmSource === 'can'
      ? hasFeature(asset, 'odometer.can')
      : hasFeature(asset, 'history.track');
    return plan.hoursSource === 'ecu'
      ? hasFeature(asset, 'hours.ecu')
      : hasFeature(asset, 'hours.ignition');
  }) && (type === 'maintenance_due' || type === 'maintenance_overdue');
}

function phaseAllows(sessionPhase: string, type: AlertType): boolean {
  if (type === 'invoice_overdue') return sessionPhase !== 'day_one';
  if (type === 'maintenance_due' || type === 'maintenance_overdue') return sessionPhase === 'later';
  const feature = ALERT_FEATURES[type];
  if (!feature) return true;
  const phase = featurePhase(feature);
  if (!phase || phase === 'day_one') return true;
  return sessionPhase === 'later' || sessionPhase === 'phase2';
}

function supportsType(type: AlertType, asset: Asset): boolean {
  if (type === 'maintenance_due' || type === 'maintenance_overdue') return maintenanceAlertSupported(asset, type);
  const feature = ALERT_FEATURES[type];
  return feature ? hasFeature(asset, feature) : false;
}

function alertVisibleToSession(alert: Alert, session: Session, phase: string): boolean {
  if (alert.tenantId && !session.isKasper && alert.tenantId !== session.tenantId) return false;
  if (alert.assetId) {
    const asset = seed.assets.find(item => item.id === alert.assetId);
    if (!asset || asset.retiredAt || !isAssetVisible(session, asset.id) || !can(session, 'alert.view', asset.id)) return false;
    if (getRelationship(session, asset.id) === 'renter') {
      const window = rentalWindow(session, asset.id);
      const openedAt = toMillis(alert.openedAt);
      if (!window || openedAt < window.start || openedAt > window.end) return false;
    }
    return supportsType(alert.type, asset) && phaseAllows(phase, alert.type);
  }
  if (alert.type !== 'invoice_overdue' || !can(session, 'billing.view')) return false;
  return phaseAllows(phase, alert.type);
}

function alertStatus(alert: Alert): 'open' | 'acknowledged' | 'closed' {
  if (alert.closedAt) return 'closed';
  if (alert.acknowledgedAt) return 'acknowledged';
  return 'open';
}

export default function AlertsPage() {
  const session = useStore(state => state.session);
  const phase = useStore(state => state.demoSwitches.phase);
  const [filter, setFilter] = useState<AlertFilter>('open');
  const [selectedType, setSelectedType] = useState<AlertType | 'all'>('all');
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');

  const visibleAlerts = useMemo(() => {
    if (!session) return [];
    return seed.alerts
      .filter(alert => alertVisibleToSession(alert, session, phase))
      .sort((a, b) => toMillis(b.openedAt) - toMillis(a.openedAt));
  }, [session, phase, revision]);

  const availableTypes = useMemo(
    () => Array.from(new Set(visibleAlerts.map(alert => alert.type))),
    [visibleAlerts]
  );
  const filteredAlerts = visibleAlerts.filter(alert => {
    const status = alertStatus(alert);
    if (filter === 'open' && status !== 'open') return false;
    if (filter === 'acknowledged' && status !== 'acknowledged') return false;
    if (selectedType !== 'all' && alert.type !== selectedType) return false;
    return true;
  });
  const openCount = visibleAlerts.filter(isOpen).length;

  const acknowledge = (alertId: string) => {
    if (!session) return;
    const alert = seed.alerts.find(item => item.id === alertId);
    if (!alert || !isOpen(alert) || !alertVisibleToSession(alert, session, phase) || !can(session, 'alert.acknowledge', alert.assetId)) {
      setMessage('You cannot acknowledge this alert.');
      return;
    }
    if (alert.assetId) {
      const asset = seed.assets.find(item => item.id === alert.assetId);
      if (!asset || !isAssetVisible(session, asset.id)) {
        setMessage('You cannot acknowledge this alert.');
        return;
      }
    } else if (alert.tenantId && !session.isKasper && alert.tenantId !== session.tenantId) {
      setMessage('You cannot acknowledge this alert.');
      return;
    }

    const at = clock.now();
    alert.acknowledgedBy = session.user.name;
    alert.acknowledgedAt = new Date(at).toISOString();
    const sequence = seed.auditEntries.length + 1;
    seed.auditEntries.push({
      id: `au-${String(sequence).padStart(3, '0')}`,
      at,
      actorUserId: session.userId,
      action: 'alert.acknowledge',
      tenantId: alert.tenantId ?? session.tenantId ?? undefined,
      assetId: alert.assetId,
      detail: `${ALERT_TYPE_LABELS[alert.type]} alert acknowledged${alert.assetId ? ` for ${seed.assets.find(item => item.id === alert.assetId)?.code ?? 'asset'}` : ''}`,
    });
    setMessage('Alert acknowledged.');
    setRevision(value => value + 1);
  };

  if (!session) return null;


  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold text-ink">Alerts</h1>
        <p className="mt-1 text-sm text-grey-500">
          {openCount} open alert{openCount === 1 ? '' : 's'} you can view
        </p>
      </header>

      {message && (
        <div role="status" className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm text-grey-700">
          <span>{message}</span>
          <button type="button" aria-label="Dismiss message" className="text-grey-500 hover:text-ink" onClick={() => setMessage('')}>Dismiss</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-grey-500">Show</span>
        {(['open', 'acknowledged', 'all'] as const).map(value => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={clsx(
              'rounded-lg border px-3 py-1.5 text-xs transition-colors',
              filter === value ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-grey-700 hover:border-grey-500'
            )}
          >
            {value === 'open' ? 'Open' : value === 'acknowledged' ? 'Acknowledged' : 'All'}
          </button>
        ))}
      </div>

      {availableTypes.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-grey-500">Type</span>
          <button
            type="button"
            onClick={() => setSelectedType('all')}
            aria-pressed={selectedType === 'all'}
            className={clsx('rounded-lg border px-3 py-1.5 text-xs', selectedType === 'all' ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-grey-700')}
          >All types</button>
          {availableTypes.map(type => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              aria-pressed={selectedType === type}
              className={clsx('rounded-lg border px-3 py-1.5 text-xs', selectedType === type ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-grey-700')}
            >
              {ALERT_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      )}

      {filteredAlerts.length === 0 ? (
        <EmptyState title="No alerts" description="There are no alerts for this filter and date range." />
      ) : (
        <ul className="space-y-2">
          {filteredAlerts.map(alert => {
            const asset = alert.assetId ? seed.assets.find(item => item.id === alert.assetId) : undefined;
            const site = asset ? seed.sites.find(item => item.id === asset.homeSiteId) : undefined;
            const status = alertStatus(alert);
            const canAcknowledge = can(session, 'alert.acknowledge', alert.assetId);
            return (
              <li key={alert.id} className={clsx('rounded-xl border bg-surface p-4', status === 'open' ? 'border-red/30' : 'border-line')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {asset && <span className="font-mono text-sm font-semibold text-ink">{asset.code}</span>}
                      {asset && <span className="text-sm text-grey-500">{asset.name}</span>}
                      {!asset && <span className="text-sm font-medium text-ink">Billing</span>}
                      <Badge variant={status === 'open' ? 'red' : status === 'acknowledged' ? 'green' : 'grey'}>{ALERT_TYPE_LABELS[alert.type]}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-grey-700">{alert.detail}</p>
                    <p className="mt-1 text-xs text-grey-500">
                      {clock.formatDubaiDateTime(toMillis(alert.openedAt))}{site ? ` · ${site.name}` : ''}
                    </p>
                    {alert.acknowledgedAt && (
                      <p className="mt-1 text-xs text-grey-500">
                        Acknowledged by {alert.acknowledgedBy ?? 'a Kasper user'} · {clock.formatDubaiDateTime(toMillis(alert.acknowledgedAt))}
                      </p>
                    )}
                  </div>
                  {status === 'open' && (
                    <Button type="button" size="sm" variant="secondary" disabled={!canAcknowledge} onClick={() => acknowledge(alert.id)} title={canAcknowledge ? undefined : 'You do not have permission to acknowledge alerts'}>
                      Acknowledge
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
