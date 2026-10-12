'use client';

// Badge — the one badge shape (UI-UPGRADE §4, fleetx `.badge`): mono 10.5 px,
// radius 3, 9% tint, AA-safe tone ink.
//
//   <Badge tone="bad">Overdue</Badge>
//   <Badge tone="ok" dot>Live</Badge>
//
// `variant` is the older API (yellow / green / red / …). It still works and maps
// onto a tone, so screens that are not redesigned yet keep compiling.

import React from 'react';
import clsx from 'clsx';
import { toneBorder, toneFill, toneText, toneTint, type Tone } from './tones';

export type BadgeVariant = 'default' | 'yellow' | 'green' | 'red' | 'grey' | 'amber' | 'ink';

export const VARIANT_TONE: Record<BadgeVariant, Tone> = {
  default: 'neutral',
  yellow: 'accent',
  green: 'ok',
  red: 'bad',
  grey: 'neutral',
  amber: 'warn',
  ink: 'neutral',
};

interface BadgeProps {
  tone?: Tone;
  /** @deprecated use `tone`. */
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
  title?: string;
}

/** The class list for the badge shape, exported so wrappers (StatusBadge) share it. */
export function badgeClasses(tone: Tone): string {
  return clsx(
    'inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5',
    'font-mono text-[10.5px] font-bold leading-[14px] whitespace-nowrap',
    toneTint[tone],
    toneText[tone],
    toneBorder[tone]
  );
}

export function Badge({ tone, variant = 'default', children, className = '', dot, title }: BadgeProps) {
  const resolved: Tone = tone ?? VARIANT_TONE[variant];
  return (
    <span className={clsx(badgeClasses(resolved), className)} title={title} data-tone={resolved}>
      {dot && <span aria-hidden="true" className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', toneFill[resolved])} />}
      {children}
    </span>
  );
}
