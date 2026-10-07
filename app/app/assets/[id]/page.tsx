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
import { getReadingForAsset, getReadingsForAsset, computeStatus } from '@/server/telemetry/simulator';

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

  const asset = useMemo(() => seed.assets.find(a => a.id === assetId), [assetId]);
  const visible = useMemo(() => asset && session ? isAssetVisible(session, asset.id) : false, [asset, session]);
  const rel = useMemo(() => asset && session ? getRelationship(session, asset.id) : null, [asset, session]);
  const status = useMemo(() => asset ? computeStatus(asset) : 'no_tracker', [asset]);
  const reading = useMemo(() => asset ? getReadingForAsset(asset) : null, [asset]);
  const positions = useMemo(() => {
    if (!asset || !reading) return [];
    const endMs = typeof reading.deviceTime === 'number' ? reading.deviceTime : new Date(reading.deviceTime).getTime();
    const startMs = endMs - 86400000; // last 24 hours
    const readings = getReadingsForAsset(asset, startMs, endMs);
    return readings
      .filter(r => {
        const t = typeof r.deviceTime === 'number' ? r.deviceTime : new Date(r.deviceTime).getTime();
        return t >= startMs && t <= endMs;
      })
      .sort((a, b) => {
        const ta = typeof a.deviceTime === 'number' ? a.deviceTime : new Date(a.deviceTime).getTime();
        const tb = typeof b.deviceTime === 'number' ? b.deviceTime : new Date(b.deviceTime).getTime();
        return tb - ta;
      })
      .slice(0, 10);
  }, [asset, reading]);

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
                  {asset.canProfile.supported.includes('engineHours') && reading?.engineHours !== undefined
                    ? `${reading.engineHours.toFixed(1)} h`
                    : 'Not measured'}
                </div>
                <div className="text-xs text-grey-500 mt-1">
                  {asset.canProfile.adapter === 'ALL-CAN300'
                    ? 'ECU · billing-grade'
                    : asset.canProfile.supported.includes('engineHours')
                    ? 'ECU · partial, not for billing'
                    : 'Ignition · Estimated'}
                </div>
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
                  {asset.canProfile.supported.includes('rpm') && reading?.rpm !== undefined
                    ? `${Math.round(reading.rpm)} rpm`
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
                  {positions.length > 0 ? (
                    positions.map((pos, i) => (
                      <tr key={i} className="border-b border-line">
                        <td className="px-3 py-2 font-mono text-xs">
                          {clock.formatDubaiTime(typeof pos.deviceTime === 'number' ? pos.deviceTime : new Date(pos.deviceTime).getTime())}
                        </td>
                        <td className="px-3 py-2 font-mono">{pos.speedKmh} km/h</td>
                        <td className="px-3 py-2">{pos.ignition ? 'On' : 'Off'}</td>
                        <td className="px-3 py-2 font-mono">{pos.heading}°</td>
                        {asset.canProfile.supported.includes('fuelLevel') && (
                          <td className="px-3 py-2 font-mono">
                            {pos.fuelLevelPct !== undefined ? `${pos.fuelLevelPct.toFixed(0)}%` : '—'}
                          </td>
                        )}
                      </tr>
                    ))
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
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="text-sm font-medium text-ink mb-3">Utilisation</div>
          <div className="text-sm text-grey-500">
            Last 7 days utilisation for this asset.
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
