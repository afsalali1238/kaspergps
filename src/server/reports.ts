// Report engine (spec §11.5): run a report over a scope and date range, clip
// renters to their rental windows, and record a ReportRun so it reappears in
// Downloads. Files regenerate on demand from the deterministic simulator.

import type { Asset, Reading, ReportRun, Session } from '@/domain/types';
import { db, append, removeWhere, nextNumber } from '@/server/db';
import { fail, ok, type OpResult } from '@/server/result';
import { hasCapability, getRelationship, isAssetVisible, isRenterWindowPast, rentalWindow } from '@/server/access';
import { hasFeature } from '@/domain/features';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { detectTrips, findGaps } from '@/server/trips';
import { buildEcuBreakdown } from '@/server/muc';
import { IDLE_SPEED_KMH, OVERSPEED_KMH, WORKING_LOAD_PCT, FUEL_DROP_PCT } from '@/config/thresholds';
import type { ExportMeta, ExportTable } from '@/lib/export';
import * as clock from '@/lib/clock';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReportTypeId =
  | 'trip_mileage'
  | 'location_history'
  | 'operating_hours'
  | 'fuel'
  | 'utilisation'
  | 'driving_events';

export interface ReportTypeOption {
  id: ReportTypeId;
  label: string;
  fileTag: string;
  description: string;
  phase: 'day_one' | 'phase2' | 'later';
  needs: string;
}

export const REPORT_TYPES: ReportTypeOption[] = [
  { id: 'trip_mileage', label: 'Trip & Mileage', fileTag: 'TripMileage', description: 'Trips, distances, and mileage', phase: 'day_one', needs: 'trips' },
  { id: 'location_history', label: 'Location history', fileTag: 'LocationHistory', description: 'Position history over time', phase: 'day_one', needs: 'history.track' },
  { id: 'operating_hours', label: 'Operating hours', fileTag: 'OperatingHours', description: 'Ignition hours (Estimated) and ECU engine hours, separate columns', phase: 'phase2', needs: 'hours.ignition' },
  { id: 'fuel', label: 'Fuel', fileTag: 'Fuel', description: 'Fuel used, refuels, drops, L/h', phase: 'phase2', needs: 'fuel.used' },
  { id: 'utilisation', label: 'Utilisation', fileTag: 'Utilisation', description: 'Working, idling and off hours per day', phase: 'phase2', needs: 'utilisation' },
  { id: 'driving_events', label: 'Driving events', fileTag: 'DrivingEvents', description: 'Harsh events and over-speed incidents', phase: 'phase2', needs: 'driving.events' },
];

export interface ReportResult {
  run: ReportRun;
  meta: ExportMeta;
  tables: ExportTable[];
  clipNotes: string[];
}

export interface RunReportInput {
  reportType: ReportTypeId;
  assetIds: string[];
  /** YYYY-MM-DD in Dubai time. */
  from: string;
  to: string;
  format: 'pdf' | 'xlsx';
  scheduleId?: string;
}

// ── Scope helpers ─────────────────────────────────────────────────────────────

/**
 * Assets the user may run reports on: assets they can see now, plus assets they
 * held a rental grant on in the past (past rentals stay reportable — spec §5).
 */
export function reportableAssets(session: Session): Asset[] {
  return db.getState().assets.filter(a => {
    if (isAssetVisible(session, a.id)) return true;
    if (session.isKasper) return true;
    if (!session.tenantId) return false;
    // Past grants: any booking for my tenant on this asset.
    return db.getState().bookings.some(b => b.assetId === a.id && b.renterTenantId === session.tenantId);
  });
}

interface Window {
  from: number;
  to: number;
  kind: 'full' | 'rental';
  label: string;
}

/** The readable windows for reports: full history for owners, rental windows for renters. */
export function reportWindows(session: Session, assetId: string): Window[] {
  const rel = getRelationship(session, assetId);
  const now = clock.now();
  if (rel === 'kasper' || rel === 'owner') {
    return [{ from: 0, to: now, kind: 'full', label: '' }];
  }
  // Renter: the active window plus past windows (past rentals stay reportable).
  const windows: Window[] = [];
  const active = rentalWindow(session, assetId);
  if (active) {
    windows.push({ from: active.start, to: Math.min(active.end, now), kind: 'rental', label: formatWindow(active.start, Math.min(active.end, now)) });
  }
  const past = isRenterWindowPast(session, assetId);
  if (past) {
    windows.push({ from: past.start, to: Math.min(past.end, now), kind: 'rental', label: formatWindow(past.start, Math.min(past.end, now)) });
  }
  return windows.filter(w => w.to > w.from).sort((a, b) => a.from - b.from);
}

function formatWindow(from: number, to: number): string {
  return `${clock.formatDubaiDate(from)} – ${clock.formatDubaiDate(to)}`;
}

/** All past + current rental windows for a renter on an asset (for the picker labels). */
export function pastRentalLabel(session: Session, assetId: string): string | null {
  const past = isRenterWindowPast(session, assetId);
  if (!past) return null;
  return `Past rental: ${formatWindow(past.start, past.end)}`;
}

function daysBetween(fromMs: number, toMs: number): { key: string; display: string; startMs: number }[] {
  const days: { key: string; display: string; startMs: number }[] = [];
  for (let t = clock.startOfDubaiDay(fromMs); t <= toMs; t += 86_400_000) {
    days.push({ key: clock.dubaiDateKey(t), display: clock.formatDubaiDate(t), startMs: t });
  }
  return days;
}

function readingMs(r: Reading): number {
  return new Date(r.deviceTime).getTime();
}

function n1(x: number): number {
  return Math.round(x * 10) / 10;
}

// ── Per-type table builders ───────────────────────────────────────────────────

function clipSegments(session: Session, assetId: string, fromMs: number, toMs: number): { from: number; to: number }[] {
  const windows = reportWindows(session, assetId);
  const full = windows.find(w => w.kind === 'full');
  if (full) return [{ from: fromMs, to: toMs }];
  return windows
    .map(w => ({ from: Math.max(fromMs, w.from), to: Math.min(toMs, w.to) }))
    .filter(s => s.to > s.from);
}

function clipNoteFor(session: Session, assetId: string, fromMs: number, toMs: number): string | null {
  const windows = reportWindows(session, assetId);
  if (windows.some(w => w.kind === 'full')) return null;
  const segs = clipSegments(session, assetId, fromMs, toMs);
  if (segs.length === 0) return null;
  const clipped = segs.some(s => s.from > fromMs || s.to < toMs) || segs.length > 1;
  return clipped ? `Limited to your rental period: ${windows.map(w => w.label).join(' · ')}` : null;
}

function tripRows(asset: Asset, fromMs: number, toMs: number): { rows: (string | number)[][]; totalKm: number } {
  const trips = detectTrips(asset, fromMs, toMs);
  const rows = trips.map(t => [
    clock.formatDubaiDateTime(t.startMs),
    clock.formatDubaiDateTime(t.endMs),
    `${t.startLat.toFixed(5)}, ${t.startLng.toFixed(5)}`,
    `${t.endLat.toFixed(5)}, ${t.endLng.toFixed(5)}`,
    n1(t.distanceKm),
    `${t.durationMin} min`,
    `${t.maxSpeedKmh} km/h`,
  ]);
  return { rows, totalKm: n1(trips.reduce((s, t) => s + t.distanceKm, 0)) };
}

function buildTripMileage(asset: Asset, fromMs: number, toMs: number): ExportTable[] {
  const { rows, totalKm } = tripRows(asset, fromMs, toMs);
  const gaps = findGaps(getReadingsForAsset(asset, fromMs, toMs), fromMs, toMs);
  const gapRows = gaps.map(g => [`No data ${clock.formatDubaiTime(g.from)} – ${clock.formatDubaiTime(g.to)}`, '', '', '', '', '', '']);
  return [
    {
      title: `${asset.code} trips`,
      columns: ['Start', 'End', 'From', 'To', 'Distance km', 'Duration', 'Max speed'],
      rows: rows.length ? [...rows, ['Total', '', '', '', totalKm, '', ''], ...gapRows] : [['No trips in this period', '', '', '', '', '', ''], ...gapRows],
    },
  ];
}

function buildLocationHistory(asset: Asset, fromMs: number, toMs: number): ExportTable[] {
  const readings = getReadingsForAsset(asset, fromMs, toMs).sort((a, b) => readingMs(a) - readingMs(b));
  const span = toMs - fromMs;
  // Sample long ranges to one row per 5 minutes so the file stays readable.
  const stepMs = span > 48 * 3600_000 ? 5 * 60_000 : 0;
  const rows: (string | number)[][] = [];
  let lastShown = -Infinity;
  for (const r of readings) {
    const t = readingMs(r);
    if (stepMs && t - lastShown < stepMs) continue;
    lastShown = t;
    rows.push([
      clock.formatDubaiDateTime(t),
      r.lat.toFixed(5),
      r.lng.toFixed(5),
      r.speedKmh,
      r.ignition ? 'On' : 'Off',
      `${r.heading}°`,
      ...(asset.canProfile.supported.includes('fuelLevel') ? [r.fuelLevelPct !== undefined ? `${n1(r.fuelLevelPct)}%` : 'Not measured'] : []),
    ]);
  }
  for (const g of findGaps(readings, fromMs, toMs)) {
    rows.push([`No data ${clock.formatDubaiTime(g.from)} – ${clock.formatDubaiTime(g.to)}`, '', '', '', '', '', '']);
  }
  return [
    {
      title: `${asset.code} positions`,
      columns: ['Time (Dubai)', 'Lat', 'Lng', 'Speed km/h', 'Ignition', 'Heading', ...(asset.canProfile.supported.includes('fuelLevel') ? ['Fuel %'] : [])],
      rows: rows.length ? rows : [['No data in this period', '', '', '', '', '', '']],
    },
  ];
}

function ignitionHours(readings: Reading[], fromMs: number, toMs: number): number {
  let ms = 0;
  const sorted = [...readings].sort((a, b) => readingMs(a) - readingMs(b));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const dt = readingMs(b) - readingMs(a);
    if (dt > 10 * 60_000) continue; // gap — don't count across it
    if (a.ignition) ms += dt;
  }
  void fromMs;
  void toMs;
  return ms / 3600_000;
}

function buildOperatingHours(asset: Asset, fromMs: number, toMs: number): ExportTable[] {
  const rows: (string | number)[][] = [];
  const dayMs = 86_400_000;
  const hasEcu = hasFeature(asset, 'hours.ecu');
  const hasPartial = hasFeature(asset, 'hours.ecuPartial');
  const ecuSource = hasEcu ? 'ECU' : hasPartial ? 'ECU · partial' : 'Not measured';
  let totalIgn = 0;
  let totalEcu = 0;
  const breakdown = hasEcu || hasPartial ? buildEcuBreakdown(asset, fromMs, toMs) : null;
  for (const day of daysBetween(fromMs, toMs)) {
    const dStart = day.startMs;
    const dEnd = dStart + dayMs;
    const readings = getReadingsForAsset(asset, Math.max(dStart, fromMs), Math.min(dEnd, toMs));
    const ign = n1(ignitionHours(readings, dStart, dEnd));
    const ecuDay = breakdown?.days.find(d => d.date === day.display);
    const ecu = ecuDay ? n1(ecuDay.engineHours) : breakdown ? 0 : 'Not measured';
    if (typeof ecu === 'number') totalEcu += ecu;
    totalIgn += ign;
    rows.push([day.display, ign, ecu, ecuSource]);
  }
  rows.push(['Total', n1(totalIgn), breakdown ? n1(totalEcu) : 'Not measured', ecuSource]);
  return [
    {
      title: `${asset.code} hours`,
      columns: ['Date', 'Ignition hours · Estimated', 'Engine hours', 'Engine hours source'],
      rows,
    },
  ];
}

function buildFuel(asset: Asset, fromMs: number, toMs: number): ExportTable[] {
  const rows: (string | number)[][] = [];
  let totalUsed = 0;
  let totalRefuel = 0;
  let totalDrop = 0;
  for (const day of daysBetween(fromMs, toMs)) {
    const dStart = day.startMs;
    const dEnd = dStart + 86_400_000;
    const readings = getReadingsForAsset(asset, Math.max(dStart, fromMs), Math.min(dEnd, toMs))
      .filter(r => r.fuelUsedL !== undefined)
      .sort((a, b) => readingMs(a) - readingMs(b));
    if (readings.length < 2) {
      rows.push([day.display, 'Not measured', '—', '—', '—', 'Not measured']);
      continue;
    }
    const used = Math.max(0, (readings[readings.length - 1].fuelUsedL ?? 0) - (readings[0].fuelUsedL ?? 0));
    let refuel = 0;
    let drop = 0;
    for (let i = 1; i < readings.length; i++) {
      const a = readings[i - 1].fuelLevelPct;
      const b = readings[i].fuelLevelPct;
      if (a === undefined || b === undefined) continue;
      const delta = b - a;
      if (delta >= 5) refuel += delta;
      if (delta <= -FUEL_DROP_PCT && !readings[i].ignition) drop += -delta;
    }
    const ign = ignitionHours(readings, dStart, dEnd);
    totalUsed += used;
    totalRefuel += refuel;
    totalDrop += drop;
    rows.push([day.display, n1(used), refuel ? `${n1(refuel)}%` : '—', drop ? `${n1(drop)}%` : '—', ign > 0 ? n1(used / ign) : '—', 'ECU']);
  }
  rows.push(['Total', n1(totalUsed), totalRefuel ? `${n1(totalRefuel)}%` : '—', totalDrop ? `${n1(totalDrop)}%` : '—', '', 'ECU']);
  return [
    {
      title: `${asset.code} fuel`,
      columns: ['Date', 'Fuel used L', 'Refuelling', 'Drops', 'Avg L/h', 'Source'],
      rows,
    },
  ];
}

function buildUtilisation(asset: Asset, fromMs: number, toMs: number): ExportTable[] {
  const rows: (string | number)[][] = [];
  const isPlant = ['plant', 'lifting', 'power'].includes(asset.assetClass);
  const tier3 = hasFeature(asset, 'utilisation') && asset.canProfile.adapter === 'ALL-CAN300' && isPlant;
  const columns = tier3
    ? ['Date', 'Working h', 'Idling h', 'Off h', 'Source']
    : ['Date', 'Moving h', 'Stationary, ignition on h', 'Off h', 'Source'];
  for (const day of daysBetween(fromMs, toMs)) {
    const dStart = day.startMs;
    const dEnd = dStart + 86_400_000;
    const readings = getReadingsForAsset(asset, Math.max(dStart, fromMs), Math.min(dEnd, toMs))
      .sort((a, b) => readingMs(a) - readingMs(b));
    let movingMs = 0;
    let workingMs = 0;
    let idleMs = 0;
    for (let i = 1; i < readings.length; i++) {
      const a = readings[i - 1];
      const b = readings[i];
      const dt = readingMs(b) - readingMs(a);
      if (dt > 10 * 60_000 || dt < 0) continue;
      if (a.ignition && a.speedKmh > IDLE_SPEED_KMH) movingMs += dt;
      else if (a.ignition) {
        if (tier3 && (a.engineLoadPct ?? 0) >= WORKING_LOAD_PCT) workingMs += dt;
        else idleMs += dt;
      }
    }
    const off = Math.max(0, dEnd - dStart - movingMs - workingMs - idleMs) / 3600_000;
    if (tier3) {
      rows.push([day.display, n1((movingMs + workingMs) / 3600_000), n1(idleMs / 3600_000), n1(off), 'ECU · engine load']);
    } else {
      rows.push([day.display, n1(movingMs / 3600_000), n1((workingMs + idleMs) / 3600_000), n1(off), 'Ignition · Estimated']);
    }
  }
  return [{ title: `${asset.code} utilisation`, columns, rows }];
}

function buildDrivingEvents(asset: Asset, fromMs: number, toMs: number): ExportTable[] {
  const words: Record<string, string> = {
    harsh_brake: 'Harsh braking',
    harsh_accel: 'Harsh acceleration',
    harsh_corner: 'Harsh cornering',
    overspeed: 'Over speed',
    power_cut: 'Power cut',
    towing: 'Moved with ignition off',
  };
  const rows: (string | number)[][] = [];
  for (const r of getReadingsForAsset(asset, fromMs, toMs).sort((a, b) => readingMs(a) - readingMs(b))) {
    const t = readingMs(r);
    if (r.event && words[r.event]) {
      rows.push([clock.formatDubaiDateTime(t), asset.code, words[r.event], `${r.speedKmh} km/h`, `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`]);
    }
    if (r.speedKmh > OVERSPEED_KMH && !rows.some(row => row[0] === clock.formatDubaiDateTime(t) && row[2] === 'Over speed')) {
      rows.push([clock.formatDubaiDateTime(t), asset.code, `Over speed: ${r.speedKmh} km/h`, `${r.speedKmh} km/h`, `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`]);
    }
  }
  return [
    {
      title: `${asset.code} driving events`,
      columns: ['Time (Dubai)', 'Asset', 'Event', 'Speed', 'Location'],
      rows: rows.length ? rows : [['No driving events in this period', '', '', '', '']],
    },
  ];
}

function buildSummary(reportType: ReportTypeId, entries: { asset: Asset; tables: ExportTable[]; totalKm: number }[]): ExportTable {
  const columns = ['Asset', 'Name', 'Period rows'];
  const rows = entries.map(e => [e.asset.code, e.asset.name, String(e.tables[0]?.rows.length ?? 0)]);
  if (reportType === 'trip_mileage') {
    columns.push('Total distance km');
    entries.forEach((e, i) => rows[i].push(String(e.totalKm)));
  }
  return { title: 'Summary', columns, rows };
}

// ── Report types available for a selection ────────────────────────────────────

export function availableReportTypes(session: Session, assetIds: string[], phase: string): ReportTypeOption[] {
  const assets = assetIds
    .map(id => db.getState().assets.find(a => a.id === id))
    .filter((a): a is Asset => Boolean(a));
  return REPORT_TYPES.filter(rt => {
    if (rt.phase === 'phase2' && phase === 'day_one') return false;
    if (rt.phase === 'later' && phase !== 'later') return false;
    // Spec §11.5: a type is listed only if at least one selected asset supports it.
    return assets.some(a => hasFeature(a, rt.needs));
  });
}

// ── Filenames ────────────────────────────────────────────────────────────────

function fileNameFor(reportType: ReportTypeId, assets: Asset[], from: string, to: string, format: 'pdf' | 'xlsx'): string {
  const rt = REPORT_TYPES.find(r => r.id === reportType)!;
  const scope = assets.length === 1 ? assets[0].code : `${assets[0].code}+${assets.length - 1}`;
  return `Kasper_${rt.fileTag}_${scope}_${from}_to_${to}.${format}`;
}

// ── Run / regenerate ─────────────────────────────────────────────────────────

function buildTables(
  session: Session,
  reportType: ReportTypeId,
  assets: Asset[],
  fromMs: number,
  toMs: number,
): { tables: ExportTable[]; clipNotes: string[]; totalKm: number; anyRows: boolean } {
  const clipNotes: string[] = [];
  const entries: { asset: Asset; tables: ExportTable[]; totalKm: number }[] = [];
  let anyRows = false;
  let totalKm = 0;
  for (const asset of assets) {
    const note = clipNoteFor(session, asset.id, fromMs, toMs);
    if (note && !clipNotes.includes(note)) clipNotes.push(note);
    const segments = clipSegments(session, asset.id, fromMs, toMs);
    if (segments.length === 0) continue;
    const tables: ExportTable[] = [];
    for (const seg of segments) {
      switch (reportType) {
        case 'trip_mileage': {
          const { rows, totalKm: km } = tripRows(asset, seg.from, seg.to);
          totalKm += km;
          anyRows = anyRows || rows.length > 0;
          tables.push(...buildTripMileage(asset, seg.from, seg.to));
          break;
        }
        case 'location_history': {
          const t = buildLocationHistory(asset, seg.from, seg.to);
          anyRows = anyRows || (t[0]?.rows.length ?? 0) > 0;
          tables.push(...t);
          break;
        }
        case 'operating_hours':
          tables.push(...buildOperatingHours(asset, seg.from, seg.to));
          anyRows = true;
          break;
        case 'fuel':
          if (hasFeature(asset, 'fuel.used') || hasFeature(asset, 'fuel.level')) {
            tables.push(...buildFuel(asset, seg.from, seg.to));
            anyRows = true;
          }
          break;
        case 'utilisation':
          tables.push(...buildUtilisation(asset, seg.from, seg.to));
          anyRows = true;
          break;
        case 'driving_events': {
          const t = buildDrivingEvents(asset, seg.from, seg.to);
          anyRows = anyRows || (t[0]?.rows.length ?? 0) > 0;
          tables.push(...t);
          break;
        }
      }
    }
    if (tables.length) entries.push({ asset, tables, totalKm });
  }
  const summary = buildSummary(reportType, entries);
  return { tables: [summary, ...entries.flatMap(e => e.tables)], clipNotes, totalKm, anyRows };
}

export function runReport(session: Session, input: RunReportInput): OpResult<ReportResult> {
  if (!hasCapability(session, 'report.run')) return fail('You can’t run reports.');
  const rt = REPORT_TYPES.find(r => r.id === input.reportType);
  if (!rt) return fail('Unknown report type.');
  const assets = input.assetIds
    .map(id => db.getState().assets.find(a => a.id === id))
    .filter((a): a is Asset => Boolean(a));
  if (assets.length === 0) return fail('Pick at least one asset.');
  const reportable = new Set(reportableAssets(session).map(a => a.id));
  for (const a of assets) {
    if (!reportable.has(a.id)) {
      return fail('You no longer have access to this report’s assets.');
    }
  }
  const fromMs = clock.isoFromDubai(`${input.from}T00:00:00`);
  const toMs = clock.isoFromDubai(`${input.to}T23:59:59`);
  if (!(fromMs < toMs)) return fail('The period must end after it starts.');

  const { tables, clipNotes, totalKm, anyRows } = buildTables(session, input.reportType, assets, fromMs, toMs);
  if (!anyRows) {
    // A renter with no window overlapping the period has lost access, not an
    // empty file (spec §11.13 skip wording).
    const anyWindow = assets.some(a => clipSegments(session, a.id, fromMs, toMs).length > 0);
    if (!anyWindow && assets.every(a => getRelationship(session, a.id) === 'renter')) {
      return fail('You no longer have access to this report’s assets.');
    }
    return fail('Nothing to report for this period');
  }

  const scope = assets.length <= 2 ? assets.map(a => a.code).join(', ') : `${assets[0].code} + ${assets.length - 1} more`;
  const runPrefix = `rr-${clock.now()}-`;
  const run: ReportRun = {
    id: `${runPrefix}${nextNumber(runPrefix, db.getState().reportRuns)}`,
    userId: session.userId,
    reportType: rt.label,
    scope,
    from: input.from,
    to: input.to,
    format: input.format,
    createdAt: new Date(clock.now()).toISOString(),
    scheduleId: input.scheduleId,
    status: 'ready',
    fileName: fileNameFor(input.reportType, assets, input.from, input.to, input.format),
    assetIds: assets.map(a => a.id),
  };
  append('reportRuns', run);

  const meta: ExportMeta = {
    fileName: run.fileName!.replace(/\.(pdf|xlsx)$/, ''),
    subtitle: [
      `Company: ${session.user.tenantId ? (db.getState().tenants.find(t => t.id === session.user.tenantId)?.name ?? '—') : 'Kasper'}`,
      `Assets: ${assets.map(a => a.code).join(', ')}`,
      `Period: ${input.from} to ${input.to} (times in Dubai time, GST)`,
      `Generated: ${clock.formatDubaiDateTime(clock.now())} by ${session.user.name}`,
      ...clipNotes,
    ].join('\n'),
  };
  void totalKm;
  return ok({ run, meta, tables, clipNotes }, `${rt.label} report ready.`);
}

/** Re-check permission *now* and rebuild the same report (spec §11.13 Download again). */
export function regenerateReport(session: Session, runId: string): OpResult<ReportResult> {
  const run = db.getState().reportRuns.find(r => r.id === runId);
  if (!run) return fail('Report not found.');
  const isOwn = run.userId === session.userId;
  const isAdmin = session.isKasper && hasCapability(session, 'console.audit.view');
  if (!isOwn && !isAdmin) return fail('Report not found.');
  const assetIds = run.assetIds ?? [];
  const reportable = new Set(reportableAssets(session).map(a => a.id));
  if (assetIds.some(id => !reportable.has(id))) {
    return fail('You no longer have access to this report’s assets.');
  }
  const rt = REPORT_TYPES.find(r => r.label === run.reportType);
  if (!rt) return fail('Unknown report type.');
  const assets = assetIds.map(id => db.getState().assets.find(a => a.id === id)).filter((a): a is Asset => Boolean(a));
  const fromMs = clock.isoFromDubai(`${String(run.from).slice(0, 10)}T00:00:00`);
  const toMs = clock.isoFromDubai(`${String(run.to).slice(0, 10)}T23:59:59`);
  const { tables, clipNotes } = buildTables(session, rt.id, assets, fromMs, toMs);
  const meta: ExportMeta = {
    fileName: (run.fileName ?? 'kasper-report').replace(/\.(pdf|xlsx)$/, ''),
    subtitle: `Period: ${run.from} to ${run.to} (times in Dubai time, GST)\nGenerated: ${clock.formatDubaiDateTime(clock.now())} by ${session.user.name}\n${clipNotes.join('\n')}`,
  };
  return ok({ run, meta, tables, clipNotes }, 'Report rebuilt.');
}

export function reportRunsFor(session: Session): ReportRun[] {
  const isAdmin = session.isKasper && hasCapability(session, 'console.audit.view');
  return db.getState().reportRuns
    .filter(r => r.userId === session.userId || isAdmin)
    .sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime());
}

export function deleteReportRun(session: Session, runId: string): OpResult<null> {
  const idx = db.getState().reportRuns.findIndex(r => r.id === runId && r.userId === session.userId);
  if (idx < 0) return fail('Report not found.');
  removeWhere('reportRuns', r => r.id === runId);
  return ok(null, 'Removed from your downloads.');
}
