'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useStore } from '@/store';
import { anyAssetHasFeature, visibleAssetIds } from '@/server/access';
import { seed } from '@/server/seed/data';
import { bellNotifications, bellUnreadCount, markAllRead, markNotificationRead } from '@/server/notifications';
import * as clock from '@/lib/clock';
import type { Tenant } from '@/domain/types';

interface NavItem {
  href: string;
  label: string;
  capability: string;
  phase: 'day_one' | 'phase2' | 'later';
  featureKey?: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    href: '/app',
    label: 'Map',
    capability: 'asset.view',
    phase: 'day_one',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1C4.1 1 1 4.1 1 8s3.1 7 7 7 7-3.1 7-7-3.1-7-7-7zm-5 8l4.5-5 1 1-4.5 5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    href: '/app/alerts',
    label: 'Alerts',
    capability: 'alert.view',
    phase: 'day_one',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1L1 15h14L8 1zm0 5l3 3-3 3M8 8V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    href: '/app/reports',
    label: 'Reports',
    capability: 'report.run',
    phase: 'day_one',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2h6l3 3v9.5a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1zm0 2v2h6v2H3V4zm-1 3h8v8h2V6H2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  },
  {
    href: '/app/downloads',
    label: 'Downloads',
    capability: 'report.run',
    phase: 'day_one',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1a4 4 0 100 8 4 4 0 000-8zM3 14v-5h10v5M6 10l3-3 3 3M6 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    href: '/app/geofences',
    label: 'Geofences',
    capability: 'geofence.view',
    phase: 'phase2',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 3a5 5 0 000 10 5 5 0 000-10z" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1"/></svg>,
  },
  {
    href: '/app/certificates',
    label: 'Certificates',
    capability: 'muc.view',
    phase: 'phase2',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M4 6h2M4 8h6M4 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  },
  {
    href: '/app/billing',
    label: 'Billing',
    capability: 'billing.view',
    phase: 'phase2',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M1 6h14M6 11h5M9 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  },
  {
    href: '/app/maintenance',
    label: 'Maintenance',
    capability: 'maintenance.view',
    phase: 'later',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1L1 10h14L8 1zm0 4l3 3-3 3M8 7V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    href: '/app/cost',
    label: 'Cost & ROI',
    capability: 'cost.view',
    phase: 'later',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 14l4-4 3 3 3-6 1 1 3 3M4 2v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
];

function formatNotificationTime(at: string | number): string {
  const ms = typeof at === 'number' ? at : new Date(at).getTime();
  const minutes = Math.round((clock.now() - ms) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return clock.formatDubaiDate(ms);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const store = useStore;
  const session = store.getState().session;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [, setBellVersion] = useState(0);

  const notifications = bellNotifications(session);
  const unread = bellUnreadCount(session);

  const currentPhase = store.getState().demoSwitches.phase;

  const visibleNavItems = navItems.filter(item => {
    const hasCap = session ? session.role === 'kasper_admin' || session.role === 'kasper_ops' || (item.capability === 'asset.view') : true;
    if (!hasCap) return false;
    if (item.phase === 'phase2' && currentPhase === 'day_one') return false;
    if (item.phase === 'later' && currentPhase !== 'later') return false;
    if (item.featureKey) {
      const ids = visibleAssetIds(session!);
      if (ids.length === 0) return false;
      return anyAssetHasFeature(session!, item.featureKey!);
    }
    return true;
  });

  const isCustomer = session && !session.isKasper;
  const showMobileNav = isCustomer;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Top bar */}
      <header className="bg-surface border-b border-line px-4 lg:px-6 h-14 flex items-center justify-between sticky top-0 z-40" style={{ marginTop: '36px' }}>
        <div className="flex items-center gap-3">
          {/* Kasper wordmark */}
          <Link href={session?.isKasper ? '/console' : '/app'} className="flex items-center gap-2 flex-shrink-0">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect width="22" height="22" rx="5" fill="#141518" />
              <text x="0" y="16" fontSize="14" fontFamily="monospace" fill="#FFC400" fontWeight="700">K</text>
            </svg>
            <span className="text-sm font-semibold text-ink hidden sm:block">Kasper</span>
          </Link>

          {/* Company name (customer) or Viewing (Kasper) */}
          {session && (
            <span className="text-sm text-grey-700 hidden md:block">
              {session.isKasper
                ? 'All tenants'
                : session.user.tenantId
                  ? seedTenants().find(t => t.id === session.user.tenantId)?.name ?? ''
                  : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="hidden sm:flex items-center gap-1.5 bg-paper border border-line rounded-lg px-2.5 py-1.5 text-sm text-grey-500 w-48">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1"/><path d="M8 8l2 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
            Type to search assets…
          </div>

          {/* Notifications bell */}
          {session && (
            <div className="relative">
              <button
                onClick={() => setIsBellOpen(!isBellOpen)}
                className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-paper-2 text-grey-700 transition-colors"
                aria-label="Notifications"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1a4 4 0 00-4 4v4.5a1 1 0 001 1h6.5a1 1 0 001-1V5a4 4 0 00-4-4zm0 1.5a2.5 2.5 0 012.5 2.5v3.5a1 1 0 01-1 1H6a1 1 0 01-1-1V5a2.5 2.5 0 012.5-2.5zm1.5 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-red text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
                    {unread}
                  </span>
                )}
              </button>

              {isBellOpen && (
                <div className="absolute right-0 top-full mt-1 w-80 bg-surface border border-line rounded-lg shadow-lg overflow-hidden z-50">
                  <div className="px-3 py-2 border-b border-line flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">Notifications</span>
                    {unread > 0 && (
                      <button
                        className="text-xs text-yellow-600 hover:text-yellow font-medium"
                        onClick={() => { markAllRead(session.userId); setBellVersion(v => v + 1); }}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-grey-500">Nothing yet.</div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto divide-y divide-line">
                      {notifications.map(n => (
                        <button
                          key={n.id}
                          onClick={() => {
                            markNotificationRead(session.userId, n.id);
                            setBellVersion(v => v + 1);
                            setIsBellOpen(false);
                            if (n.href) router.push(n.href);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-paper-2 transition-colors flex items-start gap-2"
                        >
                          <span
                            className={n.read ? 'w-1.5 h-1.5 rounded-full mt-1.5 bg-line' : 'w-1.5 h-1.5 rounded-full mt-1.5 bg-red'}
                          />
                          <span className="flex-1">
                            <span className={n.read ? 'text-xs text-grey-500 block' : 'text-xs text-ink block'}>
                              {n.text}
                            </span>
                            <span className="text-[11px] text-grey-500">{formatNotificationTime(n.at)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* User menu */}
          {session && (
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 text-sm text-grey-700 hover:text-ink transition-colors"
              >
                <span className="w-6 h-6 rounded-full bg-ink/10 text-ink text-[10px] font-semibold flex items-center justify-center">
                  {session.user.name.charAt(0)}
                </span>
                <span className="hidden lg:inline">{session.user.name}</span>
                <span className="text-grey-500">·</span>
                <span className="text-grey-500 text-xs">{roleLabel(session.user.role)}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="ml-1 text-grey-500">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-surface border border-line rounded-lg shadow-lg overflow-hidden z-50">
                  {/* User info */}
                  <div className="px-3 py-2 border-b border-line">
                    <div className="text-sm font-medium text-ink">{session.user.name}</div>
                    <div className="text-xs text-grey-500">{roleLabel(session.user.role)}</div>
                  </div>

                  {/* Menu items */}
                  <div className="py-1">
                    {/* Language */}
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-grey-700 hover:bg-paper-2 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1"/>
                        <path d="M7 1v2M7 11v2M1 7h2M11 7h2M3.5 3.5l1.5 1.5M9.5 9.5l1.5 1.5M3.5 10.5l1.5-1.5M9.5 4.5l1.5-1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                      </svg>
                      Language
                      <span className="ml-auto text-xs text-grey-500">EN / عربي</span>
                    </button>

                    {/* Users & sites (Kasper only) */}
                    {session.isKasper && (
                      <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-grey-700 hover:bg-paper-2 transition-colors">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M1 1h12v12H1z" stroke="currentColor" strokeWidth="1"/>
                          <path d="M4 1v12M7 1v12M10 1v12" stroke="currentColor" strokeWidth="1"/>
                        </svg>
                        Users & sites
                      </button>
                    )}

                    {/* Console (Kasper only) */}
                    {session.isKasper && (
                      <Link href="/console" className="w-full flex items-center gap-2 px-3 py-2 text-sm text-grey-700 hover:bg-paper-2 transition-colors">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1"/>
                          <path d="M5 7l2 2 2-2M7 5v4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                        </svg>
                        Console
                      </Link>
                    )}

                    {/* Sign out */}
                    <Link href="/sign-in" className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red hover:bg-paper-2 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      Sign out
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile menu button */}
        {showMobileNav && (
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="sm:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-paper-2 text-grey-700"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left nav (desktop) */}
        {!showMobileNav && (
          <nav className="w-56 bg-surface border-r border-line flex-shrink-0 overflow-y-auto hidden lg:flex flex-col">
            <div className="flex flex-col gap-0.5 p-2">
              {visibleNavItems.map(item => {
                const isActive = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-yellow/10 text-ink border-l-2 border-yellow border-r-0 -ml-[1px]'
                        : 'text-grey-700 hover:bg-paper-2 hover:text-ink'
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </div>

            {/* Settings */}
            {session && (
              <div className="mt-auto border-t border-line p-2">
                <Link
                  href="/app/settings"
                  className={clsx(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    pathname === '/app/settings'
                      ? 'bg-yellow/10 text-ink border-l-2 border-yellow border-r-0 -ml-[1px]'
                      : 'text-grey-700 hover:bg-paper-2 hover:text-ink'
                  )}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M8 1v2M8 13v2M13 8h2M4 8h2M12.5 3.5l1.5 1.5M3.5 12.5l1.5-1.5M12.5 12.5l-1.5-1.5M3.5 3.5l1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Settings
                </Link>
              </div>
            )}
          </nav>
        )}

        {/* Mobile bottom nav */}
        {showMobileNav && (
          <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-line z-40 flex lg:hidden overflow-x-auto">
            <div className="flex w-full">
              {visibleNavItems.slice(0, 5).map(item => {
                const isActive = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href.replace('/app/', '/app/')));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      'flex-shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 text-xs transition-colors min-w-[60px]',
                      isActive
                        ? 'text-ink'
                        : 'text-grey-500 hover:text-ink'
                    )}
                  >
                    {item.icon}
                    {item.label}
                    {isActive && <span className="h-0.5 w-5 bg-yellow rounded-full" />}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 sm:pb-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    kasper_admin: 'Kasper Admin',
    kasper_ops: 'Kasper Ops',
    tenant_admin: 'Tenant Admin',
    site_user: 'Site User',
  };
  return labels[role] ?? role;
}

function seedTenants(): readonly Tenant[] {
  return seed.tenants;
}
