// Agent E: read models for the fleet map's right panel, KPI strip and bottom tabs
// (UI-UPGRADE.md §5.2 Map row, §6). Everything here is role-scoped through access.ts:
// an asset the session can't see returns null, and a renter only ever sees its own
// booking. Values are raw numbers; screens format them with src/lib/format.ts.

import type { AlertType, Asset, Booking, Session } from '@/domain/types';
import { db } from '@/server/db';
import { getRelationship, historyFloor, isAssetVisible, viewerSiteName } from '@/server/access';
import { visibleAlerts, type AlertView } from '@/server/alerts';
import { alertSeverity, SEVERITY_ORDER, type AlertSeverity } from '@/server/alerts-screen';
import { computeStatus, getReadingForAsset } from '@/server/telemetry/simulator';
import { ecuHoursAt } from '@/server/muc';
import { planSnapshot, plansForAsset, type PlanSnapshot } from '@/server/maintenance';
import { fuelToday, fuelWeekFor, hoursSourceFor, todayFor, type HoursSource } from '@/server/utilisation';
import { tenantName } from '@/server/audit';
import { hasFeature } from '@/domain/features';
import * as clock from '@/lib/clock';

// Severity has one owner: G1's alerts-screen.ts (critical / warning / info).
export type { AlertSeverity as Severity } from '@/server/alerts-screen';

export function tierOfAsset(asset: Asset): 1 | 2 | 3 {
  return asset.canProfile.adapter === 'ALL-CAN300' ? 3 : asset.canProfile.adapter === 'LVCAN200' ? 2 : 1;
}

const ms = (v: string | number) => (typeof v === 'number' ? v : new Date(v).getTime());

/** The booking live right now on this asset, as this session may see it. */
function liveBooking(session: Session, asset: Asset, nowMs: number): Booking | null {
  const rel = getRelationship(session, asset.id);
  const live = db.getState().bookings.find(b =>
    b.assetId === asset.id && b.status === 'active' && ms(b.start) <= nowMs && nowMs < ms(b.end) && !b.cancelledAt && !b.closedAt,
  );
  if (!live) return null;
  if (rel === 'renter') return live.renterTenantId === session.tenantId ? live : null;
  if (rel === 'owner' || rel === 'kasper') return live;
  return null;
}

export interface RentalLine {
  /** 'rented_in': this company rents the asset; 'on_hire': its own asset is out on hire. */
  kind: 'rented_in' | 'on_hire';
  /** The other company: the owner for a renter, the renter for an owner. */
  counterparty: string;
  endsAt: number;
  endsToday: boolean;
}

export function rentalLineFor(session: Session, asset: Asset, nowMs: number = clock.now()): RentalLine | null {
  const booking = liveBooking(session, asset, nowMs);
  if (!booking) return null;
  const rel = getRelationship(session, asset.id);
  const endsAt = ms(booking.end);
  const endsToday = clock.startOfDubaiDay(endsAt) === clock.startOfDubaiDay(nowMs);
  if (rel === 'renter') return { kind: 'rented_in', counterparty: tenantName(asset.ownerTenantId), endsAt, endsToday };
  const renter = booking.renterTenantId ? tenantName(booking.renterTenantId) : booking.renterName ?? '';
  return { kind: 'on_hire', counterparty: renter, endsAt, endsToday };
}

export interface PanelMetric {
  key: 'engine_hours' | 'rpm' | 'speed' | 'fuel_level' | 'fuel_rate' | 'load' | 'ignition' | 'distance_today' | 'last_update';
  /** A number for the screen to format, or null for "Not measured". */
  value: number | null;
  /** For ignition: on/off. */
  on?: boolean;
  source: HoursSource | 'ECU' | 'GPS' | 'Estimated' | 'Tracker' | null;
}

export interface HealthRow {
  key: 'coolant' | 'voltage' | 'faults' | 'satellites' | 'last_ping';
  value: number | null;
  ok: boolean;
}

export interface FleetPanel {
  id: string;
  code: string;
  name: string;
  assetClass: string;
  tier: 1 | 2 | 3;
  status: ReturnType<typeof computeStatus>;
  ignition: boolean | null;
  siteName: string;
  relationship: 'kasper' | 'owner' | 'renter' | 'none';
  ownerName: string;
  rental: RentalLine | null;
  /** 2×2 grid; Tier 1 gets speed, ignition, today's distance and last update. */
  metrics: PanelMetric[];
  /** T2/T3 with a level gauge only. */
  fuel: { levelPct: number; tankL: number; litresLeft: number; week: Array<number | null>; usedTodayL: number | null; usedSource: 'ECU' | 'Estimated' | null } | null;
  health: HealthRow[];
  /** The next service due, from the owner's plans. Renters see none (maintenance is the owner's). */
  nextService: Pick<PlanSnapshot, 'headline' | 'remaining' | 'unit' | 'state'> & { name: string } | null;
  openAlerts: number;
  maintenanceDue: boolean;
  lastPingMs: number | null;
}

/** Everything the right panel shows for one asset, or null when the session can't see it. */
export function fleetPanelFor(session: Session, assetId: string, nowMs: number = clock.now()): FleetPanel | null {
  if (!isAssetVisible(session, assetId)) return null;
  const asset = db.getState().assets.find(a => a.id === assetId);
  if (!asset) return null;
  const reading = getReadingForAsset(asset);
  const tier = tierOfAsset(asset);
  const relationship = getRelationship(session, asset.id);
  const status = computeStatus(asset);
  const lastPingMs = reading ? ms(reading.deviceTime) : null;

  const metrics: PanelMetric[] = [];
  if (tier === 1) {
    const today = todayFor(asset, nowMs);
    metrics.push(
      { key: 'speed', value: reading ? reading.speedKmh : null, source: reading ? 'GPS' : null },
      { key: 'ignition', value: null, on: reading?.ignition, source: reading ? 'Tracker' : null },
      { key: 'distance_today', value: today ? today.distanceKm : null, source: today ? 'GPS' : null },
      { key: 'last_update', value: lastPingMs, source: lastPingMs ? 'Tracker' : null },
    );
  } else {
    const hoursSource = hoursSourceFor(asset);
    const hasHours = hasFeature(asset, 'hours.ecu') || hasFeature(asset, 'hours.ecuPartial');
    metrics.push({ key: 'engine_hours', value: hasHours ? ecuHoursAt(asset, nowMs) : null, source: hasHours ? hoursSource : null });
    const rpm = asset.canProfile.supported.includes('rpm') && reading?.rpm !== undefined ? reading.rpm : null;
    metrics.push(rpm !== null
      ? { key: 'rpm', value: rpm, source: 'ECU' }
      : { key: 'speed', value: reading ? reading.speedKmh : null, source: reading ? 'GPS' : null });
    const level = hasFeature(asset, 'fuel.level') && reading?.fuelLevelPct !== undefined ? reading.fuelLevelPct : null;
    metrics.push({ key: 'fuel_level', value: level, source: level !== null ? 'ECU' : null });
    const load = asset.canProfile.supported.includes('engineLoad') && reading?.engineLoadPct !== undefined ? reading.engineLoadPct : null;
    metrics.push({ key: 'load', value: load, source: load !== null ? 'ECU' : null });
  }

  let fuel: FleetPanel['fuel'] = null;
  if (tier > 1 && hasFeature(asset, 'fuel.level') && reading?.fuelLevelPct !== undefined) {
    const tankL = asset.tankLitres ?? 300;
    const week = fuelWeekFor(asset, nowMs);
    // A renter never sees the days before its rental started (history floor).
    const floor = historyFloor(session, asset.id);
    const dayVisible = (key: string) => floor === null || Date.parse(`${key}T23:59:59+04:00`) >= floor;
    const used = fuelToday(asset, nowMs);
    fuel = {
      levelPct: reading.fuelLevelPct,
      tankL,
      litresLeft: (reading.fuelLevelPct / 100) * tankL,
      week: week ? week.days.map(d => (dayVisible(d.key) ? d.usedL : null)) : [],
      usedTodayL: used ? used.litres : null,
      usedSource: used ? used.source : null,
    };
  }

  const health: HealthRow[] = [];
  if (tier > 1) {
    const coolant = asset.canProfile.supported.includes('coolantTemp') && reading?.coolantC !== undefined ? reading.coolantC : null;
    health.push({ key: 'coolant', value: coolant, ok: coolant === null || coolant < 100 });
  }
  if (hasFeature(asset, 'power.status') && reading) {
    health.push({ key: 'voltage', value: reading.extVoltage, ok: reading.extVoltage >= 11.5 });
  }
  if (hasFeature(asset, 'faults')) {
    const n = reading?.activeDtcs?.length ?? 0;
    health.push({ key: 'faults', value: n, ok: n === 0 });
  }
  if (reading) health.push({ key: 'satellites', value: reading.satellites, ok: reading.satellites >= 4 });
  health.push({ key: 'last_ping', value: lastPingMs, ok: status === 'live' || status === 'idle' });

  // Maintenance is the owner's (J4.6): a renter never sees the owner's plans.
  let nextService: FleetPanel['nextService'] = null;
  if (relationship !== 'renter') {
    const snaps = plansForAsset(session, asset.id).map(p => planSnapshot(p, asset, nowMs));
    const order = { overdue: 0, due_soon: 1, ok: 2 } as Record<string, number>;
    snaps.sort((a, b) => (order[a.state] ?? 3) - (order[b.state] ?? 3) || a.remaining - b.remaining);
    const next = snaps[0];
    if (next) nextService = { name: next.plan.name, headline: next.headline, remaining: next.remaining, unit: next.unit, state: next.state };
  }

  const alerts = visibleAlerts(session).filter(a => a.assetId === asset.id && a.status === 'open');

  return {
    id: asset.id,
    code: asset.code,
    name: asset.name,
    assetClass: asset.assetClass,
    tier,
    status,
    ignition: reading ? reading.ignition : null,
    siteName: viewerSiteName(session, asset.id),
    relationship,
    ownerName: tenantName(asset.ownerTenantId),
    rental: rentalLineFor(session, asset, nowMs),
    metrics,
    fuel,
    health,
    nextService,
    openAlerts: alerts.length,
    maintenanceDue: nextService !== null && nextService.state !== 'ok',
    lastPingMs,
  };
}

export interface FleetKpis {
  live: number;
  idle: number;
  offline: number;
  /** Engine hours today: ECU where the asset meters it, else Estimated from ignition. */
  engineHoursToday: number | null;
  engineHoursSource: 'ECU' | 'Estimated' | 'mixed' | null;
  /** T2/T3 only; null when no visible asset measures fuel. */
  fuelUsedTodayL: number | null;
  fuelEstimated: boolean;
  alertsCritical: number;
  /** Warnings and info together: everything open that isn't critical. */
  alertsWarning: number;
  rentalsEndingToday: number;
}

/** The KPI strip over the assets on screen (already role-scoped by the caller's list). */
export function fleetKpis(session: Session, assets: Asset[], nowMs: number = clock.now()): FleetKpis {
  let live = 0, idle = 0, offline = 0;
  let hours = 0, hoursAssets = 0, ecu = 0, est = 0;
  let fuelL = 0, fuelAssets = 0, fuelEstimated = false;
  let endingToday = 0;
  const ids = new Set(assets.map(a => a.id));
  for (const asset of assets) {
    const s = computeStatus(asset);
    if (s === 'live') live++;
    else if (s === 'idle') idle++;
    else if (s === 'offline' || s === 'stale') offline++;
    if (hasFeature(asset, 'hours.ecu') || hasFeature(asset, 'hours.ecuPartial')) {
      const dayStart = clock.startOfDubaiDay(nowMs);
      hours += Math.max(0, ecuHoursAt(asset, nowMs) - ecuHoursAt(asset, dayStart));
      hoursAssets++; ecu++;
    } else if (hasFeature(asset, 'hours.ignition')) {
      const today = todayFor(asset, nowMs);
      if (today) { hours += today.ignitionHours; hoursAssets++; est++; }
    }
    if (tierOfAsset(asset) > 1) {
      const f = fuelToday(asset, nowMs);
      if (f) { fuelL += f.litres; fuelAssets++; if (f.source === 'Estimated') fuelEstimated = true; }
    }
    if (rentalLineFor(session, asset, nowMs)?.endsToday) endingToday++;
  }
  let critical = 0, warning = 0;
  for (const a of visibleAlerts(session)) {
    if (a.status !== 'open' || !ids.has(a.assetId)) continue;
    if (alertSeverity(a.type) === 'critical') critical++; else warning++;
  }
  return {
    live, idle, offline,
    engineHoursToday: hoursAssets ? hours : null,
    engineHoursSource: hoursAssets === 0 ? null : ecu && est ? 'mixed' : ecu ? 'ECU' : 'Estimated',
    fuelUsedTodayL: fuelAssets ? fuelL : null,
    fuelEstimated,
    alertsCritical: critical,
    alertsWarning: warning,
    rentalsEndingToday: endingToday,
  };
}

export interface FleetEvent {
  id: string;
  at: number;
  assetId: string;
  assetCode: string;
  kind: 'alert' | 'refuel' | 'fuel_drop';
  /** Alert type for alerts. */
  type?: AlertType;
  words: string;
  status: AlertView['status'] | null;
  severity: AlertSeverity;
}

/** The bottom tabs' rows: open alerts, every alert as an event log, and fuel events (T2/3). */
export function fleetEvents(session: Session, assets: Asset[], nowMs: number = clock.now()): { alerts: FleetEvent[]; log: FleetEvent[]; fuel: FleetEvent[] } {
  const ids = new Set(assets.map(a => a.id));
  const all = visibleAlerts(session)
    .filter(a => ids.has(a.assetId))
    .map<FleetEvent>(a => ({
      id: a.id, at: ms(a.openedAt), assetId: a.assetId, assetCode: a.assetCode, kind: 'alert',
      type: a.type, words: a.typeWords, status: a.status, severity: alertSeverity(a.type),
    }))
    .sort((x, y) => y.at - x.at);
  const open = all.filter(e => e.status === 'open')
    .sort((x, y) => SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity) || y.at - x.at);
  const fuel: FleetEvent[] = [];
  for (const asset of assets) {
    if (tierOfAsset(asset) === 1 || !hasFeature(asset, 'fuel.level')) continue;
    const floor = historyFloor(session, asset.id);
    for (const day of fuelWeekFor(asset, nowMs)?.days ?? []) {
      const at = clock.startOfDubaiDay(Date.parse(`${day.key}T12:00:00+04:00`));
      // A renter never sees fuel events from before its rental started.
      if (floor !== null && at + 86400000 <= floor) continue;
      if (day.refuel) fuel.push({ id: `${asset.id}-r-${day.key}`, at, assetId: asset.id, assetCode: asset.code, kind: 'refuel', words: 'Refuel', status: null, severity: 'warning' });
      if (day.drop) fuel.push({ id: `${asset.id}-d-${day.key}`, at, assetId: asset.id, assetCode: asset.code, kind: 'fuel_drop', words: 'Fuel drop, engine off', status: null, severity: 'critical' });
    }
  }
  fuel.sort((x, y) => y.at - x.at);
  return { alerts: open, log: all.slice(0, 50), fuel };
}
