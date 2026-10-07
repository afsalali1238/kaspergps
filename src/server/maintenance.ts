// Maintenance scheduling (spec 11.18).
//
// A plan is a service interval on one asset, measured by engine hours (ECU or
// estimated ignition hours), distance (CAN odometer or GPS distance) or days.
// Trading is by "reading" values, so a plan stores what the meter read when the
// service was last done; the remaining life is due − current.
//
// Owners and Kasper only: Tenant Admins and their Site Users see their own
// company's plans (site users read-only), renters never.

import type { Asset, MaintenancePlan, ServiceRecord, Session } from '@/domain/types';
import { seed } from '@/server/seed/data';
import { recordAuditForSession } from '@/server/audit';
import { fail, ok, type OpResult } from '@/server/result';
import { hasCapability, visibleAssetIds } from '@/server/access';
import { BEHAVIOUR_HOURS_PER_DAY, ecuHoursAt } from '@/server/muc';
import { hoursSourceLabel, tierForAsset } from '@/domain/features';
import * as clock from '@/lib/clock';

let recordSeq = 100;
let planSeq = 1000;

export interface MaintenanceTask {
  id: string;
  assetId: string;
  title: string;
  fromFaultCode: string;
  createdAt: number;
  doneAt?: number;
  doneBy?: string;
}

/** One-off tasks raised from fault codes (demo state, like the other in-memory edits). */
export const maintenanceTasks: MaintenanceTask[] = [];

// ── Readings ───────────────────────────────────────────────────────────────────

const KM_PER_DAY: Record<Asset['behaviour'], number> = {
  parked: 0,
  works_at_site: 55,
  drives_between_sites: 210,
  stationary_24h: 0,
  light_vehicle_day: 95,
};

function createdAtMs(asset: Asset): number {
  return typeof asset.createdAt === 'number' ? asset.createdAt : new Date(asset.createdAt).getTime();
}

/**
 * Odometer reading, in km, for assets whose distance comes from the tracker
 * rather than the CAN bus: a deterministic base plus the asset's daily habit.
 * Prototype rule — the real product reads the odometer off the CAN bus.
 */
export function odometerKmAt(asset: Asset, atMs: number): number {
  const sum = asset.code.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const base = 20000 + (sum * 271) % 150000;
  const days = Math.max(0, (atMs - createdAtMs(asset)) / 86400000);
  return Math.round((base + days * KM_PER_DAY[asset.behaviour]) * 10) / 10;
}

/**
 * Ignition hours, estimated: the same behaviour model as the ECU but with a
 * slower base — the drift the plan form warns about ("check the hour meter at
 * each service"). Assets without a CAN bus only have this estimate.
 */
export function estimatedHoursAt(asset: Asset, atMs: number): number {
  const sum = asset.code.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const base = 400 + (sum * 97) % 6000;
  const days = Math.max(0, (atMs - createdAtMs(asset)) / 86400000);
  return Math.round((base + days * BEHAVIOUR_HOURS_PER_DAY[asset.behaviour]) * 10) / 10;
}

export type MeterUnit = 'h' | 'km' | 'days';

/**
 * The plan's meter reading right now: what the meter read at the last service
 * plus what has been put on it since. Engine hours come from the ECU, or from
 * ignition hours when the asset has no CAN bus; distance from the CAN odometer
 * or GPS distance; a date plan just counts days.
 */
export function currentMeter(plan: MaintenancePlan, asset: Asset, atMs = clock.now()): { value: number; unit: MeterUnit; source: string } {
  const doneMs = new Date(plan.lastDoneAt).getTime();
  if (plan.basis === 'days') {
    return { value: Math.floor((atMs - doneMs) / 86400000), unit: 'days', source: 'Calendar' };
  }
  if (plan.basis === 'km') {
    const since = Math.max(0, odometerKmAt(asset, atMs) - odometerKmAt(asset, doneMs));
    return {
      value: Math.round((plan.lastDoneValue + since) * 10) / 10,
      unit: 'km',
      source: plan.kmSource === 'can' ? 'CAN odometer' : 'GPS distance',
    };
  }
  const since = plan.hoursSource === 'estimated'
    ? Math.max(0, estimatedHoursAt(asset, atMs) - estimatedHoursAt(asset, doneMs))
    : Math.max(0, ecuHoursAt(asset, atMs) - ecuHoursAt(asset, doneMs));
  return {
    value: Math.round((plan.lastDoneValue + since) * 10) / 10,
    unit: 'h',
    source: plan.hoursSource === 'estimated' ? 'Estimated (ignition hours)' : hoursSourceLabel(asset),
  };
}

export type PlanState = 'overdue' | 'due_soon' | 'ok';

export interface PlanSnapshot {
  plan: MaintenancePlan;
  asset: Asset;
  state: PlanState;
  current: number;
  due: number;
  remaining: number;
  unit: MeterUnit;
  source: string;
  /** Absolute value where "due soon" starts. */
  dueSoonAt: number;
  /** Days based plans only. */
  dueAt?: number;
  /** "Due at 8,500 h · ECU — 80 h left" */
  headline: string;
  /** "On hire to Gulf Lift until 9 Oct" when the asset is out on a rental. */
  onHire: string | null;
}

function hireNote(asset: Asset, atMs: number): string | null {
  const booking = seed.bookings.find(b =>
    b.assetId === asset.id && b.status === 'active' &&
    Number(b.start) <= atMs && Number(b.end) >= atMs
  );
  if (!booking) return null;
  const renter = seed.tenants.find(t => t.id === booking.renterTenantId);
  return `On hire to ${renter?.name ?? booking.renterName} until ${clock.formatDubaiDate(Number(booking.end))}`;
}

function fmt(value: number, unit: MeterUnit): string {
  if (unit === 'h') return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} h`;
  if (unit === 'km') return `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })} km`;
  return `${value} days`;
}

/**
 * Snapshots one plan: where the meter is, when it was last done and how much
 * life is left. Due-soon starts at `dueSoonAt` (or, when the seed's threshold
 * sits outside the interval, at 80 % of it).
 */
export function planSnapshot(plan: MaintenancePlan, asset: Asset, atMs = clock.now()): PlanSnapshot {
  const meter = currentMeter(plan, asset, atMs);
  let due: number;
  let dueSoonAt: number;
  let dueAt: number | undefined;
  let remaining: number;

  if (plan.basis === 'days') {
    const dueAtMs = new Date(plan.lastDoneAt).getTime() + plan.interval * 86400000;
    dueAt = dueAtMs;
    remaining = Math.ceil((dueAtMs - atMs) / 86400000);
    due = plan.interval;
    dueSoonAt = Math.max(1, Math.round(plan.interval * 0.85));
  } else {
    due = Math.round((plan.lastDoneValue + plan.interval) * 10) / 10;
    remaining = Math.round((due - meter.value) * 10) / 10;
    const seeded = plan.dueSoonAt > plan.lastDoneValue + plan.interval * 0.5 && plan.dueSoonAt < due
      ? plan.dueSoonAt
      : plan.lastDoneValue + plan.interval * 0.8;
    dueSoonAt = Math.round(seeded * 10) / 10;
  }

  const state: PlanState = remaining <= 0 ? 'overdue' : meter.value >= dueSoonAt ? 'due_soon' : 'ok';

  let headline: string;
  if (plan.basis === 'days') {
    const dueLabel = clock.formatDubaiDate(dueAt as number);
    headline = remaining <= 0
      ? `Overdue — was due ${dueLabel} (${Math.abs(remaining)} days ago)`
      : `Due ${dueLabel} (${remaining} ${remaining === 1 ? 'day' : 'days'})`;
  } else if (remaining <= 0) {
    headline = `Overdue — due at ${fmt(due, meter.unit)} · ${meter.source} (${fmt(Math.abs(remaining), meter.unit)} over)`;
  } else {
    headline = `Due at ${fmt(due, meter.unit)} · ${meter.source} — ${fmt(remaining, meter.unit)} left`;
  }

  return {
    plan, asset, state,
    current: meter.value,
    due,
    dueSoonAt,
    remaining,
    unit: meter.unit,
    source: meter.source,
    dueAt,
    headline,
    onHire: hireNote(asset, atMs),
  };
}

// ── Visibility ─────────────────────────────────────────────────────────────────

/** Kasper sees every plan; a company sees its own assets' plans (never a renter). */
export function plansVisibleTo(session: Session): MaintenancePlan[] {
  const visible = new Set(visibleAssetIds(session));
  return seed.maintenancePlans.filter(p => {
    const asset = seed.assets.find(a => a.id === p.assetId);
    if (!asset) return false;
    if (!visible.has(asset.id)) return false;
    if (session.isKasper) return true;
    return asset.ownerTenantId === session.tenantId;
  });
}

export function plansForAsset(session: Session, assetId: string): MaintenancePlan[] {
  return plansVisibleTo(session).filter(p => p.assetId === assetId);
}

export function boardFor(session: Session, atMs = clock.now()): { overdue: PlanSnapshot[]; dueSoon: PlanSnapshot[]; ok: PlanSnapshot[] } {
  const snapshots = plansVisibleTo(session).map(plan => {
    const asset = seed.assets.find(a => a.id === plan.assetId)!;
    return planSnapshot(plan, asset, atMs);
  });
  const order = (a: PlanSnapshot, b: PlanSnapshot) => a.remaining - b.remaining;
  return {
    overdue: snapshots.filter(s => s.state === 'overdue').sort(order),
    dueSoon: snapshots.filter(s => s.state === 'due_soon').sort(order),
    ok: snapshots.filter(s => s.state === 'ok').sort(order),
  };
}

/** "Maintenance overdue: BD-02", "Maintenance due soon: EX-04 500 h service (80 h left)". */
export function maintenanceAlerts(session: Session, atMs = clock.now()): { state: 'overdue' | 'due_soon'; text: string }[] {
  const board = boardFor(session, atMs);
  const line = (s: PlanSnapshot) => s.unit === 'km'
    ? `${s.asset.code} ${s.plan.name} (${Math.max(0, Math.round(s.remaining)).toLocaleString('en-US')} km left)`
    : s.unit === 'days'
      ? `${s.asset.code} ${s.plan.name} (${clock.formatDubaiDate(s.dueAt!)})`
      : `${s.asset.code} ${s.plan.name} (${Math.max(0, Math.round(s.remaining))} h left)`;
  return [
    ...board.overdue.map(s => ({ state: 'overdue' as const, text: `Maintenance overdue: ${s.asset.code} — ${s.plan.name}` })),
    ...board.dueSoon.map(s => ({ state: 'due_soon' as const, text: `Maintenance due soon: ${line(s)}` })),
  ];
}

export function canManageMaintenance(session: Session): boolean {
  return hasCapability(session, 'maintenance.manage');
}

// ── Service history ────────────────────────────────────────────────────────────

export function serviceHistory(session: Session, assetId?: string): ServiceRecord[] {
  const visible = new Set(visibleAssetIds(session));
  const owned = new Set(seed.assets.filter(a => a.ownerTenantId === session.tenantId).map(a => a.id));
  return seed.serviceRecords
    .filter(r => visible.has(r.assetId) && (session.isKasper || owned.has(r.assetId)))
    .filter(r => !assetId || r.assetId === assetId)
    .sort((a, b) => new Date(b.doneAt).getTime() - new Date(a.doneAt).getTime());
}

// ── Logging a service ──────────────────────────────────────────────────────────

export interface LogServiceInput {
  planId: string;
  doneAt: number;
  value: number;
  notes: string;
  costAed: number;
  /** Optional task this service closes (raised from a fault code). */
  taskId?: string;
}

export function logService(session: Session, input: LogServiceInput): OpResult<ServiceRecord> {
  if (!canManageMaintenance(session)) return fail('Your role can\u2019t log services.');
  const plan = seed.maintenancePlans.find(p => p.id === input.planId);
  if (!plan) return fail('Plan not found.');
  const asset = seed.assets.find(a => a.id === plan.assetId);
  if (!asset) return fail('Asset not found.');
  if (!session.isKasper && asset.ownerTenantId !== session.tenantId) return fail('You can only log services on your own assets.');
  if (!Number.isFinite(input.value) || input.value < 0) return fail('Enter the meter reading at the service.');
  if (!Number.isFinite(input.costAed) || input.costAed < 0) return fail('Cost can\u2019t be negative.');
  if (input.doneAt > clock.now() + 3600000) return fail('The service date can\u2019t be in the future.');

  const record: ServiceRecord = {
    id: `sr-${++recordSeq}`,
    planId: plan.id,
    assetId: plan.assetId,
    tenantId: asset.ownerTenantId ?? plan.tenantId,
    doneAt: new Date(input.doneAt).toISOString(),
    value: Math.round(input.value * 10) / 10,
    notes: input.notes.trim() || plan.name,
    costAed: Math.round(input.costAed * 100) / 100,
    createdBy: session.userId,
  };
  seed.serviceRecords.push(record);

  plan.lastDoneAt = record.doneAt;
  plan.lastDoneValue = record.value;

  if (input.taskId) {
    const task = maintenanceTasks.find(t => t.id === input.taskId);
    if (task) {
      task.doneAt = clock.now();
      task.doneBy = session.userId;
    }
  }

  recordAuditForSession(session, {
    action: 'maintenance.service',
    tenantId: asset.ownerTenantId ?? undefined,
    detail: `${asset.code} ${plan.name} logged at ${record.value.toLocaleString('en-US')} ${plan.basis === 'km' ? 'km' : plan.basis === 'days' ? '' : 'h'} (AED ${record.costAed.toLocaleString('en-US')})`,
  });
  return ok(record, `${asset.code} ${plan.name} logged — the plan is reset.`);
}

// ── Plans ──────────────────────────────────────────────────────────────────────

export interface SavePlanInput {
  id?: string;
  assetId: string;
  name: string;
  basis: MaintenancePlan['basis'];
  hoursSource?: MaintenancePlan['hoursSource'];
  kmSource?: MaintenancePlan['kmSource'];
  interval: number;
  dueSoonAt?: number;
  lastDoneAt: number;
  lastDoneValue: number;
}

export function savePlan(session: Session, input: SavePlanInput): OpResult<MaintenancePlan> {
  if (!canManageMaintenance(session)) return fail('Your role can\u2019t edit service plans.');
  const asset = seed.assets.find(a => a.id === input.assetId);
  if (!asset) return fail('Asset not found.');
  if (!session.isKasper && asset.ownerTenantId !== session.tenantId) return fail('You can only plan services on your own assets.');
  const name = input.name.trim();
  if (!name) return fail('Give the plan a name.');
  if (!Number.isFinite(input.interval) || input.interval <= 0) return fail('The interval must be more than zero.');

  const existing = input.id ? seed.maintenancePlans.find(p => p.id === input.id) : undefined;
  const plan: MaintenancePlan = existing ?? {
    id: `mp-${++planSeq}`,
    tenantId: asset.ownerTenantId ?? '',
    assetId: asset.id,
    name,
    basis: input.basis,
    interval: input.interval,
    dueSoonAt: input.dueSoonAt ?? 0,
    lastDoneAt: new Date(input.lastDoneAt).toISOString(),
    lastDoneValue: input.lastDoneValue,
  };

  if (existing) {
    plan.name = name;
    plan.basis = input.basis;
    plan.interval = input.interval;
    plan.lastDoneAt = new Date(input.lastDoneAt).toISOString();
    plan.lastDoneValue = input.lastDoneValue;
  }
  if (input.basis === 'engine_hours') {
    plan.hoursSource = input.hoursSource ?? 'estimated';
    delete plan.kmSource;
  } else if (input.basis === 'km') {
    plan.kmSource = input.kmSource ?? 'gps';
    delete plan.hoursSource;
  } else {
    delete plan.hoursSource;
    delete plan.kmSource;
  }
  const snapshot = planSnapshot(plan, asset);
  plan.dueSoonAt = input.dueSoonAt && input.dueSoonAt > 0
    ? input.dueSoonAt
    : Math.round((snapshot.due - plan.interval * 0.2) * 10) / 10;

  if (!existing) seed.maintenancePlans.push(plan);

  recordAuditForSession(session, {
    action: 'maintenance.plan',
    tenantId: asset.ownerTenantId ?? undefined,
    detail: `${existing ? 'Updated' : 'Created'} ${asset.code} ${name} (every ${input.interval}${input.basis === 'days' ? ' days' : input.basis === 'km' ? ' km' : ' h'})`,
  });
  return ok(plan, `${asset.code}: ${name} ${existing ? 'updated' : 'created'}.`);
}

// ── Fault-code tasks ───────────────────────────────────────────────────────────

export function openTasks(session: Session): MaintenanceTask[] {
  const visible = new Set(visibleAssetIds(session));
  return maintenanceTasks.filter(t => visible.has(t.assetId) && !t.doneAt);
}

/** Fault codes are Tier 3 only; they raise a one-off service task on the board. */
export function createTaskFromFault(session: Session, alertId: string): OpResult<MaintenanceTask> {
  if (!canManageMaintenance(session)) return fail('Your role can\u2019t create service tasks.');
  const alert = seed.alerts.find(a => a.id === alertId && a.type === 'fault_code');
  if (!alert || !alert.assetId) return fail('Fault code not found.');
  const asset = seed.assets.find(a => a.id === alert.assetId);
  if (!asset) return fail('Asset not found.');
  if (tierForAsset(asset) < 3) return fail(`${asset.code} has no CAN bus, so fault codes aren\u2019t available.`);
  if (maintenanceTasks.some(t => t.fromFaultCode === alert.detail && !t.doneAt)) {
    return fail('There is already an open task for this fault.');
  }

  const task: MaintenanceTask = {
    id: `mt-${++recordSeq}`,
    assetId: asset.id,
    title: alert.detail.replace(/^Fault code /, ''),
    fromFaultCode: alert.detail,
    createdAt: clock.now(),
  };
  maintenanceTasks.push(task);
  recordAuditForSession(session, {
    action: 'maintenance.task',
    tenantId: asset.ownerTenantId ?? undefined,
    detail: `${asset.code}: service task from ${task.title}`,
  });
  return ok(task, `Service task created for ${asset.code}.`);
}
