'use client';

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Badge, Button, EmptyState,
} from '@/components/ui';
import { useStore } from '@/store';
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

export default function AlertsPage() {
  const store = useStore;
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
            typeLabel: 'Offline',
            typeWords: 'Offline since 14:32',
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
            typeLabel: ALERT_TYPE_LABELS[type],
            typeWords: ALERT_TYPE_WORDS[type],
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
  }, [session, visibleAssets, phase]);

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
        <h1 className="text-lg font-semibold text-ink">Alerts</h1>
        <p className="text-sm text-grey-500 mt-1">
          {openCount} open alert{openCount !== 1 ? 's' : ''}
          {phase === 'day_one' && ' (Day one: offline alerts only)'}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-grey-500 font-medium">Show:</span>
        <button
          onClick={() => setAlertFilter('unacknowledged')}
          className={clsx(
            'px-2 py-1 text-xs rounded-lg border transition-colors',
            alertFilter === 'unacknowledged' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
          )}
        >
          Unacknowledged
        </button>
        <button
          onClick={() => setAlertFilter('acknowledged')}
          className={clsx(
            'px-2 py-1 text-xs rounded-lg border transition-colors',
            alertFilter === 'acknowledged' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
          )}
        >
          Acknowledged
        </button>
        <button
          onClick={() => setAlertFilter('all')}
          className={clsx(
            'px-2 py-1 text-xs rounded-lg border transition-colors',
            alertFilter === 'all' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
          )}
        >
          All
        </button>
      </div>

      {/* Alerts list */}
      {filteredAlerts.length === 0 ? (
        <EmptyState
          title="No alerts"
          description="There are no alerts to show."
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
                    Since {alert.since} · {alert.siteName}
                  </div>
                  {alert.status === 'acknowledged' && alert.acknowledgedBy && (
                    <div className="text-xs text-grey-500 mt-1">
                      Acknowledged by {alert.acknowledgedBy} at {alert.acknowledgedAt}
                    </div>
                  )}
                </div>
                {alert.status === 'open' && canAcknowledge && (
                  <Button size="sm" variant="secondary">
                    Acknowledge
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
