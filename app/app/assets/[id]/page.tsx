'use client';

import React, { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import clsx from 'clsx';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Badge, StatusBadge, TierChip } from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { isAssetVisible, getRelationship, rentalWindow } from '@/server/access';
import { can } from '@/server/capabilities';
import { hasFeature } from '@/domain/features';
import { computeStatus, getReadingForAsset, getReadingsForAsset } from '@/server/telemetry/simulator';
import type { Asset, ParamKey, Reading } from '@/domain/types';

type TabId = 'overview' | 'history' | 'trips' | 'engine';

type Trip = {
  start: Reading;
  end: Reading;
  distanceKm: number;
  maxSpeedKmh: number;
  durationMs: number;
  points: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MOVING_SPEED_KMH = 3;
const TRIP_GAP_MS = 15 * 60 * 1000;

function toMillis(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : new Date(value).getTime();
}

function formatMeasure(value: number | undefined, digits = 1, suffix = ''): string {
  return value === undefined || !Number.isFinite(value)
    ? 'Not measured'
    : `${value.toFixed(digits)}${suffix}`;
}

function supported(asset: Asset, key: ParamKey): boolean {
  return asset.canProfile.supported.includes(key);
}

function buildTrips(readings: Reading[]): Trip[] {
  const trips: Trip[] = [];
  let start: Reading | null = null;
  let lastMoving: Reading | null = null;
  let maxSpeedKmh = 0;
  let durationMs = 0;
  let points = 0;
  let previousReading: Reading | null = null;

  const finishTrip = () => {
    if (!start || !lastMoving) return;
    trips.push({
      start,
      end: lastMoving,
      distanceKm: Math.max(0, lastMoving.gnssOdometerKm - start.gnssOdometerKm),
      maxSpeedKmh,
      durationMs,
      points,
    });
    start = null;
    lastMoving = null;
    maxSpeedKmh = 0;
    durationMs = 0;
    points = 0;
  };

  for (const reading of readings) {
    const at = toMillis(reading.deviceTime);
    const lastAt = lastMoving ? toMillis(lastMoving.deviceTime) : null;
    const moving = reading.ignition && reading.speedKmh >= MOVING_SPEED_KMH;
    if (moving && lastAt !== null && at - lastAt > TRIP_GAP_MS) finishTrip();
    if (moving) {
      if (!start) start = reading;
      if (previousReading?.ignition && previousReading.speedKmh >= MOVING_SPEED_KMH) {
        const movingInterval = at - toMillis(previousReading.deviceTime);
        if (movingInterval > 0 && movingInterval <= TRIP_GAP_MS) durationMs += movingInterval;
      }
      lastMoving = reading;
      maxSpeedKmh = Math.max(maxSpeedKmh, reading.speedKmh);
      points += 1;
    } else if (lastAt !== null && at - lastAt > TRIP_GAP_MS) {
      finishTrip();
    }
    previousReading = reading;
  }
  finishTrip();
  return trips;
}

function MetricTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-grey-500">{label}</div>
      <div className="mt-1 break-words font-mono text-lg font-semibold text-ink">{value}</div>
      {note && <div className="mt-1 text-xs text-grey-500">{note}</div>}
    </div>
  );
}

function ParameterRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <span className="text-sm text-grey-700">{label}</span>
      <span className={clsx('text-right text-sm font-mono', value === 'Not measured' ? 'text-grey-500 italic' : 'text-ink')}>
        {value}
      </span>
    </div>
  );
}

export default function AssetDetailPage() {
  const { id: assetId } = useParams<{ id: string }>();
  const session = useStore(state => state.session);
  const phase = useStore(state => state.demoSwitches.phase);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const asset = useMemo(() => seed.assets.find(item => item.id === assetId), [assetId]);
  const visible = Boolean(
    session && asset && !asset.retiredAt &&
    isAssetVisible(session, asset.id) && can(session, 'asset.view', asset.id)
  );
  const now = clock.now();
  const relationship = session && asset ? getRelationship(session, asset.id) : 'none';
  const renterWindow = relationship === 'renter' && session && asset ? rentalWindow(session, asset.id) : null;
  const canViewTelemetry = Boolean(session && asset && can(session, 'asset.viewTelemetry', asset.id));
  const canViewHistory = Boolean(session && asset && can(session, 'asset.viewHistory', asset.id));
  const canReadPositionHistory = canViewTelemetry || canViewHistory;
  const recentReadings = useMemo(() => {
    if (!asset || !visible || !canReadPositionHistory || (relationship === 'renter' && !renterWindow)) return [];
    const start = relationship === 'renter' && renterWindow
      ? Math.max(now - DAY_MS, renterWindow.start)
      : now - DAY_MS;
    const end = relationship === 'renter' && renterWindow
      ? Math.min(now, renterWindow.end)
      : now;
    if (end < start) return [];
    return getReadingsForAsset(asset, start, end);
  }, [asset, canReadPositionHistory, now, relationship, renterWindow, visible]);
  const reading = useMemo(() => {
    if (!asset || !visible || !canReadPositionHistory) return null;
    if (relationship === 'renter') return recentReadings[recentReadings.length - 1] ?? null;
    return getReadingForAsset(asset);
  }, [asset, canReadPositionHistory, now, recentReadings, relationship, visible]);
  const status = useMemo(
    () => asset && visible && canViewTelemetry ? computeStatus(asset, now) : 'unknown',
    [asset, canViewTelemetry, now, recentReadings, visible]
  );
  const trips = useMemo(() => buildTrips(recentReadings), [recentReadings]);
  const site = asset ? seed.sites.find(item => item.id === asset.homeSiteId) : undefined;
  const owner = asset ? seed.tenants.find(item => item.id === asset.ownerTenantId) : undefined;

  if (!session) return null;
  if (!asset || !visible) {
    return <div className="flex h-[360px] items-center justify-center text-sm text-grey-500">Asset not found</div>;
  }

  const tier = asset.canProfile.adapter === 'ALL-CAN300' ? 3 : asset.canProfile.adapter === 'LVCAN200' ? 2 : 1;
  const tabs: { id: TabId; label: string; enabled: boolean }[] = [
    { id: 'overview', label: 'Overview', enabled: true },
    { id: 'history', label: 'History', enabled: canViewHistory && hasFeature(asset, 'history.track') },
    { id: 'trips', label: 'Trips', enabled: canViewHistory && hasFeature(asset, 'trips') },
    { id: 'engine', label: 'Engine & fuel', enabled: phase !== 'day_one' && canViewTelemetry },
  ];
  const positions = recentReadings.slice(-30).reverse();
  const recentTrips = trips.slice().reverse();
  const totalDistanceKm = trips.reduce((sum, trip) => sum + trip.distanceKm, 0);
  const totalDurationMs = trips.reduce((sum, trip) => sum + trip.durationMs, 0);
  const color = status === 'live' ? '#1F9A6D' : status === 'idle' ? '#FFC400' : status === 'offline' ? '#D64545' : '#9A9CA1';

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-ink">{asset.code}</h1>
            <span className="text-sm text-grey-500">{asset.name}</span>
            {relationship === 'renter' && <Badge variant="yellow">Rented</Badge>}
          </div>
          <p className="mt-1 text-sm text-grey-500">{asset.make} {asset.model} · {asset.year} · {asset.plateOrSerial}</p>
          <p className="text-sm text-grey-500">{site?.name ?? 'No site'} · {owner?.name ?? 'Unknown owner'}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <TierChip tier={tier} />
        </div>
      </header>

      <div className="text-xs text-grey-500">
        Last update {reading ? clock.formatDubaiDateTime(toMillis(reading.deviceTime)) : 'No position yet'}
      </div>

      <nav aria-label="Asset detail sections" className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            disabled={!tab.enabled}
            onClick={() => tab.enabled && setActiveTab(tab.id)}
            className={clsx(
              'relative whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id ? 'text-ink' : 'text-grey-500 hover:text-ink',
              !tab.enabled && 'cursor-not-allowed opacity-40'
            )}
          >
            {tab.label}
            {activeTab === tab.id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-yellow" />}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' && (
        <section className="space-y-4" aria-label="Overview">
          <div className="h-[260px] overflow-hidden rounded-xl border border-line bg-paper">
            {reading && canViewTelemetry && hasFeature(asset, 'location.live') ? (
              <MapContainer
                center={[reading.lat, reading.lng]}
                zoom={14}
                scrollWheelZoom={false}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <CircleMarker center={[reading.lat, reading.lng]} radius={9} pathOptions={{ color, fillColor: color, fillOpacity: 0.9 }}>
                  <Popup>
                    <strong>{asset.code}</strong><br />
                    {clock.formatDubaiDateTime(toMillis(reading.deviceTime))}
                  </Popup>
                </CircleMarker>
              </MapContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-grey-500">No location data available</div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {canViewTelemetry && hasFeature(asset, 'status') && <MetricTile label="Status" value={status.replace('_', ' ')} />}
            {canViewTelemetry && hasFeature(asset, 'trips') && <MetricTile label="Speed" value={reading ? `${reading.speedKmh.toFixed(1)} km/h` : 'Not measured'} />}
            {canViewTelemetry && hasFeature(asset, 'hours.ignition') && <MetricTile label="Ignition" value={reading ? (reading.ignition ? 'On' : 'Off') : 'Not measured'} />}
            {canViewTelemetry && hasFeature(asset, 'power.status') && <MetricTile label="Tracker battery" value={reading ? `${reading.intBattery.toFixed(2)} V` : 'Not measured'} />}
            {canViewTelemetry && hasFeature(asset, 'power.status') && <MetricTile label="External voltage" value={reading ? `${reading.extVoltage.toFixed(1)} V` : 'Not measured'} />}
            {canViewTelemetry && hasFeature(asset, 'connection.quality') && <MetricTile label="Satellites" value={reading ? String(reading.satellites) : 'Not measured'} />}
            {canViewTelemetry && hasFeature(asset, 'connection.quality') && <MetricTile label="GSM signal" value={reading ? `${reading.gsm}/5` : 'Not measured'} />}
            {canViewTelemetry && hasFeature(asset, 'history.track') && <MetricTile label="GPS distance" value={reading ? `${reading.gnssOdometerKm.toFixed(1)} km` : 'Not measured'} note="GPS distance, not CAN odometer" />}
            {canViewTelemetry && hasFeature(asset, 'fuel.level') && <MetricTile label="Fuel level" value={formatMeasure(reading?.fuelLevelPct, 0, '%')} />}
            {canViewTelemetry && hasFeature(asset, 'hours.ecu') && <MetricTile label="Engine hours" value={formatMeasure(reading?.engineHours, 1, ' h')} note="ECU" />}
            {canViewTelemetry && hasFeature(asset, 'engine.live') && <MetricTile label="Engine speed" value={formatMeasure(reading?.rpm, 0, ' rpm')} />}
            {canViewTelemetry && hasFeature(asset, 'faults') && <MetricTile label="Fault codes" value={reading?.activeDtcs?.length ? reading.activeDtcs.join(', ') : 'Not measured'} />}
          </div>
          {status === 'no_tracker' && (
            <div className="rounded-lg border border-line bg-surface p-4 text-sm text-grey-700">No tracker is fitted to this asset.</div>
          )}
        </section>
      )}

      {activeTab === 'history' && canViewHistory && (
        <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-label="Position history">
          <div className="border-b border-line p-4">
            <h2 className="text-sm font-semibold text-ink">Positions · last 24 hours</h2>
            <p className="mt-1 text-xs text-grey-500">{positions.length} recent position records</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-paper-2 text-left text-xs text-grey-500">
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Position</th>
                  <th className="px-3 py-2">Speed</th>
                  <th className="px-3 py-2">Ignition</th>
                  <th className="px-3 py-2">Heading</th>
                  <th className="px-3 py-2">GPS distance</th>
                  {supported(asset, 'fuelLevel') && <th className="px-3 py-2">Fuel %</th>}
                  {supported(asset, 'fuelUsed') && <th className="px-3 py-2">Fuel used</th>}
                  {supported(asset, 'rpm') && <th className="px-3 py-2">RPM</th>}
                  {supported(asset, 'canOdometer') && <th className="px-3 py-2">CAN odometer</th>}
                  {supported(asset, 'engineHours') && <th className="px-3 py-2">Engine hours</th>}
                  {supported(asset, 'coolantTemp') && <th className="px-3 py-2">Coolant</th>}
                  {supported(asset, 'engineLoad') && <th className="px-3 py-2">Engine load</th>}
                  {supported(asset, 'faultCodes') && <th className="px-3 py-2">Fault codes</th>}
                  {supported(asset, 'adBlue') && <th className="px-3 py-2">AdBlue</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {positions.map((position, index) => (
                  <tr key={`${position.trackerId}-${position.deviceTime}-${index}`}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{clock.formatDubaiDateTime(toMillis(position.deviceTime))}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{position.lat.toFixed(5)}, {position.lng.toFixed(5)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono">{position.speedKmh.toFixed(1)} km/h</td>
                    <td className="px-3 py-2">{position.ignition ? 'On' : 'Off'}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono">{position.heading.toFixed(0)}°</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono">{position.gnssOdometerKm.toFixed(1)} km</td>
                    {supported(asset, 'fuelLevel') && <td className="whitespace-nowrap px-3 py-2 font-mono">{formatMeasure(position.fuelLevelPct, 0, '%')}</td>}
                    {supported(asset, 'fuelUsed') && <td className="whitespace-nowrap px-3 py-2 font-mono">{formatMeasure(position.fuelUsedL, 1, ' L')}</td>}
                    {supported(asset, 'rpm') && <td className="whitespace-nowrap px-3 py-2 font-mono">{formatMeasure(position.rpm, 0)}</td>}
                    {supported(asset, 'canOdometer') && <td className="whitespace-nowrap px-3 py-2 font-mono">{formatMeasure(position.canOdometerKm, 1, ' km')}</td>}
                    {supported(asset, 'engineHours') && <td className="whitespace-nowrap px-3 py-2 font-mono">{formatMeasure(position.engineHours, 1, ' h')}</td>}
                    {supported(asset, 'coolantTemp') && <td className="whitespace-nowrap px-3 py-2 font-mono">{formatMeasure(position.coolantC, 0, '°C')}</td>}
                    {supported(asset, 'engineLoad') && <td className="whitespace-nowrap px-3 py-2 font-mono">{formatMeasure(position.engineLoadPct, 0, '%')}</td>}
                    {supported(asset, 'faultCodes') && <td className="whitespace-nowrap px-3 py-2 font-mono">{position.activeDtcs?.join(', ') || 'Not measured'}</td>}
                    {supported(asset, 'adBlue') && <td className="whitespace-nowrap px-3 py-2 font-mono">{formatMeasure(position.adBluePct, 0, '%')}</td>}
                  </tr>
                ))}
                {positions.length === 0 && (
                  <tr><td colSpan={6 + asset.canProfile.supported.filter(key => ['fuelLevel', 'fuelUsed', 'rpm', 'canOdometer', 'engineHours', 'coolantTemp', 'engineLoad', 'faultCodes', 'adBlue'].includes(key)).length} className="px-3 py-8 text-center text-sm text-grey-500">No position records for this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'trips' && canViewHistory && hasFeature(asset, 'trips') && (
        <section className="space-y-3" aria-label="Trips">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricTile label="Trips" value={String(trips.length)} note="Last 24 hours" />
            <MetricTile label="Total distance" value={`${totalDistanceKm.toFixed(1)} km`} />
            <MetricTile label="Moving time" value={`${(totalDurationMs / 3_600_000).toFixed(1)} h`} />
          </div>
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="border-b border-line p-4"><h2 className="text-sm font-semibold text-ink">Trip list</h2></div>
            {recentTrips.length === 0 ? (
              <p className="p-4 text-sm text-grey-500">No trips recorded in the last 24 hours.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line bg-paper-2 text-left text-xs text-grey-500"><th className="px-3 py-2">Start</th><th className="px-3 py-2">End</th><th className="px-3 py-2">Duration</th><th className="px-3 py-2">Distance</th><th className="px-3 py-2">Max speed</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {recentTrips.map((trip, index) => {
                      const duration = trip.durationMs;
                      return (
                        <tr key={`${trip.start.deviceTime}-${index}`}>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{clock.formatDubaiDateTime(toMillis(trip.start.deviceTime))}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{clock.formatDubaiDateTime(toMillis(trip.end.deviceTime))}</td>
                          <td className="px-3 py-2 font-mono">{(duration / 60_000).toFixed(0)} min</td>
                          <td className="px-3 py-2 font-mono">{trip.distanceKm.toFixed(1)} km</td>
                          <td className="px-3 py-2 font-mono">{trip.maxSpeedKmh.toFixed(0)} km/h</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr className="border-t border-line bg-paper-2 font-semibold"><td colSpan={2} className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 font-mono">{(totalDurationMs / 3_600_000).toFixed(1)} h</td><td className="px-3 py-2 font-mono">{totalDistanceKm.toFixed(1)} km</td><td className="px-3 py-2 text-grey-500">—</td></tr></tfoot>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'engine' && phase !== 'day_one' && canViewTelemetry && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Engine and fuel measurements">
          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink">Fuel</h2>
            <ParameterRow label="Fuel level" value={supported(asset, 'fuelLevel') ? formatMeasure(reading?.fuelLevelPct, 0, '%') : 'Not measured'} />
            <ParameterRow label="Fuel used" value={supported(asset, 'fuelUsed') ? formatMeasure(reading?.fuelUsedL, 1, ' L') : 'Not measured'} />
            <ParameterRow label="Fuel rate" value={supported(asset, 'fuelRate') ? formatMeasure(reading?.fuelRateLph, 1, ' L/h') : 'Not measured'} />
            <ParameterRow label="AdBlue" value={supported(asset, 'adBlue') ? formatMeasure(reading?.adBluePct, 0, '%') : 'Not measured'} />
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink">Engine</h2>
            <ParameterRow label="Engine hours" value={supported(asset, 'engineHours') ? formatMeasure(reading?.engineHours, 1, ' h') : 'Not measured'} />
            <ParameterRow label="RPM" value={supported(asset, 'rpm') ? formatMeasure(reading?.rpm, 0, ' rpm') : 'Not measured'} />
            <ParameterRow label="Coolant temperature" value={supported(asset, 'coolantTemp') ? formatMeasure(reading?.coolantC, 0, '°C') : 'Not measured'} />
            <ParameterRow label="Engine load" value={supported(asset, 'engineLoad') ? formatMeasure(reading?.engineLoadPct, 0, '%') : 'Not measured'} />
            <ParameterRow label="CAN odometer" value={supported(asset, 'canOdometer') ? formatMeasure(reading?.canOdometerKm, 1, ' km') : 'Not measured'} />
            <ParameterRow label="Fault codes" value={supported(asset, 'faultCodes') ? (reading?.activeDtcs?.join(', ') || 'Not measured') : 'Not measured'} />
          </div>
        </section>
      )}


    </div>
  );
}
