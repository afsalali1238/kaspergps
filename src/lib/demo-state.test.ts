import { describe, it, expect, beforeEach } from 'vitest';
import { db, resetDb, DB_VERSION } from '@/server/db';
import { exportDemoState, importDemoState, parseDemoState, DEMO_STATE_FORMAT } from '@/lib/demo-state';

beforeEach(() => {
  resetDb();
});

describe('demo state export and import', () => {
  it('round-trips the whole db, with the format tag and version', () => {
    const text = exportDemoState();
    const file = parseDemoState(text);
    expect(file.format).toBe(DEMO_STATE_FORMAT);
    expect(file.version).toBe(DB_VERSION);
    expect(file.db.tenants).toEqual(db.getState().tenants);
    expect(file.db.trackers).toEqual(db.getState().trackers);
  });

  it('restores an export after the demo has changed', () => {
    const text = exportDemoState();
    const before = db.getState().tenants.length;
    db.setState({ tenants: db.getState().tenants.slice(1) });
    expect(db.getState().tenants.length).toBe(before - 1);
    importDemoState(text);
    expect(db.getState().tenants.length).toBe(before);
  });

  it('refuses a file that is not JSON', () => {
    expect(() => parseDemoState('not json')).toThrow(/not valid JSON/);
  });

  it('refuses another format tag', () => {
    expect(() => parseDemoState(JSON.stringify({ format: 'other', version: DB_VERSION, db: {} })))
      .toThrow(/not a Kasper demo-state export/);
  });

  it('refuses a different version and leaves the db unchanged', () => {
    const before = db.getState().tenants;
    const text = JSON.stringify({ ...JSON.parse(exportDemoState()), version: DB_VERSION + 1 });
    expect(() => importDemoState(text)).toThrow(/version/);
    expect(db.getState().tenants).toBe(before);
  });

  it('refuses the old export shape with no db, and leaves the db unchanged', () => {
    const before = db.getState().tenants;
    const oldShape = JSON.stringify({ format: DEMO_STATE_FORMAT, version: DB_VERSION, demoSwitches: {}, clockOffsetMs: 0, session: null });
    expect(() => importDemoState(oldShape)).toThrow(/no database/);
    expect(db.getState().tenants).toBe(before);
  });

  it('refuses a db that is missing a collection', () => {
    const full = JSON.parse(exportDemoState());
    delete full.db.bookings;
    expect(() => importDemoState(JSON.stringify(full))).toThrow(/"bookings"/);
  });
});
