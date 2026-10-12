'use client';

// RowMenu — the ⋯ menu at the end of a table row (UI-UPGRADE §4, A10).
//
//   <RowMenu label={`Actions for ${asset.code}`} items={[
//     { id: 'view', label: 'View', onSelect: () => open(asset) },
//     { id: 'void', label: 'Void', onSelect: () => setConfirm(asset), destructive: true },
//   ]} />
//
// Only list actions the user may take: the caller filters by capability (an
// item the role can't use is left out, not shown disabled). Destructive items
// should open a ConfirmDialog rather than act directly.
//
// Keyboard: Enter/Space/↓ opens and focuses the first item, ↑/↓ move, Home/End
// jump, Esc closes and returns focus to the ⋯ button. A click outside closes.

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@/i18n';
import { focusRing } from './tones';

export interface RowMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface RowMenuProps {
  items: RowMenuItem[];
  /** Accessible name for the ⋯ button, e.g. "Actions for EX-04". */
  label?: string;
  align?: 'start' | 'end';
  className?: string;
}

export function RowMenu({ items, label, align = 'end', className = '' }: RowMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const enabled = useCallback(
    () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []),
    []
  );

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    enabled()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, enabled]);

  if (items.length === 0) return null;

  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = enabled();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      close(e.key === 'Escape');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(at + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(at - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list[list.length - 1]?.focus();
    }
  };

  return (
    <div ref={rootRef} className={clsx('relative inline-block', className)} onClick={e => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label ?? t('ui.more_actions', 'More actions')}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={clsx(
          'inline-flex h-10 w-10 items-center justify-center rounded-md text-slate transition-colors hover:bg-surface-2 hover:text-ink',
          open && 'bg-surface-2 text-ink',
          focusRing
        )}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label ?? t('ui.more_actions', 'More actions')}
          onKeyDown={onMenuKey}
          className={clsx(
            'absolute top-full z-40 mt-1 min-w-[168px] overflow-hidden rounded-md border border-line bg-surface py-1 shadow-pop',
            align === 'end' ? 'end-0' : 'start-0'
          )}
        >
          {items.map(item => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={clsx(
                'flex min-h-10 w-full items-center px-3 text-start text-sm transition-colors',
                'hover:bg-surface-2 focus:bg-surface-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                item.destructive ? 'text-bad-ink' : 'text-ink'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
