'use client';

// BottomSheet — the phone version of a side panel (UI-UPGRADE §6, §10): rises
// from the bottom edge, at most 85% of the screen tall, traps focus, Esc, the ×
// or a tap on the dimmed page closes.
//
//   <BottomSheet open={open} onClose={close} title="Filters"
//                footer={<Button className="w-full" onClick={apply}>Apply</Button>}>
//     …
//   </BottomSheet>
//
// Put the primary action in `footer`: it is full-width on phones (A11).

import React, { useId } from 'react';
import clsx from 'clsx';
import { useFocusTrap } from './useFocusTrap';
import { CloseButton } from './SideSheet';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function BottomSheet({ open, onClose, title, children, footer, className = '' }: BottomSheetProps) {
  const ref = useFocusTrap<HTMLDivElement>(open, onClose);
  const titleId = useId();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-ink/30" aria-hidden="true" onClick={onClose} data-testid="sheet-backdrop" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx(
          'relative flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-xl border-t border-line bg-surface shadow-pop outline-none',
          'pb-[env(safe-area-inset-bottom)]',
          className
        )}
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-2" />
        <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-1">
          <h2 id={titleId} className="text-section min-w-0 truncate text-ink">{title}</h2>
          <CloseButton onClick={onClose} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <footer className="flex flex-col gap-2 border-t border-line px-4 py-3 [&>*]:w-full">{footer}</footer>}
      </div>
    </div>
  );
}
