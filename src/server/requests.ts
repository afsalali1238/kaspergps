// Tracker requests (spec 11.7 console → Requests, and 11.6 "Request a tracker").
// An owner asks Kasper for a tracker on an asset that has none; Kasper pairs or
// declines, and the requesting Tenant Admin hears back through the bell.

import type { Session, TrackerRequest, Asset } from '@/domain/types';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { fail, ok, type OpResult } from '@/server/result';
import { hasCapability } from '@/server/access';
import { recordAuditForSession } from '@/server/audit';
import { notifyUser } from '@/server/notifications';
import { currentTrackerForAsset, pairTracker, trackerById } from '@/server/trackers';

let requestSeq = 0;

export interface TrackerRequestView extends TrackerRequest {
  asset: Asset | null;
  tenantName: string;
  requesterName: string;
}

function view(request: TrackerRequest): TrackerRequestView {
  const asset = seed.assets.find(a => a.id === request.assetId) ?? null;
  return {
    ...request,
    asset,
    tenantName: seed.tenants.find(t => t.id === request.tenantId)?.name ?? '—',
    requesterName: seed.users.find(u => u.id === request.requestedBy)?.name ?? request.requestedBy,
  };
}

export function allTrackerRequests(): TrackerRequestView[] {
  return seed.trackerRequests
    .map(view)
    .sort((a, b) => toMs(b.at) - toMs(a.at));
}

export function openTrackerRequests(): TrackerRequestView[] {
  return allTrackerRequests().filter(r => r.status === 'open');
}

export function trackerRequestForAsset(assetId: string): TrackerRequestView | null {
  const request = seed.trackerRequests
    .filter(r => r.assetId === assetId)
    .sort((a, b) => toMs(b.at) - toMs(a.at))[0];
  return request ? view(request) : null;
}

/** True when the asset has an open request waiting on Kasper. */
export function hasOpenTrackerRequest(assetId: string): boolean {
  return trackerRequestForAsset(assetId)?.status === 'open';
}

// ── Tenant side ───────────────────────────────────────────────────────────────

export function requestTracker(session: Session, assetId: string, note = ''): OpResult<TrackerRequest> {
  if (!hasCapability(session, 'tracker.request')) {
    return fail('Only a Tenant Admin or Kasper can request a tracker.');
  }
  const asset = seed.assets.find(a => a.id === assetId);
  if (!asset) return fail('Asset not found.');
  if (!session.isKasper && asset.ownerTenantId !== session.tenantId) {
    return fail('You can only request trackers for your own assets.');
  }
  if (currentTrackerForAsset(assetId)) {
    return fail(`${asset.code} already has a tracker.`);
  }
  if (hasOpenTrackerRequest(assetId)) {
    return fail(`A tracker is already requested for ${asset.code}.`);
  }

  const request: TrackerRequest = {
    id: `trreq-${String(++requestSeq + 1).padStart(3, '0')}`,
    tenantId: asset.ownerTenantId,
    assetId,
    requestedBy: session.userId,
    at: new Date(clock.now()).toISOString(),
    note: note.trim() || `Tracker requested for ${asset.code}`,
    status: 'open',
  };
  seed.trackerRequests.push(request);

  recordAuditForSession(session, {
    action: 'tracker.request',
    assetId,
    tenantId: asset.ownerTenantId,
    detail: `Tracker requested for ${asset.code}`,
    reason: note.trim() || undefined,
  });
  return ok(request, `Tracker requested for ${asset.code}.`);
}

// ── Kasper side ───────────────────────────────────────────────────────────────

export function pairTrackerRequest(session: Session, requestId: string, trackerId: string): OpResult<TrackerRequest> {
  if (!hasCapability(session, 'console.trackers.manage')) {
    return fail('Only Kasper can pair trackers.');
  }
  const request = seed.trackerRequests.find(r => r.id === requestId);
  if (!request) return fail('Request not found.');
  if (request.status !== 'open') return fail('This request has already been handled.');

  const tracker = trackerById(trackerId);
  if (!tracker) return fail('Pick a tracker from stock.');
  const asset = seed.assets.find(a => a.id === request.assetId);

  const paired = pairTracker(session, trackerId, request.assetId);
  if (!paired.ok) return fail(paired.error ?? 'Could not pair the tracker.');

  request.status = 'done';
  request.handledBy = session.userId;
  request.handledAt = new Date(clock.now()).toISOString();

  notifyUser(
    request.requestedBy,
    `Tracker ${tracker.imei} paired to ${asset?.code ?? request.assetId}.`,
    '/app/assets'
  );
  recordAuditForSession(session, {
    action: 'tracker.request.done',
    assetId: request.assetId,
    tenantId: request.tenantId,
    detail: `Request ${request.id} paired: ${tracker.imei} to ${asset?.code ?? request.assetId}`,
  });
  return ok(request, `Tracker paired and ${asset?.code ?? 'the asset'} notified.`);
}

export function declineTrackerRequest(session: Session, requestId: string, reason: string): OpResult<TrackerRequest> {
  if (!hasCapability(session, 'console.trackers.manage')) {
    return fail('Only Kasper can decline requests.');
  }
  const request = seed.trackerRequests.find(r => r.id === requestId);
  if (!request) return fail('Request not found.');
  if (request.status !== 'open') return fail('This request has already been handled.');
  if (reason.trim().length < 10) {
    return fail('Add a reason of at least 10 characters so the tenant knows why.');
  }

  const asset = seed.assets.find(a => a.id === request.assetId);
  request.status = 'declined';
  request.handledBy = session.userId;
  request.handledAt = new Date(clock.now()).toISOString();
  request.note = `${request.note} — declined: ${reason.trim()}`;

  notifyUser(
    request.requestedBy,
    `Tracker request for ${asset?.code ?? request.assetId} declined: ${reason.trim()}`,
    '/app/assets'
  );
  recordAuditForSession(session, {
    action: 'tracker.request.declined',
    assetId: request.assetId,
    tenantId: request.tenantId,
    detail: `Request ${request.id} declined for ${asset?.code ?? request.assetId}`,
    reason: reason.trim(),
  });
  return ok(request, 'Request declined and the tenant notified.');
}

function toMs(v: string | number): number {
  return typeof v === 'number' ? v : new Date(v).getTime();
}
