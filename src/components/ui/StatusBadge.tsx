'use client';

import React from 'react';
import clsx from 'clsx';
import type { AssetStatus } from '@/domain/types';
import { useT } from '@/i18n';
import { badgeClasses } from './Badge';
import { StatusDot } from './StatusDot';
import type { Tone } from './tones';

interface StatusBadgeProps {
  status: AssetStatus;
  className?: string;
  size?: 'sm' | 'md';
}

// One badge shape (Badge.tsx); the dot carries the exact status colour and the
// text uses the AA-safe tone ink. Stale has its own ink (no shared tone).
const statusConfig: Record<AssetStatus, { label: string; tone: Tone; text?: string }> = {
  live: { label: 'Live', tone: 'ok' },
  idle: { label: 'Idle', tone: 'warn' },
  stale: { label: 'Stale', tone: 'neutral', text: 'text-stale-ink' },
  offline: { label: 'Offline', tone: 'bad' },
  unknown: { label: 'Unknown', tone: 'neutral' },
  no_tracker: { label: 'No tracker', tone: 'neutral' },
};

/** English (and Arabic via t) label for an asset status — used by tests and list cells. */
export function statusLabel(
  status: AssetStatus,
  t: (key: string, fallback: string) => string = (key, fallback) => fallback
): string {
  return t(`common.status.${status}`, statusConfig[status].label);
}

export function StatusBadge({ status, className = '', size = 'md' }: StatusBadgeProps) {
  const t = useT();
  const cfg = statusConfig[status];
  const label = statusLabel(status, t);

  return (
    <span
      className={clsx(badgeClasses(cfg.tone), 'gap-1.5', size === 'sm' && 'text-[10px]', cfg.text, className)}
      data-status={status}
    >
      <StatusDot status={status} size="sm" />
      <span>{label}</span>
    </span>
  );
}
