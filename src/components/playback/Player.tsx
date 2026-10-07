'use client';

// Trip playback — spec 11.15.
//
//   • player bar: play/pause, speed 1× / 10× / 60× / 300×, restart, a scrubber
//     coloured by state (moving green, stationary with ignition on amber, off grey,
//     no data hatched) and a current time + speed readout;
//   • map: a marker rotated to the heading moving along the track, the trail drawn
//     behind it and the rest of the track faint;
//   • event pins on the scrubber and the map (trip start/stop, harsh events,
//     over-speed, geofence enter/exit for the viewer's own fences, refuel and fuel
//     drop for Tier 2/3, power cut, towing) — clicking a pin jumps to it;
//   • side readout: Tier 1 speed / ignition / heading / GPS distance; Tier 2/3 also
//     the CAN values the asset supports, each "Not measured" when unsupported;
//   • gaps jump across with a "No data 13:05 – 15:40" banner — nothing interpolated;
//   • renters cannot scrub before their window start;
//   • prefers-reduced-motion starts paused and steps instead of animating;
//   • the trail is downsampled to ≤ 5,000 points and the marker interpolates only
//     inside one trip and less than 2 minutes apart.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import clsx from 'clsx';
import type { Alert, Geofence, GeofenceEvent, Reading } from '@/domain/types';
import type { PlaybackMapProps } from './PlaybackMap';

// Leaflet touches `window` at import time, so the map is client-only.
const PlaybackMap = dynamic<PlaybackMapProps>(() => import('./PlaybackMap').then(m => m.PlaybackMap), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-xs text-grey-500">Loading map…</div>,
});
import { Button } from '@/components/ui';
import * as clock from '@/lib/clock';
import {
  buildPlaybackData,
  gapAt,
  indexAtOrBefore,
  gapLabel,
  interpolatePosition,
  pointAt,
  trackSegments,
  type PlaybackData,
  type PlaybackEventKind,
  type PlaybackState,
  type TrackGap,
  type TrackPoint,
} from '@/domain/trips';

export const PLAYBACK_SPEEDS = [1, 10, 60, 300] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export interface PlayerProps {
  assetId: string;
  assetCode: string;
  assetName?: string;
  /** 1, 2 or 3 — CAN values only appear on Tier 2/3. */
  tier: 1 | 2 | 3;
  /** ParamKeys the asset's CAN check ticked. */
  canSupported: string[];
  readings: Reading[];
  alerts?: Alert[];
  /** The viewer's own geofences only — never another tenant's. */
  geofences?: Geofence[];
  geofenceEvents?: GeofenceEvent[];
  /** Renter window: playback cannot start or scrub before this. */
  clipStartMs?: number;
  focusTripId?: string;
  title?: string;
  onClose?: () => void;
}

const STATE_COLOURS: Record<PlaybackState, string> = {
  moving: '#1F9A6D',
  stationary: '#B89000',
  off: '#9A9CA1',
  nodata: 'transparent',
};

export const EVENT_STYLES: Record<PlaybackEventKind, { colour: string; glyph: string }> = {
  trip_start: { colour: '#1F9A6D', glyph: '▶' },
  trip_stop: { colour: '#9A9CA1', glyph: '■' },
  harsh_brake: { colour: '#D64545', glyph: '!' },
  harsh_accel: { colour: '#D64545', glyph: '!' },
  harsh_corner: { colour: '#D64545', glyph: '!' },
  harsh_driving: { colour: '#D64545', glyph: '!' },
  overspeed: { colour: '#D64545', glyph: '▲' },
  geofence_enter: { colour: '#2F6FD0', glyph: '⤓' },
  geofence_exit: { colour: '#2F6FD0', glyph: '⤒' },
  refuel: { colour: '#B89000', glyph: '▲' },
  fuel_drop: { colour: '#B89000', glyph: '▼' },
  power_cut: { colour: '#D64545', glyph: '⚡' },
  towing: { colour: '#7A4FD0', glyph: '⇄' },
};

interface TimelineSegment {
  state: PlaybackState;
  fromMs: number;
  toMs: number;
}

/** Runs of equal state, with the gaps inserted as hatched "no data" runs. */
function timelineSegments(data: PlaybackData, fromMs: number, toMs: number): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  const push = (state: PlaybackState, from: number, to: number) => {
    if (to <= from) return;
    const last = segments[segments.length - 1];
    if (last && last.state === state && last.toMs === from) last.toMs = to;
    else segments.push({ state, fromMs: from, toMs: to });
  };

  const gapStarts = new Map<number, TrackGap>();
  for (const gap of data.gaps) gapStarts.set(gap.from, gap);

  for (let i = 0; i < data.track.length; i++) {
    const p = data.track[i];
    const next = data.track[i + 1];
    const gap = gapStarts.get(p.t);
    if (gap) push('nodata', Math.max(gap.from, fromMs), Math.min(gap.to, toMs));
    const end = gap ? gap.to : next ? next.t : p.t + 30000;
    push(p.state, Math.max(p.t, fromMs), Math.min(end, toMs));
  }
  return segments.filter(s => s.toMs > fromMs && s.fromMs < toMs);
}

/** The track for a Leaflet polyline, cut at a moment and never across a gap. */
function pathUpTo(points: TrackPoint[], ms: number): [number, number][][] {
  return trackSegments(points.filter(p => p.t <= ms)).map(seg => seg.map(p => [p.lat, p.lng] as [number, number]));
}

function pathAfter(points: TrackPoint[], ms: number): [number, number][][] {
  return trackSegments(points.filter(p => p.t >= ms)).map(seg => seg.map(p => [p.lat, p.lng] as [number, number]));
}

export function Player({
  assetId,
  assetCode,
  assetName,
  tier,
  canSupported,
  readings,
  alerts,
  geofences,
  geofenceEvents,
  clipStartMs,
  focusTripId,
  title,
  onClose,
}: PlayerProps) {
  // ── Data ────────────────────────────────────────────────────────────────────
  const data = useMemo(
    () =>
      buildPlaybackData(readings, {
        assetId,
        alerts,
        geofences,
        geofenceEvents,
        tier,
        canSupported,
      }),
    [readings, alerts, geofences, geofenceEvents, tier, canSupported, assetId],
  );

  const fromMs = useMemo(() => Math.max(data.fromMs, clipStartMs ?? data.fromMs), [data.fromMs, clipStartMs]);
  const toMs = data.toMs;
  const spanMs = Math.max(1, toMs - fromMs);

  const focusedTrip = useMemo(
    () => (focusTripId ? data.trips.find(t => t.id === focusTripId) : undefined),
    [data.trips, focusTripId],
  );

  const segments = useMemo(() => timelineSegments(data, fromMs, toMs), [data, fromMs, toMs]);
  const visibleEvents = useMemo(
    () => data.events.filter(e => e.atMs >= fromMs && e.atMs <= toMs),
    [data.events, fromMs, toMs],
  );

  // ── Player state ────────────────────────────────────────────────────────────
  const [cursorMs, setCursorMs] = useState(fromMs);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(60);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [jumpedGap, setJumpedGap] = useState<TrackGap | null>(null);
  const frame = useRef<number | null>(null);
  const lastFrameAt = useRef<number>(0);
  const trackRef = useRef<TrackPoint[]>([]);
  const cursorRef = useRef(fromMs);

  trackRef.current = data.track;
  cursorRef.current = cursorMs;

  // prefers-reduced-motion: start paused and step instead of animating
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  // Restart whenever the underlying period changes (or when a renter's window moves)
  useEffect(() => {
    setPlaying(false);
    setCursorMs(Math.max(fromMs, focusedTrip ? focusedTrip.startMs : fromMs));
    setJumpedGap(null);
  }, [fromMs, focusedTrip]);

  const stop = useCallback(() => setPlaying(false), []);

  // ── Playback loop (requestAnimationFrame; steps when reduced motion is on) ──
  useEffect(() => {
    if (!playing) {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      return;
    }

    lastFrameAt.current = performance.now();
    const tick = (now: number) => {
      const realDelta = now - lastFrameAt.current;
      lastFrameAt.current = now;

      if (reducedMotion) {
        // Step to the next reading instead of sliding between them.
        const next = trackRef.current.find(p => p.t > cursorRef.current);
        const gap = data.gaps.find(g => g.from >= cursorRef.current && g.from < (next?.t ?? toMs));
        if (gap) setJumpedGap(gap);
        setCursorMs(next ? next.t : toMs);
        if (!next) setPlaying(false);
      } else {
        const next = cursorRef.current + realDelta * speed;
        const gap = gapAt(data.gaps, cursorRef.current) ?? gapAt(data.gaps, next);
        if (gap && next < gap.to) {
          // A gap: jump across it and say so — nothing is interpolated.
          setJumpedGap(gap);
          setCursorMs(Math.min(gap.to, toMs));
        } else {
          setCursorMs(next >= toMs ? toMs : next);
        }
        if (next >= toMs) setPlaying(false);
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [playing, speed, reducedMotion, data.gaps, toMs]);

  // The gap banner stays up while the cursor is inside the gap and for 10 minutes
  // of track time after jumping across it, so the jump is never silent.
  const currentGap = gapAt(data.gaps, cursorMs);
  useEffect(() => {
    if (!jumpedGap) return;
    const past = cursorMs > jumpedGap.to + 10 * 60 * 1000;
    const before = cursorMs < jumpedGap.from;
    if (past || before) setJumpedGap(null);
  }, [cursorMs, jumpedGap]);

  const bannerGap = currentGap ?? jumpedGap;

  // ── Marker + readout ────────────────────────────────────────────────────────
  const marker = useMemo(() => interpolatePosition(data.track, cursorMs), [data.track, cursorMs]);
  const markerColour = tier === 3 ? '#2F6FD0' : tier === 2 ? '#7A4FD0' : '#1F9A6D';

  const reading = useMemo(() => pointAt(data.track, cursorMs), [data.track, cursorMs]);

  // Slicing the trail is only needed when the cursor crosses a drawn point, so the
  // per-frame cost stays a binary search.
  const trailIndex = indexAtOrBefore(data.points, cursorMs);
  const splitMs = trailIndex >= 0 ? data.points[trailIndex].t : cursorMs;
  const trail = useMemo(() => pathUpTo(data.points, splitMs), [data.points, splitMs]);
  const ahead = useMemo(() => pathAfter(data.points, splitMs), [data.points, splitMs]);

  const seekable = spanMs > 0;
  const seek = useCallback(
    (ms: number) => {
      const clamped = Math.min(toMs, Math.max(fromMs, ms));
      setCursorMs(clamped);
      setPlaying(false);
    },
    [fromMs, toMs],
  );

  // ── Scrubber dragging ───────────────────────────────────────────────────────
  const barRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      // Renters cannot scrub before their window start — the bar starts at the window.
      seek(fromMs + fraction * spanMs);
    },
    [fromMs, spanMs, seek],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => seekFromClientX(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, seekFromClientX]);

  // ── Readout rows ────────────────────────────────────────────────────────────
  const supports = (key: string) => canSupported.includes(key);
  const value = (v: number | undefined, unit: string, digits = 1) =>
    v === undefined ? 'Not measured' : `${v.toFixed(digits)} ${unit}`;

  const readoutRows: { label: string; value: string }[] = [
    { label: 'Speed', value: reading ? `${reading.speedKmh.toFixed(1)} km/h` : '—' },
    { label: 'Ignition', value: reading ? (reading.ignition ? 'On' : 'Off') : '—' },
    { label: 'Heading', value: reading ? `${Math.round(reading.heading)}°` : '—' },
    { label: 'GPS distance', value: reading ? `${reading.gpsDistanceKm.toFixed(1)} km` : '—' },
  ];

  if (tier >= 2) {
    readoutRows.push(
      { label: 'Fuel level', value: supports('fuelLevel') ? value(reading?.fuelLevelPct, '%', 0) : 'Not measured' },
      { label: 'RPM', value: supports('rpm') ? value(reading?.rpm, 'rpm', 0) : 'Not measured' },
      { label: 'Coolant', value: supports('coolantTemp') ? value(reading?.coolantC, '°C', 0) : 'Not measured' },
      { label: 'Engine load', value: supports('engineLoad') ? value(reading?.engineLoadPct, '%', 0) : 'Not measured' },
      { label: 'Engine hours · ECU', value: supports('engineHours') ? value(reading?.engineHours, 'h') : 'Not measured' },
      { label: 'AdBlue', value: supports('adBlue') ? value(reading?.adBluePct, '%', 0) : 'Not measured' },
    );
  }

  const positionOf = (ms: number) => Math.min(100, Math.max(0, ((ms - fromMs) / spanMs) * 100));

  return (
    <div className="bg-surface border border-line rounded-lg overflow-hidden" data-testid="playback-player">
      <div className="flex items-center justify-between px-4 py-2 border-b border-line">
        <div className="text-sm font-medium text-ink">
          {title ?? `Playback · ${assetCode}`}
          {assetName && <span className="text-grey-500 font-normal"> — {assetName}</span>}
        </div>
        <div className="flex items-center gap-2">
          {reducedMotion && <span className="text-xs text-grey-500">Reduced motion: stepping</span>}
          {onClose && (
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px]">
        <div>
          <div className="h-[320px] relative bg-paper-2">
            <PlaybackMap
              points={data.points}
              trail={trail}
              ahead={ahead}
              events={visibleEvents}
              marker={marker}
              markerColour={markerColour}
              onEventClick={atMs => seek(atMs)}
            />

            {bannerGap && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-ink/90 text-white text-xs font-medium px-3 py-1.5 rounded-md">
                {gapLabel(bannerGap)}
              </div>
            )}
            {focusTripId && focusedTrip && (
              <div className="absolute bottom-3 left-3 bg-white/90 text-xs px-2 py-1 rounded shadow-sm text-grey-700">
                Trip {focusedTrip.index + 1} of {data.trips.length} · starts {clock.formatDubaiTime(focusedTrip.startMs)}
              </div>
            )}
          </div>

          {/* Player bar */}
          <div className="p-3 space-y-3 border-t border-line">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant={playing ? 'secondary' : 'primary'}
                onClick={() => {
                  if (!playing && cursorMs >= toMs) setCursorMs(fromMs);
                  setPlaying(p => !p);
                }}
                data-testid="playback-play"
              >
                {playing ? 'Pause' : 'Play'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { stop(); setCursorMs(fromMs); setJumpedGap(null); }}>
                Restart
              </Button>
              <div className="flex items-center gap-1 ml-1">
                {PLAYBACK_SPEEDS.map(s => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={clsx(
                      'text-xs px-2 py-1 rounded border font-mono',
                      speed === s ? 'bg-ink text-white border-ink' : 'bg-surface text-grey-700 border-line hover:text-ink',
                    )}
                  >
                    {s}×
                  </button>
                ))}
              </div>
              <div className="ml-auto text-xs text-grey-700 font-mono">
                {clock.formatDubaiTime(cursorMs)} · {reading ? `${reading.speedKmh.toFixed(0)} km/h` : '—'}
              </div>
            </div>

            {/* Scrubber: coloured by state, event pins on top */}
            <div
              ref={barRef}
              onPointerDown={e => {
                if (!seekable) return;
                setDragging(true);
                seekFromClientX(e.clientX);
              }}
              className={clsx('relative h-6 rounded overflow-hidden border border-line', seekable ? 'cursor-pointer' : 'opacity-60')}
              data-testid="playback-scrubber"
            >
              <div className="absolute inset-0 flex">
                {segments.map((segment, i) => (
                  <div
                    key={i}
                    style={{
                      width: `${((segment.toMs - segment.fromMs) / spanMs) * 100}%`,
                      backgroundColor: segment.state === 'nodata' ? undefined : STATE_COLOURS[segment.state],
                      backgroundImage:
                        segment.state === 'nodata'
                          ? 'repeating-linear-gradient(45deg, #E3E4E7 0 4px, #F6F6F7 4px 8px)'
                          : undefined,
                    }}
                    title={segment.state === 'nodata' ? 'No data' : segment.state}
                  />
                ))}
              </div>

              {/* Events */}
              {visibleEvents.map(event => (
                <button
                  key={event.id}
                  title={`${event.label}${event.detail ? ` · ${event.detail}` : ''} · ${clock.formatDubaiTime(event.atMs)}`}
                  onClick={e => {
                    e.stopPropagation();
                    seek(event.atMs);
                  }}
                  style={{ left: `${positionOf(event.atMs)}%`, color: EVENT_STYLES[event.kind].colour }}
                  className="absolute -top-1 -translate-x-1/2 text-[10px] leading-none bg-white rounded-full border border-line px-0.5"
                >
                  {EVENT_STYLES[event.kind].glyph}
                </button>
              ))}

              {/* Cursor */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-ink"
                style={{ left: `${positionOf(cursorMs)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-grey-500 font-mono">
              <span>{clock.formatDubaiTime(fromMs)}</span>
              {clipStartMs !== undefined && clipStartMs > data.fromMs && (
                <span className="text-amber-dark">Your rental starts {clock.formatDubaiDateTime(clipStartMs)}</span>
              )}
              <span>{clock.formatDubaiTime(toMs)}</span>
            </div>
          </div>
        </div>

        {/* Side readout */}
        <div className="border-t lg:border-t-0 lg:border-l border-line p-3 space-y-2">
          <div className="text-xs text-grey-500 font-medium uppercase">Readout</div>
          <div className="space-y-1">
            {readoutRows.map(row => (
              <div key={row.label} className="flex items-center justify-between text-xs">
                <span className="text-grey-500">{row.label}</span>
                <span className={clsx('font-mono', row.value === 'Not measured' ? 'text-grey-500' : 'text-ink')}>{row.value}</span>
              </div>
            ))}
          </div>
          {visibleEvents.length > 0 && (
            <>
              <div className="text-xs text-grey-500 font-medium uppercase pt-2">Events ({visibleEvents.length})</div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {visibleEvents.map(event => (
                  <button
                    key={event.id}
                    onClick={() => seek(event.atMs)}
                    className="w-full text-left text-xs hover:bg-paper-2 rounded px-1 py-0.5"
                  >
                    <span style={{ color: EVENT_STYLES[event.kind].colour }}>{EVENT_STYLES[event.kind].glyph}</span>{' '}
                    <span className="text-ink">{event.label}</span>
                    {event.detail && <span className="text-grey-500"> · {event.detail}</span>}
                    <span className="text-grey-500 font-mono"> · {clock.formatDubaiTime(event.atMs)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Player;
