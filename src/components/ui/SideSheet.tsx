'use client';

// SideSheet — the desktop right-hand panel (UI-UPGRADE §4/§6): slides over the
// page from the end edge (left in Arabic), traps focus, Esc or the × closes.
//
//   <SideSheet open={!!asset} onClose={() => setAsset(null)} title={asset?.code} eyebrow="Asset">
//     …
//   </SideSheet>
//
// On phones use BottomSheet instead; the page decides which one to render.

import React, { useId } from 'react';
import clsx from 'clsx';
import { useT } from '@/i18n';
import { useFocusTrap } from './useFocusTrap';
import { focusRing } from './tones';

interface SideSheetProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'sm' | 'md' | 'lg';
  /** Dim the page behind and close on a click there (default true). */
  modal?: boolean;
  className?: string;
}

const widths = { sm: 'sm:w-[360px]', md: 'sm:w-[420px]', lg: 'sm:w-[560px]' };

export function CloseButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('ui.close', 'Close')}
      className={clsx(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate transition-colors hover:bg-surface-2 hover:text-ink',
        focusRing,
        className
      )}
    >
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function SideSheet({ open, onClose, title, eyebrow, children, footer, width = 'md', modal = true, className = '' }: SideSheetProps) {
  const ref = useFocusTrap<HTMLDivElement>(open, onClose, { lockScroll: modal });
  const titleId = useId();
  if (!open) return null;

  return (
    <div className={clsx('fixed inset-0 z-50 flex justify-end', !modal && 'pointer-events-none')}>
      {modal && <div className="absolute inset-0 bg-ink/30" aria-hidden="true" onClick={onClose} data-testid="sheet-backdrop" />}
      <div
        ref={ref}
        role="dialog"
        aria-modal={modal}
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx(
          'pointer-events-auto relative flex h-full w-full flex-col border-s border-line bg-surface shadow-pop outline-none',
          widths[width],
          className
        )}
      >
        <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0 pt-1">
            {eyebrow && <div className="text-eyebrow truncate">{eyebrow}</div>}
            <h2 id={titleId} className="text-section truncate text-ink">{title}</h2>
          </div>
          <CloseButton onClick={onClose} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
