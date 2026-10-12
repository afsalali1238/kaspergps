'use client';

// Public tracking page (spec 11.6, 11.14, H5, J5.1). A client page so that it
// reads the same browser db as the rest of the demo:
//  - it re-renders every 30 s;
//  - it rehydrates on a `storage` event, so a revoke made in another tab
//    (the owner's) reaches the hirer's open tab;
//  - the demo clock moving redraws the marker where FB-12 now is;
//  - an inactive, unknown or altered link shows exactly one sentence.
// Architecture rule 8: the resolver returns location + optional ETA, nothing else,
// so the map has one marker and no history.

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useDb, getTrackingLinkState, resolveTrackingLink, hydrateDb } from '@/server/api';
import * as clock from '@/lib/clock';
import { useT } from '@/i18n';

const REFRESH_MS = 30_000;
const INACTIVE = 'This tracking link is no longer active.';

function formatTime(ts: string | number): string {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  return clock.formatDubaiTime(t);
}

/** The one marker this page may draw: a solid dot with a white ring (spec 11.6). */
const liveMarkerIcon = L.divIcon({
  html:
    '<div style="width:20px;height:20px;border-radius:50%;background:#1F9A6D;border:3px solid #ffffff;box-shadow:0 1px 6px rgba(0,0,0,0.35)"></div>',
  className: 'tracking-marker',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

/**
 * Keeps the marker in view as the demo clock moves the vehicle. The hirer never
 * pans the map, so the map always follows the one position it is allowed to show.
 */
function FollowMarker({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 13), { animate: true });
  }, [map, lat, lng]);
  return null;
}

export default function TrackingPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const t = useT();
  // Subscribing to the whole db re-renders this page when the db changes.
  useDb(s => s);
  const [, setTick] = useState(0);

  // Refresh on a timer, when another tab writes the db, and when the demo clock moves.
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), REFRESH_MS);
    const onStorage = (e: StorageEvent) => {
      // The demo db is stored under a `kasper.` key; null means storage was cleared.
      if (e.key === null || e.key.startsWith('kasper.')) {
        void hydrateDb().then(() => setTick(n => n + 1));
      }
    };
    const onClock = () => setTick(n => n + 1);
    window.addEventListener('storage', onStorage);
    window.addEventListener('kasper:clock-changed', onClock);
    return () => {
      clearInterval(id);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('kasper:clock-changed', onClock);
    };
  }, []);

  const state = getTrackingLinkState(token);
  if (state !== 'active') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <p className="text-base text-ink text-center" data-testid="tracking-inactive">
          {t('tracking.inactive_title', INACTIVE)}
        </p>
      </div>
    );
  }

  const resolved = resolveTrackingLink(token);
  if (!resolved) {
    return (
      <div className="min-h-screen bg-bg">
        <header className="bg-ink text-white px-4 py-3">
          <span className="text-sm font-semibold">Kasper GPS</span>
        </header>
        <div className="p-6 text-center text-sm text-grey-500">{t('tracking.waiting_first', 'Waiting for the first position…')}</div>
      </div>
    );
  }

  const eta = resolved.eta;
  const hasEta = Boolean(eta) && eta!.state !== 'unavailable';

  return (
    <div className="min-h-screen bg-bg">
      {/* No app shell. Phone-first: wordmark, asset name, arrival, updated at. */}
      <header className="bg-ink text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-yellow">
            <rect width="24" height="24" rx="5" fill="#141518" />
            <text x="0" y="18" fontSize="14" fontFamily="monospace" fill="#FFC400" fontWeight="700">K</text>
          </svg>
          <span className="text-sm font-semibold">Kasper GPS</span>
        </div>
        <div className="text-xs text-grey-500">{t('tracking.updated', 'Updated {time}', { time: formatTime(resolved.at) })}</div>
      </header>

      <div className="flex flex-col md:flex-row">
        {/* flex-1 only side by side: in the phone column a 0 flex-basis would collapse the map to 0 px. */}
        <div className="w-full md:w-auto md:flex-1 h-[60vh] md:h-[70vh] relative bg-paper-2">
          <TrackingMap lat={resolved.lat} lng={resolved.lng} />
          <div className="absolute top-3 left-3 z-[500] flex items-center gap-2 bg-white/90 px-2 py-1 rounded-md shadow-sm">
            <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
            <span className="text-xs font-medium text-ink">{t('tracking.live', 'Live')}</span>
          </div>
        </div>

        <div className="w-full md:w-80 bg-surface border-t border-line p-4 space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-ink">{resolved.assetName}</h1>
          </div>

          {eta && (
            <div className="bg-yellow/5 border border-yellow/20 rounded-lg p-3">
              <div className="text-xs text-yellow-dark font-medium mb-1">{t('tracking.arrival', 'Arrival')}</div>
              {eta.state === 'arrived' ? (
                <div className="text-sm text-ink font-medium">{t('tracking.arrived', 'Arrived {time}', { time: formatTime(eta.etaAt) })}</div>
              ) : eta.state === 'en_route' ? (
                <div className="text-sm text-ink">
                  {t('tracking.arriving_about', 'Arriving about {time}', { time: formatTime(eta.etaAt) })}
                  {eta.etaAt > clock.now() && (
                    <span className="text-xs text-grey-500">
                      {' '}
                      {t('tracking.in_min', '(in {minutes} min)', {
                        minutes: Math.max(1, Math.round((eta.etaAt - clock.now()) / 60000)),
                      })}
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-sm text-grey-700">{t('tracking.eta_unavailable', 'ETA unavailable — waiting for update')}</div>
              )}
              {hasEta && (
                <div className="text-xs text-grey-500 mt-1">
                  {t('tracking.destination', 'Destination: {name}', { name: eta.destinationName })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One marker, one position. Remounted only when the coordinates change identity,
 * so Leaflet is never asked to render a stale marker.
 */
function TrackingMap({ lat, lng }: { lat: number; lng: number }) {
  const marker = useMemo(() => ({ lat, lng }), [lat, lng]);
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={13}
      scrollWheelZoom={false}
      zoomControl={false}
      attributionControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[marker.lat, marker.lng]} icon={liveMarkerIcon} />
      <FollowMarker lat={marker.lat} lng={marker.lng} />
    </MapContainer>
  );
}
