// isFeatureVisible: the rule behind asset tabs and nav (H3.3). Phase and
// hardware both have to allow a feature.
import { describe, it, expect } from 'vitest';
import { db } from '@/server/db';
import { isFeatureVisible } from './capabilities';
import type { Session } from '@/domain/types';

function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId)!;
  return { userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role: user.role, isKasper: false } as Session;
}

describe('isFeatureVisible', () => {
  it('a Tier 1 asset shows day-one features but no Tier 3 feature', () => {
    const omar = sessionFor('u-omar');
    expect(isFeatureVisible(omar, 'a-fb12', 'location.live', 'day_one', false)).toBe(true);
    expect(isFeatureVisible(omar, 'a-fb12', 'muc', 'later', false)).toBe(false);
  });

  it('a phase 2 feature is hidden on day one and shown in phase 2', () => {
    const omar = sessionFor('u-omar');
    expect(isFeatureVisible(omar, 'a-fb12', 'hours.ignition', 'day_one', false)).toBe(false);
    expect(isFeatureVisible(omar, 'a-fb12', 'hours.ignition', 'phase2', false)).toBe(true);
  });

  it('a feature the user may not see is hidden even when the hardware has it', () => {
    const mark = sessionFor('u-mark');
    expect(isFeatureVisible(mark, 'a-fb12', 'location.live', 'day_one', false)).toBe(false);
  });

  it('an unknown asset shows nothing', () => {
    expect(isFeatureVisible(sessionFor('u-omar'), 'a-nope', 'location.live', 'later', false)).toBe(false);
  });
});
