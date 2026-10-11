'use client';

// A filter that opens a listbox (spec §11.2 "Site" filter). The button shows the
// current choice; the options are listed when it opens and close on pick or Escape.

import React, { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';

export interface FilterOption {
  value: string;
  label: string;
}

export function FilterMenu({
  label,
  value,
  options,
  onChange,
  allLabel,
}: {
  label: string;
  value: string | null;
  options: FilterOption[];
  onChange: (value: string | null) => void;
  allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find(o => o.value === value)?.label ?? allLabel;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'px-2 py-1 text-xs rounded-lg border flex items-center gap-1',
          value ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500',
        )}
      >
        <span className={value ? 'text-white/70' : 'text-grey-500'}>{label}</span>
        <span>{current}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="absolute top-full mt-1 z-20 min-w-[12rem] max-h-64 overflow-y-auto bg-surface border border-line rounded-lg shadow-md py-1">
          <li role="option" aria-selected={value === null}>
            <button type="button" onClick={() => { onChange(null); setOpen(false); }} className={clsx('w-full text-left px-3 py-1.5 text-xs hover:bg-paper-2', value === null ? 'text-ink font-medium' : 'text-grey-700')}>
              {allLabel}
            </button>
          </li>
          {options.map(o => (
            <li key={o.value} role="option" aria-selected={value === o.value}>
              <button type="button" onClick={() => { onChange(o.value); setOpen(false); }} className={clsx('w-full text-left px-3 py-1.5 text-xs hover:bg-paper-2', value === o.value ? 'text-ink font-medium' : 'text-grey-700')}>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
