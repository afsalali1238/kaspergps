// MUC (Method statement / Micro-use Certificate) server module.
// Architecture rule 7: all MUC lookups and mutations go through here.
// In production this hits a persistent store; in the prototype it reads from seed.

import { seed } from '@/server/seed/data';
import type { Muc, MucPayload, MucStatus } from '@/domain/types';
import * as clock from '@/lib/clock';

// ── Lookups ────────────────────────────────────────────────────────────────────

export function getMucByNumber(number: string): Muc | undefined {
  return seed.mucs.find(m => m.number === number);
}

export function getMucById(id: string): Muc | undefined {
  return seed.mucs.find(m => m.id === id);
}

export function getMucsForTenant(tenantId: string): Muc[] {
  return seed.mucs.filter(m => m.ownerTenantId === tenantId);
}

export function getMucsForAsset(assetId: string): Muc[] {
  return seed.mucs.filter(m => m.assetId === assetId);
}

/** Returns sealed (non-voided) MUCs linked to a booking. */
export function getActiveMucsForBooking(bookingId: string): Muc[] {
  return seed.mucs.filter(m => m.bookingId === bookingId && m.status === 'sealed');
}

// ── Seal ────────────────────────────────────────────────────────────────────────

/**
 * Compute a deterministic seal hash for a MUC payload.
 *
 * In production this uses SHA-256 via Web Crypto or a server-side equivalent.
 * In the prototype we produce a stable hex digest from the canonical payload
 * fields so that reissued MUCs carry a verifiable seal.
 */
export function sealMuc(muc: Muc): string {
  const p = muc.payload;
  const canonical = [
    `v=${p.version}`,
    `asset=${p.asset.code}|${p.asset.name}|${p.asset.make}|${p.asset.model}|${p.asset.serial}`,
    `owner=${p.owner.tenantId}|${p.owner.name}`,
    p.renter ? `renter=${p.renter.tenantId}|${p.renter.name}` : 'renter=',
    `from=${p.periodFrom}`,
    `to=${p.periodTo}`,
    `open=${p.openingHoursEcu}`,
    `close=${p.closingHoursEcu}`,
    `billable=${p.billableHours}`,
    `gaps=${p.gapRule}`,
    `source=${p.source}`,
    ...p.days.map(d => `day=${d.date}|${d.engineHours}|${d.workingHours}|${d.idlingHours}|${d.gapMinutes}`),
    ...p.gaps.map(g => `gap=${g.from}|${g.to}`),
  ].join('\n');

  // Simple FNV-1a-style 256-bit-ish hex digest for the prototype.
  // Produces a stable 64-char hex string for the same canonical input.
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const data = new TextEncoder().encode(canonical);
  for (let i = 0; i < data.length; i++) {
    let w = data[i];
    h0 ^= w;
    h0 = (h0 + 0x5487 * (i + 1)) | 0;
    h1 = (h1 ^ (h0 >>> 11)) | 0;
    h2 = (h2 + h1 * 0x7096) | 0;
    h3 = (h3 ^ (h2 >>> 7)) | 0;
    h4 = (h4 + h3 * 0x912d) | 0;
    h5 = (h5 ^ (h4 >>> 13)) | 0;
    h6 = (h6 + h5 * 0x3d9a) | 0;
    h7 = (h7 ^ (h6 >>> 5)) | 0;
  }

  const hex = (n: number) => n >>> 0;
  return [
    hex(h0), hex(h1), hex(h2), hex(h3),
    hex(h4), hex(h5), hex(h6), hex(h7),
  ].map(n => n.toString(16).padStart(8, '0')).join('');
}

// ── Mutations ───────────────────────────────────────────────────────────────────

/**
 * Void a sealed MUC.
 * Returns the updated MUC, or null if the MUC is not found or already voided.
 */
export function voidMuc(mucId: string, reason: string, by: string): Muc | null {
  const muc = seed.mucs.find(m => m.id === mucId);
  if (!muc) return null;
  if (muc.status === 'voided') return null;

  const now = clock.now();
  // Return a new reference — in production this would persist.
  const voided: Muc = {
    ...muc,
    status: 'voided' as MucStatus,
    voidedAt: now,
    voidedBy: by,
    voidReason: reason,
  };

  // Mutate seed in place for the prototype (single-process, demo only).
  const idx = seed.mucs.indexOf(muc);
  if (idx !== -1) seed.mucs[idx] = voided;

  return voided;
}

/**
 * Reissue a voided MUC.
 * Creates a new MUC that references the voided one as `reissueOf`.
 * Returns the new MUC, or null if the original is not found or not voided.
 */
export function reissueMuc(mucId: string, by: string): Muc | null {
  const original = seed.mucs.find(m => m.id === mucId);
  if (!original) return null;
  if (original.status !== 'voided') return null;

  const now = clock.now();
  const newNumber = `MUC-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${original.assetId.slice(-4)}-${String(seed.mucs.length + 1).padStart(2, '0')}`;

  const reissued: Muc = {
    ...original,
    id: `muc-${original.assetId}-${Date.now()}`,
    number: newNumber,
    status: 'sealed' as MucStatus,
    issuedAt: now,
    issuedBy: by,
    voidedAt: undefined,
    voidedBy: undefined,
    voidReason: undefined,
    reissueOf: original.id,
    sealSha256: sealMuc({ ...original, status: 'sealed' as MucStatus }),
  };

  seed.mucs.push(reissued);
  return reissued;
}

// ── Validation ──────────────────────────────────────────────────────────────────

/**
 * Check whether a MUC's stored seal matches a freshly computed seal.
 * Returns true when the payload has not been tampered with.
 */
export function verifySeal(muc: Muc): boolean {
  if (muc.status === 'voided') return false;
  const recomputed = sealMuc(muc);
  return recomputed === muc.sealSha256;
}
