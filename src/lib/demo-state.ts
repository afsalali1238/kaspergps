// Demo state as one file: the whole db plus the session, demo switches and
// clock. Reset puts everything back to the seed. Export and Import round-trip
// the same shape, and Import refuses anything it cannot fully validate.

import type { DemoSwitches, Session } from '@/domain/types';
import * as clock from '@/lib/clock';
import {
  DB_COLLECTION_KEYS, DB_VERSION, db, freshDbState, replaceDb, resetDb, type DbState,
} from '@/server/db';
import { useStore } from '@/store';

export const DEMO_STATE_FORMAT = 'kasper-demo-state';

const DEFAULT_SWITCHES: DemoSwitches = { phase: 'later', showHidden: false, salesView: false };

export interface DemoStateFile {
  format: typeof DEMO_STATE_FORMAT;
  version: number;
  exportedAt: string;
  db: Partial<DbState>;
  session: Session | null;
  demoSwitches: DemoSwitches;
  clockOffsetMs: number;
}

/** Everything a demo can change, as JSON text. */
export function exportDemoState(): string {
  const state = db.getState();
  const dbSnapshot: Partial<DbState> = {};
  for (const key of DB_COLLECTION_KEYS) {
    (dbSnapshot as Record<string, unknown>)[key] = state[key];
  }
  const store = useStore.getState();
  const file: DemoStateFile = {
    format: DEMO_STATE_FORMAT,
    version: DB_VERSION,
    exportedAt: new Date(clock.now()).toISOString(),
    db: dbSnapshot,
    session: store.session,
    demoSwitches: store.demoSwitches,
    clockOffsetMs: store.clockOffsetMs,
  };
  return JSON.stringify(file, null, 2);
}

/** Put every demo change back to the seed and sign out. */
export function resetDemoState(): void {
  resetDb();
  const store = useStore.getState();
  store.setSession(null);
  store.setDemoSwitches(DEFAULT_SWITCHES);
  store.resetClock();
}

/**
 * Parse and validate an export. Throws an Error with a readable message when
 * the file is not a complete, current-version export.
 */
export function parseDemoState(text: string): DemoStateFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!isRecord(raw) || raw.format !== DEMO_STATE_FORMAT) {
    throw new Error('That file is not a Kasper demo-state export.');
  }
  if (raw.version !== DB_VERSION) {
    throw new Error(`That export is version ${String(raw.version)}; this build reads version ${DB_VERSION}.`);
  }
  if (!isRecord(raw.db)) {
    throw new Error('That export has no database. Re-export from a current build.');
  }
  const expected = Object.keys(freshDbState());
  for (const key of expected) {
    if (!Array.isArray(raw.db[key])) {
      throw new Error(`The export is missing the "${key}" list.`);
    }
  }
  const sw = raw.demoSwitches;
  if (!isRecord(sw) || typeof sw.phase !== 'string' || typeof sw.showHidden !== 'boolean' || typeof sw.salesView !== 'boolean') {
    throw new Error('The export has invalid demo switches.');
  }
  if (typeof raw.clockOffsetMs !== 'number' || !Number.isFinite(raw.clockOffsetMs)) {
    throw new Error('The export has an invalid clock offset.');
  }
  if (raw.session !== null && !(isRecord(raw.session) && typeof raw.session.userId === 'string')) {
    throw new Error('The export has an invalid session.');
  }
  return {
    format: DEMO_STATE_FORMAT,
    version: DB_VERSION,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    db: raw.db as Partial<DbState>,
    session: raw.session as Session | null,
    demoSwitches: sw as unknown as DemoSwitches,
    clockOffsetMs: raw.clockOffsetMs,
  };
}

/** Replace the demo with a validated export. Nothing changes if validation fails. */
export function importDemoState(text: string): void {
  const file = parseDemoState(text);
  replaceDb(file.db as DbState);
  const store = useStore.getState();
  store.setSession(file.session);
  store.setDemoSwitches(file.demoSwitches);
  store.setClockOffsetMs(file.clockOffsetMs);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
