'use client';

import React from 'react';
import clsx from 'clsx';

interface TierChipProps {
  tier: number;
  className?: string;
  showLabel?: boolean;
}

const tierStyles: Record<number, string> = {
  1: 'bg-paper border-line text-grey-700',
  2: 'bg-yellow/10 border-yellow-dark/40 text-ink',
  3: 'bg-ink/10 border-ink/20 text-ink font-semibold',
};

export function TierChip({ tier, className = '', showLabel = false }: TierChipProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border',
        tierStyles[tier],
        className
      )}
    >
      {showLabel ? `T${tier}` : `T${tier}`}
    </span>
  );
}
