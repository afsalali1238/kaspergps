'use client';

// Global search / command palette (spec §11.3 Search, S40): searches the
// assets the user can see (code, name, site, plate, IMEI) and the app's pages.
// Opens from the top-bar button or Ctrl/Cmd + K.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@/domain/types';
import { searchAssets } from '@/server/api';
import { useT, useHref } from '@/i18n';

interface SearchCommandProps {
  session: Session | null;
}

interface Result {
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const PAGE_LINKS: { key: string; label: string; href: string }[] = [
  { key: 'map', label: 'Map', href: '/app' },
  { key: 'assets', label: 'Assets', href: '/app/assets' },
  { key: 'alerts', label: 'Alerts', href: '/app/alerts' },
  { key: 'reports', label: 'Reports', href: '/app/reports' },
  { key: 'downloads', label: 'Downloads', href: '/app/downloads' },
  { key: 'maintenance', label: 'Maintenance', href: '/app/maintenance' },
  { key: 'cost', label: 'Cost & fuel', href: '/app/cost' },
  { key: 'certificates', label: 'Certificates', href: '/app/certificates' },
  { key: 'billing', label: 'Billing', href: '/app/billing' },
  { key: 'geofences', label: 'Geofences', href: '/app/geofences' },
  { key: 'labels', label: 'Labels', href: '/app/labels' },
  { key: 'schedules', label: 'Schedules', href: '/app/schedules' },
  { key: 'settings', label: 'Settings', href: '/app/settings' },
];

export function SearchCommand({ session }: SearchCommandProps) {
  const t = useT();
  const href = useHref();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd + K toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const assetResults = useMemo<Result[]>(() => {
    if (!open) return [];
    return searchAssets(session, query, 6).map(a => ({
      id: `asset-${a.id}`,
      title: `${a.code} — ${a.name}`,
      subtitle: a.siteName,
      href: `/app/assets/${a.id}`,
    }));
  }, [session, query, open]);

  const pageResults = useMemo<Result[]>(() => {
    if (!open) return [];
    const q = query.trim().toLowerCase();
    return PAGE_LINKS
      .filter(p => !q || t(`nav.${p.key}`, p.label).toLowerCase().includes(q) || p.label.toLowerCase().includes(q))
      .slice(0, 5)
      .map(p => ({
        id: `page-${p.key}`,
        title: t(`nav.${p.key}`, p.label),
        subtitle: '',
        href: p.href,
      }));
  }, [query, open]);

  const results = [...assetResults, ...pageResults];

  const go = (r: Result) => {
    setOpen(false);
    router.push(href(r.href));
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-1.5 bg-paper border border-line rounded-lg px-2.5 py-1.5 text-sm text-grey-500 w-48 hover:border-grey-500 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1" /><path d="M8 8l2 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
        <span className="flex-1 text-start">{t('shell.search_placeholder', 'Type to search assets…')}</span>
        <kbd className="text-[10px] text-grey-500 border border-line rounded px-1">Ctrl K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4">
          {/* Backdrop */}
          <button
            aria-label={t('common.close', 'Close')}
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
          />

          <div className="relative w-full max-w-lg bg-surface border border-line rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1" /><path d="M8 8l2 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && results.length > 0) go(results[0]);
                }}
                placeholder={t('shell.search_placeholder', 'Type to search assets…')}
                className="flex-1 bg-transparent text-sm text-ink placeholder:text-grey-500 focus:outline-none"
              />
              <kbd className="text-[10px] text-grey-500 border border-line rounded px-1">Esc</kbd>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {results.length === 0 ? (
                <div className="px-4 py-6 text-sm text-grey-500">{t('shell.search_none', 'Nothing found.')}</div>
              ) : (
                results.map(r => (
                  <button
                    key={r.id}
                    onClick={() => go(r)}
                    className="w-full text-start px-4 py-2.5 hover:bg-paper-2 transition-colors flex items-center justify-between"
                  >
                    <span>
                      <span className="block text-sm text-ink">{r.title}</span>
                      {r.subtitle && <span className="block text-xs text-grey-500">{r.subtitle}</span>}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-grey-500"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
