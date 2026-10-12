'use client';

// KpiStrip / KpiCell — the strip at the top of every screen (UI-UPGRADE §5.2,
// fleetx `.stats-bar`): eyebrow label, mono value, one line of context, and
// where the number comes from.
//
//   <KpiStrip label="Fleet today">
//     <KpiCell label="Open alerts" value={3} tone="bad" context="1 critical"
//              source="From alerts" onClick={() => setFilter('open')} active={filter === 'open'} />
//     <KpiCell label="Fuel used today" value={null} />   // reads "Not measured"
//   </KpiStrip>
//
// Honest numbers: pass `null`/`undefined` when there is no measurement and the
// cell says "Not measured"; never pass a made-up number. Callers decide which
// cells a role or fleet may see (hide, don't zero). On phones the strip scrolls
// sideways inside itself, so the page never does.

import React from 'react';
import clsx from 'clsx';
import { useT } from '@/i18n';
import { focusRingInset, toneText, type Tone } from './tones';

interface KpiStripProps {
  children: React.ReactNode;
  /** Accessible name for the group, e.g. "Alerts summary". */
  label?: string;
  className?: string;
}

export function KpiStrip({ children, label, className = '' }: KpiStripProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={clsx(
        'flex w-full max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-line bg-surface shadow-panel',
        'divide-x divide-line rtl:divide-x-reverse',
        className
      )}
      data-testid="kpi-strip"
    >
      {children}
    </div>
  );
}

export interface KpiCellProps {
  label: string;
  /** The number (already formatted). `null`/`undefined` renders "Not measured". */
  value: React.ReactNode | null | undefined;
  tone?: Tone;
  /** One short line under the value, e.g. "2 critical · 1 warning". */
  context?: React.ReactNode;
  /** Where the number comes from, e.g. "ECU" or "From invoices". */
  source?: string;
  onClick?: () => void;
  /** The filter this cell applies is on. */
  active?: boolean;
  className?: string;
}

export function KpiCell({ label, value, tone = 'neutral', context, source, onClick, active = false, className = '' }: KpiCellProps) {
  const t = useT();
  const measured = value !== null && value !== undefined && value !== '';
  const body = (
    <>
      <span className="text-eyebrow block truncate">{label}</span>
      <span
        className={clsx(
          'mt-1 block truncate font-mono tabular-nums',
          measured ? 'text-[22px] leading-7 font-bold' : 'text-sm leading-7 italic text-text-secondary',
          measured && (tone === 'neutral' ? 'text-ink' : toneText[tone])
        )}
        data-kpi-value
      >
        {measured ? value : t('common.not_measured', 'Not measured')}
      </span>
      {context && <span className="mt-0.5 block truncate text-xs text-text-secondary">{context}</span>}
      {source && measured && (
        <span className="mt-1 block truncate font-mono text-[10px] text-text-secondary">
          {t('ui.source', 'Source: {source}', { source })}
        </span>
      )}
    </>
  );

  const cellClass = clsx(
    'relative min-w-[148px] flex-1 shrink-0 px-4 py-3 text-start',
    active && 'bg-accent-tint after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent',
    className
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={clsx(cellClass, 'min-h-[44px] transition-colors hover:bg-surface-2', focusRingInset)}
      >
        {body}
      </button>
    );
  }
  return <div className={cellClass}>{body}</div>;
}
