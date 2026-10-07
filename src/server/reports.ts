// Report runs, schedules and the simulated email outbox — spec 11.13.
//
// Everything here is prototype-grade state: deterministic, resettable and
// driven by the simulated clock. In the browser it persists through a refresh
// (a demo user who reloads Downloads should still see their reports, the same
// way the session and clock offset persist). The two rules that matter:
//
//   • "Download again" re-checks permission NOW. Access lost (rental ended, site
//     removed, user deactivated) means no file and a clear message.
//   • A schedule that runs when the user has lost access records a skipped run
//     and pauses itself after 2 skips in a row.

import { addDays, addMonths, addWeeks } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { Session } from '@/domain/types';
import { seed } from '@/server/seed/data';
import { isAssetVisible, rentalWindow } from '@/server/access';
import * as clock from '@/lib/clock';

export type ReportFormat = 'pdf' | 'excel';
export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';

export interface ReportRun {
  id: string;
  userId: string;
  type: string;
  name: string;
  scopeLabel: string;
  assetIds: string[];
  fromMs: number;
  toMs: number;
  format: ReportFormat;
  generatedAtMs: number;
  bySchedule: boolean;
  scheduleId?: string;
  /** A run can also be a record of a missed one. */
  status: 'ready' | 'skipped';
  skippedReason?: string;
  sizeKb: number;
}

export interface ReportSchedule {
  id: string;
  userId: string;
  type: string;
  name: string;
  assetIds: string[];
  format: ReportFormat;
  frequency: ScheduleFrequency;
  /** Dubai hour of day the run fires at. */
  hour: number;
  /** 0 = Sunday … 6 = Saturday; only for weekly. */
  weekday?: number;
  nextRunAt: number;
  lastRunAt?: number;
  skipStreak: number;
  pausedAt?: number;
  pausedReason?: 'manual' | 'skips';
  createdAtMs: number;
}

export interface OutboxEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAtMs: number;
  runId?: string;
}

// ── In-memory state ───────────────────────────────────────────────────────────

let runs: ReportRun[] = [];
let schedules: ReportSchedule[] = [];
let outbox: OutboxEmail[] = [];
let seq = 0;
let loaded = false;

const STORAGE_KEY = 'kasper-reports';

interface Stored {
  runs: ReportRun[];
  schedules: ReportSchedule[];
  outbox: OutboxEmail[];
  seq: number;
}

/** Pull persisted state in once, in the browser only. */
function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as Partial<Stored>;
    runs = stored.runs ?? [];
    schedules = stored.schedules ?? [];
    outbox = stored.outbox ?? [];
    seq = stored.seq ?? 0;
  } catch {
    // A corrupt blob just means starting empty.
  }
}

function persist(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ runs, schedules, outbox, seq }));
  } catch {
    // Storage full or blocked — the in-memory copy still works this session.
  }
}

export function resetReports(): void {
  loaded = true;
  runs = [];
  schedules = [];
  outbox = [];
  seq = 0;
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
}

function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

// ── Access ────────────────────────────────────────────────────────────────────

export type AccessFailureCode = 'no_access' | 'rental_ended' | 'deactivated';

export interface AccessFailure {
  code: AccessFailureCode;
  assetCode?: string;
  /** When the rental that covered the period ended, for the message. */
  rentalEndedAt?: number;
}

function sessionForUser(userId: string): Session | null {
  const user = seed.users.find(u => u.id === userId);
  if (!user) return null;
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: user.siteIds,
    role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

/**
 * Can this session still pull this report's assets for this period?
 * Returns null when it can, or the reason it cannot.
 */
export function reportAccess(
  session: Session,
  assetIds: string[],
  fromMs: number,
  toMs: number,
): AccessFailure | null {
  if (session.user.status !== 'active') return { code: 'deactivated' };

  for (const assetId of assetIds) {
    const asset = seed.assets.find(a => a.id === assetId);
    if (!asset) return { code: 'no_access', assetCode: assetId };

    const renterBooking = session.tenantId
      ? seed.bookings.find(b => b.assetId === assetId && b.renterTenantId === session.tenantId)
      : undefined;
    const ownsAsset = asset.ownerTenantId === session.tenantId;

    if (isAssetVisible(session, assetId)) {
      // A renter's window must still cover part of the period.
      if (!ownsAsset && !session.isKasper && renterBooking) {
        const window = rentalWindow(session, assetId);
        if (window && (toMs < window.start || fromMs > window.end)) {
          return { code: 'rental_ended', assetCode: asset.code, rentalEndedAt: window.end };
        }
      }
      continue;
    }

    // Not visible: was it a rental that ended, or something else entirely?
    if (renterBooking) {
      const endedAt = renterBooking.closedAt
        ? new Date(renterBooking.closedAt).getTime()
        : new Date(renterBooking.end).getTime();
      return { code: 'rental_ended', assetCode: asset.code, rentalEndedAt: endedAt };
    }
    return { code: 'no_access', assetCode: asset.code };
  }

  return null;
}

/** The message a skipped run carries (spec 11.13). */
export function skipReason(failure: AccessFailure): string {
  if (failure.code === 'deactivated') return 'Skipped — your account is no longer active';
  if (failure.code === 'rental_ended' && failure.assetCode) {
    const when = failure.rentalEndedAt ? ` (rental ended ${clock.formatDubaiDate(failure.rentalEndedAt)})` : '';
    return `Skipped — you no longer have access to ${failure.assetCode}${when}`;
  }
  return `Skipped — you no longer have access to ${failure.assetCode ?? 'these assets'}`;
}

/** Renters' periods are clipped to their windows, exactly like any renter report. */
export function clipPeriodForSession(
  session: Session,
  assetIds: string[],
  fromMs: number,
  toMs: number,
): { fromMs: number; toMs: number } {
  let from = fromMs;
  let to = toMs;
  for (const assetId of assetIds) {
    const asset = seed.assets.find(a => a.id === assetId);
    if (!asset) continue;
    if (session.isKasper || asset.ownerTenantId === session.tenantId) continue;
    const window = rentalWindow(session, assetId);
    if (!window) continue;
    from = Math.max(from, window.start);
    to = Math.min(to, window.end);
  }
  return { fromMs: from, toMs: to };
}

// ── Sizes ─────────────────────────────────────────────────────────────────────
// Deterministic: the same parameters always produce the same size, so
// "Download again" regenerates an identical file.

export function sizeKbFor(type: string, format: ReportFormat, assetCount: number, spanDays: number): number {
  let h = 2166136261;
  for (const ch of `${type}:${format}:${assetCount}:${spanDays}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const base = 18 + (Math.abs(h) % 120);
  return base + assetCount * 7 + spanDays * 3;
}

// ── Runs ──────────────────────────────────────────────────────────────────────

export interface CreateRunInput {
  type: string;
  name: string;
  scopeLabel: string;
  assetIds: string[];
  fromMs: number;
  toMs: number;
  format: ReportFormat;
  bySchedule?: boolean;
  scheduleId?: string;
  /** The moment the run is created; defaults to the simulated clock. */
  nowMs?: number;
}

/**
 * Create a run. Access is checked at this instant: a denied run is still
 * recorded, as a skipped one, so the user can see why nothing arrived.
 */
export function createRun(session: Session, input: CreateRunInput): ReportRun {
  ensureLoaded();
  const nowMs = input.nowMs ?? clock.now();
  const period = clipPeriodForSession(session, input.assetIds, input.fromMs, input.toMs);
  const failure = reportAccess(session, input.assetIds, period.fromMs, period.toMs);

  if (failure) {
    const run: ReportRun = {
      id: nextId('run'),
      userId: session.userId,
      type: input.type,
      name: input.name,
      scopeLabel: input.scopeLabel,
      assetIds: input.assetIds,
      fromMs: input.fromMs,
      toMs: input.toMs,
      format: input.format,
      generatedAtMs: nowMs,
      bySchedule: input.bySchedule ?? false,
      scheduleId: input.scheduleId,
      status: 'skipped',
      skippedReason: skipReason(failure),
      sizeKb: 0,
    };
    runs = [run, ...runs];
    persist();
    return run;
  }

  const spanDays = Math.max(1, Math.round((period.toMs - period.fromMs) / 86400000));
  const run: ReportRun = {
    id: nextId('run'),
    userId: session.userId,
    type: input.type,
    name: input.name,
    scopeLabel: input.scopeLabel,
    assetIds: input.assetIds,
    fromMs: period.fromMs,
    toMs: period.toMs,
    format: input.format,
    generatedAtMs: nowMs,
    bySchedule: input.bySchedule ?? false,
    scheduleId: input.scheduleId,
    status: 'ready',
    sizeKb: sizeKbFor(input.type, input.format, input.assetIds.length, spanDays),
  };
  runs = [run, ...runs];
  persist();
  return run;
}

/** My runs (Kasper sees every tenant's, as the spec says, audited). */
export function listRuns(session: Session): ReportRun[] {
  ensureLoaded();
  if (session.isKasper) return runs;
  return runs.filter(r => r.userId === session.userId);
}

export function findRun(session: Session, runId: string): ReportRun | null {
  const run = runs.find(r => r.id === runId);
  if (!run) return null;
  if (!session.isKasper && run.userId !== session.userId) return null;
  return run;
}

export interface DownloadAgainResult {
  ok: boolean;
  run?: ReportRun;
  /** Set when the user lost access between the original run and now. */
  failure?: AccessFailure;
}

export function downloadAgain(session: Session, runId: string): DownloadAgainResult {
  ensureLoaded();
  const run = findRun(session, runId);
  if (!run) return { ok: false, failure: { code: 'no_access' } };
  const failure = reportAccess(session, run.assetIds, run.fromMs, run.toMs);
  if (failure) return { ok: false, failure };
  return { ok: true, run };
}

export function deleteRun(session: Session, runId: string): boolean {
  ensureLoaded();
  const run = findRun(session, runId);
  if (!run) return false;
  runs = runs.filter(r => r.id !== runId);
  persist();
  return true;
}

// ── Schedules ─────────────────────────────────────────────────────────────────

export interface CreateScheduleInput {
  type: string;
  name: string;
  assetIds: string[];
  format: ReportFormat;
  frequency: ScheduleFrequency;
  hour: number;
  weekday?: number;
  nowMs?: number;
}

/** The next time a schedule of this shape should fire, from `fromMs`. */
export function nextRunAfter(fromMs: number, frequency: ScheduleFrequency, hour: number, weekday = 1): number {
  const dubai = toZonedTime(new Date(fromMs), clock.DUBAI_TZ);
  dubai.setHours(hour, 0, 0, 0);
  if (dubai.getTime() <= fromMs) {
    if (frequency === 'daily') dubai.setDate(dubai.getDate() + 1);
    else if (frequency === 'weekly') dubai.setDate(dubai.getDate() + 7);
    else dubai.setMonth(dubai.getMonth() + 1);
  }
  if (frequency === 'weekly') {
    // Walk forward to the chosen weekday.
    while (dubai.getDay() !== weekday) dubai.setDate(dubai.getDate() + 1);
  }
  return fromZonedTime(dubai, clock.DUBAI_TZ).getTime();
}

function advance(nextRunAt: number, frequency: ScheduleFrequency): number {
  const dubai = toZonedTime(new Date(nextRunAt), clock.DUBAI_TZ);
  const stepped =
    frequency === 'daily' ? addDays(dubai, 1) : frequency === 'weekly' ? addWeeks(dubai, 1) : addMonths(dubai, 1);
  return fromZonedTime(stepped, clock.DUBAI_TZ).getTime();
}

/** The period a run covers: the one that just ended when it fired. */
export function periodEndingAt(nextRunAt: number, frequency: ScheduleFrequency): { fromMs: number; toMs: number } {
  const dubai = toZonedTime(new Date(nextRunAt), clock.DUBAI_TZ);
  const start =
    frequency === 'daily' ? addDays(dubai, -1) : frequency === 'weekly' ? addWeeks(dubai, -1) : addMonths(dubai, -1);
  return { fromMs: fromZonedTime(start, clock.DUBAI_TZ).getTime(), toMs: nextRunAt };
}

export function createSchedule(session: Session, input: CreateScheduleInput): ReportSchedule {
  ensureLoaded();
  const nowMs = input.nowMs ?? clock.now();
  const schedule: ReportSchedule = {
    id: nextId('sch'),
    userId: session.userId,
    type: input.type,
    name: input.name,
    assetIds: input.assetIds,
    format: input.format,
    frequency: input.frequency,
    hour: input.hour,
    weekday: input.weekday,
    nextRunAt: nextRunAfter(nowMs, input.frequency, input.hour, input.weekday),
    skipStreak: 0,
    createdAtMs: nowMs,
  };
  schedules = [schedule, ...schedules];
  persist();
  return schedule;
}

export function listSchedules(session: Session): ReportSchedule[] {
  ensureLoaded();
  if (session.isKasper) return schedules;
  return schedules.filter(s => s.userId === session.userId);
}

export function findSchedule(session: Session, scheduleId: string): ReportSchedule | null {
  const schedule = schedules.find(s => s.id === scheduleId);
  if (!schedule) return null;
  if (!session.isKasper && schedule.userId !== session.userId) return null;
  return schedule;
}

export function pauseSchedule(session: Session, scheduleId: string): boolean {
  ensureLoaded();
  const schedule = findSchedule(session, scheduleId);
  if (!schedule) return false;
  schedule.pausedAt = clock.now();
  schedule.pausedReason = 'manual';
  persist();
  return true;
}

export function resumeSchedule(session: Session, scheduleId: string): boolean {
  ensureLoaded();
  const schedule = findSchedule(session, scheduleId);
  if (!schedule) return false;
  schedule.pausedAt = undefined;
  schedule.pausedReason = undefined;
  schedule.skipStreak = 0;
  schedule.nextRunAt = nextRunAfter(clock.now(), schedule.frequency, schedule.hour, schedule.weekday);
  persist();
  return true;
}

export function updateSchedule(session: Session, scheduleId: string, patch: Partial<CreateScheduleInput>): boolean {
  ensureLoaded();
  const schedule = findSchedule(session, scheduleId);
  if (!schedule) return false;
  if (patch.format) schedule.format = patch.format;
  if (patch.frequency) schedule.frequency = patch.frequency;
  if (patch.hour !== undefined) schedule.hour = patch.hour;
  if (patch.weekday !== undefined) schedule.weekday = patch.weekday;
  schedule.nextRunAt = nextRunAfter(clock.now(), schedule.frequency, schedule.hour, schedule.weekday);
  persist();
  return true;
}

export function deleteSchedule(session: Session, scheduleId: string): boolean {
  ensureLoaded();
  const schedule = findSchedule(session, scheduleId);
  if (!schedule) return false;
  schedules = schedules.filter(s => s.id !== scheduleId);
  persist();
  return true;
}

// ── The tick ──────────────────────────────────────────────────────────────────

/**
 * Evaluate something as if the simulated clock stood at `atMs`.
 *
 * A tick can cover many missed fires at once (jump the demo clock forward a
 * week and seven daily runs are due), and each of those runs happened at its
 * own moment: access must be judged then, not at the end state, or a rental
 * that ended yesterday would retroactively erase the runs made while it was
 * live.
 */
function withClockAt<T>(atMs: number, fn: () => T): T {
  const saved = clock.getOffsetMs();
  clock.setOffsetMs(atMs - clock.getAnchor());
  try {
    return fn();
  } finally {
    clock.setOffsetMs(saved);
  }
}

/**
 * Move every unpaused schedule forward to `nowMs`, creating a run for each
 * period that has ended. Two skips in a row pause the schedule.
 */
export function materialiseSchedules(nowMs: number = clock.now()): ReportRun[] {
  ensureLoaded();
  const created: ReportRun[] = [];

  for (const schedule of schedules) {
    if (schedule.pausedAt) continue;
    const session = sessionForUser(schedule.userId);
    if (!session) continue;

    // Guard against a clock jump of years creating thousands of runs.
    let guard = 0;
    while (schedule.nextRunAt <= nowMs && guard < 400) {
      guard += 1;
      const period = periodEndingAt(schedule.nextRunAt, schedule.frequency);
      const run = withClockAt(schedule.nextRunAt, () =>
        createRun(session, {
          type: schedule.type,
          name: schedule.name,
          scopeLabel: schedule.assetIds.length > 1 ? 'Multiple assets' : 'Single asset',
          assetIds: schedule.assetIds,
          fromMs: period.fromMs,
          toMs: period.toMs,
          format: schedule.format,
          bySchedule: true,
          scheduleId: schedule.id,
          nowMs: schedule.nextRunAt,
        }),
      );
      created.push(run);

      if (run.status === 'skipped') {
        schedule.skipStreak += 1;
        if (schedule.skipStreak >= 2) {
          schedule.pausedAt = nowMs;
          schedule.pausedReason = 'skips';
        }
      } else {
        schedule.skipStreak = 0;
        outbox = [
          {
            id: nextId('mail'),
            to: session.user.email,
            subject: `${run.name} — ${clock.formatDubaiDate(schedule.nextRunAt)}`,
            body: `Your scheduled ${run.name} (${run.format.toUpperCase()}) for ${run.scopeLabel.toLowerCase()} is attached. Period ${clock.formatDubaiDateTime(run.fromMs)} — ${clock.formatDubaiDateTime(run.toMs)}.`,
            sentAtMs: schedule.nextRunAt,
            runId: run.id,
          },
          ...outbox,
        ];
      }

      schedule.lastRunAt = schedule.nextRunAt;
      schedule.nextRunAt = advance(schedule.nextRunAt, schedule.frequency);
      if (schedule.pausedAt) break;
    }
  }

  if (created.length > 0) persist();
  return created;
}

export function listOutbox(session: Session): OutboxEmail[] {
  ensureLoaded();
  const mine = new Set(listRuns(session).map(r => r.id));
  if (session.isKasper) return outbox;
  return outbox.filter(m => m.runId !== undefined && mine.has(m.runId));
}

export function clearOutbox(session: Session): void {
  ensureLoaded();
  if (session.isKasper) {
    outbox = [];
    return;
  }
  const mine = new Set(listRuns(session).map(r => r.id));
  outbox = outbox.filter(m => m.runId === undefined || !mine.has(m.runId));
  persist();
}
