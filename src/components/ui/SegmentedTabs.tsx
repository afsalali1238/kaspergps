'use client';

// SegmentedTabs — a row of tabs that scrolls sideways (with an edge fade) when
// it does not fit, instead of wrapping or pushing the page wider (A4, A11).
//
//   <SegmentedTabs
//     label="Asset sections"
//     value={tab}
//     onChange={setTab}
//     tabs={[{ id: 'overview', label: 'Overview' }, { id: 'alerts', label: 'Alerts', count: 3 }]}
//   />
//
// Renders role="tablist" with roving focus: ←/→ move (mirrored in Arabic),
// Home/End jump. Give each panel id `${idPrefix}-panel-${tab.id}` if you want
// aria-controls to point at it.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { focusRingInset } from './tones';

export interface SegmentedTab<Id extends string = string> {
  id: Id;
  label: string;
  count?: number;
}

interface SegmentedTabsProps<Id extends string> {
  tabs: SegmentedTab<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  /** Accessible name of the tab list. */
  label: string;
  idPrefix?: string;
  className?: string;
}

export function SegmentedTabs<Id extends string>({ tabs, value, onChange, label, idPrefix = 'tabs', className = '' }: SegmentedTabsProps<Id>) {
  const scroller = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    // scrollLeft is negative in RTL; use its magnitude.
    const left = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth;
    setFade({ start: left > 1, end: max - left > 1 });
  }, []);

  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, tabs.length]);

  // Keep the active tab in view.
  useEffect(() => {
    const active = scroller.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [value]);

  const onKey = (e: React.KeyboardEvent) => {
    const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
    const at = tabs.findIndex(t => t.id === value);
    let next = at;
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) next = (at + 1) % tabs.length;
    else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) next = (at - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
    document.getElementById(`${idPrefix}-tab-${tabs[next].id}`)?.focus();
  };

  return (
    <div className={clsx('relative min-w-0 border-b border-line', className)}>
      <div
        ref={scroller}
        role="tablist"
        aria-label={label}
        onScroll={measure}
        onKeyDown={onKey}
        className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map(tab => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              id={`${idPrefix}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={clsx(
                'relative inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-sm transition-colors',
                selected ? 'font-semibold text-ink' : 'text-slate hover:text-ink',
                selected && 'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent',
                focusRingInset
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={clsx('rounded-[3px] px-1 font-mono text-[10.5px]', selected ? 'bg-accent-tint text-ink' : 'bg-surface-2 text-slate')}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <span
        aria-hidden="true"
        data-fade="start"
        className={clsx(
          'pointer-events-none absolute inset-y-0 start-0 w-8 from-bg to-transparent transition-opacity ltr:bg-gradient-to-r rtl:bg-gradient-to-l',
          fade.start ? 'opacity-100' : 'opacity-0'
        )}
      />
      <span
        aria-hidden="true"
        data-fade="end"
        className={clsx(
          'pointer-events-none absolute inset-y-0 end-0 w-8 from-bg to-transparent transition-opacity ltr:bg-gradient-to-l rtl:bg-gradient-to-r',
          fade.end ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  );
}
