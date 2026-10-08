'use client';

import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';

interface DropdownProps {
  open: boolean;
  onClose: () => void;
  align?: 'left' | 'right';
  width?: string;
  className?: string;
  children: React.ReactNode;
}

export function Dropdown({ open, onClose, align = 'left', width = '280px', className = '', children }: DropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={clsx('fixed inset-0 z-50', className)}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />

      {/* Panel */}
      <div
        ref={ref}
        className={clsx(
          'relative bg-surface border border-line shadow-xl rounded-xl overflow-hidden',
          align === 'left' ? 'start-0' : 'end-0',
          'top-full mt-1',
          width
        )}
        style={{ maxHeight: '70vh', overflowY: 'auto' }}
      >
        {children}
      </div>
    </div>
  );
}

interface ComboboxProps {
  options: { value: string; label: string; disabled?: boolean; badges?: React.ReactNode }[];
  selected: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  search?: boolean;
  className?: string;
}

export function Combobox({ options, selected, onSelect, placeholder = 'Select…', search = false, className = '' }: ComboboxProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div className={clsx('relative', className)}>
      <div className="flex items-center gap-2 bg-paper border border-line rounded-lg px-3 py-2 min-w-[200px]">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-grey-500">
          <path d="M3 3l6 6M10 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {selected ? (
          <span className="text-sm text-ink flex-1 truncate">{selected}</span>
        ) : (
          <span className="text-sm text-grey-500 flex-1">{placeholder}</span>
        )}
        <button
          type="button"
          onClick={() => setQuery('')}
          className="text-grey-500 hover:text-ink transition-colors"
          aria-label="Clear selection"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {search && (
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search…"
          className="w-full mt-1 px-3 py-2 text-sm bg-paper border border-line rounded-lg focus:outline-none focus:border-ink"
          onClick={() => setQuery('')}
        />
      )}
      <div className="mt-1 bg-surface border border-line rounded-lg overflow-hidden max-h-60 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-sm text-grey-500 text-center">No options</div>
        ) : (
          filtered.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              disabled={opt.disabled}
              className={clsx(
                'w-full text-start px-3 py-2 text-sm hover:bg-paper-2 transition-colors',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                selected === opt.value && 'bg-yellow/10 text-ink font-medium'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{opt.label}</span>
                {opt.badges}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
