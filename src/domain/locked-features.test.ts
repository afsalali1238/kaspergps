// H3.3 — hardware features an asset doesn't have are locked cards (Sales view),
// never disabled controls, and only in the phases that are in scope.
import { describe, it, expect } from 'vitest';
import { db } from '@/server/db';
import { lockedFeatures, phaseInScope } from './features';
import type { Asset } from './types';

const asset = (code: string) => db.getState().assets.find(a => a.code === code)! as Asset;

describe('phaseInScope', () => {
  it('day one features show in every phase; phase 2 not on day one; later only later', () => {
    expect(phaseInScope('day_one', 'day_one')).toBe(true);
    expect(phaseInScope('phase2', 'day_one')).toBe(false);
    expect(phaseInScope('phase2', 'phase2')).toBe(true);
    expect(phaseInScope('later', 'phase2')).toBe(false);
    expect(phaseInScope('later', 'later')).toBe(true);
  });
});

describe('lockedFeatures', () => {
  it('a Tier 1 asset gets Tier 3 locked cards for the CAN features in phase 2', () => {
    const fb12 = asset('FB-12');
    const locked = lockedFeatures(fb12, 'phase2');
    const muc = locked.find(l => l.key === 'muc');
    expect(muc?.reason).toBe('Needs ALL-CAN300 (Tier 3)');
    expect(locked.some(l => l.key === 'engine.live')).toBe(true);
  });

  it('a feature the asset has is never locked', () => {
    const ex04 = asset('EX-04');
    const locked = lockedFeatures(ex04, 'later').map(l => l.key);
    expect(locked).not.toContain('muc');
    expect(locked).not.toContain('engine.live');
  });

  it('nothing from phase 2 or later is locked on day one', () => {
    const locked = lockedFeatures(asset('FB-12'), 'day_one');
    expect(locked).toEqual([]);
  });
});
