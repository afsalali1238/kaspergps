// History tab rules (spec 11.3). Pure: callers pass times and readings.
//
//  - Periods: 24 h (default), 7 days, or a custom range.
//  - Renters cannot see before their window floor; a range that starts earlier
//    is clamped to the floor and flagged.
//  - The table interleaves readings with gap rows ("No data 13:05 – 15:40").
//  - CAN columns appear only for the parameters the asset supports.

import type { ParamKey, Reading } from '@/domain/types';
import { buildSpans, readingMs, type Span } from '@/domain/playback';

export type HistoryPeriod = '24h' | '7d' | 'custom';

export const HISTORY_DAY_MS = 86_400_000;
/** Custom ranges are capped so one query stays bounded (a decision, see reviews/H4-self-check.md). */
export const HISTORY_CUSTOM_MAX_DAYS = 31;
/** Gap rows shorter than this are noise (a leading silence of seconds), so they are not shown. */
export const HISTORY_GAP_ROW_MIN_MS = 60_000;

export type PeriodResult =
  | { ok: true; fromMs: number; toMs: number; clampedToFloor: boolean }
  | { ok: false; error: 'from_after_to' | 'too_long' | 'before_floor' | 'missing' };

export function resolvePeriod(input: {
  period: HistoryPeriod;
  nowMs: number;
  customFromMs?: number;
  customToMs?: number;
  floorMs: number | null;
}): PeriodResult {
  const { period, nowMs, floorMs } = input;
  let fromMs: number;
  let toMs: number;

  if (period === '24h' || period === '7d') {
    toMs = nowMs;
    fromMs = nowMs - (period === '24h' ? HISTORY_DAY_MS : 7 * HISTORY_DAY_MS);
  } else {
    if (input.customFromMs === undefined || input.customToMs === undefined) return { ok: false, error: 'missing' };
    fromMs = input.customFromMs;
    toMs = Math.min(input.customToMs, nowMs);
    if (fromMs >= toMs) return { ok: false, error: 'from_after_to' };
    if (toMs - fromMs > HISTORY_CUSTOM_MAX_DAYS * HISTORY_DAY_MS) return { ok: false, error: 'too_long' };
  }

  if (floorMs !== null && toMs <= floorMs) return { ok: false, error: 'before_floor' };
  let clampedToFloor = false;
  if (floorMs !== null && fromMs < floorMs) {
    fromMs = floorMs;
    clampedToFloor = true;
  }
  return { ok: true, fromMs, toMs, clampedToFloor };
}

export type HistoryRow =
  | { kind: 'reading'; timeMs: number; reading: Reading }
  | { kind: 'gap'; timeMs: number; span: Span };

/** Readings and gap rows in time order. Gap rows are no_data spans of at least HISTORY_GAP_ROW_MIN_MS. */
export function buildHistoryRows(readings: Reading[], fromMs: number, toMs: number): HistoryRow[] {
  const spans = buildSpans(readings, fromMs, toMs);
  const rows: HistoryRow[] = [];
  for (const r of readings) {
    const t = readingMs(r);
    if (t >= fromMs && t <= toMs) rows.push({ kind: 'reading', timeMs: t, reading: r });
  }
  for (const s of spans) {
    if (s.state === 'no_data' && s.toMs - s.fromMs >= HISTORY_GAP_ROW_MIN_MS) {
      rows.push({ kind: 'gap', timeMs: s.fromMs, span: s });
    }
  }
  return rows.sort((a, b) => a.timeMs - b.timeMs || (a.kind === 'gap' ? -1 : 1));
}

export interface CanColumn {
  key: ParamKey;
  label: string;
  unit: string;
  read: (r: Reading) => number | undefined;
}

const CAN_COLUMNS: CanColumn[] = [
  { key: 'fuelLevel', label: 'Fuel', unit: '%', read: r => r.fuelLevelPct },
  { key: 'fuelRate', label: 'Fuel rate', unit: 'L/h', read: r => r.fuelRateLph },
  { key: 'rpm', label: 'RPM', unit: 'rpm', read: r => r.rpm },
  { key: 'coolantTemp', label: 'Coolant', unit: '°C', read: r => r.coolantC },
  { key: 'engineLoad', label: 'Load', unit: '%', read: r => r.engineLoadPct },
  { key: 'adBlue', label: 'AdBlue', unit: '%', read: r => r.adBluePct },
];

/** The CAN columns this asset supports, in a fixed order. */
export function canColumnsFor(supported: ParamKey[]): CanColumn[] {
  return CAN_COLUMNS.filter(c => supported.includes(c.key));
}
