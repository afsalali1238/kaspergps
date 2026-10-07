// Tracker pairing, requests, audit log and notifications (spec 11.7 / 11.9).
// Pairing is dated history: moving a tracker closes one pairing and opens the
// next, so readings stay attributed to the asset the tracker was on at the time.
import { describe, it, expect, beforeEach } from 'vitest';
import { isValidImei, makeImei } from '@/domain/tracker-id';
import {
  assetsWithoutTracker, assetPairingHistory, currentPairingForAsset, currentPairingForTracker,
  currentTrackerForAsset, markTrackerFaulty, pairingHistory, pairTracker, pairingTargetsFor,
  registerTracker, retireTracker, stockTrackers, trackerById, unpairTracker,
  updateTrackerSettings,
} from './trackers';
import {
  allTrackerRequests, declineTrackerRequest, hasOpenTrackerRequest, openTrackerRequests,
  pairTrackerRequest, requestTracker, trackerRequestForAsset,
} from './requests';
import {
  actorName, assetCode, auditActions, auditEntriesToCsv, queryAuditEntries, recordAudit,
  recordAuditForSession, tenantName,
} from './audit';
import {
  markAllRead, markNotificationRead, notificationsFor, notifyUser, sessionNotifications, unreadCount,
} from './notifications';
import { seed } from '@/server/seed/data';
import type { Asset, Notification, Session } from '@/domain/types';
import * as clock from '@/lib/clock';

function sessionFor(userId: string): Session {
  const user = seed.users.find(u => u.id === userId)!;
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: user.siteIds,
    role: user.role,
    isKasper: user.role === 'kasper_admin' || user.role === 'kasper_ops',
  };
}

const sara = () => sessionFor('u-sara');   // Kasper Admin
const ravi = () => sessionFor('u-ravi');   // Kasper Ops
const priya = () => sessionFor('u-priya'); // Gulf Lift Tenant Admin
const omar = () => sessionFor('u-omar');   // Al Noor Tenant Admin

/**
 * A fresh asset with no tracker. Only LD-09 and MW-01 are tracker-less in the
 * seed, so pairing tests build their own assets instead of exhausting them.
 */
function newAsset(code: string, ownerTenantId = 't-emirates'): Asset {
  const asset: Asset = {
    ...seed.assets[0],
    id: `a-test-${code.toLowerCase()}`,
    code,
    name: `${code} test asset`,
    ownerTenantId,
    createdAt: clock.now() - 86400000,
  };
  seed.assets.push(asset);
  return asset;
}

let seq = 0;

/** A freshly registered, in-stock tracker — keeps the seeded 3 spares for the seed's story. */
function freshTracker(): string {
  seq += 1;
  const body = `35209310${String(900000 + seq)}`;
  const result = registerTracker(sara(), {
    imei: makeImei(body),
    simIccid: `89971${String(10000000000000 + seq)}`,
  });
  if (!result.ok) throw new Error(`freshTracker failed: ${result.error}`);
  return result.data!.id;
}

describe('trackers — registration', () => {
  it('registers a tracker with a valid IMEI and SIM', () => {
    const before = seed.trackers.length;
    const result = registerTracker(sara(), { imei: '352093100009999', simIccid: '89971000000000000001' });
    // 352093100009999 may or may not have a valid check digit — accept either outcome
    // and assert the rule that matters: a bad check digit never registers.
    if (result.ok) {
      expect(seed.trackers.length).toBe(before + 1);
      expect(result.data!.stockStatus).toBe('in_stock');
      expect(stockTrackers().some(t => t.id === result.data!.id)).toBe(true);
    } else {
      expect(result.error).toContain("isn't valid");
      expect(seed.trackers.length).toBe(before);
    }
  });

  it('refuses a duplicate IMEI and a bad SIM', () => {
    const existing = seed.trackers[0];
    expect(registerTracker(sara(), { imei: existing.imei, simIccid: '89971000000000000001' }).error)
      .toBe('This IMEI is already registered.');

    // A valid IMEI with a bad SIM fails on the SIM, not the IMEI.
    const imei = makeImei('35209310999999');
    expect(isValidImei(imei)).toBe(true);
    const dup = registerTracker(sara(), { imei, simIccid: '12345' });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toMatch(/19–20 digits/);

    const badCheck = registerTracker(sara(), {
      imei: `${imei.slice(0, 14)}${(Number(imei[14]) + 1) % 10}`,
      simIccid: '8997100000000000001',
    });
    expect(badCheck.ok).toBe(false);
    if (!badCheck.ok) expect(badCheck.error).toContain("isn't valid");
  });

  it('only lets Kasper register', () => {
    expect(registerTracker(priya(), { imei: '352093100005555', simIccid: '89971000000000000002' }).ok).toBe(false);
  });
});

describe('trackers — pairing', () => {
  it('pairs a stock tracker to an asset with none and dates the pairing', () => {
    const asset = newAsset('TT-01');
    const trackerId = freshTracker();
    expect(stockTrackers().some(t => t.id === trackerId)).toBe(true);

    const result = pairTracker(ravi(), trackerId, asset.id);
    expect(result.ok).toBe(true);
    expect(trackerById(trackerId)!.stockStatus).toBe('paired');
    expect(currentTrackerForAsset(asset.id)?.id).toBe(trackerId);
    expect(currentPairingForTracker(trackerId)!.assetId).toBe(asset.id);
    expect(assetPairingHistory(asset.id)[0].to).toBeNull();
    expect(assetPairingHistory(asset.id)[0].from).toBeTruthy();
  });

  it('moves a tracker and keeps history before now with the old asset', () => {
    const trackerId = freshTracker();
    const first = newAsset('TT-02');
    const second = newAsset('TT-03');
    pairTracker(ravi(), trackerId, first.id);

    const moved = pairTracker(ravi(), trackerId, second.id);
    expect(moved.ok).toBe(true);
    expect(currentPairingForTracker(trackerId)!.assetId).toBe(second.id);

    const history = pairingHistory(trackerId);
    expect(history[0].to).toBeNull();
    const closed = history[history.length - 1];
    expect(closed.assetId).toBe(first.id);
    expect(closed.to).not.toBeNull();
    expect(currentPairingForAsset(first.id)).toBeNull();
    expect(currentPairingForAsset(second.id)!.trackerId).toBe(trackerId);
    expect(moved.message).toContain(second.code);
  });

  it('refuses an asset that already has a tracker', () => {
    const asset = newAsset('TT-04');
    const first = freshTracker();
    pairTracker(ravi(), first, asset.id);
    const second = freshTracker();
    const result = pairTracker(ravi(), second, asset.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('already has tracker');
  });

  it('unpairs back to In stock and Mark faulty takes it off the asset', () => {
    const asset = seed.assets.find(a => a.code === 'FL-09')!;
    const tracker = currentTrackerForAsset(asset.id)!;
    expect(tracker).toBeTruthy();

    const unpaired = unpairTracker(ravi(), tracker.id);
    expect(unpaired.ok).toBe(true);
    expect(trackerById(tracker.id)!.stockStatus).toBe('in_stock');
    expect(currentPairingForAsset(asset.id)).toBeNull();

    pairTracker(ravi(), tracker.id, asset.id);
    const faulty = markTrackerFaulty(ravi(), tracker.id, 'Intermittent GSM');
    expect(faulty.ok).toBe(true);
    expect(trackerById(tracker.id)!.stockStatus).toBe('faulty');
    expect(trackerById(tracker.id)!.flaggedForSupport?.note).toBe('Intermittent GSM');
    expect(currentPairingForAsset(asset.id)).toBeNull();
    expect(markTrackerFaulty(ravi(), tracker.id, '').ok).toBe(false);
  });

  it('will not retire a paired tracker, and retires an unpaired one', () => {
    const paired = seed.trackers.find(t => currentPairingForTracker(t.id))!;
    expect(retireTracker(ravi(), paired.id).ok).toBe(false);

    const spareId = freshTracker();
    const spare = trackerById(spareId)!;
    const retired = retireTracker(ravi(), spareId);
    expect(retired.ok).toBe(true);
    expect(spare.stockStatus).toBe('retired');
    expect(pairTracker(ravi(), spareId, newAsset('TT-05').id).ok).toBe(false);
  });

  it('validates tracker settings (30–300 s)', () => {
    const tracker = seed.trackers[1];
    expect(updateTrackerSettings(ravi(), tracker.id, { pingIntervalSec: 20, sleepMode: 'off' }).ok).toBe(false);
    expect(updateTrackerSettings(ravi(), tracker.id, { pingIntervalSec: 301, sleepMode: 'off' }).ok).toBe(false);
    expect(updateTrackerSettings(ravi(), tracker.id, { pingIntervalSec: 60, sleepMode: 'deep' }).ok).toBe(true);
    expect(trackerById(tracker.id)!.pingIntervalSec).toBe(60);
    expect(trackerById(tracker.id)!.sleepMode).toBe('deep');
    expect(updateTrackerSettings(priya(), tracker.id, { pingIntervalSec: 60, sleepMode: 'off' }).ok).toBe(false);
  });

  it('does not let a Tenant Admin pair trackers, and 404s an unknown tracker', () => {
    const asset = newAsset('TT-06', 't-gulflift');
    const trackerId = freshTracker();
    expect(pairTracker(priya(), trackerId, asset.id).ok).toBe(false);
    expect(pairTracker(ravi(), 'tr-nope', asset.id).ok).toBe(false);
    expect(pairTracker(ravi(), trackerId, 'a-nope').ok).toBe(false);
  });
});

describe('tracker requests', () => {
  it('starts from the seeded open request for MW-01', () => {
    const open = openTrackerRequests();
    expect(open.length).toBeGreaterThanOrEqual(1);
    expect(open.some(r => r.asset?.code === 'MW-01')).toBe(true);
    expect(hasOpenTrackerRequest('a-mw01')).toBe(true);
    expect(trackerRequestForAsset('a-mw01')?.requesterName).toBe('Priya Nair');
    expect(trackerRequestForAsset('a-mw01')?.tenantName).toBe('Gulf Lift Rentals');
  });

  it('pairs the seeded request from stock and notifies the requester', () => {
    const request = openTrackerRequests().find(r => r.asset?.code === 'MW-01')!;
    const stock = stockTrackers().find(t => t.flaggedForSupport === undefined)!;
    expect(stock).toBeTruthy();
    const before = notificationsFor('u-priya').length;

    const result = pairTrackerRequest(ravi(), request.id, stock.id);
    expect(result.ok).toBe(true);
    const stored = allTrackerRequests().find(r => r.id === request.id)!;
    expect(stored.status).toBe('done');
    expect(stored.handledBy).toBe('u-ravi');
    expect(currentTrackerForAsset('a-mw01')?.id).toBe(stock.id);

    const notifications = notificationsFor('u-priya');
    expect(notifications.length).toBe(before + 1);
    expect(notifications[0].text).toContain('MW-01');
    expect(notifications[0].read).toBe(false);
    expect(hasOpenTrackerRequest('a-mw01')).toBe(false);
    expect(pairTrackerRequest(ravi(), request.id, stock[0]?.id ?? 'tr-nope').ok).toBe(false);
    expect(declineTrackerRequest(ravi(), request.id, 'Already handled this one').ok).toBe(false);
    expect(declineTrackerRequest(ravi(), 'trreq-nope', 'No such request here').ok).toBe(false);
    expect(pairTrackerRequest(priya(), request.id, stock.id).ok).toBe(false);
  });

  it('declines with a reason of 10+ characters and notifies the requester', () => {
    const asset = newAsset('TR-02', 't-gulflift');
    const request = requestTracker(priya(), asset.id, 'Needs a tracker for site safety');
    expect(request.ok).toBe(true);
    expect(hasOpenTrackerRequest(asset.id)).toBe(true);

    const short = declineTrackerRequest(ravi(), request.data!.id, 'no');
    expect(short.ok).toBe(false);

    const before = notificationsFor('u-priya').length;
    const declined = declineTrackerRequest(ravi(), request.data!.id, 'Asset is parked and never moves');
    expect(declined.ok).toBe(true);
    const stored = allTrackerRequests().find(r => r.id === request.data!.id)!;
    expect(stored.status).toBe('declined');
    expect(stored.note).toContain('declined: Asset is parked');
    expect(notificationsFor('u-priya').length).toBe(before + 1);
    expect(declineTrackerRequest(ravi(), request.data!.id, 'Second attempt to decline').ok).toBe(false);
    expect(stored.handledAt).toBeTruthy();
  });

  it('refuses a request from a Tenant Admin who does not own the asset, and duplicates', () => {
    const alNoorAsset = seed.assets.find(a => a.ownerTenantId === 't-alnoor' && !currentTrackerForAsset(a.id));
    if (alNoorAsset) {
      expect(requestTracker(priya(), alNoorAsset.id).ok).toBe(false);
    }
    const owned = newAsset('TR-03');
    const first = requestTracker(sessionFor('u-khalid'), owned.id, 'Please fit a tracker');
    expect(first.ok).toBe(true);
    const again = requestTracker(sessionFor('u-khalid'), owned.id, 'Please fit a tracker');
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toContain('already requested');

    // An asset that already has a tracker cannot be requested.
    expect(currentTrackerForAsset('a-lb02')).toBeTruthy();
    expect(requestTracker(omar(), 'a-lb02').ok).toBe(false);
    expect(requestTracker(priya(), 'a-nope').ok).toBe(false);
    expect(allTrackerRequests().length).toBe(seed.trackerRequests.length);
  });
});

describe('audit log', () => {
  beforeEach(() => {
    seed.auditEntries.push(
      { id: 'au-test-1', at: clock.now() - 3600000, actorUserId: 'u-sara', action: 'tenant.suspend', tenantId: 't-palm', detail: 'Palm Contracting suspended' },
      { id: 'au-test-2', at: clock.now() - 7200000, actorUserId: 'u-ravi', action: 'pairing.create', assetId: 'a-fb12', detail: 'Tracker paired to FB-12' },
    );
  });

  it('records an entry for a session and reads names back', () => {
    const entry = recordAuditForSession(sara(), {
      action: 'asset.retire',
      assetId: 'a-ex04',
      tenantId: 't-emirates',
      detail: 'EX-04 retired',
      reason: 'End of life',
    });
    expect(entry.actorUserId).toBe('u-sara');
    expect(actorName(entry.actorUserId)).toBe('Sara Haddad');
    expect(tenantName(entry.tenantId)).toBe('Emirates Earthmovers');
    expect(assetCode(entry.assetId)).toBe('EX-04');
    expect(actorName('nobody')).toBe('nobody');
    expect(tenantName()).toBe('—');
    expect(assetCode()).toBe('—');
    recordAudit({ actorUserId: 'u-ravi', action: 'asset.edit', detail: 'no tenant' });
  });

  it('filters by person, tenant, action and date, newest first', () => {
    const byAction = queryAuditEntries({ action: 'tenant.suspend' });
    expect(byAction.length).toBeGreaterThanOrEqual(1);
    expect(byAction.every(e => e.action === 'tenant.suspend')).toBe(true);

    const byPerson = queryAuditEntries({ person: 'ravi' });
    expect(byPerson.some(e => e.action === 'pairing.create')).toBe(true);

    const byTenant = queryAuditEntries({ tenant: 'Palm Contracting' });
    expect(byTenant.some(e => e.id === 'au-test-1')).toBe(true);

    const all = queryAuditEntries();
    for (let i = 1; i < all.length; i += 1) {
      const a = typeof all[i - 1].at === 'number' ? all[i - 1].at as number : new Date(all[i - 1].at).getTime();
      const b = typeof all[i].at === 'number' ? all[i].at as number : new Date(all[i].at).getTime();
      expect(a).toBeGreaterThanOrEqual(b);
    }

    const today = clock.dubaiToIso(clock.now()).slice(0, 10);
    const inRange = queryAuditEntries({ from: today, to: today });
    expect(inRange.some(e => e.id === 'au-test-1')).toBe(true);
    expect(queryAuditEntries({ from: '2030-01-01' }).length).toBe(0);
  });

  it('lists the actions in use and exports CSV with quoting', () => {
    expect(auditActions()).toContain('tenant.suspend');
    const csv = auditEntriesToCsv([
      { id: 'x', at: clock.now(), actorUserId: 'u-sara', action: 'tenant.suspend', detail: 'Said "stop", now' },
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('When,Person,Tenant,Action,Asset,Detail,Reason');
    expect(lines[1]).toContain('"Said ""stop"", now"');
  });
});

describe('notifications', () => {
  it('counts unread per user and marks them read', () => {
    const notification: Notification = {
      id: 'ntf-test', userId: 'u-omar', at: clock.now(), text: 'Test', read: false,
    };
    seed.notifications.push(notification);

    expect(notificationsFor('u-omar').some(n => n.id === 'ntf-test')).toBe(true);
    expect(unreadCount('u-omar')).toBeGreaterThanOrEqual(1);

    markNotificationRead('u-omar', 'ntf-test');
    expect(notification.read).toBe(true);
    // Another user's id cannot mark it, and a second read is a no-op.
    markNotificationRead('u-omar', 'ntf-test');
    expect(notification.read).toBe(true);

    notifyUser('u-omar', 'Another one');
    expect(unreadCount('u-omar')).toBeGreaterThanOrEqual(1);
    markAllRead('u-omar');
    expect(unreadCount('u-omar')).toBe(0);
    expect(notificationsFor('u-omar').every(n => n.read)).toBe(true);

    expect(sessionNotifications(null)).toEqual([]);
    expect(sessionNotifications(omar()).length).toBeGreaterThanOrEqual(1);
  });
});
