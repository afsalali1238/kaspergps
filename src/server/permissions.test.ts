// Spec §5 — the permission matrix, cell by cell.
// Each row is one cell of the asset matrix (or one asset-level case the matrix
// implies). The users and assets are the seeded ones:
//   sara  kasper_admin · ravi kasper_ops
//   omar  Tenant Admin, owns FB-12 and TP-21 (TP-21 has no live booking)
//   khalid Tenant Admin, owns EX-04 (rented to Marina, BK-1001 active, site DH)
//   lina  Tenant Admin, renter of EX-04 and owner of PU-51
//   ahmed Site User at Marina DH: owns PU-51; sees EX-04 (rented to DH)
//   john  Site User at Marina BB and JVC: sees CR-02 (rented to BB)
//   anil  Site User at Marina JVC: does not see CR-02
//   fatima Tenant Admin of Palm: past renter of EX-04 (BK-0981, closed)
//   rashid Site User at Palm PC: past renter of EX-04 at PC (BK-0981)
//   deepa  Site User at Palm DS and PC: past renter of CR-02 at DS (BK-0983)
//   mark  Site User at Gulf Lift AQ: owns CR-02 (site AQ)

import { describe, it, expect, beforeEach } from 'vitest';
import { db, resetDb } from '@/server/db';
import { can, type Capability } from './capabilities';
import type { Session } from '@/domain/types';

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

type Who = 'sara' | 'ravi' | 'omar' | 'khalid' | 'lina' | 'ahmed' | 'john' | 'anil' | 'fatima' | 'rashid' | 'deepa' | 'mark';
const USER: Record<Who, string> = {
  sara: 'u-sara', ravi: 'u-ravi', omar: 'u-omar', khalid: 'u-khalid', lina: 'u-lina',
  ahmed: 'u-ahmed', john: 'u-john', anil: 'u-anil', fatima: 'u-fatima', rashid: 'u-rashid',
  deepa: 'u-deepa', mark: 'u-mark',
};

type Cell = [Capability, Who, string, boolean];
const ASSET = { ex04: 'a-ex04', fb12: 'a-fb12', tp21: 'a-tp21', pu51: 'a-pu51', cr02: 'a-cr02' };

// ── Asset matrix (spec §5) ────────────────────────────────────────────────────
const CELLS: Cell[] = [
  // asset.view / viewHistory / viewTelemetry — full history for owners and Kasper;
  // from rental start for renters; never before a rental, never after it ends.
  ['asset.view', 'sara', ASSET.ex04, true],
  ['asset.view', 'ravi', ASSET.ex04, true],
  ['asset.view', 'khalid', ASSET.ex04, true],
  ['asset.view', 'lina', ASSET.ex04, true],          // renter, active
  ['asset.view', 'lina', ASSET.pu51, true],          // owner
  ['asset.view', 'ahmed', ASSET.pu51, true],         // site user, own asset at site
  ['asset.view', 'ahmed', ASSET.ex04, true],         // site user, rented to site
  ['asset.view', 'john', ASSET.cr02, true],          // rented to BB, John is at BB
  ['asset.view', 'anil', ASSET.cr02, false],         // rented to BB, Anil is at JVC only
  ['asset.view', 'fatima', ASSET.ex04, false],       // past rental only
  ['asset.view', 'rashid', ASSET.ex04, false],       // past rental only
  ['asset.view', 'mark', ASSET.cr02, true],          // owner, site AQ
  ['asset.view', 'lina', 'a-nope', false],           // unknown asset
  ['asset.viewHistory', 'ahmed', ASSET.ex04, true],
  ['asset.viewTelemetry', 'john', ASSET.cr02, true],

  // report.run — rental periods only for renters, past rentals included.
  ['report.run', 'lina', ASSET.ex04, true],          // renter, active
  ['report.run', 'fatima', ASSET.ex04, true],        // renter, past
  ['report.run', 'rashid', ASSET.ex04, true],        // site user, past rental at PC
  ['report.run', 'rashid', ASSET.cr02, false],       // no rental of CR-02 at PC
  ['report.run', 'deepa', ASSET.cr02, true],         // site user, past rental at DS
  ['report.run', 'anil', ASSET.cr02, false],
  ['report.run', 'ahmed', ASSET.pu51, true],
  ['report.run', 'ahmed', ASSET.ex04, true],
  ['report.run', 'omar', ASSET.fb12, true],

  // asset.edit — owner Tenant Admin (and Kasper) only.
  ['asset.edit', 'khalid', ASSET.ex04, true],
  ['asset.edit', 'omar', ASSET.fb12, true],
  ['asset.edit', 'lina', ASSET.pu51, true],
  ['asset.edit', 'lina', ASSET.ex04, false],         // renter
  ['asset.edit', 'ahmed', ASSET.pu51, false],        // site user, owner side
  ['asset.edit', 'ahmed', ASSET.ex04, false],
  ['asset.edit', 'mark', ASSET.cr02, false],
  ['asset.edit', 'fatima', ASSET.ex04, false],
  ['asset.edit', 'sara', ASSET.ex04, true],
  ['asset.edit', 'ravi', ASSET.ex04, true],

  // link.create / link.revoke — owner Tenant Admin, Kasper Admin (create); Kasper Ops support (revoke).
  ['link.create', 'khalid', ASSET.ex04, true],
  ['link.create', 'lina', ASSET.ex04, false],        // renter
  ['link.create', 'ahmed', ASSET.pu51, false],       // site user
  ['link.create', 'ravi', ASSET.ex04, false],        // Kasper Ops cannot create
  ['link.create', 'sara', ASSET.ex04, true],
  ['link.revoke', 'khalid', ASSET.ex04, true],
  ['link.revoke', 'ravi', ASSET.ex04, true],         // support
  ['link.revoke', 'lina', ASSET.ex04, false],
  ['link.revoke', 'ahmed', ASSET.pu51, false],

  // grant.endEarly — owner side only; the renter never ends its own rental.
  ['grant.endEarly', 'khalid', ASSET.ex04, true],
  ['grant.endEarly', 'ravi', ASSET.ex04, true],
  ['grant.endEarly', 'lina', ASSET.ex04, false],
  ['grant.endEarly', 'lina', ASSET.pu51, true],
  ['grant.endEarly', 'ahmed', ASSET.ex04, false],

  // alert.view — everyone who can see the asset; acknowledge — owner side.
  ['alert.view', 'lina', ASSET.ex04, true],
  ['alert.view', 'ahmed', ASSET.ex04, true],
  ['alert.view', 'john', ASSET.cr02, true],
  ['alert.view', 'anil', ASSET.cr02, false],
  ['alert.acknowledge', 'khalid', ASSET.ex04, true],
  ['alert.acknowledge', 'ravi', ASSET.ex04, true],
  ['alert.acknowledge', 'omar', ASSET.fb12, true],
  ['alert.acknowledge', 'lina', ASSET.ex04, false],  // renter
  ['alert.acknowledge', 'ahmed', ASSET.ex04, false], // site user (role)

  // label.view — own company's labels: owner side only. Never the owner's labels to a renter.
  ['label.view', 'khalid', ASSET.ex04, true],
  ['label.view', 'lina', ASSET.pu51, true],
  ['label.view', 'lina', ASSET.ex04, false],
  ['label.view', 'ahmed', ASSET.pu51, true],
  ['label.view', 'ahmed', ASSET.ex04, false],
  ['label.view', 'john', ASSET.cr02, false],
  ['label.manage', 'khalid', ASSET.ex04, true],
  ['label.manage', 'lina', ASSET.pu51, true],
  ['label.manage', 'lina', ASSET.ex04, false],
  ['label.manage', 'ahmed', ASSET.pu51, false],
  ['label.manage', 'ravi', ASSET.ex04, false],       // Kasper Ops has no label.manage

  // playback.view — inside the rental window for renters.
  ['playback.view', 'khalid', ASSET.ex04, true],
  ['playback.view', 'lina', ASSET.ex04, true],
  ['playback.view', 'ahmed', ASSET.ex04, true],
  ['playback.view', 'anil', ASSET.cr02, false],
  ['playback.view', 'fatima', ASSET.ex04, false],    // no active window
  ['playback.view', 'rashid', ASSET.ex04, false],

  // report.schedule — rental periods only for renters.
  ['report.schedule', 'lina', ASSET.ex04, true],
  ['report.schedule', 'fatima', ASSET.ex04, true],
  ['report.schedule', 'rashid', ASSET.ex04, true],
  ['report.schedule', 'anil', ASSET.cr02, false],

  // maintenance — owner side; Site Users see their own company's asset at site.
  ['maintenance.view', 'khalid', ASSET.ex04, true],
  ['maintenance.view', 'ahmed', ASSET.pu51, true],
  ['maintenance.view', 'mark', ASSET.cr02, true],
  ['maintenance.view', 'lina', ASSET.ex04, false],
  ['maintenance.view', 'ahmed', ASSET.ex04, false],
  ['maintenance.view', 'john', ASSET.cr02, false],
  ['maintenance.manage', 'khalid', ASSET.ex04, true],
  ['maintenance.manage', 'lina', ASSET.pu51, true],
  ['maintenance.manage', 'lina', ASSET.ex04, false],
  ['maintenance.manage', 'ahmed', ASSET.pu51, false],

  // cost — Kasper Admin and the owner Tenant Admin only.
  ['cost.view', 'sara', ASSET.ex04, true],
  ['cost.view', 'khalid', ASSET.ex04, true],
  ['cost.view', 'ravi', ASSET.ex04, false],
  ['cost.view', 'lina', ASSET.ex04, false],
  ['cost.view', 'lina', ASSET.pu51, true],
  ['cost.view', 'ahmed', ASSET.pu51, false],

  // muc — certificates for the renter's rental periods (active or past).
  ['muc.view', 'sara', ASSET.ex04, true],
  ['muc.view', 'ravi', ASSET.ex04, true],
  ['muc.view', 'khalid', ASSET.ex04, true],
  ['muc.view', 'lina', ASSET.ex04, true],
  ['muc.view', 'fatima', ASSET.ex04, true],          // past renter
  ['muc.view', 'ahmed', ASSET.ex04, false],          // site users have no muc.view
  ['muc.view', 'deepa', ASSET.cr02, false],
  ['muc.issue', 'sara', ASSET.ex04, true],
  ['muc.issue', 'khalid', ASSET.ex04, true],
  ['muc.issue', 'omar', ASSET.fb12, true],
  ['muc.issue', 'ravi', ASSET.ex04, false],          // never Kasper Ops
  ['muc.issue', 'lina', ASSET.ex04, false],
  ['muc.issue', 'fatima', ASSET.ex04, false],
  ['muc.void', 'sara', ASSET.ex04, true],
  ['muc.void', 'khalid', ASSET.ex04, true],
  ['muc.void', 'ravi', ASSET.ex04, false],
  ['muc.void', 'lina', ASSET.ex04, false],

  // asset.retire — owner Tenant Admin, only with no booking running or booked.
  ['asset.retire', 'sara', ASSET.fb12, true],
  ['asset.retire', 'ravi', ASSET.fb12, true],
  ['asset.retire', 'omar', ASSET.tp21, true],        // no live booking
  ['asset.retire', 'omar', ASSET.fb12, false],       // BK-1011 running
  ['asset.retire', 'khalid', ASSET.ex04, false],     // BK-1001 running
  ['asset.retire', 'lina', ASSET.pu51, true],
  ['asset.retire', 'ahmed', ASSET.pu51, false],

  // tracker.request — owner Tenant Admin only ("We need a tracker fitted").
  ['tracker.request', 'sara', ASSET.ex04, true],
  ['tracker.request', 'khalid', ASSET.ex04, true],
  ['tracker.request', 'omar', ASSET.fb12, true],
  ['tracker.request', 'lina', ASSET.ex04, false],
  ['tracker.request', 'ahmed', ASSET.pu51, false],
];

describe('spec §5 matrix: can(session, capability, assetId)', () => {
  beforeEach(() => {
    resetDb();
  });

  it.each(CELLS)('%s · %s · %s → %s', (cap, who, assetId, expected) => {
    expect(can(sessionFor(USER[who]), cap, assetId)).toBe(expected);
  });

  it('a Site User never sees a capability their role lacks, even on their own asset', () => {
    const ahmed = sessionFor('u-ahmed');
    expect(can(ahmed, 'asset.edit', ASSET.pu51)).toBe(false);
    expect(can(ahmed, 'link.create', ASSET.pu51)).toBe(false);
    expect(can(ahmed, 'alert.acknowledge', ASSET.pu51)).toBe(false);
  });

  it('with no asset, can() answers the role question only', () => {
    expect(can(sessionFor('u-lina'), 'asset.edit')).toBe(true);     // role has it
    expect(can(sessionFor('u-ahmed'), 'asset.edit')).toBe(false);   // role lacks it
  });
});

describe('spec §5 company-level capabilities', () => {
  beforeEach(() => {
    resetDb();
  });

  const COMPANY: Array<[Capability, Who, boolean]> = [
    ['geofence.view', 'sara', true],
    ['geofence.view', 'anil', true],
    ['geofence.manage', 'ravi', false],          // Kasper Ops: view only
    ['geofence.manage', 'omar', true],
    ['geofence.manage', 'anil', false],
    ['billing.view', 'sara', true],
    ['billing.view', 'ravi', false],
    ['billing.view', 'omar', true],
    ['billing.view', 'anil', false],
    ['billing.recordPayment', 'sara', true],
    ['billing.pay', 'sara', false],              // Kasper Admin does not pay invoices
    ['billing.pay', 'omar', true],
    ['billing.pay', 'anil', false],
    ['console.billing.view', 'sara', true],
    ['console.billing.view', 'omar', false],
    ['console.billing.manage', 'ravi', false],
    ['asset.create', 'ravi', true],
    ['asset.create', 'omar', true],
    ['asset.create', 'anil', false],
    ['console.assets.transfer', 'sara', true],
    ['console.assets.transfer', 'ravi', false],  // Kasper Ops cannot transfer
    ['console.assets.transfer', 'omar', false],
    ['console.assets.manage', 'sara', true],
    ['console.assets.manage', 'ravi', false],
    ['console.tenants.view', 'ravi', true],      // read-only
    ['console.tenants.manage', 'ravi', false],
    ['console.audit.view', 'sara', true],
    ['console.audit.view', 'ravi', false],
    ['console.staff.manage', 'ravi', false],
    ['console.import', 'ravi', true],
    ['users.manage', 'sara', true],
    ['users.manage', 'omar', true],              // the team page checks the company
    ['users.manage', 'ravi', false],
    ['users.manage', 'anil', false],
    ['sites.manage', 'omar', true],
    ['sites.manage', 'anil', false],
  ];

  it.each(COMPANY)('%s · %s → %s', (cap, who, expected) => {
    expect(can(sessionFor(USER[who]), cap)).toBe(expected);
  });
});
