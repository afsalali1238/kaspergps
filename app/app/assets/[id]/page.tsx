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
import { useDb, isAssetVisible, getRelationship, getReadingForAsset, getReadingsForAsset, computeStatus, detectTrips, visibleAlerts, acknowledgeAlert, buildEcuBreakdown, ecuHoursAt, getMucsForAsset, getMucVerifyStatus, hasOpenTrackerRequest, requestTracker, trackerRequestForAsset, activeLinksForAsset, createTrackingLink, expiryOptions, linkEndWords, pastLinksForAsset, revokeTrackingLink, endEarly, type EcuBreakdown, type MucVerifyStatus, canManageMaintenance, planSnapshot, plansForAsset, serviceHistory, can } from '@/server/api';
import * as clock from '@/lib/clock';
import type { Asset, TrackingLink } from '@/domain/types';
import { hasFeature } from '@/domain/features';
import { useT, useHref } from '@/i18n';
import { useSession, useSwitches } from '@/hooks';

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
  const seed = useDb(s => s);
  const session = useSession()!;
  const t = useT();
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
      onDone(t('asset_detail.share.copied', 'Link copied to the clipboard.'));
    } catch {
      onError(t('asset_detail.share.copy_blocked', 'Copy blocked by the browser — select the link and copy it manually.'));
    }
  };

  return (
    <div className="bg-surface border border-line rounded-lg p-4 space-y-3" key={version}>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-medium text-ink">{t('asset_detail.share.title', 'Share tracking link')}</h2>
          <p className="text-xs text-grey-500 mt-0.5">
            {t('asset_detail.share.body', 'Anyone with the link sees {code} live position until it expires. No login, nothing else.', { code: asset.code })}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>{t('common.close', 'Close')}</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-grey-500 font-medium">{t('asset_detail.share.job', 'Job')}</label>
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
          <label className="text-xs text-grey-500 font-medium">{t('asset_detail.share.expires', 'Expires')}</label>
          <div className="mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper-2 text-grey-700">
            {option ? `${clock.formatDubaiDate(option.expiresAt)} ${clock.formatDubaiTime(option.expiresAt)}` : '—'}
            {!booking && <span className="text-grey-500"> · {t('asset_detail.share.hours_24', '24 h')}</span>}
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
          {t('asset_detail.share.eta_switch', 'Show arrival time (ETA) to the hirer')}
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
              onDone(result.message ?? t('asset_detail.share.link_created', 'Link created.'));
            } else {
              onError(result.error ?? t('asset_detail.share.link_failed', 'Could not create the link.'));
            }
          }}
        >
          {t('asset_detail.share.create', 'Create')}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-[16rem] px-3 py-2 text-xs rounded-lg border border-line bg-paper-2 text-grey-700 break-all">{linkUrl}</code>
            <Button size="sm" onClick={copy}>{t('common.copy', 'Copy')}</Button>
            <a
              className="text-xs text-yellow-600 hover:text-yellow font-medium px-2"
              href={`/t/${created.token}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('common.open', 'Open')}
            </a>
          </div>
          <div className="text-xs text-grey-500">
            {t('asset_detail.share.suggested_label', 'Suggested message:')} <span className="text-grey-700">{t('asset_detail.share.suggested', 'Track {code} live: {link}', { code: asset.code, link: linkUrl })}</span>
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-line">
        <div className="text-xs font-medium text-grey-500 mb-1">{t('asset_detail.share.active_links', 'Active links ({count})', { count: active.length })}</div>
        {active.length === 0 ? (
          <div className="text-xs text-grey-500">{t('asset_detail.share.no_active_links', 'No active links for {code}.', { code: asset.code })}</div>
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
                    if (result.ok) { onDone(result.message ?? t('asset_detail.share.link_revoked', 'Link revoked.')); setVersion(v => v + 1); }
                    else onError(result.error ?? t('asset_detail.share.revoke_failed', 'Could not revoke the link.'));
                  }}
                >
                  {t('asset_detail.share.revoke', 'Revoke')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div className="pt-2 border-t border-line">
          <div className="text-xs font-medium text-grey-500 mb-1">{t('asset_detail.share.past_links', 'Past links ({count})', { count: past.length })}</div>
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
  const seed = useDb(s => s);
  const t = useT();
  const href = useHref();
  const params = useParams();
  const assetId = params.id as string;
  const session = useSession();
  const { phase } = useSwitches();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [breakdown, setBreakdown] = useState<EcuBreakdown | null>(null);
  const [verifyStates, setVerifyStates] = useState<Record<string, MucVerifyStatus>>({});
  const [requestNote, setRequestNote] = useState('');
  const [panel, setPanel] = useState<'share' | 'end' | 'edit' | null>(null);
  const [endReason, setEndReason] = useState('');
  const [assetVersion, setAssetVersion] = useState(0);
  const [requestVersion, setRequestVersion] = useState(0);
  const [trackerToast, setTrackerToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const asset = useMemo(() => seed.assets.find(a => a.id === assetId), [seed.assets, assetId]);
  const visible = useMemo(() => asset && session ? isAssetVisible(session, asset.id) : false, [asset, session]);
  const rel = useMemo(() => asset && session ? getRelationship(session, asset.id) : null, [asset, session]);
  const status = useMemo(() => asset ? computeStatus(asset) : 'no_tracker', [asset]);
  const reading = useMemo(() => asset ? getReadingForAsset(asset) : null, [asset]);

  // Real telemetry-backed tab data (never fabricated).
  const historyRows = useMemo(() => {
    if (!asset) return [];
    const end = clock.now();
    return getReadingsForAsset(asset, end - 24 * 3600_000, end).slice(-24);
  }, [asset]);

  const recentTrips = useMemo(() => {
    if (!asset) return [];
    return detectTrips(asset, clock.now() - 7 * 86_400_000, clock.now()).slice(-5);
  }, [asset]);

  const assetAlerts = useMemo(
    () => (session && asset ? visibleAlerts(session, phase).filter(a => a.assetId === asset.id) : []),
    [session, phase, asset, requestVersion]
  );

  const drivingEvents = useMemo(
    () => assetAlerts.filter(a => a.type === 'overspeed' || a.type === 'harsh_driving'),
    [assetAlerts]
  );

  const canAcknowledgeAlerts = session ? can(session, 'alert.acknowledge', asset?.id) : false;

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
      <div className="text-sm text-grey-500">{t('asset_detail.not_found', 'Asset not found')}</div>
    </div>
  );
  if (!visible) return (
    <div className="flex items-center justify-center h-[400px]">
      <div className="text-sm text-grey-500">{t('asset_detail.not_found', 'Asset not found')}</div>
    </div>
  );

  const tier = asset.canProfile.adapter === 'ALL-CAN300' ? 3 : asset.canProfile.adapter === 'LVCAN200' ? 2 : 1;
  const isTier1 = tier === 1;
  const canEdit = can(session, 'asset.edit', asset.id);
  const canShare = can(session, 'link.create', asset.id);
  const canEndAccess = can(session, 'grant.endEarly', asset.id);
  const canRequestTracker = can(session, 'tracker.request', asset.id);
  const canRunReport = can(session, 'report.run', asset.id);

  // Maintenance plans belong to the owner: renters never see them (spec 11.18).
  const isOwnerOrKasper = can(session, 'maintenance.view', asset.id);
  const canManageMaintenancePlans = canManageMaintenance(session, asset.id);
  const maintenancePlans = isOwnerOrKasper ? plansForAsset(session, asset.id) : [];
  const maintenanceRecords = isOwnerOrKasper ? serviceHistory(session, asset.id) : [];

  const tabs: { id: TabId; key: string; label: string; phase: 'day_one' | 'phase2' | 'later'; enabled: boolean }[] = [
    { id: 'overview', key: 'asset_detail.tabs.overview', label: 'Overview', phase: 'day_one', enabled: true },
    { id: 'history', key: 'asset_detail.tabs.history', label: 'History', phase: 'day_one', enabled: true },
    { id: 'trips', key: 'asset_detail.tabs.trips', label: 'Trips', phase: 'day_one', enabled: true },
    { id: 'engine', key: 'asset_detail.tabs.engine_fuel', label: 'Engine & fuel', phase: 'phase2', enabled: !isTier1 && phase !== 'day_one' },
    { id: 'driving', key: 'asset_detail.tabs.driving', label: 'Driving', phase: 'phase2', enabled: phase !== 'day_one' },
    { id: 'utilisation', key: 'asset_detail.tabs.utilisation', label: 'Utilisation', phase: 'phase2', enabled: phase !== 'day_one' },
    { id: 'certificates', key: 'asset_detail.tabs.certificates', label: 'Certificates', phase: 'later', enabled: hasFeature(asset, 'muc') && phase !== 'day_one' },
    { id: 'maintenance', key: 'asset_detail.tabs.maintenance', label: 'Maintenance', phase: 'later', enabled: phase === 'later' && isOwnerOrKasper },
    { id: 'alerts', key: 'asset_detail.tabs.alerts', label: 'Alerts', phase: 'day_one', enabled: true },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-ink">{asset.code}</span>
            <span className="text-sm text-grey-500">— {asset.name}</span>
            {rel === 'renter' && <Badge variant="yellow">{t('common.status.rented', 'Rented')}</Badge>}
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
        {t('asset_detail.last_updated', 'Last updated {time}', { time: reading ? clock.formatDubaiTime(new Date(reading.deviceTime).getTime()) : '—' })}{' '}
        {reading ? `· ${clock.minutesSinceDubai(new Date(reading.deviceTime).getTime())} ${t('common.minutes_short', 'min ago')}` : ''}
        {reading && (
          <span className="hover:text-ink cursor-help" title={`Device time: ${reading.deviceTime}\nReceived: ${reading.receivedAt}`}>
            {t('asset_detail.hover_details', '(hover for details)')}
          </span>
        )}
      </div>

      {/* Rental strip */}
      <div className="bg-surface border border-line rounded-lg p-4">
        {rel === 'owner' && (
          <div className="text-sm">
            {currentBooking ? (
              <div>
                <div className="font-medium text-ink">{t('asset_detail.rental_strip.current', 'Current rental')}</div>
                <div className="text-grey-700 mt-1">
                  {t('asset_detail.rental_strip.rented_to_prefix', 'Rented to')} {seed.tenants.find(x => x.id === currentBooking.renterTenantId)?.name} ·
                  {currentBooking.destination?.name ?? t('asset_detail.rental_strip.no_destination', 'No destination')} ·
                  until {clock.formatDubaiDate(new Date(currentBooking.end).getTime())} {clock.formatDubaiTime(new Date(currentBooking.end).getTime())}
                </div>
              </div>
            ) : upcomingBooking ? (
              <div>
                <div className="font-medium text-ink">{t('asset_detail.rental_strip.upcoming', 'Upcoming rental')}</div>
                <div className="text-grey-700 mt-1">
                  {t('asset_detail.rental_strip.rented_to_prefix', 'Rented to')} {seed.tenants.find(x => x.id === upcomingBooking.renterTenantId)?.name} ·
                  from {clock.formatDubaiDate(new Date(upcomingBooking.start).getTime())} {clock.formatDubaiTime(new Date(upcomingBooking.start).getTime())}
                </div>
              </div>
            ) : (
              <div className="text-grey-500">{t('asset_detail.rental_strip.none', 'No active or upcoming rentals')}</div>
            )}
            {recentBookings.length > 0 && (
              <div className="mt-3 pt-3 border-t border-line">
                <div className="font-medium text-ink text-sm">{t('asset_detail.rental_strip.recent', 'Recent rentals')}</div>
                {recentBookings.map(b => (
                  <div key={b.id} className="text-grey-700 text-sm mt-1">
                    {b.status === 'closed' ? t('asset_detail.rental_strip.rented_to_prefix', 'Rented to') : t('asset_detail.rental_strip.cancelled', 'Cancelled')} {seed.tenants.find(x => x.id === b.renterTenantId)?.name} ·
                    {clock.formatDubaiDate(new Date(b.start).getTime())} – {clock.formatDubaiDate(new Date(b.end).getTime())}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {rel === 'renter' && renterBooking && (
          <div className="text-sm">
            <div className="font-medium text-ink">{t('asset_detail.rental_strip.your_rental', 'Your rental')}</div>
            <div className="text-grey-700 mt-1">
              {t('asset_detail.rental_strip.rented_from_line', 'Rented from {company} until {until}', {
                company: ownerTenant?.name ?? '',
                until: `${clock.formatDubaiDate(new Date(renterBooking.end).getTime())} ${clock.formatDubaiTime(new Date(renterBooking.end).getTime())}`,
              })}
            </div>
            <div className="text-grey-500 mt-1">
              {t('asset_detail.rental_strip.history_starts', 'History starts {from}', {
                from: `${clock.formatDubaiDate(new Date(renterBooking.start).getTime())} ${clock.formatDubaiTime(new Date(renterBooking.start).getTime())}`,
              })}
            </div>
          </div>
        )}
        {rel === 'kasper' && (
          <div className="text-sm text-grey-700">
            {t('asset_detail.rental_strip.kasper_view', 'Kasper view · Owner: {owner}', { owner: ownerTenant?.name ?? '' })} · {t('asset_detail.rental_strip.current_rental', 'Current rental:')}{' '}
            {currentBooking ? seed.tenants.find(x => x.id === currentBooking.renterTenantId)?.name : t('common.none', 'None')}
          </div>
        )}
      </div>

      {/* Actions */}
      {(canEdit || canShare || canEndAccess || canRunReport) && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={() => setPanel(panel === 'edit' ? null : 'edit')}>
                {t('asset_detail.actions.edit_asset', 'Edit asset')}
              </Button>
            )}
            {canShare && (
              <Button variant="secondary" size="sm" onClick={() => setPanel(panel === 'share' ? null : 'share')}>
                {t('asset_detail.actions.share_link', 'Share tracking link')}
              </Button>
            )}
            {canEndAccess && currentBooking && (
              <Button variant="danger" size="sm" onClick={() => { setPanel(panel === 'end' ? null : 'end'); setEndReason(''); }}>
                {t('asset_detail.actions.end_access', 'End access now')}
              </Button>
            )}
            {canRunReport && (
              <a
                className="inline-flex items-center text-xs px-2.5 py-1.5 rounded-md bg-paper-2 text-ink border border-line hover:bg-paper hover:border-grey-500 font-medium"
                href={href('/app/reports')}
              >
                {t('asset_detail.actions.run_report', 'Run report')}
              </a>
            )}
          </div>

          {panel === 'share' && (
            <SharePanel asset={asset} onClose={() => setPanel(null)} onDone={message => { showAssetToast('ok', message); setPanel(null); refreshAsset(); }} onError={message => showAssetToast('error', message)} />
          )}

          {panel === 'end' && currentBooking && (
            <div className="bg-surface border border-red/30 rounded-lg p-4">
              <h2 className="text-sm font-medium text-ink mb-1">
                {t('asset_detail.end_access.title', 'End {company} access now', { company: seed.tenants.find(x => x.id === currentBooking.renterTenantId)?.name ?? 'the hirer' })}
              </h2>
              <p className="text-xs text-grey-500 mb-2">
                {t('asset_detail.end_access.body', 'The rental is cut short now: the override is saved, the job tracking links are revoked and the cut-off is audited. It is not undone by the nightly check.')}
              </p>
              <input
                type="text"
                value={endReason}
                onChange={e => setEndReason(e.target.value)}
                placeholder={t('asset_detail.end_access.reason_label', 'Reason (at least 10 characters)')}
                className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              />
              <div className="flex gap-2 mt-3">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    const result = endEarly(session, currentBooking.id, endReason);
                    if (result.ok) {
                      showAssetToast('ok', result.message ?? t('asset_detail.end_access.done_short', 'Access ended.'));
                      setPanel(null);
                      refreshAsset();
                    } else {
                      showAssetToast('error', result.error ?? t('asset_detail.end_access.failed', 'Could not end access.'));
                    }
                  }}
                >
                  {t('asset_detail.end_access.confirm', 'End {company} access now', { company: seed.tenants.find(x => x.id === currentBooking.renterTenantId)?.name ?? 'the hirer' })}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPanel(null)}>{t('common.cancel', 'Cancel')}</Button>
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
              {t(tab.key, tab.label)}
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
                      <div className="text-xs text-grey-500">{t(`common.status.${status}`, status)}</div>
                      <div className="text-xs text-grey-500 mt-1">
                        {clock.formatDubaiTime(new Date(reading.deviceTime).getTime())}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </MapContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-sm text-grey-500">{t('asset_detail.overview.no_location', 'No location data yet')}</div>
              </div>
            )}
          </div>

          {/* Status info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface border border-line rounded-lg p-4">
              <div className="text-xs text-grey-500 font-medium uppercase">{t('asset_detail.overview.status', 'Status')}</div>
              <div className="text-lg font-semibold text-ink mt-1 capitalize">{t(`common.status.${status}`, status)}</div>
              {status === 'offline' && (
                <div className="text-xs text-red mt-1">
                  {t('asset_detail.overview.offline_since', 'Offline since {time}', { time: reading ? clock.formatDubaiTime(new Date(reading.deviceTime).getTime()) : '—' })}
                </div>
              )}
            </div>
            <div className="bg-surface border border-line rounded-lg p-4">
              <div className="text-xs text-grey-500 font-medium uppercase">{t('asset_detail.history.speed', 'Speed')}</div>
              <div className="text-lg font-semibold text-ink mt-1 font-mono">
                {reading ? `${reading.speedKmh} km/h` : '—'}
              </div>
            </div>
            <div className="bg-surface border border-line rounded-lg p-4">
              <div className="text-xs text-grey-500 font-medium uppercase">{t('asset_detail.history.ignition', 'Ignition')}</div>
              <div className="text-lg font-semibold mt-1">
                {reading ? (reading.ignition ? t('common.on', 'On') : t('common.off', 'Off')) : '—'}
              </div>
            </div>
            <div className="bg-surface border border-line rounded-lg p-4">
              <div className="text-xs text-grey-500 font-medium uppercase">{t('asset_detail.history.battery', 'Battery')}</div>
              <div className="text-lg font-semibold mt-1 font-mono">
                {reading ? `${reading.intBattery.toFixed(1)} V` : '—'}
              </div>
            </div>
          </div>

          {/* CAN tiles (only for Tier 2+) */}
          {!isTier1 && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-surface border border-line rounded-lg p-4">
                <div className="text-xs text-grey-500 font-medium uppercase">{t('asset_detail.overview.engine_hours', 'Engine hours')}</div>
                <div className="text-lg font-semibold text-ink mt-1 font-mono">
                  {`${ecuHoursAt(asset, clock.now()).toFixed(1)} h`}
                </div>
                <div className="text-xs text-grey-500 mt-1">
                  {asset.canProfile.adapter === 'ALL-CAN300'
                    ? t('asset_detail.overview.ecu_today', 'ECU · today')
                    : t('asset_detail.overview.ecu_partial', 'ECU · partial · today')}
                </div>
              </div>
              <div className="bg-surface border border-line rounded-lg p-4">
                <div className="text-xs text-grey-500 font-medium uppercase">{t('asset_detail.overview.fuel_level', 'Fuel level')}</div>
                <div className="text-lg font-semibold text-ink mt-1 font-mono">
                  {asset.canProfile.supported.includes('fuelLevel') && reading?.fuelLevelPct !== undefined
                    ? `${reading.fuelLevelPct.toFixed(0)}%`
                    : t('common.not_measured', 'Not measured')}
                </div>
                <div className="text-xs text-grey-500 mt-1">
                  {asset.canProfile.supported.includes('fuelLevel') ? t('asset_detail.overview.fuel_gauge', 'Fuel gauge') : t('common.not_available', 'Not available')}
                </div>
              </div>
              <div className="bg-surface border border-line rounded-lg p-4">
                <div className="text-xs text-grey-500 font-medium uppercase">{t('asset_detail.overview.engine_rpm', 'Engine RPM')}</div>
                <div className="text-lg font-semibold text-ink mt-1 font-mono">
                  {reading?.rpm !== undefined ? `${Math.round(reading.rpm)} rpm` : t('common.not_measured', 'Not measured')}
                </div>
                <div className="text-xs text-grey-500 mt-1">
                  {asset.canProfile.supported.includes('rpm') && reading?.rpm !== undefined
                    ? t('asset_detail.overview.live_value', 'Live value')
                    : t('common.not_available', 'Not available')}
                </div>
              </div>
            </div>
          )}

          {/* No tracker state */}
          {status === 'no_tracker' && (
            <div className="bg-surface border border-line rounded-lg p-4">
              {openRequest ? (
                <div className="text-center">
                  <div className="text-sm text-grey-500">{t('asset_detail.overview.no_tracker', 'No tracker fitted')}</div>
                  <div className="text-xs text-grey-500 mt-1">
                    {t('asset_detail.overview.tracker_requested_on', 'Tracker requested {date} — Kasper will follow up.', { date: clock.formatDubaiDate(typeof openRequest.at === 'number' ? openRequest.at : new Date(openRequest.at).getTime()) })}
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <div className="text-sm text-grey-500">{t('asset_detail.overview.no_tracker', 'No tracker fitted')}</div>
                    <div className="text-xs text-grey-500 mt-1">
                      {canRequestTracker
                        ? t('asset_detail.overview.request_hint', 'Request a tracker and Kasper will confirm a fitting time.')
                        : t('asset_detail.overview.contact_kasper', 'This asset has no tracker. Contact Kasper to fit one.')}
                    </div>
                  </div>
                  {canRequestTracker && (
                    <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
                      <input
                        type="text"
                        value={requestNote}
                        onChange={e => setRequestNote(e.target.value)}
                        placeholder={t('asset_detail.overview.request_note', 'Optional note for Kasper')}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                      />
                      <Button size="sm" onClick={submitTrackerRequest}>{t('asset_detail.overview.request_tracker', 'Request a tracker')}</Button>
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
            <div className="text-sm font-medium text-ink mb-3">{t('asset_detail.history.positions', 'Positions')}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">{t('asset_detail.history.time', 'Time')}</th>
                    <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">{t('asset_detail.history.speed', 'Speed')}</th>
                    <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">{t('asset_detail.history.ignition', 'Ignition')}</th>
                    <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">{t('asset_detail.history.heading', 'Heading')}</th>
                    {asset.canProfile.supported.includes('fuelLevel') && (
                      <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">{t('asset_detail.history.fuel_pct', 'Fuel %')}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {historyRows.length > 0 ? (
                    historyRows.map(r => (
                      <tr key={r.deviceTime} className="border-b border-line">
                        <td className="px-3 py-2 font-mono text-xs">
                          {clock.formatDubaiDateTime(new Date(r.deviceTime).getTime())}
                        </td>
                        <td className="px-3 py-2 font-mono">{r.speedKmh.toFixed(0)} km/h</td>
                        <td className="px-3 py-2">{r.ignition ? t('common.on', 'On') : t('common.off', 'Off')}</td>
                        <td className="px-3 py-2 font-mono">{Math.round(r.heading)}°</td>
                        {asset.canProfile.supported.includes('fuelLevel') && (
                          <td className="px-3 py-2 font-mono">
                            {r.fuelLevelPct !== undefined ? `${r.fuelLevelPct.toFixed(0)}%` : '—'}
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-grey-500">{t('common.no_data', 'No data')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'trips' && (
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-line text-sm font-medium text-ink">{t('asset_detail.tabs.trips', 'Trips')}</div>
          {recentTrips.length === 0 ? (
            <div className="p-4 text-sm text-grey-500">
              {t('asset_detail.trips_empty', 'No trips recorded yet. Trips start when ignition is on and speed exceeds 3 km/h.')}
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">{t('asset_detail.trips.start', 'Start')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('asset_detail.trips.end', 'End')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('asset_detail.trips.distance', 'Distance')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('asset_detail.trips.top_speed', 'Top speed')}</th>
                </tr>
              </thead>
              <tbody>
                {recentTrips.map(tr => (
                  <tr key={tr.startMs} className="bg-paper hover:bg-paper-2">
                    <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{clock.formatDubaiDateTime(tr.startMs)}</td>
                    <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{clock.formatDubaiDateTime(tr.endMs)}</td>
                    <td className="px-3 py-2 border-b border-line text-right font-mono text-ink">{tr.distanceKm.toFixed(1)} km</td>
                    <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">{tr.maxSpeedKmh.toFixed(0)} km/h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="px-3 py-2 text-[11px] text-grey-500">{t('asset_detail.trips_rule', 'A trip starts when ignition is on and speed exceeds 3 km/h, and ends after 5 minutes stopped.')}</div>
        </div>
      )}

      {activeTab === 'engine' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="text-sm font-medium text-ink mb-3">{t('asset_detail.tabs.engine_fuel', 'Engine & fuel')}</div>
          {isTier1 ? (
            <div className="text-sm text-grey-500">
              {t('asset_detail.no_can_tier1', "Tier 1 assets don't have CAN data available.")}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: t('asset_detail.engine.fuel_level', 'Fuel level'), value: asset.canProfile.supported.includes('fuelLevel') && reading?.fuelLevelPct !== undefined ? `${reading.fuelLevelPct.toFixed(0)}%` : t('common.not_measured', 'Not measured'), source: t('asset_detail.engine.fuel_gauge', 'Fuel gauge') },
                { label: t('asset_detail.engine.fuel_rate', 'Fuel rate'), value: reading?.fuelRateLph !== undefined ? `${reading.fuelRateLph.toFixed(1)} L/h` : t('common.not_measured', 'Not measured'), source: t('asset_detail.engine.can_source', 'CAN') },
                { label: t('asset_detail.engine.coolant', 'Coolant'), value: reading?.coolantC !== undefined ? `${reading.coolantC.toFixed(0)} °C` : t('common.not_measured', 'Not measured'), source: t('asset_detail.engine.can_source', 'CAN') },
                { label: t('asset_detail.engine.load', 'Engine load'), value: reading?.engineLoadPct !== undefined ? `${reading.engineLoadPct.toFixed(0)}%` : t('common.not_measured', 'Not measured'), source: t('asset_detail.engine.can_source', 'CAN') },
                { label: t('asset_detail.engine.rpm', 'Engine RPM'), value: reading?.rpm !== undefined ? `${Math.round(reading.rpm)} rpm` : t('common.not_measured', 'Not measured'), source: t('asset_detail.engine.can_source', 'CAN') },
                { label: t('asset_detail.engine.can_odo', 'CAN odometer'), value: reading?.canOdometerKm !== undefined ? `${reading.canOdometerKm.toFixed(0)} km` : t('common.not_measured', 'Not measured'), source: t('asset_detail.engine.can_source', 'CAN') },
              ].map(cell => (
                <div key={cell.label} className="border border-line rounded-lg p-3">
                  <div className="text-xs text-grey-500 font-medium uppercase">{cell.label}</div>
                  <div className="text-lg font-semibold text-ink mt-1 font-mono">{cell.value}</div>
                  <div className="text-xs text-grey-500 mt-1">{cell.source}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'driving' && (
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-line text-sm font-medium text-ink">{t('asset_detail.driving_events', 'Driving events')}</div>
          {drivingEvents.length === 0 ? (
            <div className="p-4 text-sm text-grey-500">{t('asset_detail.driving_none', 'No driving events recorded yet.')}</div>
          ) : (
            <div className="divide-y divide-line">
              {drivingEvents.map(ev => (
                <div key={ev.id} className="px-3 py-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-ink">{t(`alerts.words.${ev.type}`, ev.typeWords)}</div>
                    <div className="text-xs text-grey-500">
                      {clock.formatDubaiDateTime(typeof ev.openedAt === 'number' ? ev.openedAt : new Date(ev.openedAt).getTime())}
                    </div>
                  </div>
                  <Badge variant={ev.status === 'closed' ? 'grey' : 'red'}>
                    {t(`alerts.types.${ev.type}`, ev.typeLabel)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'utilisation' && (
        <div className="space-y-4">
          {hasFeature(asset, 'muc') ? (
            <>
              <div className="bg-surface border border-line rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-ink">{t('asset_detail.ecu_engine_hours', 'ECU engine hours')}</div>
                  <div className="font-mono text-lg text-ink">{ecuHoursAt(asset, clock.now()).toFixed(1)} h</div>
                </div>
                <div className="text-xs text-grey-500 mt-1">
                  {t('asset_detail.muc_note', 'Meter reading from the ECU. Monthly Utilisation Certificates are sealed from this meter.')}
                </div>
              </div>
              <div className="bg-surface border border-line rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-line text-sm font-medium text-ink">
                  Last 7 days
                </div>
                {!breakdown ? (
                  <div className="p-4 text-sm text-grey-500">{t('asset_detail.reading_ecu', 'Reading the ECU…')}</div>
                ) : breakdown.days.length === 0 ? (
                  <div className="p-4 text-sm text-grey-500">{t('asset_detail.no_engine_data', 'No engine data in this window.')}</div>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-paper-2 text-grey-500">
                        <th className="px-3 py-2 text-left font-medium">{t('asset_detail.utilisation.day', 'Day')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('asset_detail.utilisation.engine_h', 'Engine (h)')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('asset_detail.utilisation.working_h', 'Working (h)')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('asset_detail.utilisation.idling_h', 'Idling (h)')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('asset_detail.utilisation.gap_min', 'Gap (min)')}</th>
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
              <div className="text-sm font-medium text-ink mb-3">{t('asset_detail.tabs.utilisation', 'Utilisation')}</div>
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
              <span className="text-sm font-medium text-ink">{t('asset_detail.muc_title', 'Monthly Utilisation Certificates')}</span>
              <a className="text-xs text-yellow-600 hover:text-yellow font-medium" href="/app/certificates">
                {t('asset_detail.open_certificates', 'Open certificates')}
              </a>
            </div>
            {mucs.length === 0 ? (
              <div className="p-6 text-center text-sm text-grey-500">
                {t('asset_detail.certificates_none', 'No certificates for {code} yet.', { code: asset.code })}
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-paper-2 text-grey-500">
                    <th className="px-3 py-2 text-left font-medium">{t('asset_detail.certificates_tab.certificate', 'Certificate')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('asset_detail.certificates_tab.period', 'Period')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('asset_detail.certificates_tab.billable_hours', 'Billable hours')}</th>
                    <th className="px-3 py-2 text-center font-medium">{t('certificates.columns.status', 'Status')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('asset_detail.certificates_tab.verify', 'Verify')}</th>
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
                          <Badge variant="red">{t('certificates.status.seal_broken', 'Seal broken')}</Badge>
                        ) : m.status === 'sealed' ? (
                          <Badge variant="green">{t('certificates.status.sealed', 'Sealed')}</Badge>
                        ) : (
                          <Badge variant="yellow">{t('certificates.status.voided', 'Voided')}</Badge>
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
              <span className="text-sm font-medium text-ink">{t('asset_detail.service_plans', 'Service plans')}</span>
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
                    <th className="px-3 py-2 text-left font-medium">{t('asset_detail.maintenance_tab.plan', 'Plan')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('asset_detail.maintenance_tab.due', 'Due')}</th>
                    <th className="px-3 py-2 text-center font-medium">{t('certificates.columns.status', 'Status')}</th>
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
                            <Badge variant="red">{t('maintenance.overdue', 'Overdue')}</Badge>
                          ) : snapshot.state === 'due_soon' ? (
                            <Badge variant="amber">{t('maintenance.due_soon', 'Due soon')}</Badge>
                          ) : (
                            <Badge variant="green">{t('maintenance.ok', 'Ok')}</Badge>
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
            <div className="px-3 py-2 border-b border-line text-sm font-medium text-ink">{t('asset_detail.service_history', 'Service history')}</div>
            {maintenanceRecords.length === 0 ? (
              <div className="p-6 text-center text-sm text-grey-500">No services logged for {asset.code} yet.</div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-paper-2 text-grey-500">
                    <th className="px-3 py-2 text-left font-medium">{t('asset_detail.maintenance_tab.date', 'Date')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('asset_detail.maintenance_tab.reading', 'Reading')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('asset_detail.maintenance_tab.notes', 'Notes')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('asset_detail.maintenance_tab.cost', 'Cost')}</th>
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
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-line text-sm font-medium text-ink">{t('asset_detail.tabs.alerts', 'Alerts')}</div>
          {assetAlerts.length === 0 ? (
            <div className="p-4 text-sm text-grey-500">{t('asset_detail.alerts_none', 'No alerts for this asset.')}</div>
          ) : (
            <div className="divide-y divide-line">
              {assetAlerts.map(al => (
                <div key={al.id} className="px-3 py-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-ink">{t(`alerts.words.${al.type}`, al.typeWords)}</div>
                    <div className="text-xs text-grey-500">
                      {clock.formatDubaiDateTime(typeof al.openedAt === 'number' ? al.openedAt : new Date(al.openedAt).getTime())}
                      {al.acknowledgedBy && ` · ${t('alerts.acknowledged_by', 'Acknowledged by {name} at {at}', { name: al.acknowledgedBy, at: al.acknowledgedAt ? clock.formatDubaiTime(typeof al.acknowledgedAt === 'string' ? new Date(al.acknowledgedAt).getTime() : al.acknowledgedAt) : '' })}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={al.status === 'open' ? 'red' : al.status === 'acknowledged' ? 'grey' : 'green'}>
                      {t(`alerts.types.${al.type}`, al.typeLabel)}
                    </Badge>
                    {al.status === 'open' && canAcknowledgeAlerts && (
                      <Button size="sm" variant="secondary" onClick={() => { acknowledgeAlert(session, al.id); setRequestVersion(v => v + 1); }}>
                        {t('alerts.acknowledge', 'Acknowledge')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
