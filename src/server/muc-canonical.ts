// Canonical MUC payload + seal (spec 11.16).
// Stable key order, ISO UTC times, numbers fixed to 1 decimal. The seal covers
// the payload, not the PDF bytes, so a reissue with the same payload has the
// same seal. Dependency-free apart from the domain types so the reseal script
// can run it directly.

import type { MucPayload } from '@/domain/types';

const n1 = (v: number) => Number(v.toFixed(1));
const iso = (t: string | number) => new Date(t).toISOString();

export function canonicalMucPayload(payload: MucPayload): string {

  return JSON.stringify({
    version: payload.version,
    asset: {
      code: payload.asset.code,
      name: payload.asset.name,
      make: payload.asset.make,
      model: payload.asset.model,
      serial: payload.asset.serial,
    },
    owner: { tenantId: payload.owner.tenantId, name: payload.owner.name },
    renter: payload.renter ? { tenantId: payload.renter.tenantId, name: payload.renter.name } : null,
    periodFrom: iso(payload.periodFrom),
    periodTo: iso(payload.periodTo),
    openingHoursEcu: n1(payload.openingHoursEcu),
    closingHoursEcu: n1(payload.closingHoursEcu),
    billableHours: n1(payload.billableHours),
    days: payload.days.map(d => ({
      date: d.date,
      engineHours: n1(d.engineHours),
      workingHours: n1(d.workingHours),
      idlingHours: n1(d.idlingHours),
      gapMinutes: Math.round(d.gapMinutes),
    })),
    gaps: payload.gaps.map(g => ({ from: iso(g.from), to: iso(g.to) })),
    gapRule: payload.gapRule,
    source: payload.source,
  });
}

export async function sha256Hex(text: string): Promise<string> {

  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sealMucPayload(payload: MucPayload): Promise<string> {
  return sha256Hex(canonicalMucPayload(payload));
}

/** True when the stored payload still produces the stored seal. */
export async function verifyMucPayloadSeal(payload: MucPayload, seal: string): Promise<boolean> {
  return (await sealMucPayload(payload)) === seal;
}
