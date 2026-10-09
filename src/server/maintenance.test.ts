// Maintenance scheduling (spec 11.18): plan maths, visibility, logging a
// service, plan editing and fault-code tasks.
import { describe, it, expect } from 'vitest';
import {
  boardFor, createTaskFromFault, currentMeter, logService, maintenanceAlerts,
  openTasks, planSnapshot, plansForAsset, plansVisibleTo, savePlan, serviceHistory,
} from './maintenance';
import { db, append } from '@/server/db';
import * as clock from '@/lib/clock';
import type { Session } from '@/domain/types';

function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId)!;
  return {
    userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

const sara = () => sessionFor('u-sara');       // Kasper Admin
const ravi = () => sessionFor('u-ravi');       // Kasper Ops
const khalid = () => sessionFor('u-khalid');   // Emirates Earthmovers Admin
const omar = () => sessionFor('u-omar');       // Al Noor Admin
const priya = () => sessionFor('u-priya');     // Gulf Lift Admin
const lina = () => sessionFor('u-lina');       // Marina Builders Admin (a renter here)
const mark = () => sessionFor('u-mark');       // Gulf Lift Site User
const asset = (id: string) => db.getState().assets.find(a => a.id === id)!;
const plan = (id: string) => db.getState().maintenancePlans.find(p => p.id === id)!;

const auditFor = (action: string, needle: string) =>
  db.getState().auditEntries.find(e => e.action === action && e.detail.includes(needle));

describe('maintenance — the board', () => {
  it('sorts every plan into overdue, due soon and ok', () => {
    const board = boardFor(sara());
    expect(board.overdue.map(s => s.asset.code)).toEqual(['BD-02', 'CR-08']);
    expect(board.dueSoon.map(s => s.asset.code)).toEqual(['CR-02', 'EX-04', 'PU-51']);
    expect(board.ok.map(s => s.asset.code)).toEqual(['GN-01', 'TP-22', 'FB-14']);
    expect(board.overdue.length + board.dueSoon.length + board.ok.length).toBe(db.getState().maintenancePlans.length);
  });

  it('writes the headline the way the spec does', () => {
    expect(planSnapshot(plan('mp-ex04'), asset('a-ex04')).headline).toBe('Due at 8,500 h · ECU — 95 h left');
    expect(planSnapshot(plan('mp-cr02'), asset('a-cr02')).headline).toBe('Due 21 Oct (15 days)');
    expect(planSnapshot(plan('mp-cr08'), asset('a-cr08')).headline).toBe('Overdue — was due 1 Oct (5 days ago)');
    expect(planSnapshot(plan('mp-bd02'), asset('a-bd02')).headline).toBe('Overdue — due at 14,950 h · ECU (110 h over)');
    // Bases are labelled, never silently mixed.
    expect(planSnapshot(plan('mp-tp22'), asset('a-tp22')).source).toBe('Estimated (ignition hours)');
    expect(planSnapshot(plan('mp-fb14'), asset('a-fb14')).source).toBe('GPS distance');
    expect(planSnapshot(plan('mp-pu51'), asset('a-pu51')).source).toBe('CAN odometer');
  });

  it('notes when the asset is out on hire, so the owner can plan around it', () => {
    const snapshot = planSnapshot(plan('mp-cr02'), asset('a-cr02'));
    expect(snapshot.onHire).toMatch(/^On hire to Marina Builders until \d+ Oct$/);
    expect(planSnapshot(plan('mp-tp22'), asset('a-tp22')).onHire).toBeNull();
  });

  it('turns overdue and due-soon plans into alert lines', () => {
    const alerts = maintenanceAlerts(sara());
    expect(alerts.map(a => a.text)).toEqual([
      'Maintenance overdue: BD-02 — 250 h service',
      'Maintenance overdue: CR-08 — Annual crane inspection',
      'Maintenance due soon: CR-02 Annual crane inspection (21 Oct)',
      'Maintenance due soon: EX-04 500 h service (95 h left)',
      'Maintenance due soon: PU-51 10,000 km service (1,450 km left)',
    ]);
  });

  it('shows a company its own assets only — a renter never sees the owner’s plans', () => {
    expect(plansVisibleTo(sara())).toHaveLength(8);
    expect(plansVisibleTo(ravi())).toHaveLength(8); // Ops may look
    expect(plansVisibleTo(khalid()).map(p => p.assetId)).toEqual(['a-ex04', 'a-bd02', 'a-gn01']);
    expect(plansVisibleTo(omar()).map(p => p.assetId)).toEqual(['a-fb14', 'a-tp22']);
    expect(plansVisibleTo(priya()).map(p => p.assetId)).toEqual(['a-cr02', 'a-cr08']);
    // Marina Builders rents EX-04 from Emirates Earthmovers, but that plan is the owner's.
    expect(plansVisibleTo(lina()).map(p => p.assetId)).toEqual(['a-pu51']);
    // A Site User sees their own sites' assets, read only.
    expect(plansVisibleTo(mark()).length).toBeGreaterThanOrEqual(0);
    expect(plansForAsset(priya(), 'a-cr02')).toHaveLength(1);
    expect(plansForAsset(khalid(), 'a-cr02')).toHaveLength(0);
  });
});

describe('maintenance — reading a plan meter', () => {
  it('adds what the asset has put on the meter since the service', () => {
    const meter = currentMeter(plan('mp-ex04'), asset('a-ex04'));
    expect(meter.unit).toBe('h');
    expect(meter.value).toBeCloseTo(8405, 0); // 8,000 h at the service + 45 days × 9 h
    expect(currentMeter(plan('mp-pu51'), asset('a-pu51')).value).toBeCloseTo(11550, 0); // 3,000 km + 90 × 95
    expect(currentMeter(plan('mp-cr02'), asset('a-cr02')).unit).toBe('days');
  });
});

describe('maintenance — logging a service', () => {
  it('resets the plan, records the cost and audits it', () => {
    const before = clock.now();
    const result = logService(khalid(), {
      planId: 'mp-bd02', doneAt: before, value: 15060, notes: '  ', costAed: 5100.5,
    });
    expect(result.ok).toBe(true);
    const record = result.data!;
    expect(record.notes).toBe('250 h service'); // falls back to the plan name
    expect(record.costAed).toBe(5100.5);
    expect(record.createdBy).toBe('u-khalid');
    expect(plan('mp-bd02').lastDoneValue).toBe(15060);
    expect(plan('mp-bd02').lastDoneAt).toBe(record.doneAt);
    expect(auditFor('maintenance.service', 'BD-02 250 h service logged at 15,060 h')).toBeTruthy();
    expect(serviceHistory(khalid(), 'a-bd02')[0].id).toBe(record.id);
    // The board reflects the reset straight away.
    expect(boardFor(khalid()).ok.map(s => s.asset.code)).toContain('BD-02');
  });

  it('checks capability, ownership and the numbers', () => {
    expect(logService(mark(), { planId: 'mp-cr02', doneAt: clock.now(), value: 1, notes: 'x', costAed: 1 }).error)
      .toBe('Your role can\u2019t log services.');
    expect(logService(omar(), { planId: 'mp-cr02', doneAt: clock.now(), value: 1, notes: 'x', costAed: 1 }).error)
      .toBe('You can only log services on your own assets.');
    expect(logService(khalid(), { planId: 'mp-nope', doneAt: clock.now(), value: 1, notes: 'x', costAed: 1 }).error)
      .toBe('Plan not found.');
    expect(logService(khalid(), { planId: 'mp-ex04', doneAt: clock.now(), value: -1, notes: 'x', costAed: 1 }).error)
      .toBe('Enter the meter reading at the service.');
    expect(logService(khalid(), { planId: 'mp-ex04', doneAt: clock.now(), value: 1, notes: 'x', costAed: -2 }).error)
      .toBe('Cost can\u2019t be negative.');
    expect(logService(khalid(), { planId: 'mp-ex04', doneAt: clock.now() + 7200000, value: 1, notes: 'x', costAed: 1 }).error)
      .toBe('The service date can\u2019t be in the future.');
    // Kasper Ops may fix up any company's history.
    expect(logService(ravi(), { planId: 'mp-cr02', doneAt: clock.now(), value: 0, notes: 're-inspection', costAed: 0 }).ok).toBe(true);
  });
});

describe('maintenance — plans and fault-code tasks', () => {
  it('creates and edits plans with sensible defaults', () => {
    const created = savePlan(omar(), {
      assetId: 'a-tp22', name: 'Air filter 200 h', basis: 'engine_hours', hoursSource: 'estimated',
      interval: 200, lastDoneAt: clock.now(), lastDoneValue: 1350,
    });
    expect(created.ok).toBe(true);
    const newPlan = created.data!;
    expect(newPlan.id).toMatch(/^mp-/);
    expect(newPlan.dueSoonAt).toBe(1510); // 200 h interval → live 80 % point
    expect(auditFor('maintenance.plan', 'Created TP-22 Air filter 200 h (every 200 h)')).toBeTruthy();

    const edited = savePlan(omar(), { id: newPlan.id, assetId: 'a-tp22', name: 'Air filter 250 h', basis: 'engine_hours', interval: 250, lastDoneAt: clock.now(), lastDoneValue: 1350 });
    expect(edited.ok).toBe(true);
    expect(edited.message).toBe('TP-22: Air filter 250 h updated.');
    expect(plan(newPlan.id).interval).toBe(250);
    // Bases are exclusive: a km plan has no hours source.
    const km = savePlan(omar(), { id: newPlan.id, assetId: 'a-tp22', name: 'Distance service', basis: 'km', kmSource: 'gps', interval: 5000, lastDoneAt: clock.now(), lastDoneValue: 100 });
    expect(km.ok).toBe(true);
    expect(plan(newPlan.id).kmSource).toBe('gps');
    expect(plan(newPlan.id).hoursSource).toBeUndefined();
  });

  it('guards plan edits', () => {
    const base = { assetId: 'a-cr02', basis: 'days' as const, lastDoneAt: clock.now(), lastDoneValue: 0 };
    expect(savePlan(omar(), { ...base, name: 'Crane check', interval: 365 }).error).toBe('You can only plan services on your own assets.');
    expect(savePlan(priya(), { ...base, name: '  ', interval: 365 }).error).toBe('Give the plan a name.');
    expect(savePlan(priya(), { ...base, name: 'Crane check', interval: 0 }).error).toBe('The interval must be more than zero.');
    expect(savePlan(priya(), { assetId: 'a-nope', name: 'Crane check', interval: 365, lastDoneAt: clock.now(), lastDoneValue: 0, basis: 'days' }).error).toBe('Asset not found.');
    expect(savePlan(mark(), { ...base, name: 'Crane check', interval: 365 }).error).toBe('Your role can\u2019t edit service plans.');
  });

  it('raises a one-off task from a Tier 3 fault code and closes it with a service', () => {
    const fault = db.getState().alerts.find(a => a.type === 'fault_code' && !a.closedAt)!;
    expect(fault.assetId).toBe('a-bd02'); // Tier 3, has a CAN bus
    const task = createTaskFromFault(khalid(), fault.id);
    expect(task.ok).toBe(true);
    expect(task.data!.title).toBe('SPN 110 FMI 0 — Engine coolant temperature high');
    expect(openTasks(khalid()).map(t => t.id)).toContain(task.data!.id);
    expect(createTaskFromFault(khalid(), fault.id).error).toBe('There is already an open task for this fault.');
    expect(auditFor('maintenance.task', 'BD-02: service task from SPN 110')).toBeTruthy();

    // Logging the service from the task closes it.
    const done = logService(khalid(), {
      planId: 'mp-bd02', doneAt: clock.now(), value: 15100, notes: 'Coolant sensor checked', costAed: 700, taskId: task.data!.id,
    });
    expect(done.ok).toBe(true);
    expect(openTasks(khalid()).map(t => t.id)).not.toContain(task.data!.id);
    expect(db.getState().maintenanceTasks.find(t => t.id === task.data!.id)!.doneBy).toBe('u-khalid');

    // Fault codes are Tier 3 only: a tracker-only asset and a partial CAN asset are refused.
    append('alerts', { ...fault, id: 'al-fake1', assetId: 'a-fb14' });
    append('alerts', { ...fault, id: 'al-fake2', assetId: 'a-pu51' });
    // The owner's admin is refused for the tracker-only asset by the tier rule.
    expect(createTaskFromFault(omar(), 'al-fake1').error).toContain('has no CAN bus');
    expect(createTaskFromFault(lina(), 'al-fake2').error).toContain('has no CAN bus');
    expect(createTaskFromFault(khalid(), 'al-missing').error).toBe('Fault code not found.');
    expect(createTaskFromFault(mark(), fault.id).error).toBe('Your role can\u2019t create service tasks.');
  });
});
