'use client';

// MetricTile — one tile of the 2×2 metric grids on the asset page and the
// right-hand panel (reference `.metrics-2`).
//
//   <div className="grid grid-cols-2 gap-2">
//     <MetricTile label="Engine hours" value="1,284" unit="h" source="ECU" />
//     <MetricTile label="Fuel level" value={null} />   // "Not measured"
//   </div>
//
// Pass already-formatted values (no raw floats). `null`/`undefined` reads
// "Not measured"; a real number should come with its `source`.

import React from 'react';
import clsx from 'clsx';
import { useT } from '@/i18n';
import { toneText, type Tone } from './tones';

interface MetricTileProps {
  label: string;
  value: React.ReactNode | null | undefined;
  unit?: string;
  tone?: Tone;
  context?: React.ReactNode;
  source?: string;
  className?: string;
}

export function MetricTile({ label, value, unit, tone = 'neutral', context, source, className = '' }: MetricTileProps) {
  const t = useT();
  const measured = value !== null && value !== undefined && value !== '';
  return (
    <div className={clsx('min-w-0 rounded-md border border-line bg-surface px-3 py-2.5', className)}>
      <div className="text-eyebrow truncate">{label}</div>
      {measured ? (
        <div className={clsx('mt-1 flex items-baseline gap-1 font-mono tabular-nums', tone === 'neutral' ? 'text-ink' : toneText[tone])}>
          <span className="truncate text-lg font-bold leading-6">{value}</span>
          {unit && <span className="text-xs text-text-secondary">{unit}</span>}
        </div>
      ) : (
        <div className="mt-1 text-sm italic leading-6 text-text-secondary">{t('common.not_measured', 'Not measured')}</div>
      )}
      {context && <div className="mt-0.5 truncate text-xs text-text-secondary">{context}</div>}
      {source && measured && (
        <div className="mt-1 truncate font-mono text-[10px] text-text-secondary">{t('ui.source', 'Source: {source}', { source })}</div>
      )}
    </div>
  );
}
