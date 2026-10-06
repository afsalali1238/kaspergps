'use client';

import React from 'react';
import clsx from 'clsx';

interface PanelProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  border?: boolean;
  background?: 'surface' | 'paper' | 'paper-2' | 'transparent';
}

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

const bgMap = {
  surface: 'bg-surface',
  paper: 'bg-paper',
  'paper-2': 'bg-paper-2',
  transparent: 'bg-transparent',
};

export function Panel({ children, className = '', padding = 'md', border = true, background = 'surface' }: PanelProps) {
  return (
    <div
      className={clsx(
        'rounded-xl',
        bgMap[background],
        border && 'border border-line',
        paddingMap[padding],
        className
      )}
    >
      {children}
    </div>
  );
}

interface PanelHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function PanelHeader({ title, subtitle, action, children, className = '' }: PanelHeaderProps) {
  return (
    <div className={clsx('flex items-start justify-between gap-3 mb-4', className)}>
      <div className="flex-1">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle && <p className="text-sm text-grey-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-start gap-2">
        {children ?? action}
      </div>
    </div>
  );
}

interface PanelSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function PanelSection({ title, children, className = '' }: PanelSectionProps) {
  return (
    <div className={clsx('mb-4 last:mb-0', className)}>
      {title && <h3 className="text-sm font-semibold text-grey-700 mb-2">{title}</h3>}
      {children}
    </div>
  );
}
