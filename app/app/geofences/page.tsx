'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Circle, MapContainer, Marker, Polygon, Popup, TileLayer, useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Badge, Button, EmptyState, Sheet,
} from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { findActiveGrantFor, getGrantEnd, hasCapability, isAssetVisible } from '@/server/access';
import { getReadingForAsset, getReadingsForAsset } from '@/server/telemetry/simulator';
import {
  CUSTOMER_GEOFENCES_STORAGE_KEY, deriveGeofenceEvents, parseStoredGeofences, timestampMs,
} from '@/domain/geofences';
import type { Asset, Geofence, GeofenceEvent, GeofenceKind, LatLng, Reading, Session } from '@/domain/types';

// Fix Leaflet's default marker URLs when the CSS is bundled by Next.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const KIND_COLORS: Record<GeofenceKind, string> = {
  site: '#1F9A6D',
  job: '#E6AF00',
  yard: '#5B5F66',
  restricted: '#D64545',
};

const DUBAI_CENTER: LatLng = { lat: 25.2048, lng: 55.2708 };
const MAX_READING_GAP_MS = 30 * 60 * 1000;

function kindLabel(kind: GeofenceKind): string {
  return kind === 'site' ? 'Site' : kind === 'job' ? 'Job' : kind === 'yard' ? 'Yard' : 'Restricted';
}

function formatTime(value: string | number): string {
  const ms = timestampMs(value);
  return Number.isFinite(ms) ? clock.formatDubaiDateTime(ms) : '—';
}

function isFenceVisibleToSession(session: Session, fence: Geofence): boolean {
  if (session.isKasper) return true;
  if (fence.tenantId !== session.tenantId) return false;
  if (session.siteIds.length > 0) return Boolean(fence.siteId && session.siteIds.includes(fence.siteId));
  return true;
}

function assetBelongsToTenant(asset: Asset, tenantId: string): boolean {
  if (asset.ownerTenantId === tenantId) return true;
  return seed.bookings.some(booking =>
    booking.assetId === asset.id
    && booking.renterTenantId === tenantId
    && (booking.status === 'active' || booking.status === 'scheduled'),
  );
}

function assetBelongsToFence(asset: Asset, fence: Geofence): boolean {
  return assetBelongsToTenant(asset, fence.tenantId);
}

function assetsForFence(fence: Geofence, assets: Asset[]): Asset[] {
  return assets.filter(asset =>
    assetBelongsToFence(asset, fence)
    && (fence.assetIds === 'all' || fence.assetIds.includes(asset.id)),
  );
}

function readingWindow(session: Session, asset: Asset, requestedStartMs: number, requestedEndMs: number): { fromMs: number; toMs: number } {
  if (session.isKasper || asset.ownerTenantId === session.tenantId) {
    return { fromMs: requestedStartMs, toMs: requestedEndMs };
  }
  const booking = findActiveGrantFor(session, asset.id);
  if (!booking) return { fromMs: requestedEndMs, toMs: requestedEndMs };
  return {
    fromMs: Math.max(requestedStartMs, new Date(booking.start).getTime()),
    toMs: Math.min(requestedEndMs, getGrantEnd(booking)),
  };
}

function fencePoints(fence: Geofence): LatLng[] {
  return fence.shape.type === 'circle' ? [fence.shape.center] : fence.shape.points;
}

function MapBoundsUpdater({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) {
      map.setView([DUBAI_CENTER.lat, DUBAI_CENTER.lng], 10);
      return;
    }
    const bounds = L.latLngBounds(points.map(point => [point.lat, point.lng]));
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 13 });
  }, [map, points]);
  return null;
}

export default function GeofencesPage() {
  const session = useStore.getState().session;
  const phase = useStore.getState().demoSwitches.phase;
  const [geofences, setGeofences] = useState<Geofence[]>(() => seed.geofences.map(fence => ({ ...fence })));
  const [formOpen, setFormOpen] = useState(false);
  const [editingFence, setEditingFence] = useState<Geofence | null>(null);
  const [mapFenceIds, setMapFenceIds] = useState<Set<string>>(() => new Set(seed.geofences.map(fence => fence.id)));
  const [toast, setToast] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = parseStoredGeofences(window.localStorage.getItem(CUSTOMER_GEOFENCES_STORAGE_KEY), seed.geofences);
      setGeofences(stored);
      setMapFenceIds(new Set(stored.map(fence => fence.id)));
    } catch {
      setGeofences(seed.geofences.map(fence => ({ ...fence })));
      setMapFenceIds(new Set(seed.geofences.map(fence => fence.id)));
    }
  }, []);

  const canView = Boolean(session && hasCapability(session, 'geofence.view'));
  // Capability notes reserve management for Tenant Admin and Kasper Admin. Kasper Ops can view but not edit.
  const canManage = Boolean(session
    && hasCapability(session, 'geofence.manage')
    && (!session.isKasper || session.role === 'kasper_admin')
    && session.role !== 'site_user');

  const visibleAssets = useMemo(() => session
    ? seed.assets.filter(asset => isAssetVisible(session, asset.id))
    : [], [session]);
  const visibleGeofences = useMemo(() => session
    ? geofences.filter(fence => isFenceVisibleToSession(session, fence))
    : [], [geofences, session]);

  const readingsByAsset = useMemo(() => {
    const end = clock.now();
    const start = end - 7 * 86400000;
    const relevantAssets = new Map<string, Asset>();
    visibleGeofences.forEach(fence => assetsForFence(fence, visibleAssets).forEach(asset => relevantAssets.set(asset.id, asset)));
    const readings = new Map<string, Reading[]>();
    if (!session) return readings;
    relevantAssets.forEach(asset => {
      const window = readingWindow(session, asset, start, end);
      const assetReadings = window.toMs > window.fromMs && seed.trackers.some(tracker => tracker.assetId === asset.id)
        ? getReadingsForAsset(asset, window.fromMs, window.toMs)
        : [];
      readings.set(asset.id, assetReadings);
    });
    return readings;
    // dataVersion changes after a create, edit or delete so derived history refreshes too.
  }, [session, visibleAssets, visibleGeofences, dataVersion]);

  const eventsByFence = useMemo(() => {
    const end = clock.now();
    const start = end - 7 * 86400000;
    const events = new Map<string, GeofenceEvent[]>();
    if (!session) return events;
    for (const fence of visibleGeofences) {
      const scopedAssets = assetsForFence(fence, visibleAssets);
      const assetWindows = new Map(scopedAssets.map(asset => [asset.id, readingWindow(session, asset, start, end)]));
      const assetIds = new Set(assetWindows.keys());
      const seeded = seed.geofenceEvents.filter(event => {
        const at = timestampMs(event.at);
        const window = assetWindows.get(event.assetId);
        return event.geofenceId === fence.id && window && at >= window.fromMs && at <= window.toMs;
      });
      const derived = [...assetIds].flatMap(assetId => {
        const tracker = seed.trackers.find(item => item.assetId === assetId);
        const window = assetWindows.get(assetId)!;
        const allowedGap = tracker?.pingIntervalSec
          ? Math.max(MAX_READING_GAP_MS, tracker.pingIntervalSec * 3 * 1000)
          : MAX_READING_GAP_MS;
        return deriveGeofenceEvents(fence, assetId, readingsByAsset.get(assetId) ?? [], allowedGap)
          .filter(event => timestampMs(event.at) >= window.fromMs && timestampMs(event.at) <= window.toMs);
      });
      const seen = new Set<string>();
      const combined = [...seeded, ...derived]
        .filter(event => {
          const key = `${event.assetId}:${event.type}:${Math.round(timestampMs(event.at) / 60000)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => timestampMs(b.at) - timestampMs(a.at));
      events.set(fence.id, combined);
    }
    return events;
  }, [readingsByAsset, session, visibleAssets, visibleGeofences]);

  const assetMarkers = useMemo(() => visibleAssets.map(asset => {
    let reading: Reading | null;
    if (session && !session.isKasper && asset.ownerTenantId !== session.tenantId) {
      const now = clock.now();
      const window = readingWindow(session, asset, now - 40 * 86400000, now);
      const inRental = window.toMs > window.fromMs
        ? getReadingsForAsset(asset, window.fromMs, window.toMs).sort((a, b) => timestampMs(a.deviceTime) - timestampMs(b.deviceTime))
        : [];
      reading = inRental[inRental.length - 1] ?? null;
    } else {
      reading = getReadingForAsset(asset);
    }
    const homeSite = seed.sites.find(site => site.id === asset.homeSiteId);
    const canSeeHomeSite = Boolean(session && (session.isKasper || asset.ownerTenantId === session.tenantId));
    const position = reading ? { lat: reading.lat, lng: reading.lng } : canSeeHomeSite ? homeSite?.center ?? DUBAI_CENTER : DUBAI_CENTER;
    return { asset, position, reading };
  }), [session, visibleAssets]);

  const pointsToFit = useMemo(() => {
    const markerPoints = assetMarkers.map(marker => marker.position);
    const overlays = visibleGeofences
      .filter(fence => mapFenceIds.has(fence.id))
      .flatMap(fencePoints);
    return [...markerPoints, ...overlays];
  }, [assetMarkers, mapFenceIds, visibleGeofences]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  };

  const saveGeofences = (next: Geofence[]) => {
    setGeofences(next);
    setDataVersion(version => version + 1);
    try {
      window.localStorage.setItem(CUSTOMER_GEOFENCES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      showToast('Saved for this visit, but browser storage is unavailable.');
    }
  };

  const saveFence = (fence: Geofence) => {
    if (!session || !canManage) return;
    if (!session.isKasper && fence.tenantId !== session.tenantId) {
      showToast('You can only manage your company geofences.');
      return;
    }
    const exists = geofences.some(item => item.id === fence.id);
    const next = exists
      ? geofences.map(item => item.id === fence.id ? fence : item)
      : [...geofences, fence];
    saveGeofences(next);
    setMapFenceIds(current => new Set(current).add(fence.id));
    setFormOpen(false);
    setEditingFence(null);
    showToast(exists ? 'Geofence updated.' : 'Geofence created.');
  };

  const removeFence = (fence: Geofence) => {
    if (!session || !canManage || (!session.isKasper && fence.tenantId !== session.tenantId)) return;
    if (!window.confirm(`Remove '${fence.name}'?`)) return;
    saveGeofences(geofences.filter(item => item.id !== fence.id));
    setMapFenceIds(current => {
      const next = new Set(current);
      next.delete(fence.id);
      return next;
    });
    showToast('Geofence removed.');
  };

  const toggleOnMap = (fenceId: string) => setMapFenceIds(current => {
    const next = new Set(current);
    if (next.has(fenceId)) next.delete(fenceId);
    else next.add(fenceId);
    return next;
  });

  if (!session) return null;
  if (!canView) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="text-sm font-semibold text-ink">Page not found</div>
          <div className="text-sm text-grey-500 mt-1">This page isn&apos;t available for your role.</div>
        </div>
      </div>
    );
  }

  if (phase === 'day_one') {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold text-ink mb-4">Geofences</h1>
        <EmptyState title="Not available" description="Geofences are available in Phase 2." />
      </div>
    );
  }

  const allMapFencesVisible = visibleGeofences.length > 0 && visibleGeofences.every(fence => mapFenceIds.has(fence.id));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-ink">Geofences</h1>
          <p className="text-sm text-grey-500 mt-1">Define areas on the map and review confirmed entry and exit history.</p>
        </div>
        <div className="flex items-center gap-2">
          {visibleGeofences.length > 0 && (
            <Link href="/app/reports?type=geofence" className="text-xs text-ink underline underline-offset-2 hover:text-grey-700">
              Geofence report
            </Link>
          )}
          {canManage && <Button size="sm" onClick={() => { setEditingFence(null); setFormOpen(true); }}>Create geofence</Button>}
        </div>
      </div>

      {toast && (
        <div className="rounded-lg border border-line bg-ink px-4 py-2 text-sm text-paper" role="status">{toast}</div>
      )}

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
          <div>
            <h2 className="text-sm font-medium text-ink">Map</h2>
            <p className="text-xs text-grey-500">Dashed outlines show each fence boundary.</p>
          </div>
          {visibleGeofences.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMapFenceIds(allMapFencesVisible ? new Set() : new Set(visibleGeofences.map(fence => fence.id)))}
            >
              {allMapFencesVisible ? 'Hide geofences' : 'Show on map'}
            </Button>
          )}
        </div>
        <div className="h-[360px] sm:h-[440px]">
          <MapContainer center={[DUBAI_CENTER.lat, DUBAI_CENTER.lng]} zoom={10} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {assetMarkers.map(({ asset, position, reading }) => (
              <Marker key={asset.id} position={[position.lat, position.lng]}>
                <Popup>
                  <div className="space-y-1">
                    <div className="font-medium text-ink">{asset.code} · {asset.name}</div>
                    <div className="text-xs text-grey-500">{reading ? formatTime(reading.deviceTime) : 'No position report'}</div>
                    <Link className="text-xs underline" href={`/app/assets/${asset.id}`}>Open asset</Link>
                  </div>
                </Popup>
              </Marker>
            ))}
            {visibleGeofences.filter(fence => mapFenceIds.has(fence.id)).map(fence => {
              const color = KIND_COLORS[fence.kind];
              const pathOptions = { color, fillColor: color, fillOpacity: 0.08, weight: 2, dashArray: '7 6' };
              return fence.shape.type === 'circle' ? (
                <Circle
                  key={fence.id}
                  center={[fence.shape.center.lat, fence.shape.center.lng]}
                  radius={fence.shape.radiusM}
                  pathOptions={pathOptions}
                >
                  <Popup>{fence.name} · {kindLabel(fence.kind)}</Popup>
                </Circle>
              ) : (
                <Polygon
                  key={fence.id}
                  positions={fence.shape.points.map(point => [point.lat, point.lng] as [number, number])}
                  pathOptions={pathOptions}
                >
                  <Popup>{fence.name} · {kindLabel(fence.kind)}</Popup>
                </Polygon>
              );
            })}
            <MapBoundsUpdater points={pointsToFit} />
          </MapContainer>
        </div>
      </section>

      <div className="space-y-3">
        {visibleGeofences.map(fence => {
          const assets = assetsForFence(fence, visibleAssets);
          const events = eventsByFence.get(fence.id) ?? [];
          const isEditable = canManage && (session.isKasper || fence.tenantId === session.tenantId);
          const assignedAssets = fence.assetIds === 'all'
            ? 'All available assets'
            : assets.map(asset => asset.code).join(', ') || 'No visible assets';
          return (
            <article key={fence.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={fence.kind === 'restricted' ? 'red' : fence.kind === 'site' ? 'green' : fence.kind === 'job' ? 'yellow' : 'grey'}>
                      {kindLabel(fence.kind)}
                    </Badge>
                    <h2 className="text-sm font-medium text-ink">{fence.name}</h2>
                  </div>
                  <div className="text-sm text-grey-700">
                    {fence.shape.type === 'circle'
                      ? `Circle · ${fence.shape.radiusM.toLocaleString('en-US')} m radius`
                      : `Polygon · ${fence.shape.points.length} points`}
                  </div>
                  <div className="text-xs text-grey-500">{assignedAssets}</div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-grey-500">
                    <span>Enter alert: {fence.alertOnEnter ? 'On' : 'Off'}</span>
                    <span>Exit alert: {fence.alertOnExit ? 'On' : 'Off'}</span>
                    <span>After-hours alert: {fence.afterHoursOnly ? 'On' : 'Off'}</span>
                    {fence.afterHoursOnly && <span>{String(fence.afterHoursOnly.from)}–{String(fence.afterHoursOnly.to)}</span>}
                    <span>Events (7d): {events.length}</span>
                  </div>
                  <p className="text-[11px] text-grey-500">Events require two consecutive readings on the new side. Reading replays are history only and do not send alerts.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => toggleOnMap(fence.id)}>
                    {mapFenceIds.has(fence.id) ? 'Hide from map' : 'Show on map'}
                  </Button>
                  {isEditable && (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => { setEditingFence(fence); setFormOpen(true); }}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => removeFence(fence)}>Delete</Button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 border-t border-line pt-3">
                <h3 className="text-xs font-medium text-grey-700">Recent events</h3>
                {events.length === 0 ? (
                  <p className="mt-2 text-xs text-grey-500">No confirmed entries or exits in the last 7 days.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[460px] text-xs">
                      <thead>
                        <tr className="bg-paper-2 text-grey-500">
                          <th className="px-2 py-2 text-left font-medium">Time (GST)</th>
                          <th className="px-2 py-2 text-left font-medium">Asset</th>
                          <th className="px-2 py-2 text-left font-medium">Event</th>
                          <th className="px-2 py-2 text-left font-medium">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.slice(0, 12).map(event => (
                          <tr key={event.id} className="bg-paper">
                            <td className="border-b border-line px-2 py-2 font-mono text-grey-700">{formatTime(event.at)}</td>
                            <td className="border-b border-line px-2 py-2 font-medium text-ink">{seed.assets.find(asset => asset.id === event.assetId)?.code ?? event.assetId}</td>
                            <td className="border-b border-line px-2 py-2 text-grey-700">{event.type === 'enter' ? 'Entered' : 'Exited'}</td>
                            <td className="border-b border-line px-2 py-2 text-grey-500">{event.source === 'reading_history' ? 'Reading history' : 'Recorded history'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </article>
          );
        })}
        {visibleGeofences.length === 0 && (
          <EmptyState
            title="No geofences"
            description={canManage ? 'Create a geofence for your company to track confirmed entry and exit history.' : 'No geofences are available for your sites.'}
            action={canManage ? <Button size="sm" onClick={() => { setEditingFence(null); setFormOpen(true); }}>Create geofence</Button> : undefined}
          />
        )}
      </div>

      {formOpen && (
        <GeofenceForm
          session={session}
          existing={editingFence ?? undefined}
          assets={visibleAssets}
          onClose={() => { setFormOpen(false); setEditingFence(null); }}
          onSave={saveFence}
        />
      )}
    </div>
  );
}

function GeofenceForm({ session, existing, assets, onClose, onSave }: {
  session: Session;
  existing?: Geofence;
  assets: Asset[];
  onClose: () => void;
  onSave: (fence: Geofence) => void;
}) {
  const initialShape = existing?.shape;
  const [name, setName] = useState(existing?.name ?? '');
  const [tenantId, setTenantId] = useState(existing?.tenantId ?? session.tenantId ?? seed.tenants[0]?.id ?? '');
  const [siteId, setSiteId] = useState(existing?.siteId ?? '');
  const [kind, setKind] = useState<GeofenceKind>(existing?.kind ?? 'job');
  const [shapeType, setShapeType] = useState<'circle' | 'polygon'>(initialShape?.type ?? 'circle');
  const [centerLat, setCenterLat] = useState(String(initialShape?.type === 'circle' ? initialShape.center.lat : DUBAI_CENTER.lat));
  const [centerLng, setCenterLng] = useState(String(initialShape?.type === 'circle' ? initialShape.center.lng : DUBAI_CENTER.lng));
  const [radius, setRadius] = useState(String(initialShape?.type === 'circle' ? initialShape.radiusM : 500));
  const [polygonText, setPolygonText] = useState(initialShape?.type === 'polygon'
    ? initialShape.points.map(point => `${point.lat}, ${point.lng}`).join('\n')
    : '25.2048, 55.2708\n25.2058, 55.2708\n25.2058, 55.2718');
  const [assetScope, setAssetScope] = useState<'all' | 'specific'>(existing?.assetIds === 'all' || !existing ? 'all' : 'specific');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>(existing?.assetIds === 'all' || !existing ? [] : existing.assetIds);
  const [alertEnter, setAlertEnter] = useState(existing?.alertOnEnter ?? true);
  const [alertExit, setAlertExit] = useState(existing?.alertOnExit ?? true);
  const [afterHours, setAfterHours] = useState(Boolean(existing?.afterHoursOnly));
  const [afterHoursFrom, setAfterHoursFrom] = useState(typeof existing?.afterHoursOnly?.from === 'string' ? existing.afterHoursOnly.from : '19:00');
  const [afterHoursTo, setAfterHoursTo] = useState(typeof existing?.afterHoursOnly?.to === 'string' ? existing.afterHoursOnly.to : '06:00');
  const [error, setError] = useState('');

  const companyAssets = useMemo(() => assets.filter(asset => assetBelongsToTenant(asset, tenantId)), [assets, tenantId]);
  const visibleCompanyIds = useMemo(() => new Set(companyAssets.map(asset => asset.id)), [companyAssets]);

  const toggleAsset = (assetId: string) => setSelectedAssetIds(current =>
    current.includes(assetId) ? current.filter(id => id !== assetId) : [...current, assetId],
  );

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Enter a name.'); return; }
    if (trimmedName.length > 80) { setError('Use 80 characters or fewer for the name.'); return; }
    if (!tenantId) { setError('Choose a company.'); return; }

    let shape: Geofence['shape'];
    if (shapeType === 'circle') {
      const lat = Number(centerLat);
      const lng = Number(centerLng);
      const radiusM = Number(radius);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        setError('Enter a valid centre latitude and longitude.');
        return;
      }
      if (!Number.isFinite(radiusM) || radiusM < 50 || radiusM > 5000) {
        setError('Radius must be between 50 and 5,000 metres.');
        return;
      }
      shape = { type: 'circle', center: { lat, lng }, radiusM };
    } else {
      const points = polygonText.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
        const [latText, lngText] = line.split(',').map(value => value.trim());
        return { lat: Number(latText), lng: Number(lngText) };
      });
      if (points.length < 3 || points.length > 30 || points.some(point =>
        !Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90
        || !Number.isFinite(point.lng) || point.lng < -180 || point.lng > 180)) {
        setError('Enter 3 to 30 valid points as latitude, longitude, one per line.');
        return;
      }
      shape = { type: 'polygon', points };
    }

    if (assetScope === 'specific') {
      const validSelected = selectedAssetIds.filter(id => visibleCompanyIds.has(id));
      if (validSelected.length === 0) { setError('Select at least one asset, or choose All assets.'); return; }
    }
    if (afterHours && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(afterHoursFrom) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(afterHoursTo))) {
      setError('Enter valid after-hours times.');
      return;
    }
    if (!session.isKasper && tenantId !== session.tenantId) { setError('You can only manage your company geofences.'); return; }

    const fence: Geofence = {
      id: existing?.id ?? `gf-${clock.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId,
      name: trimmedName,
      kind,
      shape,
      siteId: siteId || undefined,
      alertOnEnter: alertEnter,
      alertOnExit: alertExit,
      afterHoursOnly: afterHours ? { from: afterHoursFrom, to: afterHoursTo } : undefined,
      assetIds: assetScope === 'all' ? 'all' : selectedAssetIds.filter(id => visibleCompanyIds.has(id)),
      createdBy: existing?.createdBy ?? session.userId,
      createdAt: existing?.createdAt ?? clock.now(),
    };
    setError('');
    onSave(fence);
  };

  return (
    <Sheet open onClose={onClose} title={existing ? `Edit geofence — ${existing.name}` : 'Create geofence'} width="lg">
      <div className="space-y-4">
        <label className="block text-xs font-medium text-grey-500">
          Name
          <input value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="e.g. Jebel Ali Yard" className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-grey-700 focus:border-ink focus:outline-none" />
        </label>
        {session.isKasper && (
          <label className="block text-xs font-medium text-grey-500">
            Company
            <select value={tenantId} onChange={event => { setTenantId(event.target.value); setSiteId(''); }} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-grey-700 focus:border-ink focus:outline-none">
              {seed.tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
          </label>
        )}
        <label className="block text-xs font-medium text-grey-500">
          Site scope
          <select value={siteId} onChange={event => setSiteId(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-grey-700 focus:border-ink focus:outline-none">
            <option value="">All company sites</option>
            {seed.sites.filter(site => site.tenantId === tenantId).map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-grey-500">
            Kind
            <select value={kind} onChange={event => setKind(event.target.value as GeofenceKind)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-grey-700 focus:border-ink focus:outline-none">
              <option value="site">Site</option><option value="job">Job</option><option value="yard">Yard</option><option value="restricted">Restricted</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-grey-500">
            Shape
            <select value={shapeType} onChange={event => setShapeType(event.target.value as 'circle' | 'polygon')} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-grey-700 focus:border-ink focus:outline-none">
              <option value="circle">Circle</option><option value="polygon">Polygon</option>
            </select>
          </label>
        </div>

        {shapeType === 'circle' ? (
          <div className="space-y-3 rounded-lg border border-line bg-paper-2 p-3">
            <div className="text-xs font-medium text-grey-700">Circle centre</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-grey-500">Latitude
                <input value={centerLat} onChange={event => setCenterLat(event.target.value)} inputMode="decimal" className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-grey-700" />
              </label>
              <label className="text-xs text-grey-500">Longitude
                <input value={centerLng} onChange={event => setCenterLng(event.target.value)} inputMode="decimal" className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-grey-700" />
              </label>
            </div>
            <label className="block text-xs text-grey-500">Radius (50–5,000 m)
              <input type="number" min={50} max={5000} value={radius} onChange={event => setRadius(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-grey-700" />
            </label>
          </div>
        ) : (
          <label className="block text-xs text-grey-500">
            Polygon points (3–30; latitude, longitude on each line)
            <textarea rows={5} value={polygonText} onChange={event => setPolygonText(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs text-grey-700" />
          </label>
        )}

        <div className="space-y-2 rounded-lg border border-line p-3">
          <div className="text-xs font-medium text-grey-700">Assets</div>
          <div className="flex flex-wrap gap-3 text-sm text-grey-700">
            <label className="flex items-center gap-2"><input type="radio" checked={assetScope === 'all'} onChange={() => setAssetScope('all')} />All assets</label>
            <label className="flex items-center gap-2"><input type="radio" checked={assetScope === 'specific'} onChange={() => setAssetScope('specific')} />Specific assets</label>
          </div>
          {assetScope === 'specific' && (
            <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto rounded-lg bg-paper-2 p-2 sm:grid-cols-2">
              {companyAssets.map(asset => (
                <label key={asset.id} className="flex items-center gap-2 text-xs text-grey-700">
                  <input type="checkbox" checked={selectedAssetIds.includes(asset.id)} onChange={() => toggleAsset(asset.id)} />
                  <span className="font-mono">{asset.code}</span><span className="truncate">{asset.name}</span>
                </label>
              ))}
              {companyAssets.length === 0 && <span className="text-xs text-grey-500">No assets are available for this company.</span>}
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-lg border border-line p-3">
          <div className="text-xs font-medium text-grey-700">Alerts</div>
          <div className="flex flex-wrap gap-4 text-sm text-grey-700">
            <label className="flex items-center gap-2"><input type="checkbox" checked={alertEnter} onChange={event => setAlertEnter(event.target.checked)} />On enter</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={alertExit} onChange={event => setAlertExit(event.target.checked)} />On exit</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={afterHours} onChange={event => setAfterHours(event.target.checked)} />After-hours only</label>
          </div>
          {afterHours && (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-grey-500">From
                <input type="time" value={afterHoursFrom} onChange={event => setAfterHoursFrom(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm" />
              </label>
              <label className="text-xs text-grey-500">To
                <input type="time" value={afterHoursTo} onChange={event => setAfterHoursTo(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm" />
              </label>
            </div>
          )}
        </div>

        {error && <div className="rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-sm text-red" role="alert">{error}</div>}
        <div className="flex gap-2">
          <Button onClick={submit}>{existing ? 'Save changes' : 'Create'}</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Sheet>
  );
}
