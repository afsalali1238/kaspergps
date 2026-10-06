'use client';

import React from 'react';
import clsx from 'clsx';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: 'empty' | 'search' | 'list' | 'chart' | 'map';
  className?: string;
}

const iconMap = {
  empty: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-line">
      <rect x="8" y="16" width="32" height="20" rx="2" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
      <path d="M16 12h-2M32 12h-2M24 8v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  search: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-line">
      <circle cx="20" cy="20" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M27 27l9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  list: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-line">
      <rect x="10" y="8" width="28" height="6" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="10" y="18" width="28" height="6" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="10" y="28" width="28" height="6" rx="1.5" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
    </svg>
  ),
  chart: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-line">
      <rect x="8" y="32" width="6" height="8" rx="1" fill="currentColor" opacity="0.4" />
      <rect x="18" y="24" width="6" height="16" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="28" y="16" width="6" height="24" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="38" y="28" width="6" height="12" rx="1" fill="currentColor" opacity="0.5" />
    </svg>
  ),
  map: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-line">
      <path d="M8 12h32M8 24h32M8 36h32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      <circle cx="20" cy="20" r="4" fill="currentColor" />
      <circle cx="32" cy="32" r="3" fill="currentColor" opacity="0.6" />
    </svg>
  ),
};

export function EmptyState({ title, description, action, icon = 'empty', className = '' }: EmptyStateProps) {
  return (
    <div className={clsx('flex flex-col items-center justify-center text-center py-12 px-4 gap-3', className)}>
      <div className="text-line">{iconMap[icon]}</div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="text-sm text-grey-500 max-w-xs">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
