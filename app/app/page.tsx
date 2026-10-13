'use client';

// Fleet map, three panes (UI-UPGRADE §6, Agent E):
//   KPI strip → one filter bar → [fleet rail | map | asset panel] → bottom tabs.
// 1280 px and up: three columns. 1024–1279 px: the panel overlays the map.
// Phones: Map | List tabs, and the panel opens as a bottom sheet.
// Filters and the selected asset live in the URL, so Back restores the view.

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import clsx from 'clsx';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, X, Hexagon } from 'lucide-react';
import {
  Badge, EmptyState, Skeleton, Button, KpiStrip, KpiCell, StatusDot, BottomSheet,
} from '@/components/ui';
import { CloseButton } from '@/components/ui/SideSheet';
import { ClusterLayer, escapeHtml, type ClusterMarker } from '@/components/map/ClusterLayer';
import { FilterMenu } from '@/components/filters/FilterMenu';
import { LabelCombobox } from '@/components/labels/LabelCombobox';
import { GeofenceOverlayLayer, type OverlayFence } from '@/components/geofences/GeofenceMap';
import { AssetPanelBody } from '@/components/fleet/AssetPanelBody';
import { FleetBottomTabs } from '@/components/fleet/FleetBottomTabs';
import {
  useDb, isAssetVisible, getRelationship, getReadingForAsset, engineHoursToday, hoursSourceFor, computeStatus,
  can, labelIdsByAsset, labelsVisibleTo, addLabelToAssets, removeLabelFromAssets, visibleGeofences, viewerSiteId,
  fleetPanelFor, fleetKpis, fleetEvents, visibleAlerts, rentalLineFor, tierOfAsset, todayFor,
} from '@/server/api';
import { hasFeature } from '@/domain/features';
import * as clock from '@/lib/clock';
import { formatHours, formatNumber, formatPct } from '@/lib/format';
import type { Asset, Label, LatLng } from '@/domain/types';
import { useT, useLocale } from '@/i18n';
import { translate, type Locale } from '@/i18n/dictionary';
import { useSession, useNow } from '@/hooks';
import { COLORS, MAP_STATUS_COLORS, geofenceColor } from '@/config/colors';

// Fix Leaflet default icon issue
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/** A status dot with the asset code beside it; the selected one gets an accent ring. */
function createMarkerIcon(status: string, code: string, isRented: boolean, selected: boolean) {
  const color = MAP_STATUS_COLORS[status] ?? COLORS.muted;
  const ring = selected
    ? `box-shadow:0 0 0 3px ${COLORS.accent},0 1px 4px rgba(0,0,0,.35);`
    : isRented ? `box-shadow:0 0 0 2px ${COLORS.accent};` : 'box-shadow:0 1px 3px rgba(0,0,0,.3);';
  const html = `<div style="position:relative;width:16px;height:16px">
      <span style="position:absolute;inset:0;border-radius:50%;background:${color};border:2px solid ${COLORS.surface};${ring}"></span>
      <span dir="ltr" style="position:absolute;inset-inline-start:20px;top:-2px;white-space:nowrap;font:700 10px/16px 'Space Mono',monospace;color:${COLORS.ink};background:${COLORS.surface};border:1px solid ${selected ? COLORS.accent : COLORS.line};border-radius:3px;padding:0 4px">${escapeHtml(code)}</span>
    </div>`;
  return L.divIcon({ html, className: 'marker-custom', iconSize: [16, 16], iconAnchor: [8, 8] });
}

interface AssetRow {
  id: string;
  code: string;
  name: string;
  assetClass: string;
  status: ReturnType<typeof computeStatus>;
  lastUpdated: string;
  siteId: string | null;
  siteName: string;
  tier: 1 | 2 | 3;
  isRentedIn: boolean;
  lat: number;
  lng: number;
  asset: Asset;
  fuelPct: number | null;
  engineHoursToday: number | null;
  hoursSource: ReturnType<typeof hoursSourceFor>;
  openAlerts: number;
  endsToday: boolean;
  labels: Label[];
}

function lastUpdatedStr(asset: Asset, locale: Locale): string {
  const reading = getReadingForAsset(asset);
  if (!reading) return translate(locale, 'common.no_data', 'No data');
  const ms = new Date(reading.deviceTime).getTime();
  const ageMin = clock.minutesSinceDubai(ms);
  const ageH = clock.hoursSinceDubai(ms);
  const ago = ageMin < 60
    ? translate(locale, 'shell.min_ago', '{count} min ago', { count: Math.round(ageMin) })
    : translate(locale, 'shell.hours_ago', '{count} h ago', { count: Math.round(ageH) });
  return translate(locale, 'map.updated_ago', '{time} · {ago}', { time: clock.formatDubaiTime(ms), ago });
}

const STATUS_KEYS = ['live', 'idle', 'stale', 'offline', 'unknown', 'no_tracker'] as const;
type StatusKey = typeof STATUS_KEYS[number];
const STATUS_LABELS: Record<StatusKey, string> = {
  live: 'Live', idle: 'Idle', stale: 'Stale', offline: 'Offline', unknown: 'Unknown', no_tracker: 'No tracker',
};

const STATUS_TEXT: Record<string, string> = {
  live: 'text-ok-ink', idle: 'text-warn-ink', stale: 'text-stale-ink', offline: 'text-bad-ink', unknown: 'text-text-secondary', no_tracker: 'text-text-secondary',
};

const CLASS_LABELS: Record<string, string> = {
  plant: 'Plant', power: 'Power', lifting: 'Lifting', truck: 'Truck', light_vehicle: 'Light vehicle',
};

/** A 10-hour shift: the same basis as utilisation on Cost & ROI (C2). */
const SHIFT_HOURS = 10;

function MapBoundsUpdater({ assets }: { assets: AssetRow[] }) {
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

/** Pan to the selected asset when it is off screen; resize when the panes change. */
function SelectionFollower({ target, layoutKey }: { target: LatLng | null; layoutKey: string }) {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize(), 220);
    return () => window.clearTimeout(id);
  }, [map, layoutKey]);
  useEffect(() => {
    if (!target) return;
    const ll = L.latLng(target.lat, target.lng);
    if (!map.getBounds().pad(-0.1).contains(ll)) map.panTo(ll, { animate: true });
  }, [map, target?.lat, target?.lng]);
  return null;
}

/** ≥ 1024 px: the panel is a pane; below, a bottom sheet. */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return desktop;
}

const TILES = {
  carto: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
} as const;

export default function MapPage() {
  const seed = useDb(s => s);
  const t = useT();
  const locale = useLocale();
  const session = useSession();
  // The clock moves rentals in and out of view; the memos below re-run on each tick.
  const now = useNow();
  const isDesktop = useIsDesktop();

  const [statusFilter, setStatusFilter] = useState<StatusKey | 'all'>('all');
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<'all' | 1 | 2 | 3>('all');
  const [rentedFilter, setRentedFilter] = useState<'all' | 'owned' | 'rented'>('all');
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [onlyEndingToday, setOnlyEndingToday] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [labelVersion, setLabelVersion] = useState(0);
  const [labelNotice, setLabelNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [urlReady, setUrlReady] = useState(false);
  const [removeLabelId, setRemoveLabelId] = useState('');
  const [showGeofences, setShowGeofences] = useState(false);
  // Phones show one of the map or the list (spec §11.2). Desktop shows both.
  const [phoneView, setPhoneView] = useState<'map' | 'list'>('list');
  // Tiles: CARTO Positron first, OSM if it fails; after OSM fails too the map steps
  // aside so the list takes the screen. Retry starts over.
  const [tileProvider, setTileProvider] = useState<'carto' | 'osm'>('carto');
  const [tilesFailed, setTilesFailed] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const tileErrors = useRef(0);

  useEffect(() => { setLoading(false); }, []);

  // Filters and the selected asset live in the URL (spec §11.2, §6).
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
    if (q.get('alerts') === '1') setOnlyAlerts(true);
    if (q.get('ending') === '1') setOnlyEndingToday(true);
    if (q.get('q')) setSearchQuery(q.get('q') ?? '');
    const labels = q.get('labels');
    if (labels) setSelectedLabelIds(labels.split(',').filter(Boolean));
    if (q.get('asset')) setSelectedId(q.get('asset'));
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
    if (onlyAlerts) q.set('alerts', '1');
    if (onlyEndingToday) q.set('ending', '1');
    if (searchQuery) q.set('q', searchQuery);
    if (selectedLabelIds.length) q.set('labels', selectedLabelIds.join(','));
    if (selectedId) q.set('asset', selectedId);
    const search = q.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
  }, [urlReady, statusFilter, selectedSite, selectedClass, selectedTier, rentedFilter, onlyAlerts, onlyEndingToday, searchQuery, selectedLabelIds, selectedId]);

  // Labels: the company's own labels on the assets this viewer can see. Renters get none.
  const labelMap = useMemo(() => (session ? labelIdsByAsset(session) : new Map<string, string[]>()), [session, labelVersion, now]);
  const labelOptions = useMemo(() => (session ? labelsVisibleTo(session) : []), [session, labelVersion]);
  const labelById = useMemo(() => new Map(labelOptions.map(l => [l.id, l])), [labelOptions]);
  const canLabel = useMemo(() => (session ? can(session, 'label.manage') : false), [session]);
  const bulkRemovable = useMemo(() => {
    const ids = new Set<string>();
    bulkIds.forEach(id => (labelMap.get(id) ?? []).forEach(l => ids.add(l)));
    return labelOptions.filter(l => ids.has(l.id));
  }, [bulkIds, labelMap, labelOptions]);

  const openAlerts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!session) return counts;
    for (const alert of visibleAlerts(session)) {
      if (alert.status !== 'open' || !alert.assetId) continue;
      counts.set(alert.assetId, (counts.get(alert.assetId) ?? 0) + 1);
    }
    return counts;
  }, [session, now]);

  // Every asset this session may see, before any filter: the base for counts and options.
  const allRows: AssetRow[] = useMemo(() => {
    if (!session) return [];
    return seed.assets.filter(a => isAssetVisible(session, a.id)).map(a => {
      const siteId = viewerSiteId(session, a.id);
      const site = seed.sites.find(s => s.id === siteId);
      const reading = getReadingForAsset(a);
      const pos: LatLng | undefined = reading ? { lat: reading.lat, lng: reading.lng } : site?.center;
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        assetClass: a.assetClass,
        status: computeStatus(a),
        lastUpdated: lastUpdatedStr(a, locale),
        siteId: siteId ?? null,
        siteName: site?.name ?? '',
        tier: tierOfAsset(a),
        isRentedIn: getRelationship(session, a.id) === 'renter',
        lat: pos?.lat ?? 25.2048,
        lng: pos?.lng ?? 55.2708,
        asset: a,
        fuelPct: reading && hasFeature(a, 'fuel.level') && reading.fuelLevelPct !== undefined ? reading.fuelLevelPct : null,
        // ECU hours today where metered, else ignition-on time (Estimated) for the row's bar.
        engineHoursToday: engineHoursToday(a) ?? (hasFeature(a, 'hours.ignition') ? todayFor(a)?.ignitionHours ?? null : null),
        hoursSource: engineHoursToday(a) !== null ? hoursSourceFor(a) : 'Estimated',
        openAlerts: openAlerts.get(a.id) ?? 0,
        endsToday: rentalLineFor(session, a)?.endsToday ?? false,
        labels: (labelMap.get(a.id) ?? []).map(id => labelById.get(id)).filter((l): l is Label => Boolean(l)),
      };
    });
  }, [session, seed.assets, seed.sites, locale, openAlerts, now, labelMap, labelById]);

  const visibleAssets: AssetRow[] = useMemo(() => allRows.filter(a => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (selectedSite && a.siteId !== selectedSite) return false;
    if (selectedClass && a.assetClass !== selectedClass) return false;
    if (selectedTier !== 'all' && a.tier !== selectedTier) return false;
    if (session?.tenantId) {
      if (rentedFilter === 'owned' && a.isRentedIn) return false;
      if (rentedFilter === 'rented' && !a.isRentedIn) return false;
    }
    if (onlyAlerts && a.openAlerts === 0) return false;
    if (onlyEndingToday && !a.endsToday) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!a.code.toLowerCase().includes(q) && !a.name.toLowerCase().includes(q) && !a.asset.plateOrSerial.toLowerCase().includes(q)) return false;
    }
    if (selectedLabelIds.length) {
      const ids = labelMap.get(a.id) ?? [];
      if (!selectedLabelIds.some(id => ids.includes(id))) return false;
    }
    return true;
  }), [allRows, statusFilter, selectedSite, selectedClass, selectedTier, rentedFilter, onlyAlerts, onlyEndingToday, searchQuery, selectedLabelIds, labelMap, session]);

  // The panel follows the URL; an id this session can't see shows nothing.
  const panel = useMemo(() => (session && selectedId ? fleetPanelFor(session, selectedId) : null), [session, selectedId, now]);
  const selectRow = useCallback((id: string) => setSelectedId(cur => (cur === id ? null : id)), []);
  const selectFromMap = useCallback((id: string) => setSelectedId(id), []);
  const closePanel = useCallback(() => setSelectedId(null), []);

  // Esc closes the desktop pane (the bottom sheet handles its own Esc).
  useEffect(() => {
    if (!panel || !isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[role="dialog"],[role="listbox"],input,select,textarea')) return;
      setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, isDesktop]);

  const kpis = useMemo(() => (session ? fleetKpis(session, allRows.map(a => a.asset)) : null), [session, allRows]);
  const events = useMemo(
    () => (session ? fleetEvents(session, visibleAssets.map(a => a.asset)) : { alerts: [], log: [], fuel: [] }),
    [session, visibleAssets],
  );
  const fleetHasFuel = useMemo(() => allRows.some(a => a.tier > 1 && hasFeature(a.asset, 'fuel.level')), [allRows]);

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

  const clusterMarkers: ClusterMarker[] = useMemo(() => visibleAssets.map(a => ({
    id: a.id,
    lat: a.lat,
    lng: a.lng,
    title: `${a.code} — ${a.name}`,
    icon: createMarkerIcon(a.status, a.code, a.isRentedIn, a.id === selectedId),
  })), [visibleAssets, selectedId]);

  const selectedRow = useMemo(() => visibleAssets.find(a => a.id === selectedId) ?? allRows.find(a => a.id === selectedId) ?? null, [visibleAssets, allRows, selectedId]);

  const siteOptions = useMemo(() => {
    if (!session) return [];
    if (session.siteIds.length > 0) return session.siteIds.map(id => seed.sites.find(s => s.id === id)!).filter(Boolean);
    if (session.isKasper) return seed.sites;
    return seed.sites.filter(s => s.tenantId === session.tenantId);
  }, [session, seed.sites]);
  const siteCounts = useMemo(() => {
    const m = new Map<string, number>();
    allRows.forEach(a => { if (a.siteId) m.set(a.siteId, (m.get(a.siteId) ?? 0) + 1); });
    return m;
  }, [allRows]);
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { live: 0, idle: 0, stale: 0, offline: 0, unknown: 0, no_tracker: 0 };
    allRows.forEach(a => { counts[a.status]++; });
    return counts;
  }, [allRows]);
  const classOptions = useMemo(() => [...new Set(allRows.map(a => a.assetClass))], [allRows]);
  const hasTierFilter = useMemo(() => new Set(allRows.map(a => a.tier)).size > 1, [allRows]);
  // §11.2: the Owned / Rented in switch shows only to a user who has both (kept while a choice is active).
  const hasRented = useMemo(
    () => (session ? rentedFilter !== 'all' || (allRows.some(a => a.isRentedIn) && allRows.some(a => !a.isRentedIn)) : false),
    [allRows, session, rentedFilter],
  );
  const labelsUsed = useMemo(() => {
    const ids = new Set<string>();
    labelMap.forEach(list => list.forEach(id => ids.add(id)));
    return labelOptions.filter(l => ids.has(l.id));
  }, [labelMap, labelOptions]);

  const clearAll = () => {
    setStatusFilter('all'); setSelectedSite(null); setSelectedClass(null); setSelectedTier('all'); setRentedFilter('all');
    setOnlyAlerts(false); setOnlyEndingToday(false); setSearchQuery(''); setSelectedLabelIds([]);
  };

  if (!session || !kpis) return null;

  const statusWord = (s: string) => t(`common.status.${s}`, STATUS_LABELS[s as StatusKey] ?? s);
  const classWord = (c: string) => t(`fleet.class.${c}`, CLASS_LABELS[c] ?? c.replace(/_/g, ' '));
  const siteName = (id: string) => seed.sites.find(s => s.id === id)?.name ?? id;

  // Active filters as removable chips (one bar replaces the old four rows).
  const chips: { key: string; text: string; remove: () => void }[] = [];
  if (statusFilter !== 'all') chips.push({ key: 'status', text: statusWord(statusFilter), remove: () => setStatusFilter('all') });
  if (selectedSite) chips.push({ key: 'site', text: siteName(selectedSite), remove: () => setSelectedSite(null) });
  if (selectedClass) chips.push({ key: 'class', text: classWord(selectedClass), remove: () => setSelectedClass(null) });
  if (selectedTier !== 'all') chips.push({ key: 'tier', text: `T${selectedTier}`, remove: () => setSelectedTier('all') });
  if (onlyAlerts) chips.push({ key: 'alerts', text: t('fleet.chip.with_alerts', 'With open alerts'), remove: () => setOnlyAlerts(false) });
  if (onlyEndingToday) chips.push({ key: 'ending', text: t('fleet.chip.ending_today', 'Rental ends today'), remove: () => setOnlyEndingToday(false) });
  if (searchQuery) chips.push({ key: 'q', text: `“${searchQuery}”`, remove: () => setSearchQuery('') });
  selectedLabelIds.forEach(id => {
    const l = labelById.get(id);
    if (l) chips.push({ key: `label-${id}`, text: l.name, remove: () => setSelectedLabelIds(ids => ids.filter(x => x !== id)) });
  });

  const hoursSourceWord = kpis.engineHoursSource === 'mixed' ? t('fleet.kpi.ecu_and_estimated', 'ECU + Estimated') : kpis.engineHoursSource ?? undefined;

  const panelTitle = panel ? `${panel.code} · ${panel.name}` : '';
  const panelEyebrow = panel ? `${classWord(panel.assetClass)} · T${panel.tier}` : '';

  const rail = (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-line bg-surface" data-testid="fleet-rail">
      <div className="border-b border-line p-2">
        <label className="relative block">
          <span className="sr-only">{t('fleet.search', 'Search assets')}</span>
          <Search size={14} aria-hidden className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('fleet.search_placeholder', 'Code, name or plate')}
            aria-label={t('fleet.search', 'Search assets')}
            className="h-9 w-full rounded-md border border-line bg-paper ps-8 pe-2 text-sm text-ink placeholder:text-text-secondary focus:border-ink focus:outline-none"
          />
        </label>
        <div className="mt-1.5 flex items-center justify-between px-0.5 text-[11px] text-text-secondary">
          <span className="font-mono">{t('fleet.showing', '{shown} of {total} assets', { shown: visibleAssets.length, total: allRows.length })}</span>
          {chips.length > 0 && <button type="button" onClick={clearAll} className="hover:text-ink underline-offset-2 hover:underline">{t('common.clear_filters', 'Clear filters')}</button>}
        </div>
      </div>

      <ul data-testid="asset-list" className="min-h-0 flex-1 divide-y divide-line overflow-y-auto" aria-label={t('fleet.list', 'Fleet')}>
        {visibleAssets.map(a => {
          const selected = a.id === selectedId;
          const bar = a.fuelPct !== null
            ? { value: a.fuelPct, text: t('fleet.row.fuel', 'Fuel {value}', { value: formatPct(a.fuelPct) }), tone: a.fuelPct < 20 ? 'bg-bad-ink' : a.fuelPct < 35 ? 'bg-warn-ink' : 'bg-ok-ink' }
            : a.engineHoursToday !== null
              ? { value: Math.min(100, (a.engineHoursToday / SHIFT_HOURS) * 100), text: t('fleet.row.hours_today', '{hours} of a {shift} h shift today ({source})', { hours: formatHours(a.engineHoursToday), shift: SHIFT_HOURS, source: a.hoursSource }), tone: 'bg-info' }
              : null;
          return (
            <li key={a.id} className={clsx('relative flex items-stretch', selected ? 'bg-accent-tint' : 'hover:bg-paper-2')}>
              {selected && <span aria-hidden className="absolute inset-y-0 start-0 w-0.5 bg-accent" />}
              {canLabel && (
                <span className="flex items-center ps-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${a.code}`}
                    checked={bulkIds.includes(a.id)}
                    onChange={e => setBulkIds(ids => (e.target.checked ? [...ids, a.id] : ids.filter(x => x !== a.id)))}
                    className="h-4 w-4 accent-yellow"
                  />
                </span>
              )}
              <button
                type="button"
                onClick={() => selectRow(a.id)}
                aria-pressed={selected}
                data-asset-id={a.id}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
              >
                <StatusDot status={a.status} label={statusWord(a.status)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-heading text-[13px] font-semibold text-ink">{a.name}</span>
                    {a.isRentedIn && <Badge variant="yellow">{t('common.status.rented', 'Rented')}</Badge>}
                    {a.openAlerts > 0 && <Badge tone="bad" title={t('map.columns.open_alerts', 'Open alerts')}>{a.openAlerts}</Badge>}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-text-secondary">
                    <span className="font-bold text-ink">{a.code}</span> · {classWord(a.assetClass)}
                  </span>
                  <span className="block truncate text-[11px] text-text-secondary">
                    <span className={STATUS_TEXT[a.status]}>{statusWord(a.status)}</span> · {a.siteName} · {a.lastUpdated}
                  </span>
                  {a.labels.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {a.labels.map(l => <span key={l.id} className="rounded border border-line bg-paper px-1.5 py-px text-[10px] text-text-secondary">{l.name}</span>)}
                    </span>
                  )}
                </span>
                {bar && (
                  <span className="flex w-14 shrink-0 flex-col items-end gap-1" title={bar.text}>
                    <span className="font-mono text-[10px] text-text-secondary">{a.fuelPct !== null ? formatPct(a.fuelPct) : formatHours(a.engineHoursToday)}</span>
                    <span className="h-1.5 w-full overflow-hidden rounded-full bg-paper-2" role="img" aria-label={bar.text}>
                      <span className={clsx('block h-full rounded-full', bar.tone)} style={{ width: `${Math.max(3, bar.value)}%` }} />
                    </span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {siteOptions.length > 1 && (
        <div className="border-t border-line p-2">
          <div className="text-eyebrow px-1 pb-1">{t('fleet.sites', 'Sites')}</div>
          <ul className="max-h-36 overflow-y-auto">
            {siteOptions.map(s => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={selectedSite === s.id}
                  onClick={() => setSelectedSite(selectedSite === s.id ? null : s.id)}
                  className={clsx('flex w-full items-center justify-between rounded px-2 py-1 text-xs', selectedSite === s.id ? 'bg-accent-tint text-ink' : 'text-text-secondary hover:bg-paper-2 hover:text-ink')}
                >
                  <span className="truncate">{s.name}</span>
                  <span className="font-mono">{siteCounts.get(s.id) ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* KPI strip (§5.2 Map row): role-scoped; a cell filters the map. */}
      <div data-testid="today-tiles">
        <KpiStrip label={t('fleet.kpi.label', 'Fleet today')}>
          <KpiCell label={statusWord('live')} value={formatNumber(kpis.live)} tone="ok" active={statusFilter === 'live'} onClick={() => setStatusFilter(statusFilter === 'live' ? 'all' : 'live')} />
          <KpiCell label={statusWord('idle')} value={formatNumber(kpis.idle)} tone="warn" active={statusFilter === 'idle'} onClick={() => setStatusFilter(statusFilter === 'idle' ? 'all' : 'idle')} />
          <KpiCell
            label={statusWord('offline')}
            value={formatNumber(kpis.offline)}
            tone={kpis.offline > 0 ? 'bad' : 'neutral'}
            context={statusCounts.stale > 0 ? t('fleet.kpi.incl_stale', 'incl. {count} stale', { count: statusCounts.stale }) : undefined}
            active={statusFilter === 'offline'}
            onClick={() => setStatusFilter(statusFilter === 'offline' ? 'all' : 'offline')}
          />
          <KpiCell label={t('fleet.kpi.engine_hours_today', 'Engine hours today')} value={kpis.engineHoursToday === null ? null : formatHours(kpis.engineHoursToday)} source={hoursSourceWord} />
          {kpis.fuelUsedTodayL !== null && (
            <KpiCell label={t('fleet.kpi.fuel_used_today', 'Fuel used today')} value={`${formatNumber(kpis.fuelUsedTodayL)} L`} source={kpis.fuelEstimated ? 'Estimated' : 'ECU'} />
          )}
          <KpiCell
            label={t('fleet.kpi.open_alerts', 'Open alerts')}
            value={formatNumber(kpis.alertsCritical + kpis.alertsWarning)}
            tone={kpis.alertsCritical > 0 ? 'bad' : kpis.alertsWarning > 0 ? 'warn' : 'neutral'}
            context={t('fleet.kpi.alert_split', '{critical} critical · {warning} warning', { critical: kpis.alertsCritical, warning: kpis.alertsWarning })}
            active={onlyAlerts}
            onClick={() => setOnlyAlerts(v => !v)}
          />
          <KpiCell
            label={t('fleet.kpi.rentals_ending', 'Rentals ending today')}
            value={formatNumber(kpis.rentalsEndingToday)}
            active={onlyEndingToday}
            onClick={kpis.rentalsEndingToday > 0 || onlyEndingToday ? () => setOnlyEndingToday(v => !v) : undefined}
          />
        </KpiStrip>
      </div>

      {/* One filter bar (§6). */}
      <div className={clsx('flex flex-wrap items-center gap-2', phoneView === 'map' && 'hidden lg:flex')} data-testid="map-filters">
        <FilterMenu
          label={t('fleet.filters.status', 'Status:')}
          value={statusFilter === 'all' ? null : statusFilter}
          allLabel={t('fleet.filters.all', 'All')}
          options={STATUS_KEYS.map(k => ({ value: k, label: `${statusWord(k)} (${statusCounts[k]})` }))}
          onChange={v => setStatusFilter((v as StatusKey | null) ?? 'all')}
        />
        {siteOptions.length > 1 && (
          <FilterMenu
            label={t('map.filters.site', 'Site:')}
            value={selectedSite}
            allLabel={t('map.filters.all_sites', 'All sites')}
            options={siteOptions.map(s => ({ value: s.id, label: s.name }))}
            onChange={setSelectedSite}
          />
        )}
        {classOptions.length > 1 && (
          <FilterMenu
            label={t('map.filters.type', 'Type:')}
            value={selectedClass}
            allLabel={t('fleet.filters.all_types', 'All types')}
            options={classOptions.map(c => ({ value: c, label: classWord(c) }))}
            onChange={setSelectedClass}
          />
        )}
        {hasTierFilter && (
          <FilterMenu
            label={t('map.filters.tier', 'Tier:')}
            value={selectedTier === 'all' ? null : String(selectedTier)}
            allLabel={t('common.all', 'All')}
            options={[1, 2, 3].filter(n => allRows.some(a => a.tier === n)).map(n => ({ value: String(n), label: `T${n}` }))}
            onChange={v => setSelectedTier(v ? (Number(v) as 1 | 2 | 3) : 'all')}
          />
        )}
        {labelsUsed.length > 0 && (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Labels">
            <span className="text-xs text-text-secondary">{t('map.filters.labels', 'Labels:')}</span>
            {labelsUsed.map(l => {
              const on = selectedLabelIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSelectedLabelIds(on ? selectedLabelIds.filter(x => x !== l.id) : [...selectedLabelIds, l.id])}
                  className={clsx('rounded-lg border px-2 py-1 text-xs transition-colors', on ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-text-secondary hover:border-grey-500')}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
        )}
        {hasRented && (
          <div className="flex items-center gap-1" role="group" aria-label={t('fleet.filters.ownership', 'Owned or rented')}>
            <span className="text-xs text-text-secondary">{t('map.filters.show', 'Show:')}</span>
            {(['all', 'owned', 'rented'] as const).map(r => (
              <button
                key={r}
                type="button"
                aria-pressed={rentedFilter === r}
                onClick={() => setRentedFilter(r)}
                className={clsx('rounded-lg border px-2 py-1 text-xs transition-colors', rentedFilter === r ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-text-secondary hover:border-grey-500')}
              >
                {r === 'all' ? t('map.filters.rented_all', 'All') : r === 'owned' ? t('map.filters.rented_owned', 'Owned') : t('map.filters.rented_in', 'Rented in')}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          aria-pressed={showGeofences}
          onClick={() => setShowGeofences(v => !v)}
          className={clsx('inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors', showGeofences ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-text-secondary hover:border-grey-500')}
        >
          <Hexagon size={12} aria-hidden />
          {t('map.filters.geofences', 'Geofences')}
        </button>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1" aria-label={t('fleet.active_filters', 'Active filters')} role="group">
            {chips.map(c => (
              <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-yellow-dark/40 bg-accent-tint ps-2 pe-0.5 text-xs text-ink">
                {c.text}
                <button type="button" onClick={c.remove} aria-label={t('fleet.remove_filter', 'Remove filter {name}', { name: c.text })} className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface">
                  <X size={12} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width="100%" height={44} borderRadius={6} />)}</div>
          <div className="h-[480px] animate-pulse rounded-lg bg-paper" />
        </div>
      ) : allRows.length === 0 || visibleAssets.length === 0 ? (
        <EmptyState
          title={t('map.no_assets_match', 'No assets match these filters')}
          description={t('map.no_assets_match_hint', 'Try clearing some filters to see your assets.')}
          action={<Button variant="secondary" size="sm" onClick={clearAll}>{t('common.clear_filters', 'Clear filters')}</Button>}
        />
      ) : (
        <>
          {labelNotice && (
            <p role={labelNotice.tone === 'error' ? 'alert' : 'status'} className={clsx('rounded-md border px-3 py-2 text-xs', labelNotice.tone === 'error' ? 'border-bad-ink/40 bg-bad-tint text-bad-ink' : 'border-yellow-dark/40 bg-accent-tint text-ink')}>
              {labelNotice.text}
            </p>
          )}

          {canLabel && bulkIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-paper-2 px-2 py-2 text-xs" role="region" aria-label="Bulk actions">
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
                  <select
                    aria-label={t('map.bulk.remove_label', 'Remove label')}
                    value={removeLabelId}
                    onChange={e => setRemoveLabelId(e.target.value)}
                    className="rounded-md border border-line bg-paper px-2 py-1 text-text-secondary"
                  >
                    <option value="">{t('map.bulk.pick_label', 'Pick a label')}</option>
                    {bulkRemovable.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
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

          {/* Map | List on phones (spec §11.2). The list is the phone default. */}
          <div className="flex gap-1 lg:hidden" role="tablist" aria-label="Map or list">
            {(['map', 'list'] as const).map(view => (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={phoneView === view}
                onClick={() => setPhoneView(view)}
                className={clsx('min-h-10 rounded-lg border px-4 text-sm transition-colors', phoneView === view ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-text-secondary hover:border-grey-500')}
              >
                {view === 'map' ? t('map.map_tab', 'Map') : t('map.list_tab', 'List')}
              </button>
            ))}
          </div>

          <div
            className={clsx(
              'relative grid gap-3 lg:h-[max(520px,calc(100dvh-var(--demo-bar-h,0px)-19rem))]',
              tilesFailed ? 'lg:grid-cols-[minmax(0,1fr)]' : 'lg:grid-cols-[240px_minmax(0,1fr)]',
              !tilesFailed && (panel && isDesktop ? 'xl:grid-cols-[280px_minmax(0,1fr)_360px]' : 'xl:grid-cols-[280px_minmax(0,1fr)]'),
            )}
            data-testid="fleet-panes"
          >
            {/* Rail: the list. On phones it is the List tab. */}
            <div className={clsx('min-h-0', phoneView === 'map' && 'hidden lg:block', tilesFailed && 'lg:order-2')}>
              <div className="h-[60dvh] lg:h-full">{rail}</div>
            </div>

            {/* Map */}
            <div className={clsx('relative min-h-0', phoneView === 'list' && 'hidden lg:block', tilesFailed && 'lg:order-1')}>
              {tilesFailed && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-bad-ink/40 bg-bad-tint px-3 py-2 text-xs text-ink">
                  <span>{t('map.tiles_failed', 'The map could not load. Every asset is still in the list below.')}</span>
                  <Button size="sm" variant="secondary" onClick={() => { tileErrors.current = 0; setTileProvider('carto'); setTilesFailed(false); setMapKey(k => k + 1); }}>
                    {t('common.retry', 'Retry')}
                  </Button>
                </div>
              )}
              <div className={clsx('relative h-[60dvh] overflow-hidden rounded-lg border border-line bg-paper lg:h-full', tilesFailed && 'hidden')}>
                <MapContainer key={mapKey} center={[25.2048, 55.2708]} zoom={10} scrollWheelZoom zoomControl={false} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    key={tileProvider}
                    attribution={TILES[tileProvider].attribution}
                    url={TILES[tileProvider].url}
                    eventHandlers={{
                      tileerror: () => {
                        tileErrors.current += 1;
                        if (tileErrors.current < 3) return;
                        tileErrors.current = 0;
                        if (tileProvider === 'carto') setTileProvider('osm');
                        else setTilesFailed(true);
                      },
                      tileload: () => { tileErrors.current = 0; },
                    }}
                  />
                  <ZoomTopEnd />
                  <ClusterLayer markers={clusterMarkers} onSelect={selectFromMap} />
                  {showGeofences && <GeofenceOverlayLayer fences={geofenceOverlay} />}
                  <MapBoundsUpdater assets={visibleAssets} />
                  <SelectionFollower target={selectedRow ? { lat: selectedRow.lat, lng: selectedRow.lng } : null} layoutKey={`${Boolean(panel)}-${phoneView}`} />
                </MapContainer>
                {/* Legend */}
                <div className="pointer-events-none absolute bottom-2 start-2 z-[400] flex flex-wrap gap-1" aria-hidden>
                  {(['live', 'idle', 'offline'] as const).map(s => (
                    <span key={s} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface/95 px-2 py-0.5 text-[10px] text-ink shadow-panel">
                      <StatusDot status={s} /> {statusWord(s)}
                    </span>
                  ))}
                  {showGeofences && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface/95 px-2 py-0.5 text-[10px] text-ink shadow-panel">
                      <Hexagon size={10} /> {t('fleet.legend.zones', 'Zones')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Asset panel: a third column from 1280 px, over the map at 1024–1279 px. */}
            {panel && isDesktop && (
              <aside
                aria-label={t('fleet.panel_label', '{code} details', { code: panel.code })}
                className="absolute inset-y-0 end-0 z-[1100] flex w-[360px] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-pop xl:static xl:z-auto xl:w-auto xl:shadow-none"
                data-testid="asset-pane"
              >
                <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
                  <div className="min-w-0 pt-1">
                    <div className="text-eyebrow truncate">{panelEyebrow}</div>
                    <h2 className="text-section truncate text-ink">{panelTitle}</h2>
                  </div>
                  <CloseButton onClick={closePanel} />
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <AssetPanelBody panel={panel} session={session} />
                </div>
              </aside>
            )}
          </div>

          {/* Bottom tabs: desktop only; on phones these live on the Alerts page. */}
          <div className="hidden lg:block">
            <FleetBottomTabs events={events} showFuel={fleetHasFuel} onSelect={id => setSelectedId(id)} />
          </div>
        </>
      )}

      {/* Phones: the same panel in a bottom sheet. */}
      {panel && !isDesktop && (
        <BottomSheet open onClose={closePanel} title={panelTitle}>
          <AssetPanelBody panel={panel} session={session} />
        </BottomSheet>
      )}
    </div>
  );
}

/** Zoom controls top-right (top-left in Arabic). */
function ZoomTopEnd() {
  const map = useMap();
  useEffect(() => {
    const rtl = document.documentElement.dir === 'rtl';
    const zoom = L.control.zoom({ position: rtl ? 'topleft' : 'topright' });
    zoom.addTo(map);
    return () => { zoom.remove(); };
  }, [map]);
  return null;
}
