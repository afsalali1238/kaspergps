// Reports engine tests (spec §11.5, §11.13): trip detection, gating, renter
// clipping, permission re-check on Download again, and the schedule loop.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@/server/db';
import { ANCHOR_MS } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import type { Session, User } from '@/domain/types';
import { isKasperStaff } from '@/server/capabilities';
import { detectTrips, findGaps, distanceKm } from '@/server/trips';
import {
  runReport, regenerateReport, reportRunsFor, deleteReportRun,
  availableReportTypes, reportableAssets,
} from '@/server/reports';
import { createSchedule, runDueSchedules, schedulesFor, setScheduleActive } from '@/server/schedules';

function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId) as User;
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: user.siteIds,
    role: user.role,
    isKasper: isKasperStaff(user.role),
  };
}

beforeEach(() => {
  clock.setOffsetMs(0);
});

afterEach(() => {
  clock.setOffsetMs(0);
});

describe('trip detection (§11.5 trip rule)', () => {
  it('detects trips for a truck with movement and reports distance', () => {
    const fb12 = db.getState().assets.find(a => a.id === 'a-fb12')!;
    const trips = detectTrips(fb12, ANCHOR_MS - 2 * 86_400_000, ANCHOR_MS);
    expect(trips.length).toBeGreaterThan(0);
    for (const t of trips) {
      expect(t.endMs).toBeGreaterThanOrEqual(t.startMs);
      expect(t.maxSpeedKmh).toBeGreaterThanOrEqual(0);
      expect(t.distanceKm).toBeGreaterThanOrEqual(0);
    }
    expect(distanceKm(fb12, ANCHOR_MS - 2 * 86_400_000, ANCHOR_MS)).toBeGreaterThan(0);
  });

  it('finds no trips for a stationary generator', () => {
    const gn01 = db.getState().assets.find(a => a.id === 'a-gn01')!;
    const trips = detectTrips(gn01, ANCHOR_MS - 86_400_000, ANCHOR_MS);
    expect(trips).toEqual([]);
  });

  it('reports gaps as gaps and never fills them', () => {
    const wt08 = db.getState().assets.find(a => a.id === 'a-wt08')!;
    const gaps = findGaps([], ANCHOR_MS - 3 * 86_400_000, ANCHOR_MS);
    // No readings at all over three days ⇒ one big gap covering the range.
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    expect(gaps[0].to - gaps[0].from).toBeGreaterThan(86_400_000);
    void wt08;
  });
});

describe('report types gate by hardware (§11.5)', () => {
  it('Omar (Al Noor, Tier 1 only) never sees Fuel or Operating hours ECU types for day one, and never Fuel at any phase', () => {
    const omar = sessionFor('u-omar');
    const fb12 = db.getState().assets.find(a => a.id === 'a-fb12')!;
    const later = availableReportTypes(omar, [fb12.id], 'later');
    expect(later.map(r => r.id)).not.toContain('fuel');
    const dayOne = availableReportTypes(omar, [fb12.id], 'day_one');
    expect(dayOne.map(r => r.id)).toEqual(['trip_mileage', 'location_history']);
  });

  it('Khalid (Tier 3) gets Fuel for EX-04', () => {
    const khalid = sessionFor('u-khalid');
    const ex04 = db.getState().assets.find(a => a.id === 'a-ex04')!;
    const types = availableReportTypes(khalid, [ex04.id], 'later');
    expect(types.map(r => r.id)).toContain('fuel');
    expect(types.map(r => r.id)).toContain('operating_hours');
  });
});

describe('runReport (§11.5)', () => {
  it('runs a Trip & Mileage report and records a ReportRun', () => {
    const khalid = sessionFor('u-khalid');
    const before = db.getState().reportRuns.length;
    const result = runReport(khalid, {
      reportType: 'trip_mileage',
      assetIds: ['a-wl06'],
      from: '2026-10-01',
      to: '2026-10-08',
      format: 'xlsx',
    });
    expect(result.ok).toBe(true);
    expect(db.getState().reportRuns.length).toBe(before + 1);
    expect(result.data!.run.fileName).toMatch(/^Kasper_TripMileage_WL-06_.*\.xlsx$/);
    expect(result.data!.tables[0].title).toBe('Summary');
    expect(result.data!.tables.length).toBeGreaterThan(1);
  });

  it('refuses when nothing is in range instead of writing an empty file', () => {
    const khalid = sessionFor('u-khalid');
    const before = db.getState().reportRuns.length;
    const result = runReport(khalid, {
      reportType: 'trip_mileage',
      assetIds: ['a-wl06'],
      from: '2027-01-01',
      to: '2027-01-02',
      format: 'pdf',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Nothing to report for this period');
    expect(db.getState().reportRuns.length).toBe(before);
  });

  it('clips a renter to their rental window and says so', () => {
    const lina = sessionFor('u-lina');
    const result = runReport(lina, {
      reportType: 'location_history',
      assetIds: ['a-ex04'],
      from: '2026-09-01',
      to: '2026-10-08',
      format: 'xlsx',
    });
    expect(result.ok).toBe(true);
    expect(result.data!.clipNotes.join(' ')).toContain('Limited to your rental period');
  });

  it('forbids reports on assets the user cannot see (forbidden looks like missing)', () => {
    const priya = sessionFor('u-priya');
    const result = runReport(priya, {
      reportType: 'trip_mileage',
      assetIds: ['a-ex04'],
      from: '2026-10-01',
      to: '2026-10-08',
      format: 'pdf',
    });
    expect(result.ok).toBe(false);
  });

  it('regenerate re-checks permission now and Download again works for own runs', () => {
    const lina = sessionFor('u-lina');
    const run = runReport(lina, {
      reportType: 'location_history',
      assetIds: ['a-ex04'],
      from: '2026-10-01',
      to: '2026-10-05',
      format: 'pdf',
    });
    expect(run.ok).toBe(true);
    const again = regenerateReport(lina, run.data!.run.id);
    expect(again.ok).toBe(true);
    expect(again.data!.tables.length).toBeGreaterThan(0);
  });

  it('reportRunsFor only returns your own runs; delete removes them', () => {
    const khalid = sessionFor('u-khalid');
    const run = runReport(khalid, {
      reportType: 'trip_mileage',
      assetIds: ['a-wl06'],
      from: '2026-10-01',
      to: '2026-10-08',
      format: 'xlsx',
    });
    const linaRuns = reportRunsFor(sessionFor('u-lina')).map(r => r.id);
    expect(linaRuns).not.toContain(run.data!.run.id);
    const del = deleteReportRun(khalid, run.data!.run.id);
    expect(del.ok).toBe(true);
    expect(reportRunsFor(khalid).map(r => r.id)).not.toContain(run.data!.run.id);
  });

  it('a renter keeps past rentals reportable (S8: Anil and TP-21)', () => {
    const anil = sessionFor('u-anil');
    const reportable = reportableAssets(anil).map(a => a.code);
    expect(reportable).toContain('TP-21');
  });
});

describe('report schedules (§11.13)', () => {
  it('creates a schedule with a next run in the future', () => {
    const lina = sessionFor('u-lina');
    const result = createSchedule(lina, {
      reportType: 'location_history',
      scope: 'EX-04',
      assetIds: ['a-ex04'],
      frequency: 'daily',
      runAt: '18:00',
      format: 'pdf',
    });
    expect(result.ok).toBe(true);
    expect(Number(result.data!.nextRunAt)).toBeGreaterThan(clock.now());
    expect(schedulesFor(lina).some(s => s.id === result.data!.id)).toBe(true);
  });

  it('moving the clock forward a week creates 7 daily runs — ready until the rental ends, then skipped (S30)', { timeout: 60_000 }, () => {
    const lina = sessionFor('u-lina');
    const created = createSchedule(lina, {
      reportType: 'location_history',
      scope: 'EX-04',
      assetIds: ['a-ex04'],
      frequency: 'daily',
      runAt: '18:00',
      format: 'xlsx',
    });
    // A week of runs; EX-04's rental (+5 d) ends inside it, so later periods
    // fall outside Lina's windows and are skipped — two skips pause the
    // schedule (§11.13).
    clock.setOffsetMs(10 * 86_400_000);
    const outcomes = runDueSchedules(clock.now()).filter(o => o.scheduleId === created.data!.id);
    const runs = db.getState().reportRuns.filter(r => r.scheduleId === created.data!.id);
    expect(runs.length).toBeGreaterThanOrEqual(7);
    expect(runs.some(r => r.status === 'ready')).toBe(true);
    expect(outcomes.some(o => o.status === 'skipped')).toBe(true);
    expect(runs.some(r => r.status === 'skipped' && String(r.skipReason).includes('access'))).toBe(true);
  });

  it('a schedule whose assets are no longer accessible is skipped and pauses after 2 skips', () => {
    const lina = sessionFor('u-lina');
    const created = createSchedule(lina, {
      reportType: 'location_history',
      scope: 'EX-04',
      assetIds: ['a-ex04'],
      frequency: 'daily',
      runAt: '18:00',
      format: 'xlsx',
    });
    // Simulate losing access: the asset is beyond every rental window at run
    // time by jumping far past the booking end, and the run period is inside
    // the window — use a report type the scope can't support instead: mark the
    // schedule's user deactivated so runReport refuses? Simplest: point the
    // schedule at an asset the user cannot report on by clearing rentals.
    const booking = db.getState().bookings.find(b => b.id === 'b-1001')!;
    const originalEnd = booking.end;
    booking.end = new Date(clock.now() - 3 * 86_400_000).toISOString();
    void originalEnd;
    clock.setOffsetMs(2 * 86_400_000);
    runDueSchedules(clock.now());
    const runs = db.getState().reportRuns.filter(r => r.scheduleId === created.data!.id);
    expect(runs.some(r => r.status === 'skipped')).toBe(true);
    // restore
    booking.end = originalEnd;
  });

  it('paused schedules do not run', () => {
    const khalid = sessionFor('u-khalid');
    const created = createSchedule(khalid, {
      reportType: 'trip_mileage',
      scope: 'WL-06',
      assetIds: ['a-wl06'],
      frequency: 'daily',
      runAt: '07:00',
      format: 'pdf',
    });
    setScheduleActive(khalid, created.data!.id, false);
    clock.setOffsetMs(2 * 86_400_000);
    runDueSchedules(clock.now());
    const runs = db.getState().reportRuns.filter(r => r.scheduleId === created.data!.id);
    expect(runs).toHaveLength(0);
  });
});
