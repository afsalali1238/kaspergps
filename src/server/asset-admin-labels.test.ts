// H4.3 and H4.5 rules: labels (owner-side, unique, capped) and asset/site
// administration (unique codes, retire only when no hire runs, radius bounds).

import { describe, it, expect, beforeEach } from 'vitest';
import type { Session, User } from '@/domain/types';
import { db } from '@/server/db';
import { isKasperStaff } from '@/server/capabilities';
import { addLabelToAssets, labelsOnAsset, labelsVisibleTo, renameLabel, deleteLabel, removeLabelFromAssets, LABELS_PER_ASSET_MAX } from '@/server/labels';
import { createAsset, createSite, retireAsset, reinstateAsset, transferAsset } from '@/server/asset-admin';
import { resetDb } from '@/server/db';
import * as clock from '@/lib/clock';

function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId) as User;
  return { userId: user.id, user, tenantId: user.tenantId, siteIds: user.siteIds, role: user.role, isKasper: isKasperStaff(user.role) };
}

const marinaAdmin = () => sessionFor('u-lina');
const emiratesAdmin = () => sessionFor('u-khalid');
const kasper = () => sessionFor('u-sara');

beforeEach(() => {
  resetDb();
  clock.setOffsetMs(0);
});

describe('labels (§11.11)', () => {
  it('a tenant admin adds a new label to own assets and it shows on each', () => {
    const s = emiratesAdmin();
    const r = addLabelToAssets(s, { name: 'Night shift test' }, ['a-ex04']);
    expect(r.ok).toBe(true);
    expect(labelsOnAsset(s, 'a-ex04').map(l => l.name)).toContain('Night shift test');
  });

  it('refuses a name over 40 characters and an empty name', () => {
    const s = emiratesAdmin();
    expect(addLabelToAssets(s, { name: 'x'.repeat(41) }, ['a-ex04']).ok).toBe(false);
    expect(addLabelToAssets(s, { name: '   ' }, ['a-ex04']).ok).toBe(false);
  });

  it('reuses an existing label whatever the letter case', () => {
    const s = emiratesAdmin();
    addLabelToAssets(s, { name: 'project alpha' }, ['a-ex04']);
    const count = labelsVisibleTo(s).filter(l => l.name.toLowerCase() === 'project alpha').length;
    expect(count).toBe(1);
  });

  it('a rename to another label’s name is refused', () => {
    const s = emiratesAdmin();
    const alpha = labelsVisibleTo(s).find(l => l.name === 'Project Alpha')!;
    const other = labelsVisibleTo(s).find(l => l.name !== 'Project Alpha')!;
    const r = renameLabel(s, alpha.id, other.name.toUpperCase());
    expect(r).toMatchObject({ ok: false, error: 'A label with this name already exists.' });
  });

  it('a site user cannot manage labels', () => {
    const deepa = sessionFor('u-deepa');
    expect(addLabelToAssets(deepa, { name: 'Nope' }, ['a-wl06']).ok).toBe(false);
  });

  it('a renter never sees the owner’s labels', () => {
    const lina = marinaAdmin();
    expect(labelsOnAsset(lina, 'a-ex04')).toEqual([]);
  });

  it('caps labels per asset', () => {
    const s = emiratesAdmin();
    for (let i = 0; i < LABELS_PER_ASSET_MAX; i++) {
      // Ensure each label exists and is applied to the asset in turn.
      expect(addLabelToAssets(s, { name: `cap-${i}` }, ['a-ex07']).ok).toBe(true);
    }
    const over = addLabelToAssets(s, { name: 'one too many' }, ['a-ex07']);
    expect(over.ok).toBe(false);
  });

  it('removing from one asset leaves the label on others; delete takes it everywhere', () => {
    const s = emiratesAdmin();
    addLabelToAssets(s, { name: 'Temp tag' }, ['a-ex04', 'a-ex07']);
    const label = labelsVisibleTo(s).find(l => l.name === 'Temp tag')!;
    expect(removeLabelFromAssets(s, label.id, ['a-ex04']).ok).toBe(true);
    expect(labelsOnAsset(s, 'a-ex07').map(l => l.id)).toContain(label.id);
    expect(deleteLabel(s, label.id).ok).toBe(true);
    expect(labelsVisibleTo(s).some(l => l.id === label.id)).toBe(false);
  });

  it('a label cannot be put on another company’s asset', () => {
    const s = marinaAdmin();
    expect(addLabelToAssets(s, { name: 'Mine' }, ['a-ex04']).ok).toBe(false);
  });
});

describe('asset administration (§11.8)', () => {
  const base = {
    name: 'Excavator 15', type: 'Excavator', assetClass: 'plant' as const, make: 'CAT', model: '320', year: 2021,
    plateOrSerial: 'EM-900', tankLitres: undefined, behaviour: 'parked' as const,
  };

  it('adds an asset as No tracker, Tier 1, at the home site', () => {
    const s = emiratesAdmin();
    const home = db.getState().sites.find(x => x.tenantId === 't-emirates')!;
    const r = createAsset(s, { ...base, code: 'EX-15', homeSiteId: home.id });
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ status: 'no_tracker', ownerTenantId: 't-emirates', homeSiteId: home.id });
    expect(r.data!.canProfile.adapter).toBe('none');
  });

  it('refuses a code already used anywhere, case-insensitively', () => {
    const s = emiratesAdmin();
    const home = db.getState().sites.find(x => x.tenantId === 't-emirates')!;
    expect(createAsset(s, { ...base, code: 'ex-04', homeSiteId: home.id })).toMatchObject({ ok: false, error: 'This code is already in use.' });
  });

  it('retire is refused while a hire runs, then allowed; reinstate restores it', () => {
    const s = emiratesAdmin();
    // EX-04 is on hire to Marina (BK-1001, active).
    const refused = retireAsset(s, 'a-ex04');
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/is on hire until .* Retire it after the hire ends\./);

    // CP-03 has no booking in the seed.
    const cp03 = db.getState().assets.find(a => a.code === 'CP-03')!;
    expect(retireAsset(s, cp03.id).ok).toBe(true);
    expect(db.getState().assets.find(a => a.id === cp03.id)?.retiredAt).toBeTruthy();
    expect(reinstateAsset(s, cp03.id).ok).toBe(true);
    expect(db.getState().assets.find(a => a.id === cp03.id)?.retiredAt).toBeUndefined();
  });

  it('a site radius outside 100–2,000 m is refused', () => {
    const s = emiratesAdmin();
    const base2 = { name: 'Yard', center: { lat: 25.2, lng: 55.3 } };
    expect(createSite(s, { ...base2, radiusM: 50 }).ok).toBe(false);
    expect(createSite(s, { ...base2, radiusM: 2500 }).ok).toBe(false);
    expect(createSite(s, { ...base2, radiusM: 300 }).ok).toBe(true);
  });

  it('transfer is Kasper only and refused while a hire runs', () => {
    const emirates = emiratesAdmin();
    const ex04 = db.getState().assets.find(a => a.code === 'EX-04')!;
    expect(transferAsset(emirates, ex04.id, 't-marina').ok).toBe(false);
    expect(transferAsset(kasper(), ex04.id, 't-marina')).toMatchObject({ ok: false });
  });
});
