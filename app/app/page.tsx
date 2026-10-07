'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  TierChip, Badge, EmptyState, Skeleton,
  Button,
} from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { hasCapability, isAssetVisible, getRelationship } from '@/server/access';
import { getReadingForAsset } from '@/server/telemetry/simulator';
import {
  addLabelToAssets, CUSTOMER_LABELS_STORAGE_KEY, labelsForAsset, parseCustomerLabelState, removeLabelFromAssets,
  type CustomerLabelState,
} from '@/domain/customer-labels';
import type { Asset, Label, LatLng } from '@/domain/types';

// Fix Leaflet default icon issue
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Status marker colors
const STATUS_COLORS: Record<string, string> = {
  live: '#1F9A6D',
  idle: '#B89000',
  stale: '#9A9CA1',
  offline: '#D64545',
  unknown: '#9A9CA1',
  no_tracker: '#9A9CA1',
};

function createMarkerIcon(status: string, isRented: boolean) {
  const color = STATUS_COLORS[status] ?? '#9A9CA1';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
      <div style="position: relative; width: 24px; height: 36px;">
        <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 16px; height: 16px; background: ${color}; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);${isRented ? ' outline: 2px solid #FFC400; outline-offset: 2px;' : ''}"></div>
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

interface AssetMarker {
  id: string;
  code: string;
  name: string;
  status: string;
  lastUpdated: string;
  siteName: string;
  tier: 1 | 2 | 3;
  isRentedIn: boolean;
  lat: number;
  lng: number;
  asset: Asset;
  lastReadingMs: number;
  labels: Label[];
  canManageLabels: boolean;
}

function computeStatus(asset: Asset, sessionMs: number = clock.now()): 'live' | 'idle' | 'stale' | 'offline' | 'unknown' | 'no_tracker' {
  const pairing = seed.pairings.find(p => p.assetId === asset.id && p.to === null);
  if (!pairing) return 'no_tracker';
  const tracker = seed.trackers.find(t => t.id === pairing.trackerId);
  if (!tracker || tracker.stockStatus !== 'paired') return 'no_tracker';
  const reading = getReadingForAsset(asset);
  if (!reading) return 'no_tracker';
  const lastMs = new Date(reading.deviceTime).getTime();
  const ageSec = (sessionMs - lastMs) / 1000;
  if (ageSec > 1800) return 'offline';
  if (ageSec > 600) return 'stale';
  if (reading.speedKmh < 3) return 'idle';
  return 'live';
}

function lastUpdatedStr(asset: Asset): string {
  const reading = getReadingForAsset(asset);
  if (!reading) return 'No data';
  const ms = new Date(reading.deviceTime).getTime();
  const ageMin = clock.minutesSinceDubai(ms);
  const ageH = clock.hoursSinceDubai(ms);
  if (ageMin < 60) return `${clock.formatDubaiTime(ms)} · ${Math.round(ageMin)} min ago`;
  return `${clock.formatDubaiTime(ms)} · ${Math.round(ageH)} h ago`;
}

const STATUS_KEYS = ['live', 'idle', 'stale', 'offline', 'unknown', 'no_tracker'] as const;
type StatusKey = typeof STATUS_KEYS[number];

function MapBoundsUpdater({ assets }: { assets: AssetMarker[] }) {
  const map = useMap();
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  useEffect(() => {
    if (assetsRef.current.length === 0) return;
    const bounds = L.latLngBounds(assetsRef.current.map(a => [a.lat, a.lng]));
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [map]);

  return null;
}

export default function MapPage() {
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;
  const showHidden = store.getState().demoSwitches.showHidden;
  const salesView = store.getState().demoSwitches.salesView;

  const [statusFilter, setStatusFilter] = useState<StatusKey | 'all'>('all');
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<'all' | 1 | 2 | 3>('all');
  const [rentedFilter, setRentedFilter] = useState<'all' | 'owned' | 'rented'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [labelState, setLabelState] = useState<CustomerLabelState>(() => ({
    labels: [...seed.labels],
    assignments: [...seed.assetLabels],
  }));
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [bulkLabelMode, setBulkLabelMode] = useState<'add' | 'remove' | null>(null);
  const [bulkLabelInput, setBulkLabelInput] = useState('');
  const [bulkRemoveLabelId, setBulkRemoveLabelId] = useState('');
  const [labelActionMessage, setLabelActionMessage] = useState<string | null>(null);

  useEffect(() => {
    setLoading(false);
    if (typeof window !== 'undefined') {
      const fallback = { labels: [...seed.labels], assignments: [...seed.assetLabels] };
      try {
        setLabelState(parseCustomerLabelState(window.localStorage.getItem(CUSTOMER_LABELS_STORAGE_KEY), fallback));
      } catch {
        setLabelState(fallback);
      }
    }
  }, []);

  const labelFilterOptions = useMemo(() => {
    if (!session || !hasCapability(session, 'label.view')) return [];
    const options = new Map<string, Label>();
    seed.assets.filter(asset => isAssetVisible(session, asset.id)).forEach(asset => {
      if (getRelationship(session, asset.id) === 'renter') return;
      labelsForAsset(labelState, asset.id, asset.ownerTenantId).forEach(label => options.set(label.id, label));
    });
    return [...options.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [session, labelState]);

  const visibleAssets: AssetMarker[] = useMemo(() => {
    if (!session) return [];

    return seed.assets.filter(a => {
      if (!isAssetVisible(session, a.id)) return false;
      const status = computeStatus(a);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (selectedSite && a.homeSiteId !== selectedSite) return false;
      if (selectedClass && a.assetClass !== selectedClass) return false;
      const tier = a.canProfile.adapter === 'ALL-CAN300' ? 3 : a.canProfile.adapter === 'LVCAN200' ? 2 : 1;
      if (selectedTier !== 'all' && tier !== selectedTier) return false;
      if (selectedLabelIds.length > 0) {
        if (getRelationship(session, a.id) === 'renter') return false;
        const assetLabelIds = new Set(labelsForAsset(labelState, a.id, a.ownerTenantId).map(label => label.id));
        if (!selectedLabelIds.some(labelId => assetLabelIds.has(labelId))) return false;
      }
      if (session.tenantId) {
        const booking = seed.bookings.find(b => b.assetId === a.id && b.renterTenantId === session.tenantId);
        if (rentedFilter === 'owned' && booking) return false;
        if (rentedFilter === 'rented' && !booking) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!a.code.toLowerCase().includes(q) && !a.name.toLowerCase().includes(q) && !a.plateOrSerial.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    }).map(a => {
      const status = computeStatus(a);
      const tier = a.canProfile.adapter === 'ALL-CAN300' ? 3 : a.canProfile.adapter === 'LVCAN200' ? 2 : 1;
      const site = seed.sites.find(s => s.id === a.homeSiteId);
      const rel = getRelationship(session!, a.id);
      const isRented = rel === 'renter';
      const canManageAssetLabels = hasCapability(session!, 'label.manage')
        && (session!.isKasper || a.ownerTenantId === session!.tenantId);
      const labels = hasCapability(session!, 'label.view') && !isRented
        ? labelsForAsset(labelState, a.id, a.ownerTenantId)
        : [];
      const reading = getReadingForAsset(a);
      const pos: LatLng | undefined = reading ? { lat: reading.lat, lng: reading.lng } : site?.center;
      const lat = pos?.lat ?? 25.2048;
      const lng = pos?.lng ?? 55.2708;
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        status,
        lastUpdated: lastUpdatedStr(a),
        siteName: site?.name ?? '',
        tier,
        isRentedIn: isRented,
        lat,
        lng,
        asset: a,
        lastReadingMs: reading ? new Date(reading.deviceTime).getTime() : clock.now(),
        labels,
        canManageLabels: canManageAssetLabels,
      };
    });
  }, [session, statusFilter, selectedSite, selectedClass, selectedTier, selectedLabelIds, labelState, rentedFilter, searchQuery, phase, showHidden, salesView]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { live: 0, idle: 0, stale: 0, offline: 0, unknown: 0, no_tracker: 0 };
    visibleAssets.forEach(a => { counts[a.status]++; });
    return counts;
  }, [visibleAssets]);

  const siteOptions = useMemo(() => {
    if (!session) return [];
    if (session.siteIds.length > 0) return session.siteIds.map(id => seed.sites.find(s => s.id === id)!).filter(Boolean);
    if (session.isKasper) return seed.sites;
    return seed.sites.filter(s => s.tenantId === session.tenantId);
  }, [session]);

  const classOptions = useMemo(() => [...new Set(visibleAssets.map(a => a.asset.assetClass))], [visibleAssets]);
  const hasTierFilter = useMemo(() => new Set(visibleAssets.map(a => a.tier)).size > 1, [visibleAssets]);
  const hasRented = useMemo(() => session ? visibleAssets.some(a => a.isRentedIn) : false, [visibleAssets, session]);

  const totalVisible = visibleAssets.length;
  const selectedRows = visibleAssets.filter(asset => selectedAssetIds.includes(asset.id));
  const selectedTenantIds = new Set(selectedRows.map(asset => asset.asset.ownerTenantId));
  const selectedTenantId = selectedTenantIds.size === 1 ? selectedRows[0]?.asset.ownerTenantId ?? null : null;
  const canManageBulkLabels = selectedRows.length > 0
    && selectedTenantIds.size === 1
    && selectedRows.every(asset => asset.canManageLabels);
  const labelsAvailableToRemove = selectedTenantId && canManageBulkLabels
    ? labelState.labels.filter(label => label.tenantId === selectedTenantId && labelState.assignments.some(assignment =>
      assignment.tenantId === selectedTenantId && assignment.labelId === label.id && selectedRows.some(asset => asset.id === assignment.assetId),
    ))
    : [];

  const persistLabels = (next: CustomerLabelState) => {
    setLabelState(next);
    try {
      window.localStorage.setItem(CUSTOMER_LABELS_STORAGE_KEY, JSON.stringify(next));
      setLabelActionMessage(null);
    } catch {
      setLabelActionMessage('Label changes are visible for this visit, but browser storage is unavailable.');
    }
  };
  const addBulkLabel = () => {
    if (!session || !selectedTenantId || !canManageBulkLabels) return;
    const result = addLabelToAssets(labelState, {
      tenantId: selectedTenantId,
      assetIds: selectedRows.map(asset => asset.id),
      name: bulkLabelInput,
      createdBy: session.userId,
      createdAt: clock.now(),
      newLabelId: `l-${clock.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    if (!result.ok) { setLabelActionMessage(result.error); return; }
    persistLabels(result.state);
    setBulkLabelInput('');
    setBulkLabelMode(null);
  };
  const removeBulkLabel = () => {
    if (!selectedTenantId || !canManageBulkLabels || !bulkRemoveLabelId) return;
    const result = removeLabelFromAssets(labelState, {
      tenantId: selectedTenantId,
      assetIds: selectedRows.map(asset => asset.id),
      labelId: bulkRemoveLabelId,
    });
    if (!result.ok) { setLabelActionMessage(result.error); return; }
    persistLabels(result.state);
    setBulkRemoveLabelId('');
    setBulkLabelMode(null);
  };

  if (!session) return null;

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="flex flex-wrap gap-2">
        {STATUS_KEYS.map(key => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
              statusFilter === key
                ? 'bg-surface border-ink text-ink shadow-sm'
                : 'bg-paper border-line text-grey-700 hover:border-grey-500 hover:bg-paper-2'
            )}
          >
            <span className={clsx(
              'w-2 h-2 rounded-full',
              key === 'live' ? 'bg-live' :
              key === 'idle' ? 'bg-idle' :
              key === 'stale' ? 'bg-stale' :
              key === 'offline' ? 'bg-offline' :
              'bg-grey-500'
            )} />
            {key === 'no_tracker' ? 'No tracker' : key.charAt(0).toUpperCase() + key.slice(1)}
            <span className="font-mono text-grey-500 ml-1">{statusCounts[key]}</span>
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-xs text-grey-500 font-mono">{totalVisible} assets</span>
      </div>

      {loading ? (
        <div>
          <div className="h-[400px] bg-paper rounded-xl animate-pulse" />
          <div className="space-y-2 mt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-2 animate-pulse">
                <Skeleton width={32} height={32} borderRadius={6} />
                <div className="flex-1 space-y-1">
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="40%" height={12} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : visibleAssets.length === 0 ? (
        <EmptyState
          title="No assets match these filters"
          description="Try clearing some filters to see your assets."
          action={<Button variant="secondary" size="sm" onClick={() => { setStatusFilter('all'); setSelectedSite(null); setSelectedClass(null); setSelectedTier('all'); setSelectedLabelIds([]); setRentedFilter('all'); setSearchQuery(''); }}>Clear filters</Button>}
        />
      ) : (
        <>
          {/* Map */}
          <div className="rounded-xl border border-line bg-paper overflow-hidden h-[400px] sm:h-[480px] md:h-[520px] lg:h-[560px]">
            <MapContainer
              center={[25.2048, 55.2708]}
              zoom={10}
              scrollWheelZoom={true}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {visibleAssets.map(a => (
                <Marker
                  key={a.id}
                  position={[a.lat, a.lng]}
                  icon={createMarkerIcon(a.status, a.isRentedIn)}
                >
                  <Popup>
                    <div className="text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-ink">{a.code}</span>
                        <span className="text-xs text-grey-500">— {a.name}</span>
                      </div>
                      <div className="text-xs text-grey-700 mb-1">{a.status}</div>
                      <div className="text-xs text-grey-500 mb-2">{a.lastUpdated}</div>
                      {a.labels.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1">
                          {a.labels.map(label => <Badge key={label.id} variant="grey">{label.name}</Badge>)}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <TierChip tier={a.tier} />
                        <Link
                          href={`/app/assets/${a.id}`}
                          className="text-xs text-yellow hover:text-ink font-medium"
                        >
                          Open →
                        </Link>
                      </div>
                      {a.isRentedIn && (
                        <div className="mt-1 text-xs text-yellow font-medium">Rented</div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
              <MapBoundsUpdater assets={visibleAssets} />
            </MapContainer>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="min-w-[14rem] flex-1 text-xs text-grey-500">
              Find an asset
              <input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Code, name or plate" className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-grey-700 focus:border-ink focus:outline-none" />
            </label>
            {searchQuery && <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')}>Clear search</Button>}
          </div>
          {siteOptions.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-grey-500 font-medium">Site:</span>
              {siteOptions.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSite(selectedSite === s.id ? null : s.id)}
                  className={clsx(
                    'px-2 py-1 text-xs rounded-lg border transition-colors capitalize',
                    selectedSite === s.id ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
          {classOptions.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-grey-500 font-medium">Type:</span>
              {classOptions.map(cls => (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(selectedClass === cls ? null : cls)}
                  className={clsx(
                    'px-2 py-1 text-xs rounded-lg border transition-colors capitalize',
                    selectedClass === cls ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                  )}
                >
                  {cls.replace('_', ' ')}
                </button>
              ))}
            </div>
          )}
          {hasTierFilter && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-grey-500 font-medium">Tier:</span>
              <TierFilterButton label="All" selected={selectedTier === 'all'} onClick={() => setSelectedTier('all')} />
              <TierFilterButton label="T1" selected={selectedTier === 1} onClick={() => setSelectedTier(1)} tier={1} />
              <TierFilterButton label="T2" selected={selectedTier === 2} onClick={() => setSelectedTier(2)} tier={2} />
              <TierFilterButton label="T3" selected={selectedTier === 3} onClick={() => setSelectedTier(3)} tier={3} />
            </div>
          )}
          {hasRented && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-grey-500 font-medium">Show:</span>
              {(['all', 'owned', 'rented'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRentedFilter(r)}
                  className={clsx(
                    'px-2 py-1 text-xs rounded-lg border transition-colors capitalize',
                    rentedFilter === r ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                  )}
                >
                  {r === 'all' ? 'All' : r === 'owned' ? 'Owned' : 'Rented in'}
                </button>
              ))}
            </div>
          )}
          {labelFilterOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-grey-500">Label:</span>
              {labelFilterOptions.map(label => (
                <label key={label.id} className={clsx(
                  'flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors',
                  selectedLabelIds.includes(label.id) ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-grey-700 hover:border-grey-500',
                )}>
                  <input
                    type="checkbox"
                    checked={selectedLabelIds.includes(label.id)}
                    onChange={() => setSelectedLabelIds(current => current.includes(label.id)
                      ? current.filter(id => id !== label.id)
                      : [...current, label.id])}
                    className="accent-yellow"
                  />
                  {label.name}
                </label>
              ))}
              <span className="text-[11px] text-grey-500">Any selected label</span>
              {selectedLabelIds.length > 0 && <button onClick={() => setSelectedLabelIds([])} className="text-xs text-grey-500 underline">Clear labels</button>}
            </div>
          )}
          {/* Asset list and label bulk actions */}
          <div className="rounded-xl border border-line bg-surface overflow-hidden mt-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <h2 className="text-sm font-medium text-ink">Assets</h2>
                <p className="text-xs text-grey-500 mt-0.5">{visibleAssets.length} shown · {selectedRows.length} selected</p>
              </div>
              {canManageBulkLabels && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setBulkLabelMode('add'); setLabelActionMessage(null); }}>
                    Add label
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => { setBulkLabelMode('remove'); setLabelActionMessage(null); }}>
                    Remove label
                  </Button>
                </div>
              )}
            </div>

            {selectedRows.length > 0 && !canManageBulkLabels && (
              <div className="border-b border-line bg-paper-2 px-4 py-2 text-xs text-grey-500">
                {selectedTenantIds.size > 1
                  ? 'Select assets from one owner company to manage labels.'
                  : 'Only an owner company admin can change labels.'}
              </div>
            )}

            {bulkLabelMode && canManageBulkLabels && selectedTenantId && (
              <div className="flex flex-wrap items-end gap-2 border-b border-line bg-paper-2 px-4 py-3">
                {bulkLabelMode === 'add' ? (
                  <label className="min-w-[14rem] flex-1 text-xs text-grey-500">
                    Choose a label or enter a new one
                    <input
                      role="combobox"
                      aria-label="Choose or create a label for selected assets"
                      aria-autocomplete="list"
                      list={`bulk-label-options-${selectedTenantId}`}
                      value={bulkLabelInput}
                      onChange={event => setBulkLabelInput(event.target.value)}
                      maxLength={40}
                      className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-grey-700 focus:border-ink focus:outline-none"
                    />
                    <datalist id={`bulk-label-options-${selectedTenantId}`}>
                      {labelState.labels.filter(label => label.tenantId === selectedTenantId).map(label => <option key={label.id} value={label.name} />)}
                    </datalist>
                  </label>
                ) : (
                  <label className="min-w-[14rem] flex-1 text-xs text-grey-500">
                    Label to remove
                    <select value={bulkRemoveLabelId} onChange={event => setBulkRemoveLabelId(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-grey-700 focus:border-ink focus:outline-none">
                      <option value="">Choose a label</option>
                      {labelsAvailableToRemove.map(label => <option key={label.id} value={label.id}>{label.name}</option>)}
                    </select>
                  </label>
                )}
                <Button size="sm" onClick={bulkLabelMode === 'add' ? addBulkLabel : removeBulkLabel}>
                  {bulkLabelMode === 'add' ? `Add to ${selectedRows.length} assets` : `Remove from ${selectedRows.length} assets`}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setBulkLabelMode(null)}>Cancel</Button>
              </div>
            )}
            {labelActionMessage && <div role="status" className="border-b border-line px-4 py-2 text-xs text-grey-700">{labelActionMessage}</div>}

            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-paper-2 text-grey-500">
                    <th className="px-3 py-2 text-left font-medium">
                      <input
                        type="checkbox"
                        aria-label="Select all visible assets"
                        checked={visibleAssets.length > 0 && visibleAssets.every(asset => selectedAssetIds.includes(asset.id))}
                        onChange={() => setSelectedAssetIds(current => {
                          const allVisibleSelected = visibleAssets.length > 0 && visibleAssets.every(asset => current.includes(asset.id));
                          if (allVisibleSelected) return current.filter(id => !visibleAssets.some(asset => asset.id === id));
                          return [...new Set([...current, ...visibleAssets.map(asset => asset.id)])];
                        })}
                        className="accent-yellow"
                      />
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Asset</th>
                    <th className="px-3 py-2 text-left font-medium">Site · last seen</th>
                    <th className="px-3 py-2 text-left font-medium">Labels</th>
                    <th className="px-3 py-2 text-left font-medium">Tier</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAssets.map(a => (
                    <tr key={a.id} className="bg-paper hover:bg-paper-2">
                      <td className="border-b border-line px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${a.code}`}
                          checked={selectedAssetIds.includes(a.id)}
                          onChange={() => setSelectedAssetIds(current => current.includes(a.id)
                            ? current.filter(id => id !== a.id)
                            : [...current, a.id])}
                          className="accent-yellow"
                        />
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        <Link href={`/app/assets/${a.id}`} className="font-medium text-ink hover:underline">{a.code} — {a.name}</Link>
                        {a.isRentedIn && <Badge variant="yellow" className="ml-2">Rented</Badge>}
                      </td>
                      <td className="border-b border-line px-3 py-2 text-grey-500">{a.siteName} · {a.lastUpdated}</td>
                      <td className="border-b border-line px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {a.labels.length > 0
                            ? a.labels.map(label => <Badge key={label.id} variant="grey">{label.name}</Badge>)
                            : <span className="text-grey-500">—</span>}
                        </div>
                      </td>
                      <td className="border-b border-line px-3 py-2"><TierChip tier={a.tier} /></td>
                      <td className={clsx('border-b border-line px-3 py-2 font-medium', a.status === 'live' ? 'text-live' : a.status === 'idle' ? 'text-[#B89000]' : a.status === 'offline' ? 'text-red' : 'text-grey-500')}>
                        {a.status}
                      </td>
                    </tr>
                  ))}
                  {visibleAssets.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-grey-500">No assets match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TierFilterButton({ label, selected, onClick, tier }: { label: string; selected: boolean; onClick: () => void; tier?: 1 | 2 | 3 }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-2 py-1 text-xs rounded-lg border transition-colors font-mono flex items-center gap-1',
        selected ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
      )}
    >
      {tier !== undefined && <TierChip tier={tier} />}
      {label}
    </button>
  );
}
