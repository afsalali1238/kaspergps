'use client';

// StatusDot — a small coloured dot for an asset status or a tone.
//
//   <StatusDot status="live" />                 // decorative, next to a label
//   <StatusDot status="offline" label="Offline" />  // stands alone: announced
//   <StatusDot tone="warn" pulse />
//
// Without `label` the dot is aria-hidden: always put the status in words next to
// it (colour is never the only signal).

import React from 'react';
import clsx from 'clsx';
import type { AssetStatus } from '@/domain/types';
import { toneFill, type Tone } from './tones';

export const STATUS_DOT: Record<AssetStatus, string> = {
  live: 'bg-live',
  idle: 'bg-idle',
  stale: 'bg-stale',
  offline: 'bg-offline',
  unknown: 'bg-unknown',
  no_tracker: 'bg-no-tracker',
};

interface StatusDotProps {
  status?: AssetStatus;
  tone?: Tone;
  /** Accessible name. Omit when the status is already written next to the dot. */
  label?: string;
  size?: 'sm' | 'md';
  pulse?: boolean;
  className?: string;
}

export function StatusDot({ status, tone = 'neutral', label, size = 'sm', pulse = false, className = '' }: StatusDotProps) {
  const fill = status ? STATUS_DOT[status] : toneFill[tone];
  return (
    <span
      className={clsx(
        'relative inline-block shrink-0 rounded-full',
        size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5',
        fill,
        className
      )}
      data-status={status}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {pulse && (
        <span aria-hidden="true" className={clsx('absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping', fill)} />
      )}
    </span>
  );
}
