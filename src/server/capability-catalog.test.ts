// J5.2 — the Features panel's catalogue (spec §10.2).
//
// The panel is a promise: what it prints is what the product does. These tests
// pin that promise to the two functions that decide access — can() for the
// capabilities and hasFeature() for the hardware — so the panel can never say
// "yes" where a screen says no, and every ✕ carries a reason a reviewer can read.

import { describe, it, expect } from 'vitest';
import {
  ALL_CAPABILITIES, CAPABILITY_GROUPS, CAPABILITY_LABELS, ROLE_PURPOSE, ROLE_WORDS,
  capabilityRows, featureAvailability, rightNowCounts, scopeWords, siteWords, tierOf, tierSummary,
} from './capability-catalog';
import { can } from './capabilities';
import { reasonFor } from './capability-reasons';
import { FEATURES, hasFeature } from '@/domain/features';
import { db } from './db';
import { getRelationship, isAssetVisible } from './access';
import { seed } from './seed/data';
import * as clock from '@/lib/clock';
import type { Session } from '@/domain/types';
import type { Relationship } from './capability-catalog';

/** Build a session for a seeded user without the store (same shape as access.test.ts). */
function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId)!;
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: user.siteIds,
    role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

const OMAR = sessionFor('u-omar');
const KHALID = sessionFor('u-khalid');
const SARA = sessionFor('u-sara');
const RAVI = sessionFor('u-ravi');
const FATIMA = sessionFor('u-fatima');
const PRIYA = sessionFor('u-priya');
const LINA = sessionFor('u-lina');
const AHMED = sessionFor('u-ahmed');
const JOHN = sessionFor('u-john');
const ALL = [OMAR, KHALID, SARA, RAVI, FATIMA, PRIYA, LINA, AHMED, JOHN];

describe('features panel — capability names read as words (J6.5)', () => {
  it('has a label for every capability and no dotted id', () => {
    for (const capability of ALL_CAPABILITIES) {
      const label = CAPABILITY_LABELS[capability];
      expect(label, `${capability} has no label`).toBeTruthy();
      expect(label, `${capability} shows its id`).not.toMatch(/[._]/);
      expect(label[0], `${capability} starts a sentence`).toBe(label[0].toUpperCase());
    }
  });

  it('groups every capability exactly once, under the spec’s headings', () => {
    const grouped = CAPABILITY_GROUPS.flatMap(g => g.capabilities);
    expect([...grouped].sort()).toEqual([...ALL_CAPABILITIES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(CAPABILITY_GROUPS.map(g => g.label)).toEqual([
      'Seeing assets', 'Acting on assets', 'Rentals & links', 'Alerts', 'Labels & geofences',
      'Reports & downloads', 'Certificates & billing', 'Maintenance & cost', 'Company admin', 'Kasper console',
    ]);
  });

  it('has a role purpose line for every role', () => {
    for (const session of ALL) {
      expect(ROLE_WORDS[session.role], session.role).toBeTruthy();
      expect(ROLE_PURPOSE[session.role].length, session.role).toBeGreaterThan(20);
    }
  });
});

describe('features panel — the ✓ and ✕ come from can()', () => {
  for (const session of ALL) {
    it(`matches can() for ${session.user.name}`, () => {
      for (const row of capabilityRows(session)) {
        expect(row.held, `${session.user.name} / ${row.capability}`).toBe(can(session, row.capability));
      }
    });
  }

  it('matches can() against a selected asset, relationship included', () => {
    for (const session of ALL) {
      for (const assetId of ['a-ex04', 'a-fb12', 'a-pu51']) {
        for (const row of capabilityRows(session, assetId)) {
          expect(row.held, `${session.user.name} / ${row.capability} / ${assetId}`)
            .toBe(can(session, row.capability, assetId));
        }
      }
    }
  });

  it('gives every ✕ the reason from capability-reasons.ts, and none for a ✓', () => {
    for (const session of ALL) {
      for (const assetId of [undefined, 'a-ex04', 'a-fb12']) {
          const relationship: Relationship = assetId ? getRelationship(session, assetId) : 'none';
        for (const row of capabilityRows(session, assetId)) {
          if (row.held) {
            expect(row.reason, `${session.user.name} / ${row.capability}`).toBeNull();
          } else {
            const fromReasons = reasonFor(session, row.capability, relationship);
            expect(row.reason, `${session.user.name} / ${row.capability}`).toBe(
              fromReasons ?? 'Your role doesn’t include this.');
          }
        }
      }
    }
  });

  it('gives Kasper Ops the reason this role can’t create links', () => {
    const rows = capabilityRows(RAVI);
    const link = rows.find(r => r.capability === 'link.create')!;
    expect(link.held).toBe(false);
    expect(link.reason).toBe(reasonFor(RAVI, 'link.create', 'none'));
    expect(link.reason).toMatch(/Kasper Ops/);
  });

  it('answers from the asset when the reviewer is looking at one', () => {
    // Lina owns PU-51 but EX-04 is hired in: the same capability differs per asset.
    const own = capabilityRows(LINA, 'a-pu51').find(r => r.capability === 'link.create')!;
    const hired = capabilityRows(LINA, 'a-ex04').find(r => r.capability === 'link.create')!;
    expect(own.held).toBe(true);
    expect(hired.held).toBe(false);
    expect(hired.reason).toBe(reasonFor(LINA, 'link.create', 'renter'));
  });

  it('gives a Site User the site-scoped scope words, not the company ones', () => {
    expect(scopeWords(AHMED, 'asset.view')).toBe('Your sites only');
    expect(scopeWords(AHMED, 'asset.viewHistory')).toBe('Your sites only');
    expect(scopeWords(OMAR, 'asset.view')).toBe('Every asset you can see');
    const whole = capabilityRows(SARA).find(r => r.capability === 'asset.view')!;
    expect(whole.scope).toBe('Every asset you can see');
  });

  it('names a Site User’s sites in the header, and the company for an admin', () => {
    expect(siteWords(AHMED)).toBe('Sites: Dubai Hills Project');
    expect(siteWords(JOHN)).toBe('Sites: Business Bay Tower · JVC Villas');
    expect(siteWords(KHALID)).toBe('All sites · Emirates Earthmovers');
    expect(siteWords(SARA)).toBe('All sites · 5 companies');
  });
});

describe('features panel — hardware in the current view', () => {
  it('counts the tiers this session can see', () => {
    for (const session of ALL) {
      const summary = tierSummary(session);
      const visible = db.getState().assets.filter(a => isAssetVisible(session, a.id));
      expect(summary.total).toBe(visible.length);
      expect(summary.counts[1] + summary.counts[2] + summary.counts[3]).toBe(summary.total);
      for (const asset of visible) {
        expect(tierOf(asset.canProfile.adapter)).toBe(
          asset.canProfile.adapter === 'ALL-CAN300' ? 3 : asset.canProfile.adapter === 'LVCAN200' ? 2 : 1);
      }
    }
  });

  it('says "all Tier 1 (no CAN)" for Al Noor and counts the mix for Emirates', () => {
    expect(tierSummary(OMAR).sentence).toBe('10 assets · all Tier 1 (no CAN)');
    expect(tierSummary(KHALID).sentence).toBe('12 assets · T1 3 · T3 9');
  });

  it('lists every §6.3 feature with the number of assets that can show it', () => {
    const rows = featureAvailability(KHALID);
    expect(rows.map(r => r.key)).toEqual(FEATURES.map(f => f.key));
    for (const row of rows) {
      const expected = db.getState().assets
        .filter(a => isAssetVisible(KHALID, a.id) && hasFeature(a, row.key)).length;
      expect(row.available, row.key).toBe(expected);
      expect(row.total).toBe(tierSummary(KHALID).total);
      if (row.available === 0) expect(row.reason, row.key).toBeTruthy();
      else expect(row.reason, row.key).toBeNull();
    }
  });

  it('explains a Tier 3 feature on a Tier 1-only fleet with the adapter', () => {
    const rows = featureAvailability(OMAR);
    // What a tracker-only fleet can still do...
    const live = rows.find(r => r.key === 'location.live')!;
    expect(live.available).toBe(live.total);
    expect(live.reason).toBeNull();
    // ...and the one reason every CAN feature has to give.
    const canOnly = new Set(['engineHours', 'fuelLevel', 'fuelUsed', 'fuelRate', 'rpm', 'canOdometer', 'coolantTemp', 'engineLoad', 'faultCodes', 'adBlue']);
    const canRows = rows.filter(r => {
      const feature = FEATURES.find(f => f.key === r.key)!;
      return feature.needs.some(p => canOnly.has(p));
    });
    expect(canRows.length).toBeGreaterThan(5);
    for (const row of canRows) {
      expect(row.available, row.key).toBe(0);
      expect(row.reason, row.key).toBe('None of these assets has a CAN adapter.');
    }
  });

  it('names the adapter a Tier 3 fleet would need', () => {
    const row = featureAvailability(KHALID).find(r => r.key === 'hours.ecuPartial')!;
    expect(row.available).toBe(0);
    expect(row.reason).toBe('Needs LVCAN200 — none of these assets has one.');
  });

  it('names the missing sensor when the fleet has CAN but the asset does not', () => {
    // Ahmed sees EX-04 (no AdBlue sensor) and PU-51 (LVCAN200): AdBlue is the one
    // thing neither can measure, so that is the reason the panel must print.
    const row = featureAvailability(AHMED).find(r => r.key === 'adblue')!;
    expect(row.available).toBe(0);
    expect(row.reason).toBe('No CAN data for AdBlue.');
  });

  it('says nothing rather than guessing when the view is empty', () => {
    const blind = { ...OMAR, siteIds: [] as string[], tenantId: 't-nobody', isKasper: false };
    const rows = featureAvailability(blind);
    expect(rows.every(r => r.total === 0 && r.reason === null)).toBe(true);
    expect(tierSummary(blind).sentence).toBe('No assets in your current view');
  });
});

describe('features panel — Right now', () => {
  it('counts assets, rentals, links and open alerts from the same API the screens use', () => {
    for (const session of ALL) {
      const counts = rightNowCounts(session);
      expect(counts.assets).toBe(tierSummary(session).total);
      expect(counts.owned + counts.rentedIn).toBe(counts.assets);
      expect(counts.openAlerts).toBeGreaterThanOrEqual(0);
      expect(counts.activeLinks).toBeGreaterThanOrEqual(0);
    }
  });

  it('shows Khalid renting out and Omar hiring nobody in', () => {
    expect(rightNowCounts(OMAR).rentedOut).toBe(1);
    expect(rightNowCounts(OMAR).rentedIn).toBe(0);
    expect(rightNowCounts(KHALID).rentedOut).toBeGreaterThan(0);
    expect(rightNowCounts(KHALID).rentedIn).toBe(0);
  });

  it('counts the hired-in asset for the renter, not the owner', () => {
    expect(rightNowCounts(PRIYA).rentedIn).toBeGreaterThan(0);
  });

  it('counts only links that are live at the demo clock', () => {
    const counts = rightNowCounts(KHALID);
    const live = db.getState().trackingLinks.filter(l => !l.revokedAt && new Date(l.expiresAt).getTime() > clock.now());
    expect(counts.activeLinks).toBeGreaterThanOrEqual(0);
    expect(live.length).toBeGreaterThanOrEqual(counts.activeLinks);
  });

  it('has one seeded asset that GN-01’s theft alert can point at', () => {
    expect(seed.assets.find(a => a.code === 'GN-01')).toBeDefined();
  });
});
