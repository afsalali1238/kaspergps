'use client';

// ProgressBar — a thin bar for tank level, utilisation or service interval used
// (A8, A7). The bar is decoration; the number is always written beside it.
//
//   <ProgressBar label="Fuel level" value={62} tone="ok" valueLabel="62%" />
//   <ProgressBar label="Fuel level" value={null} />   // "Not measured", empty track
//
// `value` is 0–`max` (default 100) and is clamped. Pass `valueLabel` already
// formatted; the bar never prints a raw float.

import React from 'react';
import clsx from 'clsx';
import { useT } from '@/i18n';
import { toneFill, type Tone } from './tones';

interface ProgressBarProps {
  label: string;
  value: number | null | undefined;
  max?: number;
  tone?: Tone;
  /** Formatted value shown at the end of the label row, e.g. "62%" or "180 / 250 h". */
  valueLabel?: string;
  /** Hide the label row (the caller writes label and value elsewhere). */
  bare?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function clampPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

export function ProgressBar({ label, value, max = 100, tone = 'ok', valueLabel, bare = false, size = 'sm', className = '' }: ProgressBarProps) {
  const t = useT();
  const measured = typeof value === 'number' && Number.isFinite(value);
  const pct = measured ? clampPercent(value, max) : 0;
  const text = measured ? valueLabel : t('common.not_measured', 'Not measured');

  return (
    <div className={clsx('min-w-0', className)}>
      {!bare && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="truncate text-text-secondary">{label}</span>
          {text && <span className={clsx('shrink-0 font-mono tabular-nums', measured ? 'text-ink' : 'italic text-text-secondary')}>{text}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        {...(measured ? { 'aria-valuenow': Math.min(max, Math.max(0, value)) } : {})}
        aria-valuetext={text}
        className={clsx('w-full overflow-hidden rounded-full bg-line', size === 'sm' ? 'h-1.5' : 'h-2.5')}
      >
        {measured && <div className={clsx('h-full rounded-full', toneFill[tone])} style={{ width: `${pct}%` }} />}
      </div>
    </div>
  );
}
