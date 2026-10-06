'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  TierChip, Badge, EmptyState, Skeleton,
  Button,
} from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import type { Asset, Session } from '@/domain/types';

interface AssetRow {
  id: string;
  code: string;
  name: string;
  status: 'live' | 'idle' | 'stale' | 'offline' | 'unknown' | 'no_tracker';
  lastUpdated: string;
  siteName: string;
  tier: 1 | 2 | 3;
  isRentedIn: boolean;
  ownerName: string;
  asset: Asset;
  lastReadingMs: number;
}

function lastReadingMsFor(_asset: Asset): number {
  // Simplified: return a recent timestamp for prototype
  return clock.now() - Math.floor(Math.random() * 7200000);
}

function computeStatus(asset: Asset, sessionMs: number = clock.now()): 'live' | 'idle' | 'stale' | 'offline' | 'unknown' | 'no_tracker' {
  const pairing = seed.pairings.find(p => p.assetId === asset.id && p.to === null);
  if (!pairing) return 'no_tracker';
  const tracker = seed.trackers.find(t => t.id === pairing.trackerId);
  if (!tracker || tracker.stockStatus !== 'paired') return 'no_tracker';
  const lastMs = lastReadingMsFor(asset);
  const ageSec = (sessionMs - lastMs) / 1000;
  if (ageSec > 1800) return 'offline';
  if (ageSec > 600) return 'stale';
  const speed = Math.random() > 0.5 ? Math.floor(Math.random() * 80) : 0;
  if (speed < 3) return 'idle';
  return 'live';
}

function lastUpdatedStr(asset: Asset): string {
  const ms = lastReadingMsFor(asset);
  const ageMin = clock.minutesSinceDubai(ms);
  const ageH = clock.hoursSinceDubai(ms);
  if (ageMin < 60) return `${clock.formatDubaiTime(ms)} · ${Math.round(ageMin)} min ago`;
  return `${clock.formatDubaiTime(ms)} · ${Math.round(ageH)} h ago`;
}

const STATUS_KEYS = ['live', 'idle', 'stale', 'offline', 'unknown', 'no_tracker'] as const;
type StatusKey = typeof STATUS_KEYS[number];

export default function MapPage() {
  const store = useStore;
  const session = store.getState().session;
  const _phase = store.getState().demoSwitches.phase;
  const _showHidden = store.getState().demoSwitches.showHidden;
  const _salesView = store.getState().demoSwitches.salesView;

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

  const visibleAssets: AssetRow[] = useMemo(() => {
    if (!session) return [];

    return seed.assets.filter(a => {
      if (!isAssetVisible(session, a.id)) return false;
      const status = computeStatus(a);
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
      const status = computeStatus(a);
      const tier = a.canProfile.adapter === 'ALL-CAN300' ? 3 : a.canProfile.adapter === 'LVCAN200' ? 2 : 1;
      const site = seed.sites.find(s => s.id === a.homeSiteId);
      const isRented = session.tenantId ? !!seed.bookings.find(b => b.assetId === a.id && b.renterTenantId === session.tenantId) : false;
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        status,
        lastUpdated: lastUpdatedStr(a),
        siteName: site?.name ?? '',
        tier,
        isRentedIn: isRented,
        ownerName: seed.tenants.find(t => t.id === a.ownerTenantId)?.name ?? '',
        asset: a,
        lastReadingMs: lastReadingMsFor(a),
      };
    });
  }, [session, statusFilter, selectedSite, selectedClass, selectedTier, rentedFilter, searchQuery]);

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
          action={<Button variant="secondary" size="sm" onClick={() => { setStatusFilter('all'); setSelectedSite(null); setSelectedClass(null); setSelectedTier('all'); setRentedFilter('all'); setSearchQuery(''); }}>Clear filters</Button>}
        />
      ) : (
        <>
          {/* Map placeholder (Leaflet added in later phase) */}
          <div className="rounded-xl border border-line bg-paper h-[400px] sm:h-[480px] md:h-[520px] lg:h-[560px] flex items-center justify-center">
            <div className="text-center">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-line mx-auto mb-3">
                <path d="M24 8c-8.8 0-16 7.2-16 16s7.2 16 16 16 16-7.2 16-16-7.2-16-16-16zm-8 16l6-6 1.5 1.5L24 24l-3.5 3.5 1.5 1.5L16 24z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p className="text-sm text-grey-500">Map view — OpenStreetMap tiles (Leaflet)</p>
              <p className="text-xs text-grey-500 mt-1">{totalVisible} markers · live position</p>
              <Button variant="secondary" size="sm" className="mt-3">Replace with Leaflet map (Phase 2)</Button>
            </div>
          </div>

          {/* Filters */}
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
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-xs text-grey-500 hover:text-ink">Clear search</button>
          )}

          {/* List panel */}
          <div className="rounded-xl border border-line bg-surface overflow-hidden max-h-[360px] overflow-y-auto mt-2">
            <div className="divide-y divide-line">
              {visibleAssets.map(a => (
                <Link
                  key={a.id}
                  href={`/app/assets/${a.id}`}
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
                      {a.isRentedIn && <Badge variant="yellow">Rented</Badge>}
                    </div>
                    <div className="text-xs text-grey-500 mt-0.5">
                      {a.ownerName} · {a.siteName} · {a.lastUpdated}
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
                      {a.status}
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

function isAssetVisible(session: Session, assetId: string): boolean {
  if (!session) return false;
  if (session.isKasper) return true;
  const asset = seed.assets.find(a => a.id === assetId);
  if (!asset) return false;
  if (asset.ownerTenantId === session.tenantId) return true;
  const booking = seed.bookings.find(b => b.assetId === assetId && b.renterTenantId === session.tenantId);
  if (booking) {
    const start = new Date(booking.start).getTime();
    const end = booking.closedAt ? new Date(booking.closedAt).getTime() : new Date(booking.end).getTime();
    return clock.now() >= start && clock.now() <= end;
  }
  return false;
}
