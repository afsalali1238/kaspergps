// The role-first login (chunk R, owner decision 13 Oct). Each card on `/` is one
// persona: a role plus the context that changes what its screens show (the
// company's relationship to the asset, the hardware tier). Each card is wired to
// one seeded account, which stays hidden. No names, emails or passwords reach
// the page. personas.test.ts checks that every chip is true of its account, so a
// card can't claim something the data does not show.
import type { Role } from '@/domain/types';

export type PersonaChip =
  | 'kasper'
  | 'console'
  | 'owner'
  | 'renter'
  | 'client'
  | 'site'
  | 'tier1'
  | 'tier3'
  | 'public';

export type PersonaGroup = 'kasper' | 'owners' | 'renters' | 'site' | 'public';

export interface Persona {
  /** Stable id, used by the e2e helper pickRole(). */
  id: string;
  group: PersonaGroup;
  /** The seeded account behind the card. Absent for the outside hirer's tracking link. */
  userId?: string;
  /** The role the account must have (checked by personas.test.ts). */
  role?: Role;
  titleKey: string;
  title: string;
  chips: PersonaChip[];
  blurbKey: string;
  blurb: string;
}

export const PERSONA_GROUPS: { key: PersonaGroup; labelKey: string; label: string }[] = [
  { key: 'kasper', labelKey: 'roles.group.kasper', label: 'Kasper team' },
  { key: 'owners', labelKey: 'roles.group.owners', label: 'Fleet owners' },
  { key: 'renters', labelKey: 'roles.group.renters', label: 'Renters and clients' },
  { key: 'site', labelKey: 'roles.group.site', label: 'On site' },
  { key: 'public', labelKey: 'roles.group.public', label: 'Public' },
];

export const PERSONAS: Persona[] = [
  {
    id: 'kasper-admin',
    group: 'kasper',
    userId: 'u-sara',
    role: 'kasper_admin',
    titleKey: 'roles.card.kasper_admin.title',
    title: 'Kasper Admin',
    chips: ['kasper', 'console'],
    blurbKey: 'roles.card.kasper_admin.blurb',
    blurb: 'Onboard companies, hardware stock, bookings, billing, audit',
  },
  {
    id: 'kasper-ops',
    group: 'kasper',
    userId: 'u-ravi',
    role: 'kasper_ops',
    titleKey: 'roles.card.kasper_ops.title',
    title: 'Kasper Ops',
    chips: ['kasper', 'console'],
    blurbKey: 'roles.card.kasper_ops.blurb',
    blurb: 'Trackers, CAN adapters and bookings; no billing or audit',
  },
  {
    id: 'owner-tier3',
    group: 'owners',
    userId: 'u-khalid',
    role: 'tenant_admin',
    titleKey: 'roles.card.owner_tier3.title',
    title: 'Fleet owner · Tier 3',
    chips: ['owner', 'tier3'],
    blurbKey: 'roles.card.owner_tier3.blurb',
    blurb: 'ECU engine hours, fuel, certificates, billing, maintenance',
  },
  {
    id: 'owner-tier1',
    group: 'owners',
    userId: 'u-omar',
    role: 'tenant_admin',
    titleKey: 'roles.card.owner_tier1.title',
    title: 'Fleet owner · Tier 1',
    chips: ['owner', 'tier1'],
    blurbKey: 'roles.card.owner_tier1.blurb',
    blurb: 'GPS-only fleet: trips, tracking links, estimated hours',
  },
  {
    id: 'owner-renter-mixed',
    group: 'owners',
    userId: 'u-priya',
    role: 'tenant_admin',
    titleKey: 'roles.card.owner_renter_mixed.title',
    title: 'Owner and renter · mixed tiers',
    chips: ['owner', 'renter', 'tier1', 'tier3'],
    blurbKey: 'roles.card.owner_renter_mixed.blurb',
    blurb: 'Mixed fleet, a rented-in asset with a fault code',
  },
  {
    id: 'renter',
    group: 'renters',
    userId: 'u-lina',
    role: 'tenant_admin',
    titleKey: 'roles.card.renter.title',
    title: 'Renter',
    chips: ['renter', 'owner'],
    blurbKey: 'roles.card.renter.blurb',
    blurb: 'Rented equipment from the rental start only; own pickups',
  },
  {
    id: 'client-rents-only',
    group: 'renters',
    userId: 'u-fatima',
    role: 'tenant_admin',
    titleKey: 'roles.card.client_rents_only.title',
    title: 'Client · rents only',
    chips: ['client', 'renter'],
    blurbKey: 'roles.card.client_rents_only.blurb',
    blurb: 'Rented equipment, invoices to pay, access that ended early',
  },
  {
    id: 'site-user',
    group: 'site',
    userId: 'u-mark',
    role: 'site_user',
    titleKey: 'roles.card.site_user.title',
    title: 'Site user · one site',
    chips: ['site'],
    blurbKey: 'roles.card.site_user.blurb',
    blurb: "One site's assets only; no settings, no money",
  },
];

/** The outside hirer's tracking link: no account, opens /t/<token>. */
export const HIRER_PERSONA: Persona = {
  id: 'hirer-link',
  group: 'public',
  titleKey: 'roles.card.hirer_link.title',
  title: 'Hirer · tracking link',
  chips: ['public'],
  blurbKey: 'roles.card.hirer_link.blurb',
  blurb: 'The one-asset tracking page an outside hirer gets',
};

export const CHIP_LABELS: Record<PersonaChip, { key: string; label: string; tone: 'warn' | 'info' | 'neutral' | 'accent' }> = {
  kasper: { key: 'roles.chip.kasper', label: 'Kasper', tone: 'neutral' },
  console: { key: 'roles.chip.console', label: 'Console', tone: 'neutral' },
  owner: { key: 'roles.chip.owner', label: 'Owner', tone: 'neutral' },
  renter: { key: 'roles.chip.renter', label: 'Renter', tone: 'accent' },
  client: { key: 'roles.chip.client', label: 'Client', tone: 'warn' },
  site: { key: 'roles.chip.site', label: 'Site user', tone: 'neutral' },
  tier1: { key: 'roles.chip.tier1', label: 'Tier 1 GPS', tone: 'neutral' },
  tier3: { key: 'roles.chip.tier3', label: 'Tier 3 CAN', tone: 'info' },
  public: { key: 'roles.chip.public', label: 'Public · no account', tone: 'neutral' },
};

/** The persona behind a seeded account, if the login page offers one. */
export function personaForUser(userId: string): Persona | undefined {
  return PERSONAS.find(p => p.userId === userId);
}
