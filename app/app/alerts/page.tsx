'use client';

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Badge, Button, EmptyState,
} from '@/components/ui';
import { useStore } from '@/store';
import { useT } from '@/lib/useT';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { isAssetVisible } from '@/server/access';
import type { AlertType } from '@/domain/types';

type AlertFilter = 'all' | 'unacknowledged' | 'acknowledged';
type StatusFilter = 'all' | 'open' | 'acknowledged';

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
  after_hours_move: 'After hours move',
  maintenance_due: 'Maintenance due',
  maintenance_overdue: 'Maintenance overdue',
  invoice_overdue: 'Invoice overdue',
  idle: 'Idle',
  low_fuel: 'Low fuel',
};

const ALERT_TYPE_WORDS: Record<AlertType, string> = {
  offline: 'Offline since 14:32',
  power_cut: 'Power cut at 12:10 — running on tracker battery',
  low_battery: 'Tracker battery low (3.5 V)',
  towing: 'Moved with ignition off',
  overspeed: 'Over speed: 104 km/h',
  harsh_driving: 'Harsh braking',
  fuel_drop: 'Fuel dropped 18% at 02:10 with engine off',
  fault_code: 'Fault code SPN 110 FMI 0 — Engine coolant temperature high',
  geofence_enter: 'Entered geofence: Business Bay',
  geofence_exit: 'Exited geofence: Business Bay',
  after_hours_move: 'Moved outside hours',
  maintenance_due: 'Maintenance due',
  maintenance_overdue: 'Maintenance overdue',
  invoice_overdue: 'Invoice overdue',
  idle: 'Idle for 2 hours',
  low_fuel: 'Low fuel: 15%',
};

/** Catalogue keys for the type names and the sentence describing each alert. */
const ALERT_TYPE_KEYS: Record<AlertType, string> = {
  offline: 'alerts.offline',
  power_cut: 'alerts.powerCut',
  low_battery: 'alerts.lowBattery',
  towing: 'alerts.towing',
  overspeed: 'alerts.overSpeed',
  harsh_driving: 'alerts.harshDriving',
  fuel_drop: 'alerts.fuelDrop',
  fault_code: 'alerts.faultCode',
  geofence_enter: 'alerts.geofenceEnter',
  geofence_exit: 'alerts.geofenceExit',
  after_hours_move: 'alerts.afterHoursMove',
  maintenance_due: 'alerts.maintenanceDue',
  maintenance_overdue: 'alerts.maintenanceOverdue',
  invoice_overdue: 'alerts.invoiceOverdue',
  idle: 'alerts.idle',
  low_fuel: 'alerts.lowFuel',
};

const ALERT_WORD_KEYS: Record<AlertType, string> = {
  offline: 'alerts.words.offline',
  power_cut: 'alerts.words.powerCut',
  low_battery: 'alerts.words.lowBattery',
  towing: 'alerts.words.towing',
  overspeed: 'alerts.words.overspeed',
  harsh_driving: 'alerts.words.harshDriving',
  fuel_drop: 'alerts.words.fuelDrop',
  fault_code: 'alerts.words.faultCode',
  geofence_enter: 'alerts.words.geofenceEnter',
  geofence_exit: 'alerts.words.geofenceExit',
  after_hours_move: 'alerts.words.afterHoursMove',
  maintenance_due: 'alerts.words.maintenanceDue',
  maintenance_overdue: 'alerts.words.maintenanceOverdue',
  invoice_overdue: 'alerts.words.invoiceOverdue',
  idle: 'alerts.words.idle',
  low_fuel: 'alerts.words.lowFuel',
};

export default function AlertsPage() {
  const store = useStore;
  const { t } = useT();
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  const [alertFilter, setAlertFilter] = useState<AlertFilter>('unacknowledged');
  const [_statusFilter] = useState<StatusFilter>('open');

  const visibleAssets = useMemo(() => {
    if (!session) return [];
    return seed.assets.filter(a => isAssetVisible(session, a.id));
  }, [session]);

  // Generate sample alerts for visible assets (Day one: only offline alerts)
  const alerts = useMemo(() => {
    if (!session) return [];

    const result: {
      id: string;
      assetId: string;
      assetCode: string;
      assetName: string;
      type: AlertType;
      typeLabel: string;
      typeWords: string;
      status: 'open' | 'acknowledged';
      acknowledgedBy: string | null;
      acknowledgedAt: string | null;
      since: string;
      siteName: string;
    }[] = [];

    for (const asset of visibleAssets) {
      // Day one phase: only offline alerts
      if (phase === 'day_one') {
        // Only add offline alert if asset is not live
        const status = seed.pairings.find(p => p.assetId === asset.id && p.to === null)
          ? 'offline'
          : 'no_tracker';
        if (status === 'offline') {
          result.push({
            id: `alert-${asset.id}-offline`,
            assetId: asset.id,
            assetCode: asset.code,
            assetName: asset.name,
            type: 'offline',
            typeLabel: t(ALERT_TYPE_KEYS.offline, ALERT_TYPE_LABELS.offline),
            typeWords: t(ALERT_WORD_KEYS.offline, ALERT_TYPE_WORDS.offline),
            status: 'open',
            acknowledgedBy: null,
            acknowledgedAt: null,
            since: '14:32',
            siteName: seed.sites.find(s => s.id === asset.homeSiteId)?.name ?? '',
          });
        }
      } else {
        // Phase 2+: add various alert types
        const types: AlertType[] = ['offline', 'low_battery', 'overspeed', 'harsh_driving'];
        for (const type of types) {
          const isAcknowledged = Math.random() > 0.5;
          result.push({
            id: `alert-${asset.id}-${type}`,
            assetId: asset.id,
            assetCode: asset.code,
            assetName: asset.name,
            type,
            typeLabel: t(ALERT_TYPE_KEYS[type], ALERT_TYPE_LABELS[type]),
            typeWords: t(ALERT_WORD_KEYS[type], ALERT_TYPE_WORDS[type]),
            status: isAcknowledged ? 'acknowledged' : 'open',
            acknowledgedBy: isAcknowledged ? session.user.name : null,
            acknowledgedAt: isAcknowledged ? clock.formatDubaiTime(clock.now() - Math.random() * 86400000) : null,
            since: clock.formatDubaiTime(clock.now() - Math.random() * 86400000),
            siteName: seed.sites.find(s => s.id === asset.homeSiteId)?.name ?? '',
          });
        }
      }
    }

    return result;
  }, [session, visibleAssets, phase, t]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      if (alertFilter === 'unacknowledged' && a.status !== 'open') return false;
      if (alertFilter === 'acknowledged' && a.status !== 'acknowledged') return false;
      if (_statusFilter === 'open' && a.status !== 'open') return false;
      if (_statusFilter === 'acknowledged' && a.status !== 'acknowledged') return false;
      return true;
    });
  }, [alerts, alertFilter, _statusFilter]);

  const openCount = useMemo(() => alerts.filter(a => a.status === 'open').length, [alerts]);
  const canAcknowledge = session?.isKasper || session?.role === 'tenant_admin';

  if (!session) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-ink">{t('alerts.title', 'Alerts')}</h1>
        <p className="text-sm text-grey-500 mt-1">
          {t(
            'alerts.openCount',
            openCount === 1 ? '1 open alert' : `${openCount} open alerts`,
            { count: openCount },
          )}
          {phase === 'day_one' && ` ${t('alerts.dayOneNote', '(Day one: offline alerts only)')}`}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-grey-500 font-medium">{t('alerts.filters.show', 'Show:')}</span>
        <button
          onClick={() => setAlertFilter('unacknowledged')}
          className={clsx(
            'px-2 py-1 text-xs rounded-lg border transition-colors',
            alertFilter === 'unacknowledged' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
          )}
        >
          {t('alerts.filters.unacknowledged', 'Unacknowledged')}
        </button>
        <button
          onClick={() => setAlertFilter('acknowledged')}
          className={clsx(
            'px-2 py-1 text-xs rounded-lg border transition-colors',
            alertFilter === 'acknowledged' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
          )}
        >
          {t('alerts.filters.acknowledged', 'Acknowledged')}
        </button>
        <button
          onClick={() => setAlertFilter('all')}
          className={clsx(
            'px-2 py-1 text-xs rounded-lg border transition-colors',
            alertFilter === 'all' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
          )}
        >
          {t('alerts.filters.all', 'All')}
        </button>
      </div>

      {/* Alerts list */}
      {filteredAlerts.length === 0 ? (
        <EmptyState
          title={t('alerts.empty', 'No alerts')}
          description={t('alerts.emptyDescription', 'There are no alerts to show.')}
        />
      ) : (
        <div className="space-y-2">
          {filteredAlerts.map(alert => (
            <div
              key={alert.id}
              className={clsx(
                'bg-surface border rounded-lg p-4',
                alert.status === 'open' ? 'border-red/20' : 'border-line'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{alert.assetCode}</span>
                    <span className="text-grey-500">— {alert.assetName}</span>
                    <Badge
                      variant={alert.status === 'open' ? 'red' : 'grey'}
                    >
                      {alert.typeLabel}
                    </Badge>
                  </div>
                  <div className="text-sm text-grey-700 mt-1">{alert.typeWords}</div>
                  <div className="text-xs text-grey-500 mt-1">
                    {t('alerts.since', `Since ${alert.since} · ${alert.siteName}`, {
                      time: alert.since,
                      site: alert.siteName,
                    })}
                  </div>
                  {alert.status === 'acknowledged' && alert.acknowledgedBy && (
                    <div className="text-xs text-grey-500 mt-1">
                      {t('alerts.acknowledgedBy', `Acknowledged by ${alert.acknowledgedBy} at ${alert.acknowledgedAt}`, {
                        name: alert.acknowledgedBy,
                        time: alert.acknowledgedAt ?? '',
                      })}
                    </div>
                  )}
                </div>
                {alert.status === 'open' && canAcknowledge && (
                  <Button size="sm" variant="secondary">
                    {t('alerts.acknowledge', 'Acknowledge')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
