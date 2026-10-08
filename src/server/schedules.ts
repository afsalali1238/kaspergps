// Report schedules (spec §11.13): daily / weekly / monthly runs checked against
// the simulated clock. When the clock passes nextRunAt, a run is created for the
// period just ended, checking permissions at that moment. Two consecutive skips
// pause the schedule.

import type { ReportSchedule, Session } from '@/domain/types';
import { seed } from '@/server/seed/data';
import { fail, ok, type OpResult } from '@/server/result';
import { hasCapability } from '@/server/access';
import { isKasperStaff } from '@/server/capabilities';
import { runReport, reportableAssets, REPORT_TYPES, type ReportTypeId } from '@/server/reports';
import * as clock from '@/lib/clock';

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';

export interface CreateScheduleInput {
  reportType: ReportTypeId;
  /** Display label for the scope, e.g. "EX-04" or "Assets with label Project Alpha". */
  scope: string;
  assetIds: string[];
  frequency: ScheduleFrequency;
  /** HH:mm in Dubai time. */
  runAt: string;
  /** 0 = Sunday … 6 = Saturday, for weekly schedules. */
  weekday?: number;
  format: 'pdf' | 'xlsx';
}

// The seed's ReportSchedule predates assetIds; keep them on the side so runs can
// rebuild files. New schedules store ids in the object below.
const scheduleAssetIds = new Map<string, string[]>();
const scheduleSkips = new Map<string, number>();

function nextRunAfter(baseMs: number, frequency: ScheduleFrequency, runAt: string, weekday?: number): number {
  const [hh, mm] = runAt.split(':').map(Number);
  // The seed encodes Sunday as 7; JS getDay() is 0–6.
  const weekday0 = (weekday ?? 1) % 7;
  for (let dayOffset = 0; dayOffset <= 370; dayOffset++) {
    const day = clock.startOfDubaiDay(baseMs + dayOffset * 86_400_000);
    const at = day + (hh * 60 + mm) * 60_000;
    if (at <= baseMs) continue;
    const date = clock.dubaiMsToDate(day);
    if (frequency === 'daily') return at;
    if (frequency === 'weekly' && date.getDay() === weekday0) return at;
    if (frequency === 'monthly' && date.getDate() === 1) return at;
  }
  return baseMs + 86_400_000;
}

export function createSchedule(session: Session, input: CreateScheduleInput): OpResult<ReportSchedule> {
  if (!hasCapability(session, 'report.schedule')) return fail('You can’t create report schedules.');
  const reportable = new Set(reportableAssets(session).map(a => a.id));
  if (input.assetIds.length === 0) return fail('Pick at least one asset.');
  for (const id of input.assetIds) {
    if (!reportable.has(id)) return fail('You no longer have access to this report’s assets.');
  }
  if (!/^\d{2}:\d{2}$/.test(input.runAt)) return fail('Enter a time like 07:00.');

  const schedule: ReportSchedule = {
    id: `rs-${clock.now()}-${seed.reportSchedules.length + 1}`,
    userId: session.userId,
    reportType: input.reportType,
    scope: input.scope,
    frequency: input.frequency,
    runAt: input.runAt,
    weekday: input.weekday,
    format: input.format,
    nextRunAt: nextRunAfter(clock.now(), input.frequency, input.runAt, input.weekday),
    active: true,
  };
  seed.reportSchedules.push(schedule);
  scheduleAssetIds.set(schedule.id, input.assetIds);
  scheduleSkips.set(schedule.id, 0);
  return ok(schedule, `Schedule saved — next run ${clock.formatDubaiDateTime(Number(schedule.nextRunAt))}.`);
}

export function schedulesFor(session: Session): ReportSchedule[] {
  return seed.reportSchedules.filter(s => s.userId === session.userId);
}

function findSchedule(session: Session, id: string): ReportSchedule | null {
  return seed.reportSchedules.find(s => s.id === id && s.userId === session.userId) ?? null;
}

export function setScheduleActive(session: Session, id: string, active: boolean): OpResult<ReportSchedule> {
  const schedule = findSchedule(session, id);
  if (!schedule) return fail('Schedule not found.');
  schedule.active = active;
  if (active) {
    scheduleSkips.set(id, 0);
    schedule.nextRunAt = nextRunAfter(clock.now(), schedule.frequency, schedule.runAt, schedule.weekday);
  }
  return ok(schedule, active ? 'Schedule resumed.' : 'Schedule paused.');
}

export function deleteSchedule(session: Session, id: string): OpResult<null> {
  const idx = seed.reportSchedules.findIndex(s => s.id === id && s.userId === session.userId);
  if (idx < 0) return fail('Schedule not found.');
  seed.reportSchedules.splice(idx, 1);
  scheduleAssetIds.delete(id);
  scheduleSkips.delete(id);
  return ok(null, 'Schedule deleted.');
}

// Seeded schedules: map their scope to the label's assets (§8.10 report schedules).
function assetIdsFor(schedule: ReportSchedule): string[] {
  const known = scheduleAssetIds.get(schedule.id);
  if (known) return known;
  if (schedule.scope.includes('Project Alpha')) return ['a-ex04', 'a-wl03', 'a-bd02'];
  if (schedule.scope.includes('EX-04')) return ['a-ex04'];
  return [];
}

/** Seeded rows store the report type's label; new ones store its id. */
function resolveTypeId(reportType: string): ReportTypeId {
  const match = REPORT_TYPES.find(rt => rt.id === reportType || rt.label === reportType);
  return (match?.id ?? 'location_history') as ReportTypeId;
}

export interface DueRunOutcome {
  scheduleId: string;
  runId: string | null;
  status: 'ready' | 'skipped';
  detail: string;
}

/**
 * Run every schedule whose nextRunAt has passed, once per missed occurrence
 * (moving the clock forward a week creates 7 daily runs). Permissions are
 * re-checked at run time; two consecutive skips pause the schedule.
 */
export function runDueSchedules(atMs: number = clock.now()): DueRunOutcome[] {
  const outcomes: DueRunOutcome[] = [];
  for (const schedule of [...seed.reportSchedules]) {
    if (!schedule.active) continue;
    let guard = 0;
    while (Number(schedule.nextRunAt) <= atMs && guard++ < 40) {
      const periodEnd = Number(schedule.nextRunAt);
      const periodFrom = clock.dubaiDateKey(periodEnd - 86_400_000);
      const periodTo = clock.dubaiDateKey(periodEnd - 60_000);
      const user = seed.users.find(u => u.id === schedule.userId);
      const assetIds = assetIdsFor(schedule);
      if (!user || assetIds.length === 0) {
        schedule.nextRunAt = nextRunAfter(periodEnd, schedule.frequency, schedule.runAt, schedule.weekday);
        continue;
      }
      // Build the same session shape the rest of the server uses.
      const sessionLike: Session = {
        userId: user.id,
        user,
        tenantId: user.tenantId,
        siteIds: user.siteIds,
        role: user.role,
        isKasper: isKasperStaff(user.role),
      };
      const result = runReport(sessionLike, {
        reportType: resolveTypeId(schedule.reportType),
        assetIds,
        from: periodFrom,
        to: periodTo,
        format: schedule.format,
        scheduleId: schedule.id,
      });
      if (result.ok && result.data) {
        scheduleSkips.set(schedule.id, 0);
        outcomes.push({ scheduleId: schedule.id, runId: result.data.run.id, status: 'ready', detail: `${result.data.run.fileName ?? ''} ready` });
      } else {
        const skips = (scheduleSkips.get(schedule.id) ?? 0) + 1;
        scheduleSkips.set(schedule.id, skips);
        const reason = result.error ?? 'Skipped — you no longer have access.';
        const run = {
          id: `rr-${periodEnd}-skip-${schedule.id}`,
          userId: schedule.userId,
          reportType: schedule.reportType,
          scope: schedule.scope,
          from: periodFrom,
          to: periodTo,
          format: schedule.format,
          createdAt: new Date(periodEnd).toISOString(),
          scheduleId: schedule.id,
          status: 'skipped' as const,
          skipReason: `Skipped — ${reason}`,
          assetIds,
        };
        seed.reportRuns.push(run);
        outcomes.push({ scheduleId: schedule.id, runId: run.id, status: 'skipped', detail: reason });
        if (skips >= 2) {
          schedule.active = false;
          outcomes.push({ scheduleId: schedule.id, runId: null, status: 'skipped', detail: 'Schedule paused after 2 skips.' });
          break;
        }
      }
      schedule.nextRunAt = nextRunAfter(periodEnd, schedule.frequency, schedule.runAt, schedule.weekday);
    }
  }
  return outcomes;
}
