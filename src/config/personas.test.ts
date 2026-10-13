// Each login card must be true of its seeded account (chunk R). A card that
// says "Tier 3" must see a Tier 3 asset; "Renter" must rent one; "Client" must be
// a client company. A card may leave out a tier its account also sees (a mixed
// fleet keeps the card's one headline tier).
import { describe, it, expect } from 'vitest';
import { PERSONAS, HIRER_PERSONA, CHIP_LABELS, type Persona } from './personas';
import { seed } from '@/server/seed/data';
import { getRelationship, isAssetVisible } from '@/server/access';
import { tierOf } from '@/server/capability-catalog';
import { isKasperStaff } from '@/server/capabilities';
import type { Session } from '@/domain/types';

function sessionFor(userId: string): Session {
  const user = seed.users.find(u => u.id === userId)!;
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: user.siteIds,
    role: user.role,
    isKasper: isKasperStaff(user.role),
  };
}

function facts(persona: Persona) {
  const session = sessionFor(persona.userId!);
  const user = session.user;
  const tenant = user.tenantId ? seed.tenants.find(t => t.id === user.tenantId) : undefined;
  const visible = seed.assets.filter(a => isAssetVisible(session, a.id));
  return {
    session,
    user,
    tenant,
    owns: visible.some(a => a.ownerTenantId === user.tenantId),
    rents: visible.some(a => getRelationship(session, a.id) === 'renter'),
    tiers: new Set(visible.map(a => tierOf(a.canProfile.adapter))),
  };
}

const withAccount = PERSONAS.filter(p => p.userId !== undefined);

describe('login cards (personas)', () => {
  it('shows exactly eight role cards plus the outside hirer link', () => {
    expect(PERSONAS).toHaveLength(8);
    expect(HIRER_PERSONA.userId).toBeUndefined();
    expect(new Set(PERSONAS.map(p => p.id)).size).toBe(PERSONAS.length);
  });

  it('every card points at a seeded, active account with the role it claims', () => {
    for (const persona of withAccount) {
      const user = seed.users.find(u => u.id === persona.userId);
      expect(user, `${persona.id}: account ${persona.userId} is missing`).toBeTruthy();
      expect(user!.status, `${persona.id}: account is not active`).toBe('active');
      expect(user!.role, `${persona.id}: role differs from the card`).toBe(persona.role);
    }
  });

  it('every chip is true of the account behind the card', () => {
    for (const persona of withAccount) {
      const f = facts(persona);
      for (const chip of persona.chips) {
        switch (chip) {
          case 'kasper':
          case 'console':
            expect(f.session.isKasper, `${persona.id}: "${chip}" needs Kasper staff`).toBe(true);
            break;
          case 'owner':
            expect(f.owns, `${persona.id}: "owner" but no visible asset is owned`).toBe(true);
            break;
          case 'renter':
            expect(f.rents, `${persona.id}: "renter" but no visible asset is rented in`).toBe(true);
            break;
          case 'client':
            expect(f.tenant?.type, `${persona.id}: "client" needs a client company`).toBe('client');
            break;
          case 'site':
            expect(f.user.role, `${persona.id}: "site" needs a site user`).toBe('site_user');
            break;
          case 'tier1':
            expect(f.tiers.has(1), `${persona.id}: "Tier 1" but no visible Tier 1 asset`).toBe(true);
            break;
          case 'tier3':
            expect(f.tiers.has(3), `${persona.id}: "Tier 3" but no visible Tier 3 asset`).toBe(true);
            break;
          default:
            throw new Error(`${persona.id}: unknown chip ${chip}`);
        }
      }
    }
  });

  it('every chip has a label and a translation key', () => {
    for (const persona of PERSONAS) {
      for (const chip of persona.chips) {
        expect(CHIP_LABELS[chip].label.length).toBeGreaterThan(0);
        expect(CHIP_LABELS[chip].key).toMatch(/^roles\.chip\./);
      }
    }
  });
});
