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
import { useDb, type DbState, isAssetVisible, getRelationship, getReadingForAsset } from '@/server/api';
import * as clock from '@/lib/clock';
import type { Asset, LatLng } from '@/domain/types';
import { useT, useHref, useLocale } from '@/i18n';
import { translate, type Locale } from '@/i18n/dictionary';
import { useSession, useSwitches } from '@/hooks';

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
}

function computeStatus(asset: Asset, data: Pick<DbState, 'pairings' | 'trackers'>, sessionMs: number = clock.now()): 'live' | 'idle' | 'stale' | 'offline' | 'unknown' | 'no_tracker' {
  const pairing = data.pairings.find(p => p.assetId === asset.id && p.to === null);
  if (!pairing) return 'no_tracker';
  const tracker = data.trackers.find(t => t.id === pairing.trackerId);
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

function lastUpdatedStr(asset: Asset, locale: Locale): string {
  const reading = getReadingForAsset(asset);
  if (!reading) return translate(locale, 'common.no_data', 'No data');
  const ms = new Date(reading.deviceTime).getTime();
  const ageMin = clock.minutesSinceDubai(ms);
  const ageH = clock.hoursSinceDubai(ms);
  if (ageMin < 60) {
    return translate(locale, 'map.updated_ago', '{time} · {minutes} min ago', {
      time: clock.formatDubaiTime(ms), minutes: Math.round(ageMin),
    });
  }
  return translate(locale, 'map.updated_ago', '{time} · {hours} h ago', {
    time: clock.formatDubaiTime(ms), hours: Math.round(ageH),
  });
}

const STATUS_KEYS = ['live', 'idle', 'stale', 'offline', 'unknown', 'no_tracker'] as const;
type StatusKey = typeof STATUS_KEYS[number];

/** English fallbacks for the status words in ar.json (common.status.*). */
const STATUS_LABELS: Record<StatusKey, string> = {
  live: 'Live',
  idle: 'Idle',
  stale: 'Stale',
  offline: 'Offline',
  unknown: 'Unknown',
  no_tracker: 'No tracker',
};

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
  const seed = useDb(s => s);
  const t = useT();
  const href = useHref();
  const locale = useLocale();
  const session = useSession();
  const { phase } = useSwitches();
  const { showHidden } = useSwitches();
  const { salesView } = useSwitches();

  const [statusFilter, setStatusFilter] = useState<StatusKey | 'all'>('all');
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<'all' | 1 | 2 | 3>('all');
  const [rentedFilter, setRentedFilter] = useState<'all' | 'owned' | 'rented'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  const visibleAssets: AssetMarker[] = useMemo(() => {
    if (!session) return [];

    return seed.assets.filter(a => {
      if (!isAssetVisible(session, a.id)) return false;
      const status = computeStatus(a, seed);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (selectedSite && a.homeSiteId !== selectedSite) return false;
      if (selectedClass && a.assetClass !== selectedClass) return false;
      const tier = a.canProfile.adapter === 'ALL-CAN300' ? 3 : a.canProfile.adapter === 'LVCAN200' ? 2 : 1;
      if (selectedTier !== 'all' && tier !== selectedTier) return false;
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
      const status = computeStatus(a, seed);
      const tier = a.canProfile.adapter === 'ALL-CAN300' ? 3 : a.canProfile.adapter === 'LVCAN200' ? 2 : 1;
      const site = seed.sites.find(s => s.id === a.homeSiteId);
      const rel = getRelationship(session!, a.id);
      const isRented = rel === 'renter';
      const reading = getReadingForAsset(a);
      const pos: LatLng | undefined = reading ? { lat: reading.lat, lng: reading.lng } : site?.center;
      const lat = pos?.lat ?? 25.2048;
      const lng = pos?.lng ?? 55.2708;
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        status,
        lastUpdated: lastUpdatedStr(a, locale),
        siteName: site?.name ?? '',
        tier,
        isRentedIn: isRented,
        lat,
        lng,
        asset: a,
        lastReadingMs: reading ? new Date(reading.deviceTime).getTime() : clock.now(),
      };
    });
  }, [session, statusFilter, selectedSite, selectedClass, selectedTier, rentedFilter, searchQuery, phase, showHidden, salesView, locale]);

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
            {t(`common.status.${key}`, STATUS_LABELS[key])}
            <span className="font-mono text-grey-500 ml-1">{statusCounts[key]}</span>
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-xs text-grey-500 font-mono">{t('common.assets_count', '{count} assets', { count: totalVisible })}</span>
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
          title={t('map.no_assets_match', 'No assets match these filters')}
          description={t('map.no_assets_match_hint', 'Try clearing some filters to see your assets.')}
          action={<Button variant="secondary" size="sm" onClick={() => { setStatusFilter('all'); setSelectedSite(null); setSelectedClass(null); setSelectedTier('all'); setRentedFilter('all'); setSearchQuery(''); }}>{t('common.clear_filters', 'Clear filters')}</Button>}
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
                      <div className="text-xs text-grey-700 mb-1">{t(`common.status.${a.status}`, STATUS_LABELS[a.status as StatusKey] ?? a.status)}</div>
                      <div className="text-xs text-grey-500 mb-2">{a.lastUpdated}</div>
                      <div className="flex items-center justify-between">
                        <TierChip tier={a.tier} />
                        <Link
                          href={href(`/app/assets/${a.id}`)}
                          className="text-xs text-yellow hover:text-ink font-medium"
                        >
                          {t('map.open', 'Open')} <span className="arrow-forward">→</span>
                        </Link>
                      </div>
                      {a.isRentedIn && (
                        <div className="mt-1 text-xs text-yellow font-medium">{t('common.status.rented', 'Rented')}</div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
              <MapBoundsUpdater assets={visibleAssets} />
            </MapContainer>
          </div>

          {/* Filters */}
          {siteOptions.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-grey-500 font-medium">{t('map.filters.site', 'Site:')}</span>
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
              <span className="text-xs text-grey-500 font-medium">{t('map.filters.type', 'Type:')}</span>
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
              <span className="text-xs text-grey-500 font-medium">{t('map.filters.tier', 'Tier:')}</span>
              <TierFilterButton label={t('common.all', 'All')} selected={selectedTier === 'all'} onClick={() => setSelectedTier('all')} />
              <TierFilterButton label="T1" selected={selectedTier === 1} onClick={() => setSelectedTier(1)} tier={1} />
              <TierFilterButton label="T2" selected={selectedTier === 2} onClick={() => setSelectedTier(2)} tier={2} />
              <TierFilterButton label="T3" selected={selectedTier === 3} onClick={() => setSelectedTier(3)} tier={3} />
            </div>
          )}
          {hasRented && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-grey-500 font-medium">{t('map.filters.show', 'Show:')}</span>
              {(['all', 'owned', 'rented'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRentedFilter(r)}
                  className={clsx(
                    'px-2 py-1 text-xs rounded-lg border transition-colors capitalize',
                    rentedFilter === r ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                  )}
                >
                  {r === 'all'
                    ? t('map.filters.rented_all', 'All')
                    : r === 'owned'
                      ? t('map.filters.rented_owned', 'Owned')
                      : t('map.filters.rented_in', 'Rented in')}
                </button>
              ))}
            </div>
          )}
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-xs text-grey-500 hover:text-ink">{t('common.clear_search', 'Clear search')}</button>
          )}

          {/* List panel */}
          <div className="rounded-xl border border-line bg-surface overflow-hidden max-h-[360px] overflow-y-auto mt-2">
            <div className="divide-y divide-line">
              {visibleAssets.map(a => (
                <Link
                  key={a.id}
                  href={href(`/app/assets/${a.id}`)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-paper-2/50 transition-colors"
                >
                  <div className={clsx(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-mono font-semibold border',
                    a.status === 'live' ? 'bg-live/10 text-live border-live/20' :
                    a.status === 'idle' ? 'bg-idle/10 text-[#B89000] border-idle/20' :
                    a.status === 'offline' ? 'bg-red/10 text-red border-red/20' :
                    a.status === 'stale' ? 'bg-stale/10 text-stale border-stale/20' :
                    'bg-paper border-line text-grey-700'
                  )}>
                    {a.code}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink truncate">{a.code} — {a.name}</span>
                      {a.isRentedIn && <Badge variant="yellow">{t('common.status.rented', 'Rented')}</Badge>}
                    </div>
                    <div className="text-xs text-grey-500 mt-0.5">
                      {a.siteName} · {a.lastUpdated}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <TierChip tier={a.tier} />
                    <span className={clsx(
                      'text-xs font-medium',
                      a.status === 'live' ? 'text-live' :
                      a.status === 'idle' ? 'text-[#B89000]' :
                      a.status === 'offline' ? 'text-red' :
                      a.status === 'stale' ? 'text-stale' :
                      'text-grey-500'
                    )}>
                      {t(`common.status.${a.status}`, STATUS_LABELS[a.status as StatusKey] ?? a.status)}
                    </span>
                  </div>
                </Link>
              ))}
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
