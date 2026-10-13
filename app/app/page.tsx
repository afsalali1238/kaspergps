'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  TierChip, Badge, EmptyState, Skeleton,
  Button, SourceLabel,
} from '@/components/ui';
import { ClusterLayer, escapeHtml, type ClusterMarker } from '@/components/map/ClusterLayer';
import { FilterMenu } from '@/components/filters/FilterMenu';
import { LabelCombobox } from '@/components/labels/LabelCombobox';
import { GeofenceOverlayLayer, type OverlayFence } from '@/components/geofences/GeofenceMap';
import {
  useDb, isAssetVisible, getRelationship, getReadingForAsset, visibleAlerts, fleetTodayTotals, engineHoursToday, hoursSourceFor, computeStatus,
  can, labelIdsByAsset, labelsVisibleTo, addLabelToAssets, removeLabelFromAssets, visibleGeofences, viewerSiteId,
} from '@/server/api';
import { hasFeature } from '@/domain/features';
import * as clock from '@/lib/clock';
import type { Asset, Label, LatLng } from '@/domain/types';
import { useT, useHref, useLocale } from '@/i18n';
import { translate, type Locale } from '@/i18n/dictionary';
import { useSession, useSwitches, useNow } from '@/hooks';
import { COLORS, MAP_STATUS_COLORS, geofenceColor } from '@/config/colors';

// Fix Leaflet default icon issue
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});


function createMarkerIcon(status: string, isRented: boolean) {
  const color = MAP_STATUS_COLORS[status] ?? COLORS.muted;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
      <div style="position: relative; width: 24px; height: 36px;">
        <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 16px; height: 16px; background: ${color}; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);${isRented ? ' outline: 2px solid ${COLORS.accent}; outline-offset: 2px;' : ''}"></div>
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
  /** Phase 2+ list columns (spec 11.2) — null when this asset can't measure it. */
  fuelPct: number | null;
  engineHoursToday: number | null;
  hoursSource: ReturnType<typeof hoursSourceFor>;
  openAlerts: number;
  /** Labels this viewer may see on the asset (none for a renter). */
  labels: Label[];
}

function lastUpdatedStr(asset: Asset, locale: Locale): string {
  const reading = getReadingForAsset(asset);
  if (!reading) return translate(locale, 'common.no_data', 'No data');
  const ms = new Date(reading.deviceTime).getTime();
  const ageMin = clock.minutesSinceDubai(ms);
  const ageH = clock.hoursSinceDubai(ms);
  // The age phrase comes from the shell keys, which are translated with their own
  // plurals; map.updated_ago only joins the time and that phrase.
  const ago = ageMin < 60
    ? translate(locale, 'shell.min_ago', '{count} min ago', { count: Math.round(ageMin) })
    : translate(locale, 'shell.hours_ago', '{count} h ago', { count: Math.round(ageH) });
  return translate(locale, 'map.updated_ago', '{time} · {ago}', {
    time: clock.formatDubaiTime(ms), ago,
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
  // The clock moves rentals in and out of view; the memos below re-run on each tick.
  const now = useNow();
  const { phase } = useSwitches();
  const { showHidden } = useSwitches();
  const { salesView } = useSwitches();

  const [statusFilter, setStatusFilter] = useState<StatusKey | 'all'>('all');
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<'all' | 1 | 2 | 3>('all');
  const [rentedFilter, setRentedFilter] = useState<'all' | 'owned' | 'rented'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [labelVersion, setLabelVersion] = useState(0);
  const [labelNotice, setLabelNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [urlReady, setUrlReady] = useState(false);
  const [removeLabelId, setRemoveLabelId] = useState('');
  const [showGeofences, setShowGeofences] = useState(false);
  // Phones show one of the map or the list (spec §11.2). Desktop shows both.
  const [phoneView, setPhoneView] = useState<'map' | 'list'>('list');
  // Map tiles: after three failed tiles in a row the map steps aside, so the list
  // takes the screen. A Retry remounts the map.
  const [tilesFailed, setTilesFailed] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const tileErrors = useRef(0);

  useEffect(() => {
    setLoading(false);
  }, []);

  // Filters live in the URL (spec §11.2): read them once on arrival, then keep the
  // address bar in step, so Back to this page brings the same filters back.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const status = q.get('status');
    if (status && (STATUS_KEYS as readonly string[]).includes(status)) setStatusFilter(status as StatusKey);
    if (q.get('site')) setSelectedSite(q.get('site'));
    if (q.get('class')) setSelectedClass(q.get('class'));
    const tier = q.get('tier');
    if (tier === '1' || tier === '2' || tier === '3') setSelectedTier(Number(tier) as 1 | 2 | 3);
    const rented = q.get('rented');
    if (rented === 'owned' || rented === 'rented') setRentedFilter(rented);
    if (q.get('q')) setSearchQuery(q.get('q') ?? '');
    const labels = q.get('labels');
    if (labels) setSelectedLabelIds(labels.split(',').filter(Boolean));
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    const q = new URLSearchParams();
    if (statusFilter !== 'all') q.set('status', statusFilter);
    if (selectedSite) q.set('site', selectedSite);
    if (selectedClass) q.set('class', selectedClass);
    if (selectedTier !== 'all') q.set('tier', String(selectedTier));
    if (rentedFilter !== 'all') q.set('rented', rentedFilter);
    if (searchQuery) q.set('q', searchQuery);
    if (selectedLabelIds.length) q.set('labels', selectedLabelIds.join(','));
    const search = q.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
  }, [urlReady, statusFilter, selectedSite, selectedClass, selectedTier, rentedFilter, searchQuery, selectedLabelIds]);

  // Labels: the company's own labels on the assets this viewer can see. Renters get none.
  const labelMap = useMemo(() => (session ? labelIdsByAsset(session) : new Map<string, string[]>()), [session, labelVersion, now]);
  const labelOptions = useMemo(() => (session ? labelsVisibleTo(session) : []), [session, labelVersion]);
  const labelById = useMemo(() => new Map(labelOptions.map(l => [l.id, l])), [labelOptions]);
  const canLabel = useMemo(() => (session ? can(session, 'label.manage') : false), [session]);
  const labelsUsedOnVisible = useMemo(() => {
    const ids = new Set<string>();
    labelMap.forEach(list => list.forEach(id => ids.add(id)));
    return labelOptions.filter(l => ids.has(l.id));
  }, [labelMap, labelOptions]);
  // Labels on the current selection, offered for removal.
  const bulkRemovable = useMemo(() => {
    const ids = new Set<string>();
    bulkIds.forEach(id => (labelMap.get(id) ?? []).forEach(l => ids.add(l)));
    return labelOptions.filter(l => ids.has(l.id));
  }, [bulkIds, labelMap, labelOptions]);

  // Open alerts per asset, for the list badges and the "Open alerts" tile.
  // Declared before visibleAssets, which reads it (main crashed here).
  const openAlerts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!session || phase === 'day_one') return counts;
    for (const alert of visibleAlerts(session, phase)) {
      if (alert.status !== 'open' || !alert.assetId) continue;
      counts.set(alert.assetId, (counts.get(alert.assetId) ?? 0) + 1);
    }
    return counts;
  }, [session, phase, now]);

  const visibleAssets: AssetMarker[] = useMemo(() => {
    if (!session) return [];

    return seed.assets.filter(a => {
      if (!isAssetVisible(session, a.id)) return false;
      const status = computeStatus(a);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (selectedSite && viewerSiteId(session, a.id) !== selectedSite) return false;
      if (selectedClass && a.assetClass !== selectedClass) return false;
      const tier = a.canProfile.adapter === 'ALL-CAN300' ? 3 : a.canProfile.adapter === 'LVCAN200' ? 2 : 1;
      if (selectedTier !== 'all' && tier !== selectedTier) return false;
      if (session.tenantId) {
        const rentedIn = getRelationship(session, a.id) === 'renter';
        if (rentedFilter === 'owned' && rentedIn) return false;
        if (rentedFilter === 'rented' && !rentedIn) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!a.code.toLowerCase().includes(q) && !a.name.toLowerCase().includes(q) && !a.plateOrSerial.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (selectedLabelIds.length) {
        // Any-of: the asset shows if it carries at least one chosen label.
        const ids = labelMap.get(a.id) ?? [];
        if (!selectedLabelIds.some(id => ids.includes(id))) return false;
      }
      return true;
    }).map(a => {
      const status = computeStatus(a);
      const tier = a.canProfile.adapter === 'ALL-CAN300' ? 3 : a.canProfile.adapter === 'LVCAN200' ? 2 : 1;
      const site = seed.sites.find(s => s.id === viewerSiteId(session!, a.id));
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
        fuelPct: reading && hasFeature(a, 'fuel.level') && reading.fuelLevelPct !== undefined
          ? Math.round(reading.fuelLevelPct)
          : null,
        engineHoursToday: engineHoursToday(a),
        hoursSource: hoursSourceFor(a),
        openAlerts: openAlerts.get(a.id) ?? 0,
        labels: (labelMap.get(a.id) ?? []).map(id => labelById.get(id)).filter((l): l is Label => Boolean(l)),
      };
    });
  }, [session, statusFilter, selectedSite, selectedClass, selectedTier, rentedFilter, searchQuery, selectedLabelIds, phase, showHidden, salesView, locale, openAlerts, now, labelMap, labelById]);

  // The user's geofences, for the optional overlay (spec §11.12).
  const geofenceOverlay: OverlayFence[] = useMemo(() => {
    if (!session || !showGeofences) return [];
    return visibleGeofences(session)
      .filter(g => (g.shape === 'circle' ? g.center : (g.points?.length ?? 0) >= 3))
      .map(g => ({
        id: g.id,
        name: g.name,
        colour: geofenceColor(g.kind),
        shape: g.shape === 'circle'
          ? { type: 'circle' as const, center: g.center!, radiusM: g.radiusM ?? 0 }
          : { type: 'polygon' as const, points: g.points! },
      }));
  }, [session, showGeofences, now, seed.geofences]);

  // Clustered markers (spec §11.2): status-coloured pins merge into count bubbles.
  const clusterMarkers: ClusterMarker[] = useMemo(() => visibleAssets.map(a => ({
    id: a.id,
    lat: a.lat,
    lng: a.lng,
    icon: createMarkerIcon(a.status, a.isRentedIn),
    popupHtml: `<div style="text-align:left;min-width:160px">
      <div style="font-size:14px;font-weight:600;color:${COLORS.ink}">${escapeHtml(a.code)} <span style="font-size:12px;font-weight:400;color:${COLORS.secondary}">— ${escapeHtml(a.name)}</span></div>
      <div style="font-size:12px;color:${COLORS.slate};margin-top:4px">${escapeHtml(t(`common.status.${a.status}`, STATUS_LABELS[a.status as StatusKey] ?? a.status))}</div>
      <div style="font-size:12px;color:${COLORS.secondary};margin-top:2px">${escapeHtml(a.lastUpdated)}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <span style="font-size:11px;color:${COLORS.secondary}">T${a.tier}</span>
        <a href="${escapeHtml(href(`/app/assets/${a.id}`))}" style="font-size:12px;color:${COLORS.warnInk};font-weight:500">${escapeHtml(t('map.open', 'Open'))} →</a>
      </div>
      ${a.isRentedIn ? `<div style="font-size:12px;color:${COLORS.warnInk};font-weight:500;margin-top:4px">${escapeHtml(t('common.status.rented', 'Rented'))}</div>` : ''}
    </div>`,
  })), [visibleAssets, t, href]);

  const visibleOpenAlerts = useMemo(
    () => visibleAssets.reduce((sum, a) => sum + (openAlerts.get(a.id) ?? 0), 0),
    [visibleAssets, openAlerts]
  );

  // Phase 2+ "today" tiles (spec 11.2). An asset that can't meter a number
  // contributes nothing, and a tile with no measuring asset is not shown at all.
  const today = useMemo(() => {
    if (!session || phase === 'day_one') return null;
    return fleetTodayTotals(visibleAssets.map(a => a.asset));
  }, [session, phase, visibleAssets]);

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
  // §11.2: the Owned / Rented in switch shows only to a user who has both (kept while a choice is active).
  const hasRented = useMemo(
    () => session ? rentedFilter !== 'all' || (visibleAssets.some(a => a.isRentedIn) && visibleAssets.some(a => !a.isRentedIn)) : false,
    [visibleAssets, session, rentedFilter]
  );

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

      {today && (today.engineAssets > 0 || today.fuelAssets > 0 || openAlerts.size > 0) && (
        <div className="flex flex-wrap gap-2" data-testid="today-tiles">
          {today.engineAssets > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-line bg-surface text-xs">
              <span className="text-grey-500">{t('map.kpi.engine_hours_today', 'Engine hours today (ECU)')}</span>
              <span className="font-mono font-semibold text-ink">
                {t('common.hours_short', '{value} h', { value: today.engineHours.toFixed(1) })}
              </span>
              <span className="text-[10px] text-grey-500">{t('common.assets_count', '{count} assets', { count: today.engineAssets })}</span>
            </div>
          )}
          {today.fuelAssets > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-line bg-surface text-xs">
              <span className="text-grey-500">{t('map.kpi.fuel_used_today', 'Fuel used today')}</span>
              <span className="font-mono font-semibold text-ink">
                {t('map.kpi.litres_short', '{value} L', { value: today.fuelLitres.toFixed(1) })}
              </span>
              {today.fuelEstimatedAssets > 0 && (
                <SourceLabel source="Estimated" inline />
              )}
              <span className="text-[10px] text-grey-500">{t('common.assets_count', '{count} assets', { count: today.fuelAssets })}</span>
            </div>
          )}
          {openAlerts.size > 0 && (
            <Link
              href={href('/app/alerts')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-line bg-surface text-xs hover:border-grey-500 hover:bg-paper-2"
            >
              <span className="text-grey-500">{t('map.kpi.open_alerts', 'Open alerts')}</span>
              <span className="font-mono font-semibold text-bad-ink">{visibleOpenAlerts}</span>
            </Link>
          )}
        </div>
      )}

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
          action={<Button variant="secondary" size="sm" onClick={() => { setStatusFilter('all'); setSelectedSite(null); setSelectedClass(null); setSelectedTier('all'); setRentedFilter('all'); setSearchQuery(''); setSelectedLabelIds([]); }}>{t('common.clear_filters', 'Clear filters')}</Button>}
        />
      ) : (
        <>
          {/* Map | List on phones (spec §11.2). The list is the phone default so the
              assets are on screen without a tap; the map is one tap away. */}
          <div className="lg:hidden flex gap-1" role="tablist" aria-label="Map or list">
            {(['map', 'list'] as const).map(view => (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={phoneView === view}
                onClick={() => setPhoneView(view)}
                className={clsx(
                  'px-3 py-1.5 text-xs rounded-lg border transition-colors',
                  phoneView === view ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                )}
              >
                {view === 'map' ? t('map.map_tab', 'Map') : t('map.list_tab', 'List')}
              </button>
            ))}
          </div>

          {/* Filters: above the map and the list on desktop (spec §11.2). */}
          <div className={clsx('space-y-3', phoneView === 'map' && 'hidden lg:block')} data-testid="map-filters">
          {/* Filters */}
          {siteOptions.length > 1 && (
            <div className="flex flex-wrap gap-2 items-center">
              <FilterMenu
                label={t('map.filters.site', 'Site:')}
                value={selectedSite}
                allLabel={t('map.filters.all_sites', 'All sites')}
                options={siteOptions.map(s => ({ value: s.id, label: s.name }))}
                onChange={setSelectedSite}
              />
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={showGeofences}
              onClick={() => setShowGeofences(v => !v)}
              className={clsx(
                'px-2 py-1 text-xs rounded-lg border transition-colors',
                showGeofences ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
              )}
            >
              {t('map.filters.geofences', 'Geofences')}
            </button>
          </div>
          {labelsUsedOnVisible.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Labels">
              <span className="text-xs text-grey-500 font-medium">{t('map.filters.labels', 'Labels:')}</span>
              {labelsUsedOnVisible.map(l => {
                const on = selectedLabelIds.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelectedLabelIds(on ? selectedLabelIds.filter(x => x !== l.id) : [...selectedLabelIds, l.id])}
                    className={clsx(
                      'px-2 py-1 text-xs rounded-lg border transition-colors',
                      on ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                    )}
                  >
                    {l.name}
                  </button>
                );
              })}
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

          {labelNotice && (
            <p role={labelNotice.tone === 'error' ? 'alert' : 'status'} className={clsx('text-xs px-3 py-2 rounded-lg border', labelNotice.tone === 'error' ? 'text-red border-red/40 bg-red/5' : 'text-ink border-yellow-dark/40 bg-yellow/10')}>
              {labelNotice.text}
            </p>
          )}

          {canLabel && bulkIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border border-line bg-paper-2 text-xs" role="region" aria-label="Bulk actions">
              <span className="font-medium text-ink">{t('map.bulk.selected', '{count} selected', { count: bulkIds.length })}</span>
              <LabelCombobox
                options={labelOptions.map(l => ({ id: l.id, name: l.name }))}
                buttonLabel={t('map.bulk.add_label', 'Add label')}
                placeholder={t('map.bulk.label_name', 'Label name')}
                onChoose={choice => {
                  const result = addLabelToAssets(session, choice, bulkIds);
                  setLabelNotice({ tone: result.ok ? 'ok' : 'error', text: (result.ok ? result.message : result.error) ?? '' });
                  if (result.ok) setLabelVersion(v => v + 1);
                }}
              />
              {bulkRemovable.length > 0 && (
                <>
                  <label className="flex items-center gap-1 text-grey-500">
                    <span className="sr-only">{t('map.bulk.remove_label', 'Remove label')}</span>
                    <select
                      aria-label={t('map.bulk.remove_label', 'Remove label')}
                      value={removeLabelId}
                      onChange={e => setRemoveLabelId(e.target.value)}
                      className="px-2 py-1 rounded-lg border border-line bg-paper text-grey-700"
                    >
                      <option value="">{t('map.bulk.pick_label', 'Pick a label')}</option>
                      {bulkRemovable.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </label>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!removeLabelId}
                    onClick={() => {
                      const result = removeLabelFromAssets(session, removeLabelId, bulkIds);
                      setLabelNotice({ tone: result.ok ? 'ok' : 'error', text: (result.ok ? result.message : result.error) ?? '' });
                      if (result.ok) { setLabelVersion(v => v + 1); setRemoveLabelId(''); }
                    }}
                  >
                    {t('map.bulk.remove_action', 'Remove label')}
                  </Button>
                </>
              )}
              <Button size="sm" variant="secondary" onClick={() => setBulkIds([])}>{t('map.bulk.clear', 'Clear selection')}</Button>
            </div>
          )}

          </div>

          <div className={clsx('lg:items-start lg:gap-4', tilesFailed ? '' : 'lg:grid lg:grid-cols-[minmax(0,1fr)_22rem]')}>
            <div className={clsx(phoneView === 'list' && 'hidden lg:block')}>
          {/* Map */}
          {tilesFailed && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border border-red/40 bg-red/5 text-xs text-ink">
              <span>{t('map.tiles_failed', 'The map could not load. Every asset is still in the list below.')}</span>
              <Button size="sm" variant="secondary" onClick={() => { tileErrors.current = 0; setTilesFailed(false); setMapKey(k => k + 1); }}>
                {t('common.retry', 'Retry')}
              </Button>
            </div>
          )}
          <div className={clsx('rounded-xl border border-line bg-paper overflow-hidden h-[400px] sm:h-[480px] md:h-[520px] lg:h-[560px]', tilesFailed && 'hidden')}>
            <MapContainer
              key={mapKey}
              center={[25.2048, 55.2708]}
              zoom={10}
              scrollWheelZoom={true}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                eventHandlers={{
                  tileerror: () => {
                    tileErrors.current += 1;
                    if (tileErrors.current >= 3) setTilesFailed(true);
                  },
                  tileload: () => { tileErrors.current = 0; },
                }}
              />
              <ClusterLayer markers={clusterMarkers} />
              {showGeofences && <GeofenceOverlayLayer fences={geofenceOverlay} />}
              <MapBoundsUpdater assets={visibleAssets} />
            </MapContainer>
          </div>

            </div>
            <div className={clsx('mt-2 lg:mt-0', phoneView === 'map' && 'hidden lg:block')}>
          {/* List panel */}
          <div data-testid="asset-list" className="rounded-xl border border-line bg-surface overflow-hidden max-h-[360px] lg:max-h-[560px] overflow-y-auto lg:mt-0 mt-2">
            <div className="divide-y divide-line">
              {visibleAssets.map(a => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-paper-2/50 transition-colors">
                {canLabel && (
                  <input
                    type="checkbox"
                    aria-label={`Select ${a.code}`}
                    checked={bulkIds.includes(a.id)}
                    onChange={e => setBulkIds(ids => (e.target.checked ? [...ids, a.id] : ids.filter(x => x !== a.id)))}
                    className="accent-yellow flex-shrink-0"
                  />
                )}
                <Link
                  href={href(`/app/assets/${a.id}`)}
                  className="flex flex-1 min-w-0 items-center gap-3"
                >
                  <div className={clsx(
                    'min-w-8 h-8 px-1.5 rounded-lg flex items-center justify-center text-[10px] font-mono font-semibold border whitespace-nowrap',
                    a.status === 'live' ? 'bg-live/10 text-ok-ink border-live/20' :
                    a.status === 'idle' ? 'bg-idle/10 text-warn-ink border-idle/20' :
                    a.status === 'offline' ? 'bg-red/10 text-bad-ink border-red/20' :
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
                    {a.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {a.labels.map(l => (
                          <span key={l.id} className="px-1.5 py-0.5 rounded border border-line bg-paper text-[10px] text-grey-700">{l.name}</span>
                        ))}
                      </div>
                    )}
                    {phase !== 'day_one' && (a.fuelPct !== null || a.engineHoursToday !== null || a.openAlerts > 0) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-grey-500 mt-1">
                        {a.fuelPct !== null && (
                          <span>{t('map.columns.fuel', 'Fuel %')} <span className="font-mono text-grey-700">{a.fuelPct}%</span></span>
                        )}
                        {a.engineHoursToday !== null && (
                          <span className="inline-flex items-center gap-1">
                            {t('map.columns.engine_hours', 'Engine hours')}
                            <span className="font-mono text-grey-700">
                              {t('common.hours_short', '{value} h', { value: a.engineHoursToday.toFixed(1) })}
                            </span>
                            <SourceLabel source={a.hoursSource} inline />
                          </span>
                        )}
                        {a.openAlerts > 0 && (
                          <span className="text-bad-ink">
                            {t('map.columns.open_alerts', 'Open alerts')} <span className="font-mono">{a.openAlerts}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <TierChip tier={a.tier} />
                    <span className={clsx(
                      'text-xs font-medium',
                      a.status === 'live' ? 'text-ok-ink' :
                      a.status === 'idle' ? 'text-warn-ink' :
                      a.status === 'offline' ? 'text-bad-ink' :
                      a.status === 'stale' ? 'text-stale' :
                      'text-grey-500'
                    )}>
                      {t(`common.status.${a.status}`, STATUS_LABELS[a.status as StatusKey] ?? a.status)}
                    </span>
                  </div>
                </Link>
                </div>
              ))}
            </div>
          </div>
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
