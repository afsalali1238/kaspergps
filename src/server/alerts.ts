// Alerts (spec §11.4): what each user may see, in plain words, with real
// acknowledge. Alert rows come from the seeded alert set plus the derived
// tenant-owned alerts; visibility follows asset visibility (or the owning
// tenant for geofence/maintenance/invoice alerts). Day one shows offline only.

import type { Alert, AlertType, Session } from '@/domain/types';
import { seed } from '@/server/seed/data';
import { fail, ok, type OpResult } from '@/server/result';
import { hasCapability, isAssetVisible, getRelationship } from '@/server/access';
import { recordAuditForSession } from '@/server/audit';
import { hasFeature } from '@/domain/features';
import * as clock from '@/lib/clock';

export interface AlertView {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  siteName: string;
  type: AlertType;
  typeLabel: string;
  typeWords: string;
  status: 'open' | 'acknowledged' | 'closed';
  openedAt: string | number;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  tenantOwned: boolean;
}

const TYPE_LABELS: Record<string, string> = {
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
  maintenance_due: 'Maintenance due soon',
  maintenance_overdue: 'Maintenance overdue',
  invoice_overdue: 'Invoice overdue',
  idle: 'Long idle',
  low_fuel: 'Low fuel',
};

function toMs(v: string | number): number {
  return typeof v === 'number' ? v : new Date(v).getTime();
}

function toView(alert: Alert): AlertView {
  const asset = alert.assetId ? seed.assets.find(a => a.id === alert.assetId) : undefined;
  return {
    id: alert.id,
    assetId: alert.assetId ?? '',
    assetCode: asset?.code ?? '—',
    assetName: asset?.name ?? '',
    siteName: asset ? (seed.sites.find(s => s.id === asset.homeSiteId)?.name ?? '') : '',
    type: alert.type,
    typeLabel: TYPE_LABELS[alert.type] ?? alert.type,
    typeWords: alert.detail,
    status: alert.closedAt ? 'closed' : alert.acknowledgedAt ? 'acknowledged' : 'open',
    openedAt: alert.openedAt,
    acknowledgedBy: alert.acknowledgedBy,
    acknowledgedAt: alert.acknowledgedAt,
    tenantOwned: Boolean(alert.tenantId),
  };
}

/** Types that only exist when the user's fleet can measure them (§6.4 rule 3). */
const HARDWARE_TYPES: { type: string; feature: string }[] = [
  { type: 'fuel_drop', feature: 'fuel.level' },
  { type: 'low_fuel', feature: 'fuel.level' },
  { type: 'fault_code', feature: 'faults' },
];

function alertVisible(session: Session, alert: Alert, phase: string): boolean {
  // Day one: offline alerts only.
  if (phase === 'day_one' && alert.type !== 'offline') return false;

  // Tenant-owned alerts (geofence, maintenance, invoice) belong to one tenant —
  // and when they name an asset, the user must also see that asset (S9: Deepa
  // never sees Al Quoz alerts, even tenant-owned ones).
  if (alert.tenantId) {
    const tenantOk = session.isKasper || alert.tenantId === session.tenantId;
    if (!tenantOk) return false;
    if (alert.assetId) return isAssetVisible(session, alert.assetId);
    return true;
  }

  // Asset alerts follow asset visibility.
  if (!alert.assetId) return false;
  if (!isAssetVisible(session, alert.assetId)) return false;

  // Hardware-gated types: the asset must be able to produce them.
  const asset = seed.assets.find(a => a.id === alert.assetId);
  if (!asset) return false;
  for (const hw of HARDWARE_TYPES) {
    if (hw.type === alert.type && !hasFeature(asset, hw.feature)) return false;
  }
  return true;
}

export function visibleAlerts(session: Session, phase: string = 'later'): AlertView[] {
  return seed.alerts
    .filter(a => alertVisible(session, a, phase))
    .map(toView)
    .sort((a, b) => toMs(b.openedAt) - toMs(a.openedAt));
}

export function openAlertCount(session: Session, phase: string = 'later'): number {
  return visibleAlerts(session, phase).filter(a => a.status === 'open').length;
}

/** Type filter options: only types the user's visible alerts actually use. */
export function alertTypesIn(session: Session, phase: string = 'later'): { type: AlertType; label: string }[] {
  const seen = new Map<string, string>();
  for (const a of visibleAlerts(session, phase)) {
    if (!seen.has(a.type)) seen.set(a.type, a.typeLabel);
  }
  return Array.from(seen, ([type, label]) => ({ type: type as AlertType, label }));
}

/** Acknowledge: Kasper and the owner's Tenant Admin only (matrix, §5). */
export function acknowledgeAlert(session: Session, alertId: string): OpResult<AlertView> {
  if (!hasCapability(session, 'alert.acknowledge')) {
    return fail('You can’t acknowledge alerts.');
  }
  const alert = seed.alerts.find(a => a.id === alertId);
  if (!alert || !alertVisible(session, alert, 'later')) return fail('Alert not found.');
  if (!session.isKasper) {
    if (alert.tenantId) {
      if (alert.tenantId !== session.tenantId) return fail('Alert not found.');
    } else if (!alert.assetId || getRelationship(session, alert.assetId) !== 'owner') {
      return fail('Only the owner can acknowledge this alert.');
    }
  }
  if (alert.acknowledgedAt) return ok(toView(alert), 'Already acknowledged.');

  alert.acknowledgedBy = session.user.name;
  alert.acknowledgedAt = new Date(clock.now()).toISOString();
  recordAuditForSession(session, {
    action: 'alert.acknowledge',
    assetId: alert.assetId,
    tenantId: alert.tenantId,
    detail: `Alert ${alert.id} acknowledged: ${alert.detail}`,
  });
  return ok(toView(alert), `Acknowledged by ${session.user.name} at ${clock.formatDubaiTime(clock.now())}.`);
}

/** Alerts for the bell dropdown: open and unacknowledged only. */
export function bellAlerts(session: Session, phase: string = 'later'): AlertView[] {
  return visibleAlerts(session, phase).filter(a => a.status === 'open');
}
