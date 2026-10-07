'use client';

import React, { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import clsx from 'clsx';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  TierChip, Badge, Button, StatusBadge,
} from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { isAssetVisible, getRelationship, hasCapability } from '@/server/access';
import { getReadingForAsset, computeStatus } from '@/server/telemetry/simulator';
import { buildEcuBreakdown, ecuHoursAt, getMucsForAsset, getMucVerifyStatus } from '@/server/muc';
import { hasOpenTrackerRequest, requestTracker, trackerRequestForAsset } from '@/server/requests';
import {
  activeLinksForAsset, createTrackingLink, expiryOptions, linkEndWords, pastLinksForAsset,
  revokeTrackingLink,
} from '@/server/tracking-links';
import { endEarly } from '@/server/bookings';
import type { Asset, TrackingLink } from '@/domain/types';
import type { EcuBreakdown, MucVerifyStatus } from '@/server/muc';
import { hasFeature } from '@/domain/features';
import { canManageMaintenance, planSnapshot, plansForAsset, serviceHistory } from '@/server/maintenance';

// Fix Leaflet default icon issue
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const STATUS_COLORS: Record<string, string> = {
  live: '#1F9A6D',
  idle: '#B89000',
  stale: '#9A9CA1',
  offline: '#D64545',
  unknown: '#9A9CA1',
  no_tracker: '#9A9CA1',
};

function createMarkerIcon(status: string) {
  const color = STATUS_COLORS[status] ?? '#9A9CA1';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
      <div style="position: relative; width: 24px; height: 36px;">
        <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 16px; height: 16px; background: ${color}; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>
        <div style="position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid ${color};"></div>
      </div>
    </svg>
  `;
  return L.divIcon({
    html: svg,
    className: 'marker-custom',
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  });
}

function SharePanel({ asset, onClose, onDone, onError }: {
  asset: Asset;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const session = useStore.getState().session!;
  const options = expiryOptions(asset.id);
  const [optionKey, setOptionKey] = useState(String(options[0]?.bookingId ?? 'none'));
  const [showEta, setShowEta] = useState(true);
  const [created, setCreated] = useState<TrackingLink | null>(null);
  const [version, setVersion] = useState(0);

  const option = options.find(o => String(o.bookingId ?? 'none') === optionKey) ?? options[0];
  const booking = option?.bookingId ? seed.bookings.find(b => b.id === option.bookingId) : null;
  const hasDestination = Boolean(booking?.destination);
  const active = activeLinksForAsset(asset.id);
  const past = pastLinksForAsset(asset.id);
  const linkUrl = created ? `${typeof window !== 'undefined' ? window.location.origin : ''}/t/${created.token}` : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(linkUrl);
      onDone('Link copied to the clipboard.');
    } catch {
      onError('Copy blocked by the browser — select the link and copy it manually.');
    }
  };

  return (
    <div className="bg-surface border border-line rounded-lg p-4 space-y-3" key={version}>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-medium text-ink">Share tracking link</h2>
          <p className="text-xs text-grey-500 mt-0.5">
            Anyone with the link sees {asset.code}&apos;s live position until it expires. No login, nothing else.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-grey-500 font-medium">Job</label>
          <select
            value={optionKey}
            onChange={e => { setOptionKey(e.target.value); setCreated(null); }}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          >
            {options.map(o => (
              <option key={String(o.bookingId ?? 'none')} value={String(o.bookingId ?? 'none')}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-grey-500 font-medium">Expires</label>
          <div className="mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper-2 text-grey-700">
            {option ? `${clock.formatDubaiDate(option.expiresAt)} ${clock.formatDubaiTime(option.expiresAt)}` : '—'}
            {!booking && <span className="text-grey-500"> · 24 h</span>}
          </div>
        </div>
      </div>

      {hasDestination && (
        <label className="flex items-center gap-2 text-sm text-grey-700">
          <input
            type="checkbox"
            checked={showEta}
            onChange={e => setShowEta(e.target.checked)}
            className="accent-yellow"
          />
          Show arrival time (ETA) to the hirer
          <span className="text-xs text-grey-500">· to {booking?.destination?.name}</span>
        </label>
      )}

      {!created ? (
        <Button
          size="sm"
          onClick={() => {
            const result = createTrackingLink(session, {
              assetId: asset.id,
              bookingId: option?.bookingId ?? null,
              expiresAt: option?.expiresAt,
              showEta: hasDestination ? showEta : false,
            });
            if (result.ok) {
              setCreated(result.data!);
              setVersion(v => v + 1);
              onDone(result.message ?? 'Link created.');
            } else {
              onError(result.error ?? 'Could not create the link.');
            }
          }}
        >
          Create
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-[16rem] px-3 py-2 text-xs rounded-lg border border-line bg-paper-2 text-grey-700 break-all">{linkUrl}</code>
            <Button size="sm" onClick={copy}>Copy</Button>
            <a
              className="text-xs text-yellow-600 hover:text-yellow font-medium px-2"
              href={`/t/${created.token}`}
              target="_blank"
              rel="noreferrer"
            >
              Open
            </a>
          </div>
          <div className="text-xs text-grey-500">
            Suggested message: <span className="text-grey-700">Track {asset.code} live: {linkUrl}</span>
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-line">
        <div className="text-xs font-medium text-grey-500 mb-1">Active links ({active.length})</div>
        {active.length === 0 ? (
          <div className="text-xs text-grey-500">No active links for {asset.code}.</div>
        ) : (
          <div className="space-y-1">
            {active.map(link => (
              <div key={link.id} className="flex items-center justify-between gap-2 text-xs text-grey-700">
                <span>
                  {link.bookingId ? seed.bookings.find(b => b.id === link.bookingId)?.reference ?? 'Job' : 'No job'}
                  {' · '}
                  {seed.users.find(u => u.id === link.createdBy)?.name ?? 'Kasper'}
                  {' · '}created {clock.formatDubaiDate(Number(new Date(link.createdAt)))}
                  {' · '}expires {clock.formatDubaiDate(Number(new Date(link.expiresAt)))}
                </span>
                <button
                  className="px-2 py-0.5 rounded bg-paper border border-line hover:border-ink"
                  onClick={() => {
                    const result = revokeTrackingLink(session, link.id, 'manual');
                    if (result.ok) { onDone(result.message ?? 'Link revoked.'); setVersion(v => v + 1); }
                    else onError(result.error ?? 'Could not revoke the link.');
                  }}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div className="pt-2 border-t border-line">
          <div className="text-xs font-medium text-grey-500 mb-1">Past links ({past.length})</div>
          <div className="space-y-1">
            {past.map(link => (
              <div key={link.id} className="text-xs text-grey-500">
                {clock.formatDubaiDate(Number(new Date(link.createdAt)))}
                {' · '}{link.bookingId ? seed.bookings.find(b => b.id === link.bookingId)?.reference ?? 'Job' : 'No job'}
                {' · '}{linkEndWords(link)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


type TabId = 'overview' | 'history' | 'trips' | 'engine' | 'driving' | 'utilisation' | 'certificates' | 'maintenance' | 'alerts';

export default function AssetDetailPage() {
  const params = useParams();
  const assetId = params.id as string;
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [breakdown, setBreakdown] = useState<EcuBreakdown | null>(null);
  const [verifyStates, setVerifyStates] = useState<Record<string, MucVerifyStatus>>({});
  const [requestNote, setRequestNote] = useState('');
  const [panel, setPanel] = useState<'share' | 'end' | 'edit' | null>(null);
  const [endReason, setEndReason] = useState('');
  const [assetVersion, setAssetVersion] = useState(0);
  const [requestVersion, setRequestVersion] = useState(0);
  const [trackerToast, setTrackerToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const asset = useMemo(() => seed.assets.find(a => a.id === assetId), [assetId]);
  const visible = useMemo(() => asset && session ? isAssetVisible(session, asset.id) : false, [asset, session]);
  const rel = useMemo(() => asset && session ? getRelationship(session, asset.id) : null, [asset, session]);
  const status = useMemo(() => asset ? computeStatus(asset) : 'no_tracker', [asset]);
  const reading = useMemo(() => asset ? getReadingForAsset(asset) : null, [asset]);

  const site = useMemo(() => asset ? seed.sites.find(s => s.id === asset.homeSiteId) : null, [asset]);
  const ownerTenant = useMemo(() => asset ? seed.tenants.find(t => t.id === asset.ownerTenantId) : null, [asset]);

  const currentBooking = useMemo(() => {
    if (!asset || !session) return null;
    return seed.bookings.find(b => b.assetId === asset.id && b.status === 'active');
    // assetVersion busts the memo after a link or rental change
  }, [asset, session, assetVersion]);

  const upcomingBooking = useMemo(() => {
    if (!asset || !session) return null;
    return seed.bookings.find(b => b.assetId === asset.id && b.status === 'scheduled');
  }, [asset, session]);

  const recentBookings = useMemo(() => {
    if (!asset) return [];
    return seed.bookings
      .filter(b => b.assetId === asset.id && (b.status === 'closed' || b.status === 'cancelled'))
      .sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime())
      .slice(0, 3);
  }, [asset]);

  const renterBooking = useMemo(() => {
    if (!asset || !session) return null;
    return seed.bookings.find(b => b.assetId === asset.id && b.renterTenantId === session.tenantId);
  }, [asset, session]);

  const mucs = useMemo(() => (asset ? getMucsForAsset(asset.id) : []), [asset]);

  const openRequest = useMemo(
    () => (asset && hasOpenTrackerRequest(asset.id) ? trackerRequestForAsset(asset.id) : null),
    [asset, requestVersion]
  );

  const showAssetToast = (kind: 'ok' | 'error', text: string) => setTrackerToast({ kind, text });
  const refreshAsset = () => setAssetVersion(v => v + 1);

  const submitTrackerRequest = () => {
    if (!asset) return;
    const result = requestTracker(session!, asset.id, requestNote);
    if (result.ok) {
      setTrackerToast({ kind: 'ok', text: result.message ?? 'Tracker requested.' });
      setRequestNote('');
      setRequestVersion(v => v + 1);
    } else {
      setTrackerToast({ kind: 'error', text: result.error ?? 'Could not send the request.' });
    }
  };

  // Utilisation is a heavy simulation, so it only runs when its tab is opened.
  const utilisationOpen = activeTab === 'utilisation';
  React.useEffect(() => {
    if (!asset || !utilisationOpen) return;
    let cancelled = false;
    const to = clock.now();
    const from = to - 7 * 86400000;
    const next = buildEcuBreakdown(asset, from, to);
    if (!cancelled) setBreakdown(next);
    return () => { cancelled = true; };
  }, [asset, utilisationOpen]);

  // Seal checks are async (webcrypto), so they run once per asset.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, MucVerifyStatus> = {};
      for (const m of mucs) next[m.id] = await getMucVerifyStatus(m);
      if (!cancelled) setVerifyStates(next);
    })();
    return () => { cancelled = true; };
  }, [mucs]);

  if (!session) return null;
  if (!asset) return (
    <div className="flex items-center justify-center h-[400px]">
      <div className="text-sm text-grey-500">Asset not found</div>
    </div>
  );
  if (!visible) return (
    <div className="flex items-center justify-center h-[400px]">
      <div className="text-sm text-grey-500">Asset not found</div>
    </div>
  );

  const tier = asset.canProfile.adapter === 'ALL-CAN300' ? 3 : asset.canProfile.adapter === 'LVCAN200' ? 2 : 1;
  const isTier1 = tier === 1;
  const canEdit = hasCapability(session, 'asset.edit');
  const canShare = hasCapability(session, 'link.create');
  const canEndAccess = hasCapability(session, 'grant.endEarly');
  const canRequestTracker = hasCapability(session, 'tracker.request')
    && (session.isKasper || asset.ownerTenantId === session.tenantId);

  // Maintenance plans belong to the owner: renters never see them (spec 11.18).
  const isOwnerOrKasper = session.isKasper || asset.ownerTenantId === session.tenantId;
  const canManageMaintenancePlans = canManageMaintenance(session);
  const maintenancePlans = isOwnerOrKasper ? plansForAsset(session, asset.id) : [];
  const maintenanceRecords = isOwnerOrKasper ? serviceHistory(session, asset.id) : [];

  const tabs: { id: TabId; label: string; phase: 'day_one' | 'phase2' | 'later'; enabled: boolean }[] = [
    { id: 'overview', label: 'Overview', phase: 'day_one', enabled: true },
    { id: 'history', label: 'History', phase: 'day_one', enabled: true },
    { id: 'trips', label: 'Trips', phase: 'day_one', enabled: true },
    { id: 'engine', label: 'Engine & fuel', phase: 'phase2', enabled: !isTier1 && phase !== 'day_one' },
    { id: 'driving', label: 'Driving', phase: 'phase2', enabled: phase !== 'day_one' },
    { id: 'utilisation', label: 'Utilisation', phase: 'phase2', enabled: phase !== 'day_one' },
    { id: 'certificates', label: 'Certificates', phase: 'later', enabled: hasFeature(asset, 'muc') && phase !== 'day_one' },
    { id: 'maintenance', label: 'Maintenance', phase: 'later', enabled: phase === 'later' && isOwnerOrKasper },
    { id: 'alerts', label: 'Alerts', phase: 'day_one', enabled: true },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-ink">{asset.code}</span>
            <span className="text-sm text-grey-500">— {asset.name}</span>
            {rel === 'renter' && <Badge variant="yellow">Rented</Badge>}
          </div>
          <div className="text-sm text-grey-500 mt-1">
            {asset.make} {asset.model} · {asset.year} · {asset.plateOrSerial}
          </div>
          <div className="text-sm text-grey-500">
            {site?.name} · {ownerTenant?.name}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <TierChip tier={tier} />
        </div>
      </div>

      {/* Last updated */}
      <div className="text-sm text-grey-500">
        Last updated {reading ? clock.formatDubaiTime(new Date(reading.deviceTime).getTime()) : '—'}{' '}
        {reading ? `· ${clock.minutesSinceDubai(new Date(reading.deviceTime).getTime())} min ago` : ''}
        {reading && (
          <span className="hover:text-ink cursor-help" title={`Device time: ${reading.deviceTime}\nReceived: ${reading.receivedAt}`}>
            (hover for details)
          </span>
        )}
      </div>

      {/* Rental strip */}
      <div className="bg-surface border border-line rounded-lg p-4">
        {rel === 'owner' && (
          <div className="text-sm">
            {currentBooking ? (
              <div>
                <div className="font-medium text-ink">Current rental</div>
                <div className="text-grey-700 mt-1">
                  Rented to {seed.tenants.find(t => t.id === currentBooking.renterTenantId)?.name} ·
                  {currentBooking.destination?.name ?? 'No destination'} ·
                  until {clock.formatDubaiDate(new Date(currentBooking.end).getTime())} {clock.formatDubaiTime(new Date(currentBooking.end).getTime())}
                </div>
              </div>
            ) : upcomingBooking ? (
              <div>
                <div className="font-medium text-ink">Upcoming rental</div>
                <div className="text-grey-700 mt-1">
                  Rented to {seed.tenants.find(t => t.id === upcomingBooking.renterTenantId)?.name} ·
                  from {clock.formatDubaiDate(new Date(upcomingBooking.start).getTime())} {clock.formatDubaiTime(new Date(upcomingBooking.start).getTime())}
                </div>
              </div>
            ) : (
              <div className="text-grey-500">No active or upcoming rentals</div>
            )}
            {recentBookings.length > 0 && (
              <div className="mt-3 pt-3 border-t border-line">
                <div className="font-medium text-ink text-sm">Recent rentals</div>
                {recentBookings.map(b => (
                  <div key={b.id} className="text-grey-700 text-sm mt-1">
                    {b.status === 'closed' ? 'Rented to' : 'Cancelled'} {seed.tenants.find(t => t.id === b.renterTenantId)?.name} ·
                    {clock.formatDubaiDate(new Date(b.start).getTime())} – {clock.formatDubaiDate(new Date(b.end).getTime())}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {rel === 'renter' && renterBooking && (
          <div className="text-sm">
            <div className="font-medium text-ink">Your rental</div>
            <div className="text-grey-700 mt-1">
              Rented from {ownerTenant?.name} until {clock.formatDubaiDate(new Date(renterBooking.end).getTime())} {clock.formatDubaiTime(new Date(renterBooking.end).getTime())}
            </div>
            <div className="text-grey-500 mt-1">
              History starts {clock.formatDubaiDate(new Date(renterBooking.start).getTime())} {clock.formatDubaiTime(new Date(renterBooking.start).getTime())}
            </div>
          </div>
        )}
        {rel === 'kasper' && (
          <div className="text-sm text-grey-700">
            Kasper view · Owner: {ownerTenant?.name} · Current rental:{' '}
            {currentBooking ? seed.tenants.find(t => t.id === currentBooking.renterTenantId)?.name : 'None'}
          </div>
        )}
      </div>

      {/* Actions */}
      {(canEdit || canShare || canEndAccess) && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={() => setPanel(panel === 'edit' ? null : 'edit')}>
                Edit asset
              </Button>
            )}
            {canShare && (
              <Button variant="secondary" size="sm" onClick={() => setPanel(panel === 'share' ? null : 'share')}>
                Share tracking link
              </Button>
            )}
            {canEndAccess && rel === 'owner' && currentBooking && (
              <Button variant="danger" size="sm" onClick={() => { setPanel(panel === 'end' ? null : 'end'); setEndReason(''); }}>
                End access now
              </Button>
            )}
            <a
              className="inline-flex items-center text-xs px-2.5 py-1.5 rounded-md bg-paper-2 text-ink border border-line hover:bg-paper hover:border-grey-500 font-medium"
              href="/app/reports"
            >
              Run report
            </a>
          </div>

          {panel === 'share' && (
            <SharePanel asset={asset} onClose={() => setPanel(null)} onDone={message => { showAssetToast('ok', message); setPanel(null); refreshAsset(); }} onError={message => showAssetToast('error', message)} />
          )}

          {panel === 'end' && currentBooking && (
            <div className="bg-surface border border-red/30 rounded-lg p-4">
              <h2 className="text-sm font-medium text-ink mb-1">
                End {seed.tenants.find(t => t.id === currentBooking.renterTenantId)?.name ?? 'the hirer'}&apos;s access now
              </h2>
              <p className="text-xs text-grey-500 mb-2">
                The rental is cut short now: the override is saved, the job&apos;s tracking links are revoked and the cut-off is audited.
                It is not undone by the nightly check.
              </p>
              <input
                type="text"
                value={endReason}
                onChange={e => setEndReason(e.target.value)}
                placeholder="Reason (at least 10 characters)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              />
              <div className="flex gap-2 mt-3">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    const result = endEarly(session, currentBooking.id, endReason);
                    if (result.ok) {
                      showAssetToast('ok', result.message ?? 'Access ended.');
                      setPanel(null);
                      refreshAsset();
                    } else {
                      showAssetToast('error', result.error ?? 'Could not end access.');
                    }
                  }}
                >
                  End {seed.tenants.find(t => t.id === currentBooking.renterTenantId)?.name ?? 'the hirer'}&apos;s access now
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPanel(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-line">
        <div className="flex gap-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => tab.enabled && setActiveTab(tab.id)}
              disabled={!tab.enabled}
              className={clsx(
                'text-sm font-medium transition-colors pb-2 border-b-2',
                activeTab === tab.id
                  ? 'text-ink border-yellow'
                  : tab.enabled
                  ? 'text-grey-500 hover:text-ink border-transparent'
                  : 'text-grey-300 border-transparent cursor-not-allowed'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {trackerToast && (
        <div
          className={
            trackerToast.kind === 'ok'
              ? 'bg-green/10 border border-green/30 text-green text-sm px-4 py-2 rounded-lg'
              : 'bg-red/10 border border-red/30 text-red text-sm px-4 py-2 rounded-lg'
          }
        >
          {trackerToast.text}
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Mini map */}
          <div className="rounded-xl border border-line bg-paper h-[240px]">
            {reading ? (
              <MapContainer
                center={[reading.lat, reading.lng]}
                zoom={14}
                scrollWheelZoom={false}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[reading.lat, reading.lng]} icon={createMarkerIcon(status)}>
                  <Popup>
                    <div className="text-left">
                      <div className="text-sm font-semibold text-ink">{asset.code}</div>
                      <div className="text-xs text-grey-500">{status}</div>
                      <div className="text-xs text-grey-500 mt-1">
                        {clock.formatDubaiTime(new Date(reading.deviceTime).getTime())}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </MapContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-sm text-grey-500">No location data yet</div>
              </div>
            )}
          </div>

          {/* Status info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface border border-line rounded-lg p-4">
              <div className="text-xs text-grey-500 font-medium uppercase">Status</div>
              <div className="text-lg font-semibold text-ink mt-1 capitalize">{status}</div>
              {status === 'offline' && (
                <div className="text-xs text-red mt-1">
                  Offline since {reading ? clock.formatDubaiTime(new Date(reading.deviceTime).getTime()) : '—'}
                </div>
              )}
            </div>
            <div className="bg-surface border border-line rounded-lg p-4">
              <div className="text-xs text-grey-500 font-medium uppercase">Speed</div>
              <div className="text-lg font-semibold text-ink mt-1 font-mono">
                {reading ? `${reading.speedKmh} km/h` : '—'}
              </div>
            </div>
            <div className="bg-surface border border-line rounded-lg p-4">
              <div className="text-xs text-grey-500 font-medium uppercase">Ignition</div>
              <div className="text-lg font-semibold mt-1">
                {reading ? (reading.ignition ? 'On' : 'Off') : '—'}
              </div>
            </div>
            <div className="bg-surface border border-line rounded-lg p-4">
              <div className="text-xs text-grey-500 font-medium uppercase">Battery</div>
              <div className="text-lg font-semibold mt-1 font-mono">
                {reading ? `${reading.intBattery.toFixed(1)} V` : '—'}
              </div>
            </div>
          </div>

          {/* CAN tiles (only for Tier 2+) */}
          {!isTier1 && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-surface border border-line rounded-lg p-4">
                <div className="text-xs text-grey-500 font-medium uppercase">Engine hours</div>
                <div className="text-lg font-semibold text-ink mt-1 font-mono">
                  {reading ? `${reading.gnssOdometerKm.toFixed(1)} km` : '—'}
                </div>
                <div className="text-xs text-grey-500 mt-1">ECU · today</div>
              </div>
              <div className="bg-surface border border-line rounded-lg p-4">
                <div className="text-xs text-grey-500 font-medium uppercase">Fuel level</div>
                <div className="text-lg font-semibold text-ink mt-1 font-mono">
                  {asset.canProfile.supported.includes('fuelLevel') && reading?.fuelLevelPct !== undefined
                    ? `${reading.fuelLevelPct.toFixed(0)}%`
                    : 'Not measured'}
                </div>
                <div className="text-xs text-grey-500 mt-1">
                  {asset.canProfile.supported.includes('fuelLevel') ? 'Fuel gauge' : 'Not available'}
                </div>
              </div>
              <div className="bg-surface border border-line rounded-lg p-4">
                <div className="text-xs text-grey-500 font-medium uppercase">Engine RPM</div>
                <div className="text-lg font-semibold text-ink mt-1 font-mono">
                  {asset.canProfile.supported.includes('rpm') && reading?.fuelRateLph !== undefined
                    ? `${Math.floor(Math.random() * 3000)} rpm`
                    : 'Not measured'}
                </div>
                <div className="text-xs text-grey-500 mt-1">
                  {asset.canProfile.supported.includes('rpm') ? 'Live value' : 'Not available'}
                </div>
              </div>
            </div>
          )}

          {/* No tracker state */}
          {status === 'no_tracker' && (
            <div className="bg-surface border border-line rounded-lg p-4">
              {openRequest ? (
                <div className="text-center">
                  <div className="text-sm text-grey-500">No tracker fitted</div>
                  <div className="text-xs text-grey-500 mt-1">
                    Tracker requested {clock.formatDubaiDate(typeof openRequest.at === 'number' ? openRequest.at : new Date(openRequest.at).getTime())} — Kasper will follow up.
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <div className="text-sm text-grey-500">No tracker fitted</div>
                    <div className="text-xs text-grey-500 mt-1">
                      {canRequestTracker
                        ? 'Request a tracker and Kasper will confirm a fitting time.'
                        : 'This asset has no tracker. Contact Kasper to fit one.'}
                    </div>
                  </div>
                  {canRequestTracker && (
                    <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
                      <input
                        type="text"
                        value={requestNote}
                        onChange={e => setRequestNote(e.target.value)}
                        placeholder="Optional note for Kasper"
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                      />
                      <Button size="sm" onClick={submitTrackerRequest}>Request a tracker</Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-surface border border-line rounded-lg p-4">
            <div className="text-sm font-medium text-ink mb-3">Positions</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">Time</th>
                    <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">Speed</th>
                    <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">Ignition</th>
                    <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">Heading</th>
                    {asset.canProfile.supported.includes('fuelLevel') && (
                      <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">Fuel %</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {reading ? (
                    <tr className="border-b border-line">
                      <td className="px-3 py-2 font-mono text-xs">
                        {clock.formatDubaiTime(new Date(reading.deviceTime).getTime())}
                      </td>
                      <td className="px-3 py-2 font-mono">{reading.speedKmh} km/h</td>
                      <td className="px-3 py-2">{reading.ignition ? 'On' : 'Off'}</td>
                      <td className="px-3 py-2 font-mono">{reading.heading}°</td>
                      {asset.canProfile.supported.includes('fuelLevel') && (
                        <td className="px-3 py-2 font-mono">
                          {reading.fuelLevelPct !== undefined ? `${reading.fuelLevelPct.toFixed(0)}%` : '—'}
                        </td>
                      )}
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-grey-500">No data</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'trips' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="text-sm font-medium text-ink mb-3">Trips</div>
          <div className="text-sm text-grey-500">
            No trips recorded yet. Trips start when ignition is on and speed exceeds 3 km/h.
          </div>
        </div>
      )}

      {activeTab === 'engine' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="text-sm font-medium text-ink mb-3">Engine & fuel</div>
          {isTier1 ? (
            <div className="text-sm text-grey-500">
              Tier 1 assets don't have CAN data available.
            </div>
          ) : (
            <div className="text-sm text-grey-500">
              Engine & fuel data for this asset.
            </div>
          )}
        </div>
      )}

      {activeTab === 'driving' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="text-sm font-medium text-ink mb-3">Driving events</div>
          <div className="text-sm text-grey-500">
            No driving events recorded yet.
          </div>
        </div>
      )}

      {activeTab === 'utilisation' && (
        <div className="space-y-4">
          {hasFeature(asset, 'muc') ? (
            <>
              <div className="bg-surface border border-line rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-ink">ECU engine hours</div>
                  <div className="font-mono text-lg text-ink">{ecuHoursAt(asset, clock.now()).toFixed(1)} h</div>
                </div>
                <div className="text-xs text-grey-500 mt-1">
                  Meter reading from the ECU. Monthly Utilisation Certificates are sealed from this meter.
                </div>
              </div>
              <div className="bg-surface border border-line rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-line text-sm font-medium text-ink">
                  Last 7 days
                </div>
                {!breakdown ? (
                  <div className="p-4 text-sm text-grey-500">Reading the ECU…</div>
                ) : breakdown.days.length === 0 ? (
                  <div className="p-4 text-sm text-grey-500">No engine data in this window.</div>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-paper-2 text-grey-500">
                        <th className="px-3 py-2 text-left font-medium">Day</th>
                        <th className="px-3 py-2 text-right font-medium">Engine (h)</th>
                        <th className="px-3 py-2 text-right font-medium">Working (h)</th>
                        <th className="px-3 py-2 text-right font-medium">Idling (h)</th>
                        <th className="px-3 py-2 text-right font-medium">Gap (min)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.days.map(d => (
                        <tr key={d.date} className="bg-paper hover:bg-paper-2">
                          <td className="px-3 py-2 border-b border-line text-grey-700">{d.date}</td>
                          <td className="px-3 py-2 border-b border-line text-right font-mono text-ink">{d.engineHours.toFixed(1)}</td>
                          <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">{d.workingHours.toFixed(1)}</td>
                          <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">{d.idlingHours.toFixed(1)}</td>
                          <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-500">{d.gapMinutes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className="bg-surface border border-line rounded-lg p-4">
              <div className="text-sm font-medium text-ink mb-3">Utilisation</div>
              <div className="text-sm text-grey-500">
                Last 7 days utilisation for this asset.
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'certificates' && (
        <div className="space-y-3">
          <div className="bg-surface border border-line rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-line flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Monthly Utilisation Certificates</span>
              <a className="text-xs text-yellow-600 hover:text-yellow font-medium" href="/app/certificates">
                Open certificates
              </a>
            </div>
            {mucs.length === 0 ? (
              <div className="p-6 text-center text-sm text-grey-500">
                No certificates for {asset.code} yet.
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-paper-2 text-grey-500">
                    <th className="px-3 py-2 text-left font-medium">Certificate</th>
                    <th className="px-3 py-2 text-left font-medium">Period</th>
                    <th className="px-3 py-2 text-right font-medium">Billable hours</th>
                    <th className="px-3 py-2 text-center font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Verify</th>
                  </tr>
                </thead>
                <tbody>
                  {mucs.map(m => (
                    <tr key={m.id} className="bg-paper hover:bg-paper-2">
                      <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{m.number}</td>
                      <td className="px-3 py-2 border-b border-line text-grey-500">
                        {clock.formatDubaiDate(typeof m.periodFrom === 'number' ? m.periodFrom : new Date(m.periodFrom).getTime())}
                        {' – '}
                        {clock.formatDubaiDate(typeof m.periodTo === 'number' ? m.periodTo : new Date(m.periodTo).getTime())}
                      </td>
                      <td className="px-3 py-2 border-b border-line text-right font-mono text-ink">
                        {m.payload.billableHours.toFixed(1)} h
                      </td>
                      <td className="px-3 py-2 border-b border-line text-center">
                        {verifyStates[m.id] === 'tampered' ? (
                          <Badge variant="red">Seal broken</Badge>
                        ) : m.status === 'sealed' ? (
                          <Badge variant="green">Sealed</Badge>
                        ) : (
                          <Badge variant="yellow">Voided</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-line text-right">
                        <a
                          className="text-xs text-yellow-600 hover:text-yellow font-medium"
                          href={`/verify/${encodeURIComponent(m.number)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Verify
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'maintenance' && (
        <div className="space-y-3">
          <div className="bg-surface border border-line rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-line flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Service plans</span>
              <a className="text-xs text-yellow-600 hover:text-yellow font-medium" href="/app/maintenance">
                Open the maintenance board
              </a>
            </div>
            {maintenancePlans.length === 0 ? (
              <div className="p-6 text-center text-sm text-grey-500">
                No service plans for {asset.code} yet.
                {canManageMaintenancePlans ? ' Add one from the maintenance board.' : ''}
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-paper-2 text-grey-500">
                    <th className="px-3 py-2 text-left font-medium">Plan</th>
                    <th className="px-3 py-2 text-left font-medium">Due</th>
                    <th className="px-3 py-2 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenancePlans.map(p => {
                    const snapshot = planSnapshot(p, asset);
                    return (
                      <tr key={p.id} className="bg-paper hover:bg-paper-2">
                        <td className="px-3 py-2 border-b border-line text-grey-700">{p.name}</td>
                        <td className="px-3 py-2 border-b border-line text-grey-700">
                          {snapshot.headline}
                          {snapshot.onHire && <span className="text-grey-500"> · {snapshot.onHire}</span>}
                        </td>
                        <td className="px-3 py-2 border-b border-line text-center">
                          {snapshot.state === 'overdue' ? (
                            <Badge variant="red">Overdue</Badge>
                          ) : snapshot.state === 'due_soon' ? (
                            <Badge variant="amber">Due soon</Badge>
                          ) : (
                            <Badge variant="green">Ok</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-surface border border-line rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-line text-sm font-medium text-ink">Service history</div>
            {maintenanceRecords.length === 0 ? (
              <div className="p-6 text-center text-sm text-grey-500">No services logged for {asset.code} yet.</div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-paper-2 text-grey-500">
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-right font-medium">Reading</th>
                    <th className="px-3 py-2 text-left font-medium">Notes</th>
                    <th className="px-3 py-2 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenanceRecords.map(r => (
                    <tr key={r.id} className="bg-paper hover:bg-paper-2">
                      <td className="px-3 py-2 border-b border-line text-grey-700">
                        {clock.formatDubaiDate(new Date(r.doneAt).getTime())}
                      </td>
                      <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">
                        {r.value.toLocaleString('en-US')}
                      </td>
                      <td className="px-3 py-2 border-b border-line text-grey-700">{r.notes}</td>
                      <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">
                        AED {r.costAed.toLocaleString('en-US')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="text-sm font-medium text-ink mb-3">Alerts</div>
          <div className="text-sm text-grey-500">
            No alerts for this asset.
          </div>
        </div>
      )}
    </div>
  );
}
