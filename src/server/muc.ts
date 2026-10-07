// Monthly Utilisation Certificates (spec 11.16).
//
// The canonical payload is the seal: stable key order, ISO UTC times, numbers
// fixed to 1 decimal. Issue/void/reissue all write the audit log. There is no
// edit action — a wrong certificate is voided and reissued.
//
// Used by /app/certificates, the asset detail Certificates tab and /verify/[number].

import type { Asset, Muc, MucPayload, Session, Booking } from '@/domain/types';
import { seed } from '@/server/seed/data';
import { recordAudit } from '@/server/audit';
import { fail, ok } from '@/server/result';
import type { OpResult } from '@/server/result';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { hasFeature } from '@/domain/features';
import { MUC_GAP_RULE, MUC_MAX_GAP_H } from '@/config/thresholds';
import { canonicalMucPayload, sealMucPayload, sha256Hex, verifyMucPayloadSeal } from '@/server/muc-canonical';

export { canonicalMucPayload, sealMucPayload, sha256Hex };
import * as clock from '@/lib/clock';

const n1 = (v: number) => Number(v.toFixed(1));

// ── Verify ───────────────────────────────────────────────────────────────────

/** True when the stored payload still produces the stored seal. */
export async function verifyMucSeal(muc: Muc): Promise<boolean> {
  return verifyMucPayloadSeal(muc.payload, muc.sealSha256);
}

export type MucVerifyStatus = 'valid' | 'voided' | 'tampered' | 'not_found';

export async function getMucVerifyStatus(muc: Muc): Promise<MucVerifyStatus> {
  if (!(await verifyMucSeal(muc))) return 'tampered';
  return muc.status === 'voided' ? 'voided' : 'valid';
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export function getMucByNumber(number: string): Muc | null {
  return seed.mucs.find(m => m.number === number) ?? null;
}

export function getMucsForAsset(assetId: string): Muc[] {
  return seed.mucs.filter(m => m.assetId === assetId);
}

/** Replacement MUC for a voided certificate, if one exists (seed points forwards). */
export function getReplacementMuc(muc: Muc): Muc | null {
  if (!muc.replacesMucId) return null;
  return seed.mucs.find(m => m.id === muc.replacesMucId) ?? null;
}

// ── Simulated ECU engine hours ────────────────────────────────────────────────
// The prototype's ECU model: hours accumulate with the tracker's ignition-on
// time, anchored to a deterministic per-asset baseline so it never jumps.

function assetImei(asset: Asset): string {
  const pairing = seed.pairings.find(p => p.assetId === asset.id && p.to === null);
  const tracker = pairing
    ? seed.trackers.find(t => t.id === pairing.trackerId)
    : seed.trackers.find(t => t.assetId === asset.id && t.stockStatus === 'paired');
  return tracker?.imei ?? '352093100000000';
}

function ecuBaseHours(asset: Asset): number {
  const digits = assetImei(asset).slice(-6);
  return 500 + (parseInt(digits, 10) % 8000);
}

/** Engine hours per day the simulator puts on each kind of asset. */
export const BEHAVIOUR_HOURS_PER_DAY: Record<Asset['behaviour'], number> = {
  parked: 1,
  works_at_site: 9,
  drives_between_sites: 6,
  stationary_24h: 0,
  light_vehicle_day: 4,
};

function createdAtMs(asset: Asset): number {
  return typeof asset.createdAt === 'number' ? asset.createdAt : new Date(asset.createdAt).getTime();
}

/** ECU engine hours at a moment in time (simulated, monotonic per asset). */
export function ecuHoursAt(asset: Asset, atMs: number): number {
  const hoursPerDay = BEHAVIOUR_HOURS_PER_DAY[asset.behaviour] ?? 4;
  const days = Math.max(0, (atMs - createdAtMs(asset)) / 86400000);
  return n1(ecuBaseHours(asset) + days * hoursPerDay);
}

export interface EcuDayBucket {
  date: string;
  engineHours: number;
  workingHours: number;
  idlingHours: number;
  gapMinutes: number;
}

export interface EcuBreakdown {
  days: EcuDayBucket[];
  gaps: { from: number; to: number }[];
  /** Engine hours that fall inside the period's data gaps (disclosed, not attributable). */
  gapHours: number;
  /** Hours the ECU kept counting during gaps, per the disclosed gap rule. */
  maxGapHours: number;
}

const GAP_MINUTES = 90;

/**
 * Per-day engine/working/idling hours plus the gaps, from the simulator readings.
 * A gap is a stretch longer than 90 minutes with no reading: the ECU kept
 * counting, those hours are disclosed but can't be attributed to a day.
 */
export function buildEcuBreakdown(asset: Asset, fromMs: number, toMs: number): EcuBreakdown {
  const readings = getReadingsForAsset(asset, fromMs, toMs);
  const days = new Map<string, EcuDayBucket>();
  const gaps: { from: number; to: number }[] = [];
  let gapHours = 0;
  let maxGapHours = 0;

  const dayKey = (ms: number) => clock.formatDubaiDate(ms).replace(/ /g, ' ');

  let prevMs: number | null = null;
  for (const r of readings) {
    const t = new Date(r.deviceTime).getTime();
    const key = dayKey(t);
    let bucket = days.get(key);
    if (!bucket) {
      bucket = { date: key, engineHours: 0, workingHours: 0, idlingHours: 0, gapMinutes: 0 };
      days.set(key, bucket);
    }
    if (prevMs !== null && t - prevMs > GAP_MINUTES * 60000) {
      gaps.push({ from: prevMs, to: t });
      const gapH = (t - prevMs) / 3600000;
      gapHours += gapH * 0.5; // disclosed assumption: engine ran half the gap
      if (gapH > maxGapHours) maxGapHours = gapH;
      bucket.gapMinutes += Math.round((t - prevMs) / 60000);
    }
    if (prevMs !== null && t > prevMs && t - prevMs <= GAP_MINUTES * 60000) {
      const hours = (t - prevMs) / 3600000;
      if (r.ignition) {
        bucket.engineHours += hours;
        if (r.moving) bucket.workingHours += hours;
        else bucket.idlingHours += hours;
      }
    }
    prevMs = t;
  }

  const ordered = [...days.values()]
    .map(d => ({
      ...d,
      engineHours: n1(d.engineHours),
      workingHours: n1(d.workingHours),
      idlingHours: n1(d.idlingHours),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { days: ordered, gaps, gapHours: n1(gapHours), maxGapHours: Math.round(maxGapHours * 10) / 10 };
}

// ── Issue / void / reissue ────────────────────────────────────────────────────

export interface IssueMucInput {
  assetId: string;
  periodFrom: string | number;
  periodTo: string | number;
  bookingId?: string;
  /** Kasper Admin override for a data gap longer than 24 h (audited). */
  gapOverrideReason?: string;
}

function periodMonth(ms: number): string {
  const d = clock.dubaiMsToDate(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function nextMucNumber(assetCode: string, periodFromMs: number, existing: Muc[]): string {
  const month = periodMonth(periodFromMs);
  const prefix = `MUC-${month}-${assetCode}-`;
  const n = existing.filter(m => m.number.startsWith(prefix)).length + 1;
  return `${prefix}${String(n).padStart(2, '0')}`;
}

function canIssueFor(session: Session, asset: Asset): boolean {
  if (session.isKasper) return session.role === 'kasper_admin';
  return session.role === 'tenant_admin' && asset.ownerTenantId === session.tenantId;
}

export async function issueMuc(session: Session, input: IssueMucInput): Promise<OpResult<Muc>> {
  const asset = seed.assets.find(a => a.id === input.assetId);
  if (!asset) return fail('Asset not found.');

  if (!canIssueFor(session, asset)) {
    return fail('Only the owner Tenant Admin or a Kasper Admin can issue a certificate.');
  }
  if (!hasFeature(asset, 'muc')) {
    return fail('Certificates need ALL-CAN300 (Tier 3) engine hours.');
  }

  const fromMs = typeof input.periodFrom === 'number' ? input.periodFrom : new Date(input.periodFrom).getTime();
  const toMs = typeof input.periodTo === 'number' ? input.periodTo : new Date(input.periodTo).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return fail('Pick a period that ends after it starts.');
  }
  if (toMs > clock.now()) {
    return fail('Only past periods can be certified.');
  }

  const existing = seed.mucs.filter(
    m => m.assetId === asset.id && m.status === 'sealed' && new Date(m.periodFrom).getTime() === fromMs
  );
  if (existing.length > 0) {
    return fail(`A certificate for this period already exists (${existing[0].number}). Void it before reissuing.`);
  }

  const breakdown = buildEcuBreakdown(asset, fromMs, toMs);
  const hasGapOver24h = breakdown.gaps.some(g => (g.to - g.from) / 3600000 > MUC_MAX_GAP_H);
  if (hasGapOver24h) {
    const gapH = Math.round(breakdown.maxGapHours);
    if (!input.gapOverrideReason?.trim()) {
      return fail(`This period has a ${gapH}-hour data gap. Certificates can't be issued until it's reviewed.`);
    }
    if (session.role !== 'kasper_admin') {
      return fail('Only a Kasper Admin can override a data gap.');
    }
  }

  const opening = ecuHoursAt(asset, fromMs);
  const billable = n1(breakdown.days.reduce((sum, d) => sum + d.engineHours, 0) + breakdown.gapHours);
  const closing = n1(opening + billable);
  const owner = seed.tenants.find(t => t.id === asset.ownerTenantId);
  const booking: Booking | null = input.bookingId ? seed.bookings.find(b => b.id === input.bookingId) ?? null : null;
  const renter = booking?.renterTenantId ? seed.tenants.find(t => t.id === booking.renterTenantId) ?? null : null;

  const payload: MucPayload = {
    version: 1,
    asset: { code: asset.code, name: asset.name, make: asset.make, model: asset.model, serial: asset.plateOrSerial },
    owner: { tenantId: asset.ownerTenantId, name: owner?.name ?? asset.ownerTenantId },
    renter: renter ? { tenantId: renter.id, name: renter.name } : undefined,
    periodFrom: new Date(fromMs).toISOString(),
    periodTo: new Date(toMs).toISOString(),
    openingHoursEcu: opening,
    closingHoursEcu: closing,
    billableHours: billable,
    days: breakdown.days,
    gaps: breakdown.gaps,
    gapRule: MUC_GAP_RULE as 'delta_disclosed',
    source: 'ECU',
  };

  const muc: Muc = {
    id: `muc-${asset.code.toLowerCase()}-${Date.now()}`,
    number: nextMucNumber(asset.code, fromMs, seed.mucs),
    assetId: asset.id,
    ownerTenantId: asset.ownerTenantId,
    bookingId: booking?.id,
    periodFrom: payload.periodFrom,
    periodTo: payload.periodTo,
    payload,
    sealSha256: await sealMucPayload(payload),
    issuedAt: new Date(clock.now()).toISOString(),
    issuedBy: session.userId,
    status: 'sealed',
  };
  seed.mucs.push(muc);

  recordAudit({
    actorUserId: session.userId,
    action: 'muc.issue',
    assetId: asset.id,
    tenantId: asset.ownerTenantId,
    detail: `${muc.number} issued for ${asset.code}`,
    reason: input.gapOverrideReason,
  });

  return ok(muc, `${muc.number} sealed — ${billable.toFixed(1)} billable hours.`);
}

export async function voidMuc(session: Session, mucNumber: string, reason: string, reissuedAs?: string): Promise<OpResult<Muc>> {
  const muc = getMucByNumber(mucNumber);
  if (!muc) return fail('Certificate not found.');
  if (muc.status === 'voided') return fail('This certificate is already voided.');
  if (!session.isKasper && !(session.role === 'tenant_admin' && muc.ownerTenantId === session.tenantId)) {
    return fail('Only the owner Tenant Admin or a Kasper Admin can void a certificate.');
  }
  if (reason.trim().length < 10) return fail('Give a reason of at least 10 characters.');

  muc.status = 'voided';
  muc.voidedAt = new Date(clock.now()).toISOString();
  muc.voidedBy = session.userId;
  muc.voidReason = reason.trim();
  if (reissuedAs) muc.replacesMucId = reissuedAs;

  recordAudit({
    actorUserId: session.userId,
    action: 'muc.void',
    assetId: muc.assetId,
    tenantId: muc.ownerTenantId,
    detail: `${muc.number} voided — ${reason.trim()}`,
    reason: reason.trim(),
  });

  return ok(muc, `${muc.number} voided.`);
}

/** Void the old certificate and create the next `-nn` with a fresh payload and seal. */
export async function reissueMuc(session: Session, mucNumber: string, reason: string): Promise<OpResult<Muc>> {
  const original = getMucByNumber(mucNumber);
  if (!original) return fail('Certificate not found.');
  if (original.status === 'sealed') {
    return fail('Void the certificate before reissuing it.');
  }
  if (reason.trim().length < 10) return fail('Give a reason of at least 10 characters.');

  const asset = seed.assets.find(a => a.id === original.assetId);
  if (!asset) return fail('Asset not found.');

  const breakdown = buildEcuBreakdown(asset, new Date(original.periodFrom).getTime(), new Date(original.periodTo).getTime());
  const opening = ecuHoursAt(asset, new Date(original.periodFrom).getTime());
  const billable = n1(breakdown.days.reduce((sum, d) => sum + d.engineHours, 0) + breakdown.gapHours);
  const payload: MucPayload = {
    ...original.payload,
    openingHoursEcu: opening,
    closingHoursEcu: n1(opening + billable),
    billableHours: billable,
    days: breakdown.days,
    gaps: breakdown.gaps,
  };

  const replacement: Muc = {
    id: `muc-${asset.code.toLowerCase()}-reissue-${Date.now()}`,
    number: nextMucNumber(asset.code, new Date(original.periodFrom).getTime(), seed.mucs),
    assetId: original.assetId,
    ownerTenantId: original.ownerTenantId,
    bookingId: original.bookingId,
    periodFrom: original.periodFrom,
    periodTo: original.periodTo,
    payload,
    sealSha256: await sealMucPayload(payload),
    issuedAt: new Date(clock.now()).toISOString(),
    issuedBy: session.userId,
    status: 'sealed',
    replacesMucId: original.id,
    reissueOf: original.id,
  };
  seed.mucs.push(replacement);
  original.replacesMucId = replacement.id;

  recordAudit({
    actorUserId: session.userId,
    action: 'muc.reissue',
    assetId: original.assetId,
    tenantId: original.ownerTenantId,
    detail: `${replacement.number} reissued in place of ${original.number}`,
    reason: reason.trim(),
  });

  return ok(replacement, `${replacement.number} sealed — ${billable.toFixed(1)} billable hours.`);
}

/** Demo tamper tool: change one stored number so the seal no longer matches. */
export function tamperWithMuc(mucNumber: string): OpResult<Muc> {
  const muc = getMucByNumber(mucNumber);
  if (!muc) return fail('Certificate not found.');
  muc.payload.billableHours = n1(muc.payload.billableHours + 5);
  return ok(muc, `${muc.number} tampered — the verify page will now flag it.`);
}
