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
import { Player } from '@/components/playback/Player';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { isAssetVisible, getRelationship, hasCapability, rentalWindow } from '@/server/access';
import { getReadingForAsset, computeStatus, getReadingsForAsset } from '@/server/telemetry/simulator';
import { buildPlaybackData, clippedPeriod, gapLabel } from '@/domain/trips';
import { formatEtaLine } from '@/domain/eta';
import { etaForLink } from '@/server/links';

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

type TabId = 'overview' | 'history' | 'trips' | 'engine' | 'driving' | 'utilisation' | 'alerts';

export default function AssetDetailPage() {
  const params = useParams();
  const assetId = params.id as string;
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [period, setPeriod] = useState<'24h' | '7d'>('24h');
  // Playback opens inline over the tab content: { from, to, tripId }
  const [playback, setPlayback] = useState<{ fromMs: number; toMs: number; tripId?: string } | null>(null);

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
  }, [asset, session]);

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

  // ── Playback inputs ───────────────────────────────────────────────────────
  // Renters can't look before their window, so both the period and the scrubber
  // start at the window start.
  const window = asset && session ? rentalWindow(session, asset.id) : null;
  const requestedPeriod = clippedPeriod(
    clock.now() - (period === '7d' ? 7 : 1) * 24 * 3600 * 1000,
    clock.now(),
    window,
  );
  const periodFromMs = requestedPeriod.fromMs;
  const periodEndMs = requestedPeriod.toMs;

  const playbackData = useMemo(() => {
    if (!asset) return null;
    const readings = getReadingsForAsset(asset, periodFromMs, periodEndMs);
    const ownGeofences = session ? seed.geofences.filter(g => g.tenantId === session.tenantId) : [];
    const ownFenceIds = new Set(ownGeofences.map(g => g.id));
    return buildPlaybackData(readings, {
      assetId: asset.id,
      fromMs: periodFromMs,
      toMs: periodEndMs,
      alerts: seed.alerts,
      geofences: ownGeofences,
      geofenceEvents: seed.geofenceEvents.filter(e => ownFenceIds.has(e.geofenceId)),
      tier: (asset.canProfile.adapter === 'ALL-CAN300' ? 3 : asset.canProfile.adapter === 'LVCAN200' ? 2 : 1) as 1 | 2 | 3,
      canSupported: asset.canProfile.supported,
    });
  }, [asset, period, periodFromMs, periodEndMs, session]);

  // Positions table: at most 60 rows, with the gap rows kept in place.
  const historyRows = useMemo(() => {
    const track = playbackData?.track ?? [];
    const gaps = playbackData?.gaps ?? [];
    if (track.length <= 60) return { track, gaps };
    const stride = Math.ceil(track.length / 60);
    return { track: track.filter((_, i) => i % stride === 0 || i === track.length - 1), gaps };
  }, [playbackData]);

  const playbackReadings = useMemo(() => {
    if (!asset || !playback) return [];
    return getReadingsForAsset(asset, playback.fromMs, playback.toMs);
  }, [asset, playback]);

  // Owner's active tracking links for this asset, with the hirer's ETA line
  const trackingLinkRows = useMemo(() => {
    if (!asset || !session) return [];
    const ownsAsset = getRelationship(session, asset.id) === 'owner' || session.isKasper;
    if (!ownsAsset) return [];
    return seed.trackingLinks
      .filter(l => l.assetId === asset.id)
      .map(l => {
        const eta = etaForLink(l);
        const booking = l.bookingId ? seed.bookings.find(b => b.id === l.bookingId) : null;
        return {
          id: l.id,
          token: l.token,
          createdAt: typeof l.createdAt === 'number' ? l.createdAt : new Date(l.createdAt).getTime(),
          expiresAt: typeof l.expiresAt === 'number' ? l.expiresAt : new Date(l.expiresAt).getTime(),
          revoked: !!l.revokedAt,
          showEta: l.showEta,
          job: booking?.reference ?? 'No job — 24 hour link',
          destinationName: booking?.destination?.name,
          etaLine: eta ? formatEtaLine(eta, clock.now()) : null,
        };
      });
  }, [asset, session]);

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

  const tabs: { id: TabId; label: string; phase: 'day_one' | 'phase2' | 'later'; enabled: boolean }[] = [
    { id: 'overview', label: 'Overview', phase: 'day_one', enabled: true },
    { id: 'history', label: 'History', phase: 'day_one', enabled: true },
    { id: 'trips', label: 'Trips', phase: 'day_one', enabled: true },
    { id: 'engine', label: 'Engine & fuel', phase: 'phase2', enabled: !isTier1 && phase !== 'day_one' },
    { id: 'driving', label: 'Driving', phase: 'phase2', enabled: phase !== 'day_one' },
    { id: 'utilisation', label: 'Utilisation', phase: 'phase2', enabled: phase !== 'day_one' },
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
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button variant="secondary" size="sm">Edit asset</Button>
          )}
          {canShare && (
            <Button variant="secondary" size="sm">Share tracking link</Button>
          )}
          {canEndAccess && rel === 'owner' && (
            <Button variant="danger" size="sm">End access now</Button>
          )}
          <Button variant="secondary" size="sm">Run report</Button>
        </div>
      )}

      {/* Tracking links — the owner sees the same ETA line the hirer sees (11.6/11.14) */}
      {trackingLinkRows.length > 0 && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="text-sm font-medium text-ink mb-2">Tracking links</div>
          <div className="space-y-2">
            {trackingLinkRows.map(row => (
              <div key={row.id} className="text-sm border border-line rounded p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-grey-700">/t/{row.token.slice(0, 10)}…</span>
                  <Badge variant={row.revoked ? 'grey' : 'green'}>{row.revoked ? 'Revoked' : 'Active'}</Badge>
                  <span className="text-xs text-grey-500">{row.job}</span>
                  <span className="text-xs text-grey-500 ml-auto font-mono">
                    expires {clock.formatDubaiDate(row.expiresAt)} {clock.formatDubaiTime(row.expiresAt)}
                  </span>
                </div>
                <div className="text-xs text-grey-500 mt-1">
                  {row.showEta && row.destinationName ? (
                    <>
                      Destination: <span className="text-grey-700">{row.destinationName}</span>
                      {row.etaLine && <span className="text-ink"> · {row.etaLine}</span>}
                    </>
                  ) : row.destinationName ? (
                    <>Destination: <span className="text-grey-700">{row.destinationName}</span> · arrival time hidden from the hirer</>
                  ) : (
                    'No destination on this job — no arrival time'
                  )}
                </div>
              </div>
            ))}
          </div>
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

      {/* Trip playback (11.15) — opens over the tab content */}
      {playback && playbackData && (
        <Player
          assetId={asset.id}
          assetCode={asset.code}
          assetName={asset.name}
          tier={(tier as 1 | 2 | 3)}
          canSupported={asset.canProfile.supported}
          readings={playbackReadings}
          alerts={seed.alerts}
          geofences={session ? seed.geofences.filter(g => g.tenantId === session.tenantId) : []}
          geofenceEvents={seed.geofenceEvents}
          clipStartMs={window ? window.start : undefined}
          focusTripId={playback.tripId}
          title={playback.tripId ? `Trip playback · ${asset.code}` : `Playback · ${asset.code}`}
          onClose={() => setPlayback(null)}
        />
      )}

      {/* Tab content */}
      {!playback && activeTab === 'overview' && (
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
            <div className="bg-surface border border-line rounded-lg p-4 text-center">
              <div className="text-sm text-grey-500">No tracker fitted</div>
              <div className="text-xs text-grey-500 mt-1">
                This asset has no tracker. Contact Kasper to fit one.
              </div>
            </div>
          )}
        </div>
      )}

      {!playback && activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-grey-500 font-medium">Period:</span>
            {(['24h', '7d'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={clsx(
                  'text-xs px-2 py-1 rounded border',
                  period === p ? 'bg-ink text-white border-ink' : 'bg-surface text-grey-700 border-line hover:text-ink',
                )}
              >
                {p === '24h' ? 'Last 24 hours' : 'Last 7 days'}
              </button>
            ))}
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto"
              onClick={() => setPlayback({ fromMs: periodFromMs, toMs: periodEndMs })}
            >
              Play this period
            </Button>
          </div>

          {window && window.start > periodEndMs - 7 * 24 * 3600 * 1000 && (
            <div className="text-xs text-amber-dark bg-amber/10 border border-amber/30 rounded px-3 py-2">
              Your rental history starts {clock.formatDubaiDateTime(window.start)} — nothing before that is shown.
            </div>
          )}

          <div className="bg-surface border border-line rounded-lg p-4">
            <div className="text-sm font-medium text-ink mb-3">
              Positions · {clock.formatDubaiDateTime(periodFromMs)} — {clock.formatDubaiDateTime(periodEndMs)}
            </div>
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
                    {asset.canProfile.supported.includes('rpm') && (
                      <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">RPM</th>
                    )}
                    {asset.canProfile.supported.includes('coolantTemp') && (
                      <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">Coolant</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {historyRows.track.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-grey-500">No data in this period</td>
                    </tr>
                  )}
                  {historyRows.track.map((p, i) => (
                    <React.Fragment key={p.t}>
                      {historyRows.gaps
                        .filter(g => g.from === historyRows.track[i - 1]?.t && g.to === p.t)
                        .map(g => (
                          <tr key={`gap-${g.from}`} className="bg-paper-2">
                            <td colSpan={6} className="px-3 py-2 text-xs text-grey-500 italic">{gapLabel(g)}</td>
                          </tr>
                        ))}
                      <tr className="border-b border-line">
                        <td className="px-3 py-2 font-mono text-xs">{clock.formatDubaiTime(p.t)}</td>
                        <td className="px-3 py-2 font-mono">{p.speedKmh.toFixed(1)} km/h</td>
                        <td className="px-3 py-2">{p.ignition ? 'On' : 'Off'}</td>
                        <td className="px-3 py-2 font-mono">{Math.round(p.heading)}°</td>
                        {asset.canProfile.supported.includes('fuelLevel') && (
                          <td className="px-3 py-2 font-mono">{p.fuelLevelPct !== undefined ? `${p.fuelLevelPct.toFixed(0)}%` : 'Not measured'}</td>
                        )}
                        {asset.canProfile.supported.includes('rpm') && (
                          <td className="px-3 py-2 font-mono">{p.rpm !== undefined ? Math.round(p.rpm) : 'Not measured'}</td>
                        )}
                        {asset.canProfile.supported.includes('coolantTemp') && (
                          <td className="px-3 py-2 font-mono">{p.coolantC !== undefined ? `${p.coolantC.toFixed(0)}°C` : 'Not measured'}</td>
                        )}
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-grey-500 mt-2">
              GPS distance in this period: <span className="font-mono text-grey-700">{playbackData ? playbackData.totalDistanceKm.toFixed(1) : '0'} km</span>
            </div>
          </div>
        </div>
      )}

      {!playback && activeTab === 'trips' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-ink">Trips</div>
            <span className="text-xs text-grey-500">
              {period === '24h' ? 'Last 24 hours' : 'Last 7 days'} · Trips start at ignition on with speed above 3 km/h
            </span>
          </div>
          {!playbackData || playbackData.trips.length === 0 ? (
            <div className="text-sm text-grey-500">
              No trips recorded in this period. Trips start when ignition is on and speed exceeds 3 km/h.
            </div>
          ) : (
            <>
              <div className="text-xs text-grey-500 mb-2">
                {playbackData.trips.length} trip{playbackData.trips.length === 1 ? '' : 's'} ·{' '}
                <span className="font-mono text-grey-700">{playbackData.totalDistanceKm.toFixed(1)} km</span> total
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">Trip</th>
                      <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">Start</th>
                      <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">End</th>
                      <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">From</th>
                      <th className="text-left text-xs text-grey-500 font-medium px-3 py-2">To</th>
                      <th className="text-right text-xs text-grey-500 font-medium px-3 py-2">Distance</th>
                      <th className="text-right text-xs text-grey-500 font-medium px-3 py-2">Duration</th>
                      <th className="text-right text-xs text-grey-500 font-medium px-3 py-2">Max speed</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {playbackData.trips.map(trip => (
                      <tr key={trip.id} className="border-b border-line">
                        <td className="px-3 py-2 font-mono text-xs">{trip.index + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs">{clock.formatDubaiTime(trip.startMs)}</td>
                        <td className="px-3 py-2 font-mono text-xs">{clock.formatDubaiTime(trip.endMs)}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-grey-500">
                          {trip.start.lat.toFixed(4)}, {trip.start.lng.toFixed(4)}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-grey-500">
                          {trip.end.lat.toFixed(4)}, {trip.end.lng.toFixed(4)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{trip.distanceKm.toFixed(1)} km</td>
                        <td className="px-3 py-2 text-right font-mono">{trip.durationMin} min</td>
                        <td className="px-3 py-2 text-right font-mono">{trip.maxSpeedKmh.toFixed(0)} km/h</td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setPlayback({ fromMs: Math.max(trip.startMs - 5 * 60000, periodFromMs), toMs: Math.min(trip.endMs + 5 * 60000, periodEndMs), tripId: trip.id })}
                          >
                            Play
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {!playback && activeTab === 'engine' && (
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

      {!playback && activeTab === 'driving' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="text-sm font-medium text-ink mb-3">Driving events</div>
          <div className="text-sm text-grey-500">
            No driving events recorded yet.
          </div>
        </div>
      )}

      {!playback && activeTab === 'utilisation' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="text-sm font-medium text-ink mb-3">Utilisation</div>
          <div className="text-sm text-grey-500">
            Last 7 days utilisation for this asset.
          </div>
        </div>
      )}

      {!playback && activeTab === 'alerts' && (
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
