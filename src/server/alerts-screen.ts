// Alerts screen (UI-UPGRADE §8, Agent G): severity groups, the KPI strip and
// bulk acknowledge. Everything here is built on `visibleAlerts` and
// `acknowledgeAlert` from ./alerts, so the screen, the bell and the access
// rules share one source.

import type { AlertType, Session } from '@/domain/types';
import { db } from '@/server/db';
import { can } from '@/server/capabilities';
import { getRelationship } from '@/server/access';
import { acknowledgeAlert, visibleAlerts, type AlertView } from '@/server/alerts';
import * as clock from '@/lib/clock';

export type AlertSeverity = 'critical' | 'warning' | 'info';

/** Group order on the page: Critical, then Warning, then Info. */
export const SEVERITY_ORDER: readonly AlertSeverity[] = ['critical', 'warning', 'info'];

/** Spec §8: offline, power cut, fuel drop and fault are critical. */
const SEVERITY_BY_TYPE: Record<AlertType, AlertSeverity> = {
  offline: 'critical',
  power_cut: 'critical',
  fuel_drop: 'critical',
  fault_code: 'critical',
  towing: 'warning',
  overspeed: 'warning',
  harsh_driving: 'warning',
  low_battery: 'warning',
  low_fuel: 'warning',
  after_hours_move: 'warning',
  geofence_exit: 'warning',
  maintenance_overdue: 'warning',
  invoice_overdue: 'warning',
  geofence_enter: 'info',
  maintenance_due: 'info',
  idle: 'info',
};

export function alertSeverity(type: AlertType): AlertSeverity {
  return SEVERITY_BY_TYPE[type] ?? 'info';
}

export interface AlertGroup {
  severity: AlertSeverity;
  alerts: AlertView[];
}

/** Alerts grouped by severity, in SEVERITY_ORDER; empty groups are left out. Newest first inside a group. */
export function groupAlertsBySeverity(alerts: readonly AlertView[]): AlertGroup[] {
  return SEVERITY_ORDER
    .map(severity => ({
      severity,
      alerts: alerts
        .filter(a => alertSeverity(a.type) === severity)
        .sort((a, b) => toMs(b.openedAt) - toMs(a.openedAt)),
    }))
    .filter(g => g.alerts.length > 0);
}

export interface AlertKpis {
  /** Opened since Dubai midnight today (up to the demo clock). */
  newToday: number;
  /** Open (not acknowledged, not closed) critical alerts. */
  critical: number;
  /** Open warning alerts. */
  warning: number;
  /** Acknowledged since Dubai midnight today. */
  acknowledgedToday: number;
}

/** The KPI strip for the alerts the user may see. Counts only; nothing estimated. */
export function alertKpis(session: Session, phase: string = 'later'): AlertKpis {
  const alerts = visibleAlerts(session, phase);
  const now = clock.now();
  const dayStart = clock.startOfDubaiDay(now);
  const today = (ms: number) => ms >= dayStart && ms <= now;
  return {
    newToday: alerts.filter(a => today(toMs(a.openedAt))).length,
    critical: alerts.filter(a => a.status === 'open' && alertSeverity(a.type) === 'critical').length,
    warning: alerts.filter(a => a.status === 'open' && alertSeverity(a.type) === 'warning').length,
    acknowledgedToday: alerts.filter(a => a.status === 'acknowledged' && a.acknowledgedAt && today(toMs(a.acknowledgedAt))).length,
  };
}

/**
 * Whether the user may acknowledge this alert. Mirrors the checks in
 * `acknowledgeAlert` (Kasper, or the owner's Tenant Admin) so the page shows
 * the button exactly when the action would succeed.
 */
export function mayAcknowledge(session: Session, alert: AlertView): boolean {
  if (alert.status !== 'open') return false;
  const raw = db.getState().alerts.find(a => a.id === alert.id);
  if (!raw) return false;
  if (!can(session, 'alert.acknowledge', raw.assetId ?? undefined)) return false;
  if (session.isKasper) return true;
  if (raw.tenantId) return raw.tenantId === session.tenantId;
  return Boolean(raw.assetId) && getRelationship(session, raw.assetId as string) === 'owner';
}

export interface BulkAcknowledgeResult {
  acknowledged: string[];
  skipped: string[];
}

/**
 * "Acknowledge all (n)": acknowledges each listed alert the user may
 * acknowledge, one audit entry per alert (through `acknowledgeAlert`). Alerts
 * the user can't see, can't acknowledge, or that are no longer open are skipped.
 */
export function acknowledgeAlerts(session: Session, alertIds: readonly string[], phase: string = 'later'): BulkAcknowledgeResult {
  const byId = new Map(visibleAlerts(session, phase).map(a => [a.id, a]));
  const acknowledged: string[] = [];
  const skipped: string[] = [];
  for (const id of new Set(alertIds)) {
    const view = byId.get(id);
    if (!view || !mayAcknowledge(session, view)) {
      skipped.push(id);
      continue;
    }
    const result = acknowledgeAlert(session, id);
    (result.ok ? acknowledged : skipped).push(id);
  }
  return { acknowledged, skipped };
}

function toMs(v: string | number): number {
  return typeof v === 'number' ? v : new Date(v).getTime();
}
