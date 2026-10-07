// S30 at the data level — reports, schedules, the skip rule and the simulated
// outbox (spec 11.13).
//
// S30: Lina schedules a daily Location history for EX-04, jumps past the rental
// end, and the runs turn into "Skipped — you no longer have access to EX-04
// (rental ended …)"; two skips in a row pause the schedule.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Session } from '@/domain/types';
import { seed, ANCHOR_MS } from '@/server/seed/data';
import { rentalWindow } from '@/server/access';
import {
  createRun,
  createSchedule,
  deleteRun,
  downloadAgain,
  listOutbox,
  listRuns,
  listSchedules,
  materialiseSchedules,
  pauseSchedule,
  reportAccess,
  resetReports,
  resumeSchedule,
  sizeKbFor,
  skipReason,
} from '@/server/reports';
import * as clock from '@/lib/clock';

const DAY = 86400000;

function sessionOf(userId: string): Session {
  const user = seed.users.find(u => u.id === userId)!;
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: user.siteIds,
    role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

const lina = () => sessionOf('u-lina');
const omar = () => sessionOf('u-omar');

beforeEach(() => resetReports());
afterEach(() => clock.resetOffset());

describe('report access is re-checked, not remembered', () => {
  it('allows a run inside the renter’s window and denies one outside it', () => {
    const session = lina();
    const window = rentalWindow(session, 'a-ex04')!;

    expect(reportAccess(session, ['a-ex04'], window.start + DAY, window.start + 2 * DAY)).toBeNull();

    const outside = reportAccess(session, ['a-ex04'], window.end + DAY, window.end + 2 * DAY);
    expect(outside?.code).toBe('rental_ended');
    expect(outside?.assetCode).toBe('EX-04');
    expect(outside?.rentalEndedAt).toBe(window.end);
  });

  it('refuses an asset the user cannot see at all', () => {
    const failure = reportAccess(lina(), ['a-fb12'], ANCHOR_MS - DAY, ANCHOR_MS);
    expect(failure?.code).toBe('no_access');
    expect(failure?.assetCode).toBe('FB-12');
  });

  it('refuses a deactivated user', () => {
    const deactivated: Session = { ...lina(), user: { ...seed.users.find(u => u.id === 'u-lina')!, status: 'deactivated' } };
    expect(reportAccess(deactivated, ['a-ex04'], ANCHOR_MS - DAY, ANCHOR_MS)?.code).toBe('deactivated');
  });

  it('"Download again" succeeds while access holds, then fails once the rental ends', () => {
    const session = lina();
    const window = rentalWindow(session, 'a-ex04')!;
    const run = createRun(session, {
      type: 'location_history',
      name: 'Location history — EX-04',
      scopeLabel: 'Single asset',
      assetIds: ['a-ex04'],
      fromMs: window.start + DAY,
      toMs: window.start + 2 * DAY,
      format: 'excel',
    });
    expect(run.status).toBe('ready');
    expect(downloadAgain(session, run.id).ok).toBe(true);

    // The rental ends and the clock moves past it.
    clock.setOffsetMs(window.end + 2 * DAY - clock.getAnchor());
    expect(clock.now()).toBeGreaterThan(window.end);
    const later = downloadAgain(session, run.id);
    expect(later.ok).toBe(false);
    expect(later.failure?.code).toBe('rental_ended');
  });

  it('keeps each user’s list to their own runs', () => {
    const run = createRun(lina(), {
      type: 'trip_mileage',
      name: 'Trip & Mileage — EX-04',
      scopeLabel: 'Single asset',
      assetIds: ['a-ex04'],
      fromMs: ANCHOR_MS - DAY,
      toMs: ANCHOR_MS,
      format: 'pdf',
    });
    expect(listRuns(lina()).map(r => r.id)).toContain(run.id);
    expect(listRuns(omar()).map(r => r.id)).not.toContain(run.id);
    // Kasper sees everything.
    expect(listRuns(sessionOf('u-sara')).map(r => r.id)).toContain(run.id);
  });

  it('deletes only your own runs', () => {
    const run = createRun(lina(), {
      type: 'fuel',
      name: 'Fuel — EX-04',
      scopeLabel: 'Single asset',
      assetIds: ['a-ex04'],
      fromMs: ANCHOR_MS - DAY,
      toMs: ANCHOR_MS,
      format: 'excel',
    });
    expect(deleteRun(omar(), run.id)).toBe(false);
    expect(deleteRun(lina(), run.id)).toBe(true);
    expect(listRuns(lina())).toHaveLength(0);
  });
});

describe('sizes are deterministic', () => {
  it('the same parameters always give the same size', () => {
    expect(sizeKbFor('location_history', 'excel', 1, 1)).toBe(sizeKbFor('location_history', 'excel', 1, 1));
    expect(sizeKbFor('location_history', 'excel', 1, 1)).not.toBe(sizeKbFor('location_history', 'pdf', 1, 1));
    // A regenerated run is byte-identical, so the size matches too.
    const session = lina();
    const window = rentalWindow(session, 'a-ex04')!;
    const input = {
      type: 'location_history',
      name: 'Location history — EX-04',
      scopeLabel: 'Single asset',
      assetIds: ['a-ex04'],
      fromMs: window.start + DAY,
      toMs: window.start + 2 * DAY,
      format: 'excel' as const,
    };
    const first = createRun(session, input);
    const second = createRun(session, input);
    expect(second.sizeKb).toBe(first.sizeKb);
  });

  it('clips a renter’s run period to their window', () => {
    const session = lina();
    const window = rentalWindow(session, 'a-ex04')!;
    const run = createRun(session, {
      type: 'location_history',
      name: 'Location history — EX-04',
      scopeLabel: 'Single asset',
      assetIds: ['a-ex04'],
      fromMs: window.start - 5 * DAY,
      toMs: window.start + DAY,
      format: 'excel',
    });
    expect(run.fromMs).toBe(window.start);
  });
});

/** Jump the simulated clock, exactly like the demo bar does. */
function jumpTo(ms: number): void {
  clock.setOffsetMs(ms - clock.getAnchor());
}

function dailySchedule() {
  const session = lina();
  return {
    session,
    schedule: createSchedule(session, {
      type: 'location_history',
      name: 'Location history — EX-04',
      assetIds: ['a-ex04'],
      format: 'excel',
      frequency: 'daily',
      hour: 10, // the hour the demo creates it at
    }),
  };
}

describe('S30 · a daily schedule across the end of a rental', () => {
  it('creates one run per day when the clock jumps forward a week', () => {
    // The owner's own asset, so nothing expires mid-week: the spec's
    // "moving the clock forward a week creates 7 daily runs" has to be about
    // runs that are actually allowed.
    const session = omar();
    const schedule = createSchedule(session, {
      type: 'location_history',
      name: 'Location history — FB-12',
      assetIds: ['a-fb12'],
      format: 'excel',
      frequency: 'daily',
      hour: 10,
    });
    expect(listSchedules(session)).toHaveLength(1);

    // A week goes by (stopping one minute short of the eighth fire).
    jumpTo(schedule.nextRunAt + 7 * DAY - 60000);
    const created = materialiseSchedules();
    expect(created).toHaveLength(7);
    expect(created.every(r => r.status === 'ready')).toBe(true);
    expect(listRuns(session).length).toBe(7);
    // Each run delivered an email to the simulated outbox.
    expect(listOutbox(session)).toHaveLength(7);
    expect(listOutbox(session)[0].to).toBe('omar@alnoor.ae');
    expect(listOutbox(session)[0].subject).toContain('Location history — FB-12');
  });

  it('records skips after the rental ends and pauses the schedule after two', () => {
    const { session, schedule } = dailySchedule();
    const window = rentalWindow(session, 'a-ex04')!;

    // Jump to two days past the rental end, as S30 says.
    jumpTo(window.end + 2 * DAY);
    const created = materialiseSchedules();

    // Runs made while the rental was live are untouched — access is judged at
    // each run's own moment, not at the end state.
    expect(created.filter(r => r.status === 'ready').length).toBeGreaterThan(0);
    const skipped = created.filter(r => r.status === 'skipped');
    expect(skipped.length).toBe(2);

    const reason = skipped[0].skippedReason!;
    expect(reason).toContain('Skipped — you no longer have access to EX-04');
    expect(reason).toContain('(rental ended');
    expect(reason).toContain(clock.formatDubaiDate(window.end));

    // Paused itself, and no further runs are created while paused.
    expect(schedule.pausedAt).toBeDefined();
    expect(schedule.pausedReason).toBe('skips');
    const before = listRuns(session).length;
    jumpTo(window.end + 30 * DAY);
    materialiseSchedules();
    expect(listRuns(session).length).toBe(before);

    // Resuming starts it again.
    expect(resumeSchedule(session, schedule.id)).toBe(true);
    expect(schedule.pausedAt).toBeUndefined();
    expect(schedule.skipStreak).toBe(0);
    expect(materialiseSchedules()).toEqual([]);
  });

  it('a manual pause stops runs and resuming restarts them', () => {
    const session = omar();
    const schedule = createSchedule(session, {
      type: 'trip_mileage',
      name: 'Trip & Mileage — FB-12',
      assetIds: ['a-fb12'],
      format: 'pdf',
      frequency: 'weekly',
      hour: 6,
      weekday: 1,
    });
    expect(pauseSchedule(session, schedule.id)).toBe(true);
    jumpTo(schedule.nextRunAt + 10 * DAY);
    expect(materialiseSchedules()).toEqual([]);
    expect(resumeSchedule(session, schedule.id)).toBe(true);
  });

  it('skipReason reads the way the spec writes it', () => {
    expect(skipReason({ code: 'rental_ended', assetCode: 'EX-04', rentalEndedAt: ANCHOR_MS })).toBe(
      `Skipped — you no longer have access to EX-04 (rental ended ${clock.formatDubaiDate(ANCHOR_MS)})`,
    );
    expect(skipReason({ code: 'no_access', assetCode: 'FB-12' })).toBe(
      'Skipped — you no longer have access to FB-12',
    );
  });

  it('does not create a run for a schedule that has not come due', () => {
    const { schedule } = dailySchedule();
    jumpTo(schedule.nextRunAt - 60000);
    expect(materialiseSchedules()).toEqual([]);
  });
});
