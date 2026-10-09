// The db is the only writer. `seed` is the start-up value and nothing may
// assign into it after start-up (F1 proof).

import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  db, append, removeWhere, touch, nextNumber, nextRowNumber, freshDbState, resetDb, DB_VERSION, DB_STORAGE_KEY, type DbRow,
} from '@/server/db';
import * as seedData from '@/server/seed/data';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('db: seed is read-only after start-up', () => {
  // Writes into the seed: `seed.x = …`, `seed.x[i] = …`, `seed.x.push(…)` and
  // in-place array methods. Reads, comparisons and `const seed = useDb(…)` pass.
  const SEED_WRITE = /\bseed\.\w+(?:\.\w+|\[[^\]]*\])*\s*=(?!=)/;
  const SEED_MUTATOR = /\bseed\.\w+\.(?:push|splice|pop|shift|unshift|sort|reverse|fill|copyWithin)\(/;
  const SEED_DATA_WRITE = /\bseedData\.\w+(?:\.\w+|\[[^\]]*\])*\s*=(?!=)/;

  it('nothing outside db.ts assigns into or mutates the seed', () => {
    const offenders: string[] = [];
    for (const full of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'tests'))]) {
      const path = relative(ROOT, full).split(sep).join('/');
      if (path === 'src/server/db.ts' || path === 'src/server/db.test.ts' || path.startsWith('src/server/seed/')) continue;
      const text = readFileSync(full, 'utf8');
      if (SEED_WRITE.test(text) || SEED_MUTATOR.test(text) || SEED_DATA_WRITE.test(text)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });
});

describe('db: store behaviour', () => {
  beforeEach(() => {
    resetDb();
  });

  it('starts as a copy of the seed, never sharing arrays with it', () => {
    const state = freshDbState();
    expect(state.tenants).not.toBe(seedData.tenants);
    expect(state.tenants).toEqual(seedData.tenants);
    expect(state.assets[0]).not.toBe(seedData.assets[0]);
  });

  it('uses the versioned storage key', () => {
    expect(DB_STORAGE_KEY).toBe('kasper.db.v1');
    expect(DB_VERSION).toBe(1);
  });

  it('append adds a row and touch hands subscribers a new array', () => {
    const before = db.getState().labels;
    const row = { id: 'lb-test-1', name: 'Test label', color: '#fff' } as unknown as DbRow<'labels'>;
    append('labels', row);
    expect(db.getState().labels).toHaveLength(before.length + 1);
    const mid = db.getState().labels;
    touch('labels');
    expect(db.getState().labels).not.toBe(mid);
    expect(db.getState().labels).toHaveLength(before.length + 1);
  });

  it('removeWhere returns how many rows it removed', () => {
    const id = `lb-test-${Date.now()}`;
    append('labels', { id, name: 'x', color: '#000' } as unknown as DbRow<'labels'>);
    expect(removeWhere('labels', l => l.id === id)).toBe(1);
    expect(removeWhere('labels', l => l.id === id)).toBe(0);
  });

  it('nextNumber is above the largest stored suffix and respects the floor', () => {
    const rows = [{ id: 'tr-new-3' }, { id: 'tr-new-9' }, { id: 'tr-other-50' }, { id: 'tr-new-x' }];
    expect(nextNumber('tr-new-', rows)).toBe(10);
    expect(nextNumber('tr-new-', [], 100)).toBe(101);
    expect(nextNumber('tr-new-', rows, 20)).toBe(21);
  });
});

describe('db: nextRowNumber reads the live collection', () => {
  beforeEach(() => {
    resetDb();
  });

  it('counts past the rows already stored, so an import never reuses an id', () => {
    const start = nextRowNumber('assets', 'asset-import-');
    append('assets', { ...db.getState().assets[0], id: `asset-import-${start}` });
    expect(nextRowNumber('assets', 'asset-import-')).toBe(start + 1);
  });

  it('starts at the floor when nothing has that prefix yet', () => {
    expect(nextRowNumber('trackers', 'tracker-import-', 5)).toBe(6);
  });
});
