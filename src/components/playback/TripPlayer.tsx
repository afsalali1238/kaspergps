'use client';

// Trip playback player (spec 11.15). Presentation only: the maths lives in
// src/domain/playback.ts. Readings are passed in by the screen, which gets them
// through src/server/api.ts.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Reading } from '@/domain/types';
import * as clock from '@/lib/clock';
import {
  PLAYBACK_SPEEDS,
  advancePlayhead,
  buildSpans,
  gapAt,
  positionAt,
  sortReadings,
  stepPlayhead,
  trailDistanceKm,
  trailUntil,
  type PinKind,
  type PlaybackPin,
  type PlaybackSpeed,
  type PlaybackState,
  type Span,
} from '@/domain/playback';

export interface TripPlayerProps {
  assetLabel: string;
  tier: 1 | 2 | 3;
  readings: Reading[];
  fromMs: number;
  toMs: number;
  /** Event pins on the scrubber, built by the screen (see buildPins). */
  pins?: PlaybackPin[];
  onClose: () => void;
}

const PIN_COLOUR: Record<PinKind, string> = {
  overspeed: '#e03131',
  fuel_drop: '#7048e8',
  geofence_enter: '#1971c2',
  geofence_exit: '#1971c2',
};

const STATE_COLOUR: Record<Exclude<PlaybackState, 'no_data'>, string> = {
  moving: '#2f9e44',
  stationary_on: '#f59f00',
  off: '#adb5bd',
};

const STATE_WORDS: Record<PlaybackState, string> = {
  moving: 'Moving',
  stationary_on: 'Stationary, ignition on',
  off: 'Ignition off',
  no_data: 'No data',
};

function arrowIcon(heading: number): L.DivIcon {
  return L.divIcon({
    className: 'trip-player-arrow',
    html: `<div style="transform:rotate(${Math.round(heading)}deg);font-size:18px;line-height:18px;color:#1d4ed8">▲</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function FollowMarker({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map.getBounds().contains([lat, lng])) map.panTo([lat, lng], { animate: false });
  }, [map, lat, lng]);
  return null;
}

function SpanTrack({ spans, fromMs, toMs }: { spans: Span[]; fromMs: number; toMs: number }) {
  const total = Math.max(1, toMs - fromMs);
  return (
    <div className="relative h-3 rounded bg-paper-2 overflow-hidden" aria-hidden="true">
      {spans.map(s => {
        const left = ((s.fromMs - fromMs) / total) * 100;
        const width = ((s.toMs - s.fromMs) / total) * 100;
        const style: React.CSSProperties =
          s.state === 'no_data'
            ? {
                backgroundImage:
                  'repeating-linear-gradient(45deg, #ced4da 0 3px, transparent 3px 6px)',
              }
            : { backgroundColor: STATE_COLOUR[s.state] };
        return (
          <div
            key={`${s.fromMs}-${s.state}`}
            className="absolute top-0 bottom-0"
            style={{ left: `${left}%`, width: `${width}%`, ...style }}
            data-state={s.state}
          />
        );
      })}
    </div>
  );
}

export function TripPlayer({ assetLabel, tier, readings, fromMs, toMs, pins = [], onClose }: TripPlayerProps) {
  const sorted = useMemo(() => sortReadings(readings), [readings]);
  const spans = useMemo(() => buildSpans(sorted, fromMs, toMs), [sorted, fromMs, toMs]);

  const [timeMs, setTimeMs] = useState(fromMs);
  const [playing, setPlaying] = useState(false); // always starts paused
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [jump, setJump] = useState<Span | null>(null);
  const [reduced, setReduced] = useState(false);
  const timeRef = useRef(fromMs);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // Animation loop. Not used with reduced motion, which steps instead.
  useEffect(() => {
    if (!playing || reduced) return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = now - last;
      last = now;
      const r = advancePlayhead(timeRef.current, dt, speed, toMs, spans);
      timeRef.current = r.timeMs;
      setTimeMs(r.timeMs);
      if (r.jumped) setJump(r.jumped);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, reduced, speed, toMs, spans]);

  useEffect(() => {
    if (timeMs >= toMs) setPlaying(false);
  }, [timeMs, toMs]);

  const moveTo = (next: number) => {
    timeRef.current = next;
    setTimeMs(next);
  };

  const step = () => {
    const r = stepPlayhead(timeRef.current, toMs, spans);
    timeRef.current = r.timeMs;
    setTimeMs(r.timeMs);
    setJump(r.jumped);
  };

  const restart = () => {
    setPlaying(false);
    setJump(null);
    moveTo(fromMs);
  };

  const position = positionAt(sorted, timeMs);
  const fix = position && !('kind' in position) ? position : null;
  const banner = gapAt(spans, timeMs) ?? jump;

  // Full-resolution trail for distance (thinning would undercount).
  const distanceKm = useMemo(
    () => trailDistanceKm(trailUntil(sorted, fromMs, timeMs, Number.POSITIVE_INFINITY)),
    [sorted, fromMs, timeMs],
  );
  // Capped trail for drawing (at most PLAYBACK_DOWNSAMPLE_MAX points).
  const trail = useMemo(() => trailUntil(sorted, fromMs, timeMs), [sorted, fromMs, timeMs]);
  const faintTrack = useMemo(() => trailUntil(sorted, fromMs, toMs), [sorted, fromMs, toMs]);
  const icon = useMemo(() => arrowIcon(fix?.heading ?? 0), [fix?.heading]);

  const reading = fix?.reading;
  const fmt = (ms: number) => clock.formatDubaiTime(ms);
  const pending = <span className="text-grey-500">Not measured</span>;
  const pick = (v: number | undefined, unit: string) =>
    v === undefined ? pending : <span className="font-mono text-ink">{v.toFixed(0)}{unit}</span>;

  return (
    <div className="bg-surface border border-line rounded-lg overflow-hidden" data-testid="trip-player">
      <div className="px-3 py-2 border-b border-line flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-ink">
          Playback · {assetLabel} · {clock.formatDubaiDateTime(fromMs)} – {fmt(toMs)}
        </div>
        <button type="button" onClick={onClose} className="text-xs text-grey-500 hover:text-ink">
          Close
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {reduced ? (
            <button type="button" onClick={step} className="px-2 py-1 border border-line rounded">
              Step 5 min
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(p => !p)}
              className="px-2 py-1 border border-line rounded"
              aria-pressed={playing}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
          )}
          <button type="button" onClick={restart} className="px-2 py-1 border border-line rounded">
            Restart
          </button>
          <div className="flex gap-1" role="group" aria-label="Playback speed">
            {PLAYBACK_SPEEDS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={`px-2 py-1 border rounded ${speed === s ? 'border-ink text-ink' : 'border-line text-grey-500'}`}
              >
                {s}×
              </button>
            ))}
          </div>
          <div className="ml-auto font-mono text-ink" data-testid="playback-time">
            {fmt(timeMs)} · {speed}×
          </div>
        </div>

        <div className="space-y-1">
          <div className="relative">
            <SpanTrack spans={spans} fromMs={fromMs} toMs={toMs} />
            <input
              type="range"
              min={fromMs}
              max={toMs}
              step={1000}
              value={timeMs}
              aria-label="Playback position"
              onChange={e => {
                setPlaying(false);
                setJump(null);
                moveTo(Number(e.target.value));
              }}
              className="absolute inset-0 w-full h-3 opacity-0 cursor-pointer"
            />
          </div>
          <div className="flex gap-3 text-[11px] text-grey-500">
            <span><span className="inline-block w-2 h-2 mr-1 align-middle" style={{ background: STATE_COLOUR.moving }} />Moving</span>
            <span><span className="inline-block w-2 h-2 mr-1 align-middle" style={{ background: STATE_COLOUR.stationary_on }} />Stationary, ignition on</span>
            <span><span className="inline-block w-2 h-2 mr-1 align-middle" style={{ background: STATE_COLOUR.off }} />Off</span>
            <span><span className="inline-block w-2 h-2 mr-1 align-middle bg-paper-2 border border-line" />No data</span>
          </div>
        </div>

        {pins.length > 0 && (
          <div className="relative h-4" data-testid="event-pins" aria-label="Event pins" role="group">
            {pins.map((p, i) => {
              const total = Math.max(1, toMs - fromMs);
              const left = ((p.atMs - fromMs) / total) * 100;
              return (
                <button
                  key={`${p.kind}-${p.atMs}-${i}`}
                  type="button"
                  title={`${p.label} · ${fmt(p.atMs)}`}
                  aria-label={`${p.label} at ${fmt(p.atMs)}`}
                  onClick={() => {
                    setPlaying(false);
                    setJump(null);
                    moveTo(p.atMs);
                  }}
                  className="absolute top-0 -translate-x-1/2 w-3 h-3 rounded-full border border-white shadow"
                  style={{ left: `${left}%`, background: PIN_COLOUR[p.kind] }}
                />
              );
            })}
          </div>
        )}

        {banner && (
          <div role="status" className="text-xs px-2 py-1 rounded bg-paper-2 text-ink" data-testid="gap-banner">
            No data {fmt(banner.fromMs)} – {fmt(banner.toMs)}
          </div>
        )}

        <div className="h-72 rounded overflow-hidden border border-line">
          <MapContainer
            center={[fix?.lat ?? sorted[0]?.lat ?? 25.2, fix?.lng ?? sorted[0]?.lng ?? 55.3]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            {faintTrack.map((line, i) => (
              <Polyline key={`f-${i}`} positions={line.map(p => [p.lat, p.lng])} pathOptions={{ color: '#495057', weight: 2, opacity: 0.25 }} />
            ))}
            {trail.map((line, i) => (
              <Polyline key={`t-${i}`} positions={line.map(p => [p.lat, p.lng])} pathOptions={{ color: '#1d4ed8', weight: 4 }} />
            ))}
            {fix && (
              <>
                <Marker position={[fix.lat, fix.lng]} icon={icon} />
                <FollowMarker lat={fix.lat} lng={fix.lng} />
              </>
            )}
          </MapContainer>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs" data-testid="playback-readout">
          <div>
            <dt className="text-grey-500">State</dt>
            <dd className="text-ink">{fix ? STATE_WORDS[fix.state] : STATE_WORDS.no_data}</dd>
          </div>
          <div>
            <dt className="text-grey-500">Speed</dt>
            <dd>{reading ? <span className="font-mono text-ink">{reading.speedKmh.toFixed(0)} km/h</span> : pending}</dd>
          </div>
          <div>
            <dt className="text-grey-500">Heading</dt>
            <dd>{reading ? <span className="font-mono text-ink">{reading.heading.toFixed(0)}°</span> : pending}</dd>
          </div>
          <div>
            <dt className="text-grey-500">Distance so far</dt>
            <dd className="font-mono text-ink">{distanceKm.toFixed(1)} km</dd>
          </div>
          {tier >= 2 && (
            <>
              <div>
                <dt className="text-grey-500">Fuel</dt>
                <dd>{pick(reading?.fuelLevelPct, '%')}</dd>
              </div>
              <div>
                <dt className="text-grey-500">RPM</dt>
                <dd>{pick(reading?.rpm, ' rpm')}</dd>
              </div>
              <div>
                <dt className="text-grey-500">Coolant</dt>
                <dd>{pick(reading?.coolantC, ' °C')}</dd>
              </div>
              <div>
                <dt className="text-grey-500">Engine load</dt>
                <dd>{pick(reading?.engineLoadPct, '%')}</dd>
              </div>
              <div>
                <dt className="text-grey-500">AdBlue</dt>
                <dd>{pick(reading?.adBluePct, '%')}</dd>
              </div>
            </>
          )}
        </dl>
        {!fix && (
          <div className="text-[11px] text-grey-500">Nothing to show at this time.</div>
        )}
      </div>
    </div>
  );
}
