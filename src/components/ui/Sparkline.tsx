'use client';

// Sparkline — a tiny trend line (fuel use, engine hours per day). Decoration
// next to a written number; it has no axes and is not the source of any value.
//
//   <Sparkline values={[4, 6, 5, 8, 7]} label="Engine hours, last 5 days" tone="info" />
//
// Fewer than two finite points draw nothing (an honest "no trend"), not a flat
// line. Non-finite points are skipped.

import React from 'react';
import clsx from 'clsx';
import { toneStroke, type Tone } from './tones';

interface SparklineProps {
  values: Array<number | null | undefined>;
  /** Accessible description, e.g. "Fuel used per day, last 7 days". */
  label: string;
  width?: number;
  height?: number;
  tone?: Tone;
  /** Shade the area under the line. */
  area?: boolean;
  className?: string;
}

/** Map values to SVG points inside a width × height box (1 px inset). */
export function sparkPoints(values: Array<number | null | undefined>, width: number, height: number): Array<[number, number]> {
  const pts = values
    .map((v, i) => [i, v] as const)
    .filter((p): p is readonly [number, number] => typeof p[1] === 'number' && Number.isFinite(p[1]));
  if (pts.length < 2) return [];
  const ys = pts.map(p => p[1]);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const last = values.length - 1 || 1;
  const pad = 1;
  return pts.map(([i, v]) => {
    const x = pad + (i / last) * (width - pad * 2);
    const y = max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - pad * 2);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  });
}

export function Sparkline({ values, label, width = 80, height = 24, tone = 'info', area = false, className = '' }: SparklineProps) {
  const pts = sparkPoints(values, width, height);
  if (pts.length === 0) return null;
  const line = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const fill = `${pts[0][0]},${height} ${line} ${pts[pts.length - 1][0]},${height}`;
  return (
    <svg
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={clsx('shrink-0 overflow-visible', toneStroke[tone], className)}
    >
      {area && <polygon points={fill} fill="currentColor" opacity={0.12} />}
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
