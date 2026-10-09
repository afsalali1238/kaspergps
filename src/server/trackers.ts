// Trackers and pairings (spec 11.7 console → Trackers).
// Pairing is dated history: a tracker has one open pairing at a time, and
// moving a tracker closes the old pairing and opens a new one, so readings
// stay attributed to whichever asset the tracker was on at the time.

import type { Asset, Pairing, Session, Tracker, TrackerSleepMode } from '@/domain/types';
import { db, append, touch, nextNumber } from '@/server/db';
import * as clock from '@/lib/clock';
import { fail, ok, type OpResult } from '@/server/result';

import { recordAuditForSession } from '@/server/audit';
import {
  ICCID_ERROR, IMEI_DUPLICATE_ERROR, IMEI_ERROR, isValidIccid, isValidImei,
} from '@/domain/tracker-id';
import { can } from '@/server/capabilities';

// ── Reads ─────────────────────────────────────────────────────────────────────

export function trackerById(trackerId: string): Tracker | null {
  return db.getState().trackers.find(t => t.id === trackerId) ?? null;
}

/** The pairing that is still open for a tracker (`to === null`). */
export function currentPairingForTracker(trackerId: string): Pairing | null {
  return db.getState().pairings.find(p => p.trackerId === trackerId && p.to === null) ?? null;
}

/** The pairing that is still open for an asset — its current tracker. */
export function currentPairingForAsset(assetId: string): Pairing | null {
  return db.getState().pairings.find(p => p.assetId === assetId && p.to === null) ?? null;
}

export function currentTrackerForAsset(assetId: string): Tracker | null {
  const pairing = currentPairingForAsset(assetId);
  if (pairing) return trackerById(pairing.trackerId);
  // Seeded assets may carry the link on the tracker itself.
  return db.getState().trackers.find(t => t.assetId === assetId && t.stockStatus === 'paired') ?? null;
}

/** The open pairing comes first, then the closes newest-first. */
function byOpenThenNewest(a: Pairing, b: Pairing): number {
  if ((a.to === null) !== (b.to === null)) return a.to === null ? -1 : 1;
  return toMs(b.from) - toMs(a.from);
}

export function pairingHistory(trackerId: string): Pairing[] {
  return db.getState().pairings.filter(p => p.trackerId === trackerId).sort(byOpenThenNewest);
}

export function assetPairingHistory(assetId: string): Pairing[] {
  return db.getState().pairings.filter(p => p.assetId === assetId).sort(byOpenThenNewest);
}

/** Trackers registered but not fitted to any asset. */
export function stockTrackers(): Tracker[] {
  return db.getState().trackers.filter(t => t.stockStatus === 'in_stock');
}

/** Assets with no current tracker — the only sensible pairing targets. */
export function assetsWithoutTracker(): Asset[] {
  return db.getState().assets.filter(a => !currentTrackerForAsset(a.id));
}

/** Assets a tracker could move to: anything not already carrying it. */
export function pairingTargetsFor(trackerId: string): Asset[] {
  const alreadyOn = currentPairingForTracker(trackerId)?.assetId ?? null;
  return db.getState().assets.filter(a => {
    if (a.id === alreadyOn) return false;
    return !currentTrackerForAsset(a.id);
  });
}

// ── Writes ────────────────────────────────────────────────────────────────────

export interface RegisterTrackerInput {
  imei: string;
  simIccid: string;
  firmware?: string;
  pingIntervalSec?: number;
  sleepMode?: TrackerSleepMode;
}

const DEFAULT_FIRMWARE = '03.29.00.Rev.03';

export function registerTracker(session: Session, input: RegisterTrackerInput): OpResult<Tracker> {
  if (!can(session, 'console.trackers.manage')) {
    return fail('Only Kasper can register trackers.');
  }
  const imei = input.imei.replace(/\s+/g, '');
  const simIccid = input.simIccid.replace(/\s+/g, '');

  if (!/^\d{15}$/.test(imei) || !isValidImei(imei)) return fail(IMEI_ERROR);
  if (db.getState().trackers.some(t => t.imei === imei)) return fail(IMEI_DUPLICATE_ERROR);
  if (!isValidIccid(simIccid)) return fail(ICCID_ERROR);

  const tracker: Tracker = {
    id: `tr-new-${nextNumber('tr-new-', db.getState().trackers)}`,
    assetId: null,
    imei,
    model: 'FMC130',
    simIccid,
    firmware: input.firmware?.trim() || DEFAULT_FIRMWARE,
    pingIntervalSec: input.pingIntervalSec ?? 30,
    sleepMode: input.sleepMode ?? 'off',
    stockStatus: 'in_stock',
    registeredAt: new Date(clock.now()).toISOString(),
    registeredBy: session.userId,
  };
  append('trackers', tracker);

  recordAuditForSession(session, {
    action: 'tracker.register',
    detail: `Tracker ${imei} registered`,
  });
  return ok(tracker, `Tracker ${imei} registered.`);
}

/**
 * Pair (or move) a tracker onto an asset. Moving closes the tracker's open
 * pairing first, so history before now stays with the old asset.
 */
export function pairTracker(session: Session, trackerId: string, assetId: string): OpResult<Tracker> {
  if (!can(session, 'console.trackers.manage')) {
    return fail('Only Kasper can pair trackers.');
  }
  const tracker = trackerById(trackerId);
  if (!tracker) return fail('Tracker not found.');
  const asset = db.getState().assets.find(a => a.id === assetId);
  if (!asset) return fail('Asset not found.');
  if (tracker.stockStatus === 'retired') return fail('This tracker is retired.');
  if (tracker.stockStatus === 'faulty') return fail('This tracker is flagged faulty.');

  const existingForTracker = currentPairingForTracker(trackerId);
  const existingForAsset = currentPairingForAsset(assetId);
  if (existingForAsset && existingForTracker && existingForAsset.id === existingForTracker.id) {
    return fail(`${asset.code} already carries this tracker.`);
  }
  if (existingForAsset) {
    const holder = trackerById(existingForAsset.trackerId);
    return fail(`${asset.code} already has tracker ${holder?.imei ?? '—'}. Unpair it first.`);
  }

  const now = new Date(clock.now()).toISOString();
  if (existingForTracker) {
    existingForTracker.to = now;
    const from = db.getState().assets.find(a => a.id === existingForTracker.assetId);
    tracker.assetId = asset.id;
    tracker.stockStatus = 'paired';
    append('pairings', { id: `p-new-${nextNumber('p-new-', db.getState().pairings)}`, trackerId, assetId, from: now, to: null });
    touch('trackers', 'pairings');
    recordAuditForSession(session, {
      action: 'pairing.move',
      assetId,
      tenantId: asset.ownerTenantId,
      detail: `Tracker ${tracker.imei} moved from ${from?.code ?? existingForTracker.assetId} to ${asset.code}: history before now stays with ${from?.code ?? 'the old asset'}`,
    });
    return ok(tracker, `Tracker ${tracker.imei} moved to ${asset.code}.`);
  }

  tracker.assetId = asset.id;
  tracker.stockStatus = 'paired';
  tracker.flaggedForSupport = undefined;
  append('pairings', { id: `p-new-${nextNumber('p-new-', db.getState().pairings)}`, trackerId, assetId, from: now, to: null });
  touch('trackers', 'pairings');
  recordAuditForSession(session, {
    action: 'pairing.create',
    assetId,
    tenantId: asset.ownerTenantId,
    detail: `Tracker ${tracker.imei} paired to ${asset.code}`,
  });
  return ok(tracker, `Tracker ${tracker.imei} paired to ${asset.code}.`);
}

export function unpairTracker(session: Session, trackerId: string): OpResult<Tracker> {
  if (!can(session, 'console.trackers.manage')) {
    return fail('Only Kasper can unpair trackers.');
  }
  const tracker = trackerById(trackerId);
  if (!tracker) return fail('Tracker not found.');
  const pairing = currentPairingForTracker(trackerId);
  if (!pairing) return fail('This tracker is not paired to an asset.');

  const asset = db.getState().assets.find(a => a.id === pairing.assetId);
  pairing.to = new Date(clock.now()).toISOString();
  tracker.assetId = null;
  tracker.stockStatus = 'in_stock';
  touch('trackers', 'pairings');
  recordAuditForSession(session, {
    action: 'pairing.end',
    assetId: pairing.assetId,
    detail: `Tracker ${tracker.imei} unpaired from ${asset?.code ?? pairing.assetId} — back in stock`,
  });
  return ok(tracker, `Tracker ${tracker.imei} unpaired from ${asset?.code ?? 'the asset'}.`);
}

export function markTrackerFaulty(session: Session, trackerId: string, note: string): OpResult<Tracker> {
  if (!can(session, 'console.trackers.manage')) {
    return fail('Only Kasper can flag trackers.');
  }
  const tracker = trackerById(trackerId);
  if (!tracker) return fail('Tracker not found.');
  if (!note.trim()) return fail('Add a note saying what is wrong.');

  const pairing = currentPairingForTracker(trackerId);
  if (pairing) {
    const asset = db.getState().assets.find(a => a.id === pairing.assetId);
    pairing.to = new Date(clock.now()).toISOString();
    tracker.assetId = null;
    recordAuditForSession(session, {
      action: 'pairing.end',
      assetId: pairing.assetId,
      detail: `Tracker ${tracker.imei} removed from ${asset?.code ?? pairing.assetId} and flagged faulty`,
    });
  }
  tracker.stockStatus = 'faulty';
  tracker.flaggedForSupport = {
    by: session.userId,
    at: new Date(clock.now()).toISOString(),
    note: note.trim(),
  };
  touch('trackers', 'pairings');
  recordAuditForSession(session, {
    action: 'tracker.faulty',
    detail: `Tracker ${tracker.imei} marked faulty — ${note.trim()}`,
    reason: note.trim(),
  });
  return ok(tracker, `Tracker ${tracker.imei} flagged for support.`);
}

export function retireTracker(session: Session, trackerId: string): OpResult<Tracker> {
  if (!can(session, 'console.trackers.manage')) {
    return fail('Only Kasper can retire trackers.');
  }
  const tracker = trackerById(trackerId);
  if (!tracker) return fail('Tracker not found.');
  if (currentPairingForTracker(trackerId)) {
    return fail('Unpair the tracker before retiring it.');
  }
  tracker.stockStatus = 'retired';
  touch('trackers', 'pairings');
  recordAuditForSession(session, {
    action: 'tracker.retire',
    detail: `Tracker ${tracker.imei} retired`,
  });
  return ok(tracker, `Tracker ${tracker.imei} retired.`);
}

export interface TrackerSettingsInput {
  pingIntervalSec: number;
  sleepMode: TrackerSleepMode;
}

export function updateTrackerSettings(session: Session, trackerId: string, input: TrackerSettingsInput): OpResult<Tracker> {
  if (!can(session, 'console.trackers.configure')) {
    return fail('Only Kasper can change tracker settings.');
  }
  const tracker = trackerById(trackerId);
  if (!tracker) return fail('Tracker not found.');
  if (!Number.isFinite(input.pingIntervalSec) || input.pingIntervalSec < 30 || input.pingIntervalSec > 300) {
    return fail('Ping interval must be between 30 and 300 seconds.');
  }
  tracker.pingIntervalSec = Math.round(input.pingIntervalSec);
  tracker.sleepMode = input.sleepMode;
  touch('trackers', 'pairings');
  recordAuditForSession(session, {
    action: 'tracker.settings',
    assetId: tracker.assetId ?? undefined,
    detail: `Tracker ${tracker.imei} settings: ping ${tracker.pingIntervalSec}s, sleep ${tracker.sleepMode}`,
  });
  return ok(tracker, 'Settings saved.');
}

function toMs(v: string | number): number {
  return typeof v === 'number' ? v : new Date(v).getTime();
}
