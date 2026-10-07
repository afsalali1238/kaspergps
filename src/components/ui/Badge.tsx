'use client';

import React from 'react';
import clsx from 'clsx';

type BadgeVariant = 'default' | 'yellow' | 'green' | 'red' | 'grey' | 'amber' | 'ink';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'background-paper-2 text-grey-700 border border-line',
  yellow: 'background-yellow text-ink border border-yellow-dark/30',
  green: 'background-green/10 text-green border border-green/30',
  red: 'background-red/10 text-red border border-red/30',
  grey: 'background-paper border border-line text-grey-500',
  amber: 'background-amber/10 text-amber-dark border border-amber/30',
  ink: 'background-ink/10 text-ink border border-ink/20',
};

const dotStyles: Record<BadgeVariant, string> = {
  default: 'bg-grey-500',
  yellow: 'bg-yellow',
  green: 'bg-green',
  red: 'bg-red',
  grey: 'bg-grey-500',
  amber: 'bg-amber',
  ink: 'bg-ink',
};

export function Badge({ variant = 'default', children, className = '', dot }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium leading-none',
        variantStyles[variant],
        className
      )}
    >
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full', dotStyles[variant])} />}
      {children}
    </span>
  );
}
