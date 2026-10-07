'use client';

import React from 'react';
import clsx from 'clsx';
import type { AssetStatus } from '@/domain/types';

interface StatusBadgeProps {
  status: AssetStatus;
  className?: string;
  size?: 'sm' | 'md';
  /** Translated label for the mirrored screens; the console keeps the default. */
  label?: string;
}

const statusConfig: Record<AssetStatus, { label: string; dot: string; bg: string; text: string }> = {
  live: { label: 'Live', dot: 'bg-live', bg: 'bg-live/10', text: 'text-live' },
  idle: { label: 'Idle', dot: 'bg-idle', bg: 'bg-idle/10', text: 'text-idle-dark' },
  stale: { label: 'Stale', dot: 'bg-stale', bg: 'bg-stale/10', text: 'text-stale' },
  offline: { label: 'Offline', dot: 'bg-offline', bg: 'bg-offline/10', text: 'text-red' },
  unknown: { label: 'Unknown', dot: 'bg-unknown', bg: 'bg-unknown/10', text: 'text-grey-500' },
  no_tracker: { label: 'No tracker', dot: 'bg-no-tracker', bg: 'bg-no-tracker/10', text: 'text-grey-700' },
};

export function StatusBadge({ status, className = '', size = 'md', label }: StatusBadgeProps) {
  const cfg = statusConfig[status];
  const isSm = size === 'sm';

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        isSm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
        cfg.bg,
        className
      )}
    >
      <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot)} />
      <span className={clsx(cfg.text, isSm ? 'font-medium' : 'font-semibold')}>{label ?? cfg.label}</span>
    </span>
  );
}
