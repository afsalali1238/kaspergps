'use client';

// Top navigation tabs, like fleetx (owner decision, 13 Oct; UI-UPGRADE.md §5.1).
// Pages sit in the top bar; there is no left sidebar. The bar shows 4 tabs from
// 1024 px, 6 from 1280 px and 7 from 1600 px; the rest are under "More".
// The split is pure CSS (no measuring), so the bar never jumps on load.
// Below 1024 px the shell's menu sheet holds every tab instead.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';

export interface TopTab {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}

/** Visibility of tab i in the bar, and in the More menu (the complement). */
function barClass(i: number): string {
  if (i < 4) return 'flex';
  if (i < 6) return 'hidden xl:flex';
  if (i < 7) return 'hidden min-[1600px]:flex';
  return 'hidden';
}
function menuClass(i: number): string {
  if (i < 4) return 'hidden';
  if (i < 6) return 'flex xl:hidden';
  if (i < 7) return 'flex min-[1600px]:hidden';
  return 'flex';
}
function moreClass(count: number): string | null {
  if (count <= 4) return null;
  if (count <= 6) return 'flex xl:hidden';
  if (count === 7) return 'flex min-[1600px]:hidden';
  return 'flex';
}
/** Whether the More button should look active: an active tab is hidden in it at some width. */
function moreHoldsActive(tabs: TopTab[]): boolean {
  return tabs.some((t, i) => t.active && i >= 4);
}

const tabBase =
  'h-14 items-center gap-2 px-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors focus-visible:outline-none focus-visible:bg-paper-2';
const tabIdle = 'border-transparent text-grey-700 hover:text-ink hover:bg-paper-2';
const tabActive = 'border-yellow text-ink bg-yellow/10';

export function TopTabs({ tabs, label, moreLabel }: { tabs: TopTab[]; label: string; moreLabel: string }) {
  const [open, setOpen] = useState(false);
  const more = moreClass(tabs.length);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <nav aria-label={label} className="hidden lg:flex items-stretch h-14 min-w-0" data-testid="top-nav">
      {tabs.map((tab, i) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? 'page' : undefined}
          className={clsx(barClass(i), tabBase, tab.active ? tabActive : tabIdle)}
        >
          <span className="shrink-0" aria-hidden>{tab.icon}</span>
          {tab.label}
        </Link>
      ))}
      {more && (
        <div className={clsx(more, 'relative items-stretch')}>
          <button
            type="button"
            aria-expanded={open}
                        onClick={() => setOpen(o => !o)}
            className={clsx('flex', tabBase, moreHoldsActive(tabs) ? tabActive : tabIdle)}
          >
            {moreLabel}
            <ChevronDown size={14} aria-hidden className={clsx('transition-transform', open && 'rotate-180')} />
          </button>
          {open && (
            <>
              <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
              <div role="group" aria-label={moreLabel} className="absolute start-0 top-full z-50 mt-px min-w-52 bg-surface border border-line rounded-b-lg shadow-pop py-1">
                {tabs.map((tab, i) => (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={tab.active ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={clsx(
                      menuClass(i),
                      'items-center gap-2.5 px-3 py-2 text-sm font-medium',
                      tab.active ? 'text-ink bg-yellow/10 border-s-2 border-yellow' : 'text-grey-700 hover:bg-paper-2 hover:text-ink',
                    )}
                  >
                    <span className="shrink-0" aria-hidden>{tab.icon}</span>
                    {tab.label}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
