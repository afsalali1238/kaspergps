'use client';

// Panel — header + body container, used instead of ad-hoc cards (UI-UPGRADE §4).
//
//   <Panel title="Service plan" eyebrow="EX-04" actions={<Button size="sm">Log</Button>} padding="none">
//     <Table … />
//   </Panel>
//
// With `title`, the panel draws a header bar (section title, optional eyebrow
// and actions) above the body and the padding applies to the body only.
// Without it, Panel is the plain bordered card it always was, and
// PanelHeader / PanelSection still work inside it.

import React from 'react';
import clsx from 'clsx';

interface PanelProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  /** Heading level of the title (default h2). */
  as?: 'h2' | 'h3';
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

export function Panel({
  children,
  className = '',
  padding = 'md',
  border = true,
  background = 'surface',
  title,
  eyebrow,
  actions,
  as: Heading = 'h2',
}: PanelProps) {
  if (title === undefined) {
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
  return (
    <section
      className={clsx(
        'min-w-0 overflow-hidden rounded-lg shadow-panel',
        bgMap[background],
        border && 'border border-line',
        className
      )}
    >
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="min-w-0">
          {eyebrow && <div className="text-eyebrow truncate">{eyebrow}</div>}
          <Heading className="text-section truncate text-ink">{title}</Heading>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={paddingMap[padding]}>{children}</div>
    </section>
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
