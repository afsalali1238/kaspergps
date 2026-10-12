'use client';

// History tab (spec 11.3): period picker, track with gap breaks, positions
// table with the asset's CAN columns and gap rows. Presentation only; rules in
// src/domain/history.ts, readings come from the screen via api.

import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Reading, ParamKey } from '@/domain/types';
import * as clock from '@/lib/clock';
import { buildSpans, sortReadings, readingMs, trailUntil } from '@/domain/playback';
import {
  HISTORY_CUSTOM_MAX_DAYS,
  HISTORY_DAY_MS,
  buildHistoryRows,
  canColumnsFor,
  resolvePeriod,
  type HistoryPeriod,
  type CanColumn,
} from '@/domain/history';

export interface HistoryPanelProps {
  supported: ParamKey[];
  nowMs: number;
  /** Earliest time this session may view (renters); null for owners and Kasper. */
  floorMs: number | null;
  readingsFor: (fromMs: number, toMs: number) => Reading[];
  /** Opens the playback player over the period shown (spec 11.3 "Play this period"). */
  onPlay?: (fromMs: number, toMs: number) => void;
}

const PAGE = 100;

function toLocalInput(ms: number): string {
  return clock.dubaiToIso(ms).slice(0, 16);
}

function fromLocalInput(value: string): number {
  return clock.isoFromDubai(`${value}:00+04:00`);
}

const ERRORS: Record<string, string> = {
  from_after_to: 'The start must be before the end.',
  too_long: `Custom ranges can be up to ${HISTORY_CUSTOM_MAX_DAYS} days.`,
  before_floor: 'No history before your rental window.',
  missing: 'Choose a start and an end.',
};

export function HistoryPanel({ supported, nowMs, floorMs, readingsFor, onPlay }: HistoryPanelProps) {
  const [period, setPeriod] = useState<HistoryPeriod>('24h');
  const [customFrom, setCustomFrom] = useState<string>(() => toLocalInput(nowMs - HISTORY_DAY_MS));
  const [customTo, setCustomTo] = useState<string>(() => toLocalInput(nowMs));
  const [applied, setApplied] = useState<{ from: number; to: number } | null>(null);
  const [shown, setShown] = useState(PAGE);

  const result = useMemo(
    () =>
      resolvePeriod({
        period,
        nowMs,
        customFromMs: applied?.from,
        customToMs: applied?.to,
        floorMs,
      }),
    [period, nowMs, applied, floorMs],
  );

  const columns: CanColumn[] = useMemo(() => canColumnsFor(supported), [supported]);

  const range = result.ok ? { fromMs: result.fromMs, toMs: result.toMs } : null;
  const readings = useMemo(
    () => (range ? sortReadings(readingsFor(range.fromMs, range.toMs)) : []),
    // readingsFor is recreated each render by the parent; the range is what matters.
    [range?.fromMs, range?.toMs, nowMs],
  );

  const rows = useMemo(
    () => (range ? buildHistoryRows(readings, range.fromMs, range.toMs) : []),
    [readings, range?.fromMs, range?.toMs],
  );

  const lines = useMemo(
    () => (range ? trailUntil(readings, range.fromMs, range.toMs, Number.POSITIVE_INFINITY) : []),
    [readings, range?.fromMs, range?.toMs],
  );
  const spanCount = useMemo(
    () => (range ? buildSpans(readings, range.fromMs, range.toMs).filter(s => s.state === 'no_data').length : 0),
    [readings, range?.fromMs, range?.toMs],
  );

  const pick = (p: HistoryPeriod) => {
    setPeriod(p);
    setShown(PAGE);
  };

  const applyCustom = () => {
    setApplied({ from: fromLocalInput(customFrom), to: fromLocalInput(customTo) });
    setPeriod('custom');
    setShown(PAGE);
  };

  const last = readings[readings.length - 1];
  const fmt = (ms: number) => clock.formatDubaiDateTime(ms);

  return (
    <div className="bg-surface border border-line rounded-lg p-4 space-y-4" data-testid="history-panel">
      <div className="flex flex-wrap items-center gap-2 text-xs" role="group" aria-label="History period">
        {(['24h', '7d', 'custom'] as HistoryPeriod[]).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => (p === 'custom' ? setPeriod('custom') : pick(p))}
            aria-pressed={period === p}
            className={`px-2 py-1 border rounded ${period === p ? 'border-ink text-ink' : 'border-line text-grey-500'}`}
          >
            {p === '24h' ? '24 h' : p === '7d' ? '7 days' : 'Custom'}
          </button>
        ))}
      </div>

      {onPlay && range && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onPlay(range.fromMs, range.toMs)}
            className="px-2 py-1 border border-line rounded text-xs text-ink"
          >
            Play this period
          </button>
        </div>
      )}

      {period === 'custom' && (
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-grey-500">From (Dubai time)</span>
            <input
              type="datetime-local"
              value={customFrom}
              min={floorMs !== null ? toLocalInput(floorMs) : undefined}
              max={customTo}
              onChange={e => setCustomFrom(e.target.value)}
              className="border border-line rounded px-2 py-1 bg-paper"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-grey-500">To (Dubai time)</span>
            <input
              type="datetime-local"
              value={customTo}
              max={toLocalInput(nowMs)}
              onChange={e => setCustomTo(e.target.value)}
              className="border border-line rounded px-2 py-1 bg-paper"
            />
          </label>
          <button type="button" onClick={applyCustom} className="px-2 py-1 border border-line rounded text-ink">
            Show
          </button>
        </div>
      )}

      {!result.ok && (
        <div role="alert" className="text-xs text-red-700">
          {ERRORS[result.error]}
        </div>
      )}

      {result.ok && (
        <div className="text-xs text-grey-500">
          {fmt(result.fromMs)} – {fmt(result.toMs)}
          {result.clampedToFloor && floorMs !== null && (
            <span className="ml-2" data-testid="history-floor-note">History starts {fmt(floorMs)}</span>
          )}
          {spanCount > 0 && <span className="ml-2">· {spanCount} gap{spanCount === 1 ? '' : 's'} with no data</span>}
        </div>
      )}

      {range && (
        <div className="h-72 rounded overflow-hidden border border-line">
          <MapContainer
            center={[last?.lat ?? 25.2, last?.lng ?? 55.3]}
            zoom={12}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            {lines.map((line, i) => (
              <Polyline key={`h-${i}`} positions={line.map(p => [p.lat, p.lng])} pathOptions={{ color: '#1d4ed8', weight: 3 }} />
            ))}
            {last && <CircleMarker center={[last.lat, last.lng]} radius={6} pathOptions={{ color: '#1d4ed8' }} />}
          </MapContainer>
        </div>
      )}

      {range && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-grey-500">
                <th className="text-left font-medium px-3 py-2">Time</th>
                <th className="text-left font-medium px-3 py-2">Speed</th>
                <th className="text-left font-medium px-3 py-2">Ignition</th>
                <th className="text-left font-medium px-3 py-2">Heading</th>
                {columns.map(c => (
                  <th key={c.key} className="text-left font-medium px-3 py-2">{c.label} ({c.unit})</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4 + columns.length} className="px-3 py-4 text-center text-grey-500">No data</td>
                </tr>
              )}
              {rows.slice(0, shown).map(row =>
                row.kind === 'gap' ? (
                  <tr key={`g-${row.timeMs}`} className="border-b border-line bg-paper-2 text-grey-500 text-xs" data-testid="gap-row">
                    <td colSpan={4 + columns.length} className="px-3 py-2">
                      No data {fmt(row.span.fromMs)} – {fmt(row.span.toMs)}
                    </td>
                  </tr>
                ) : (
                  <tr key={`r-${readingMs(row.reading)}`} className="border-b border-line">
                    <td className="px-3 py-2 font-mono text-xs">{fmt(row.timeMs)}</td>
                    <td className="px-3 py-2 font-mono">{row.reading.speedKmh.toFixed(0)} km/h</td>
                    <td className="px-3 py-2">{row.reading.ignition ? 'On' : 'Off'}</td>
                    <td className="px-3 py-2 font-mono">{Math.round(row.reading.heading)}°</td>
                    {columns.map(c => {
                      const v = c.read(row.reading);
                      return (
                        <td key={c.key} className="px-3 py-2 font-mono">
                          {v === undefined ? <span className="text-grey-500">Not measured</span> : v.toFixed(0)}
                        </td>
                      );
                    })}
                  </tr>
                ),
              )}
            </tbody>
          </table>
          {rows.length > shown && (
            <button type="button" onClick={() => setShown(s => s + PAGE)} className="mt-2 text-xs text-ink underline">
              Show more ({rows.length - shown} left)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
