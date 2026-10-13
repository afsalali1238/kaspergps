'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { anyAssetHasFeature, ownsAnyAsset, visibleAssetIds, type Capability, useDb, bellNotifications, bellUnreadCount, markAllRead, markNotificationRead, bellAlerts, can } from '@/server/api';
import { SearchCommand } from '@/components/layout/SearchCommand';
import { signOutToRoles } from '@/components/auth/sign-out';
import { TopTabs } from '@/components/layout/TopTabs';
import { Map as MapIcon, TriangleAlert, BarChart3, Download, Fence, BadgeCheck, CreditCard, Wrench, TrendingUp, Settings, Bell, ChevronDown, Menu, LogOut, Monitor, Users } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import * as clock from '@/lib/clock';
import { useT, useHref, stripLocale } from '@/i18n';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';
import { openDemoClock } from '@/components/demo/open-clock';
import { useSession, useSwitches, useNow } from '@/hooks';
import type { Session } from '@/domain/types';

interface NavItem {
  href: string;
  /** ar.json key; `label` is the English fallback. */
  labelKey: string;
  label: string;
  capability: Capability;
  phase: 'day_one' | 'phase2' | 'later';
  featureKey?: string;
  /** Only for a company that owns assets: maintenance and costs are the owner's (J4.6). */
  ownerOnly?: boolean;
  icon: React.ReactNode;
}

/**
 * The §11 nav rule, shared by the nav and by every page under its href: a
 * page shows only when its nav item would show. Otherwise the route reads
 * "Page not found" (H2.6). Phase is the demo bar's current phase.
 */
export function navItemAllowed(session: Session | null, item: NavItem, phase: string): boolean {
  if (!session) return true;
  if (!can(session, item.capability)) return false;
  if (item.phase === 'phase2' && phase === 'day_one') return false;
  if (item.phase === 'later' && phase !== 'later') return false;
  if (item.ownerOnly && !ownsAnyAsset(session)) return false;
  if (item.featureKey) {
    if (visibleAssetIds(session).length === 0) return false;
    return anyAssetHasFeature(session, item.featureKey);
  }
  return true;
}

/**
 * Settings (§11.8) holds company admin: users, sites and assets. It shows only
 * to someone who may manage at least one of them, so Site Users never see it.
 */
export function settingsAllowed(session: Session | null): boolean {
  if (!session) return false;
  return can(session, 'users.manage') || can(session, 'sites.manage') || can(session, 'asset.create');
}

/** What a locked screen says, per route (spec 11.3 / phase ladder). */
const LOCK_COPY: Record<string, { phase?: string; feature?: string; role?: string; owner?: string }> = {
  '/app/certificates': {
    phase: 'Certificates are available in Phase 2. Tier 3 assets with ECU engine hours only.',
    feature: 'Certificates need Tier 3 assets with ECU engine hours only.',
  },
  '/app/geofences': { phase: 'Geofences are available in Phase 2.' },
  '/app/billing': {
    phase: 'Billing is available in Phase 2.',
    feature: 'Billing needs Tier 3 assets with ECU engine hours only.',
    role: 'Your access doesn’t include billing.',
  },
  '/app/maintenance': {
    phase: 'Maintenance arrives in the Later phase.',
    owner: 'Maintenance is for assets your company owns. Your company rents its equipment, so there is nothing to service here.',
  },
  '/app/cost': {
    phase: 'Cost & ROI arrives in the Later phase.',
    owner: 'Cost & ROI is for assets your company owns. Your company rents its equipment; its costs are on your invoices.',
  },
};

/**
 * How a route renders for this session (spec 11.3, phase ladder):
 *  - role denied (no capability)  → "Page not found" (unchanged; the role never sees it);
 *  - phase or Tier denied          → a locked "Not available" screen with the reason;
 *  - otherwise                     → the page.
 */
export function routeGate(
  session: Session | null,
  item: NavItem | undefined,
  phase: string,
): { kind: 'ok' } | { kind: 'not_found'; role?: string } | { kind: 'locked'; reason: string } {
  if (!session || !item) return { kind: 'ok' };
  const copy = LOCK_COPY[item.href] ?? {};
  if (!can(session, item.capability)) return copy.role ? { kind: 'not_found', role: copy.role } : { kind: 'not_found' };
  if (item.phase === 'phase2' && phase === 'day_one') return { kind: 'locked', reason: copy.phase ?? 'Not available in this phase.' };
  if (item.phase === 'later' && phase !== 'later') return { kind: 'locked', reason: copy.phase ?? 'Arrives in the Later phase.' };
  if (item.ownerOnly && !ownsAnyAsset(session)) return { kind: 'locked', reason: copy.owner ?? 'Only for companies that own assets.' };
  if (item.featureKey && (visibleAssetIds(session).length === 0 || !anyAssetHasFeature(session, item.featureKey))) {
    return { kind: 'locked', reason: copy.feature ?? 'Not available for your assets.' };
  }
  return { kind: 'ok' };
}

// Priority order (UI-UPGRADE.md §5.1): the first tabs stay in the top bar at every
// desktop width; the later ones move under "More" when the bar is narrow.
const navItems: NavItem[] = [
  { href: '/app', labelKey: 'nav.map', label: 'Map', capability: 'asset.view', phase: 'day_one', icon: <MapIcon size={16} strokeWidth={1.75} /> },
  { href: '/app/alerts', labelKey: 'nav.alerts', label: 'Alerts', capability: 'alert.view', phase: 'day_one', icon: <TriangleAlert size={16} strokeWidth={1.75} /> },
  { href: '/app/reports', labelKey: 'nav.reports', label: 'Reports', capability: 'report.run', phase: 'day_one', icon: <BarChart3 size={16} strokeWidth={1.75} /> },
  { href: '/app/maintenance', labelKey: 'nav.maintenance', label: 'Maintenance', capability: 'maintenance.view', phase: 'later', ownerOnly: true, icon: <Wrench size={16} strokeWidth={1.75} /> },
  { href: '/app/billing', labelKey: 'nav.billing', label: 'Billing', capability: 'billing.view', phase: 'phase2', icon: <CreditCard size={16} strokeWidth={1.75} /> },
  { href: '/app/geofences', labelKey: 'nav.geofences', label: 'Geofences', capability: 'geofence.view', phase: 'phase2', icon: <Fence size={16} strokeWidth={1.75} /> },
  { href: '/app/certificates', labelKey: 'nav.certificates', label: 'Certificates', capability: 'muc.view', phase: 'phase2', featureKey: 'muc', icon: <BadgeCheck size={16} strokeWidth={1.75} /> },
  { href: '/app/cost', labelKey: 'nav.cost', label: 'Cost & ROI', capability: 'cost.view', phase: 'later', ownerOnly: true, icon: <TrendingUp size={16} strokeWidth={1.75} /> },
  { href: '/app/downloads', labelKey: 'nav.downloads', label: 'Downloads', capability: 'report.run', phase: 'day_one', icon: <Download size={16} strokeWidth={1.75} /> },
];

function formatNotificationTime(
  at: string | number,
  t: (key: string, fallback: string, vars?: Record<string, string | number>) => string
): string {
  const ms = typeof at === 'number' ? at : new Date(at).getTime();
  const minutes = Math.round((clock.now() - ms) / 60000);
  if (minutes < 1) return t('shell.just_now', 'just now');
  if (minutes < 60) return t('shell.min_ago', '{count} min ago', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('shell.hours_ago', '{count} h ago', { count: hours });
  return clock.formatDubaiDate(ms);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const href = useHref();
  const t = useT();
  const pathname = stripLocale(usePathname() ?? '');
  const router = useRouter();
  const session = useSession();
  const currentPhase = useSwitches().phase;
  const tenantRows = useDb(s => s.tenants);
  // G1: re-render the bell when an alert is acknowledged, so it matches the Alerts page.
  useDb(s => s.alerts);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [, setBellVersion] = useState(0);

  const notifications = bellNotifications(session);
  const openAlerts = session ? bellAlerts(session, currentPhase) : [];
  const unread = bellUnreadCount(session);
  const bellCount = unread + openAlerts.length;


  // §11 nav rule: each item appears only if the user may see it.
  const visibleNavItems = navItems.filter(item => navItemAllowed(session, item, currentPhase));

  // H2.6: the page under a nav href follows the same rule as its nav item.
  const routeItem = navItems.find(item =>
    pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href + '/'))
  );
  const onSettings = pathname === '/app/settings' || pathname.startsWith('/app/settings/');
  const gate: ReturnType<typeof routeGate> = onSettings && session && !settingsAllowed(session)
    ? ({ kind: 'not_found' } as const)
    : routeGate(session, routeItem, currentPhase);

  // The asset page belongs to the Map tab (you reach it from the map).
  const isActive = (itemHref: string) =>
    pathname === itemHref ||
    (itemHref !== '/app' && pathname.startsWith(itemHref + '/')) ||
    (itemHref === '/app' && pathname.startsWith('/app/assets/'));

  const isCustomer = session && !session.isKasper;
  const showMobileNav = isCustomer;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Top bar: brand, page tabs (no left sidebar; UI-UPGRADE.md §5.1), then tools. */}
      <header className="bg-surface border-b border-line ps-4 pe-3 lg:ps-5 h-14 flex items-center gap-3 lg:gap-5 sticky top-0 z-40 shadow-panel" style={{ top: 'var(--demo-bar-h)' }}>
        <div className="flex items-center gap-3 shrink-0">
          <Link href={session?.isKasper ? '/console' : href('/app')} className="flex items-center gap-2 flex-shrink-0">
            <svg width="24" height="24" viewBox="0 0 22 22" aria-hidden>
              <rect width="22" height="22" rx="5" className="fill-ink" />
              <text x="11" y="16" textAnchor="middle" direction="ltr" fontSize="14" fontFamily="var(--font-mono)" className="fill-yellow" fontWeight="700">K</text>
            </svg>
            <span className="text-section text-ink hidden sm:block">{t('shell.brand', 'Kasper')}</span>
          </Link>
          {session && (
            <span className="text-sm text-grey-700 hidden md:block border-s border-line ps-3 max-w-44 truncate">
              {session.isKasper
                ? t('shell.all_tenants', 'All tenants')
                : session.user.tenantId
                  ? tenantRows.find(t => t.id === session.user.tenantId)?.name ?? ''
                  : ''}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 self-stretch">
          <TopTabs
            label={t('shell.pages', 'Pages')}
            moreLabel={t('shell.more', 'More')}
            tabs={visibleNavItems.map(item => ({
              href: href(item.href),
              label: t(item.labelKey, item.label),
              icon: item.icon,
              active: isActive(item.href),
            }))}
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {session && <LivePill />}
          {/* Search */}
          <SearchCommand session={session} />

          {/* Notifications bell */}
          {session && (
            <div className="relative">
              <button
                onClick={() => setIsBellOpen(!isBellOpen)}
                className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-paper-2 text-grey-700 transition-colors"
                aria-label={t('shell.notifications', 'Notifications')}
              >
                <Bell size={17} strokeWidth={1.75} aria-hidden />
                {bellCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-red text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
                    {bellCount}
                  </span>
                )}
              </button>

              {isBellOpen && (
                <div className="absolute end-0 top-full mt-1 w-80 bg-surface border border-line rounded-lg shadow-lg overflow-hidden z-50">
                  <div className="px-3 py-2 border-b border-line flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">{t('shell.notifications', 'Notifications')}</span>
                    {unread > 0 && (
                      <button
                        className="text-xs text-yellow-600 hover:text-yellow font-medium"
                        onClick={() => { markAllRead(session.userId); setBellVersion(v => v + 1); }}
                      >
                        {t('shell.mark_all_read', 'Mark all read')}
                      </button>
                    )}
                  </div>
                  {openAlerts.length > 0 && (
                    <div className="max-h-64 overflow-y-auto divide-y divide-line">
                      {openAlerts.map(a => (
                        <button
                          key={a.id}
                          onClick={() => {
                            setIsBellOpen(false);
                            if (a.assetId) router.push(href(`/app/assets/${a.assetId}`));
                          }}
                          className="w-full text-start px-3 py-2 hover:bg-paper-2 transition-colors"
                        >
                          <span className="text-xs text-ink block">{a.typeWords}</span>
                          <span className="text-[11px] text-grey-500">
                            {a.assetCode} · {t(`alerts.types.${a.type}`, a.typeLabel)}
                            {a.siteName ? ` · ${a.siteName}` : ''}
                          </span>
                        </button>
                      ))}
                      <button
                        onClick={() => { setIsBellOpen(false); router.push(href('/app/alerts')); }}
                        className="w-full text-start px-3 py-2 text-xs text-yellow-dark font-medium hover:bg-paper-2"
                      >
                        {t('shell.view_all', 'View all alerts')}
                      </button>
                    </div>
                  )}
                  {notifications.length === 0 && openAlerts.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-grey-500">{t('shell.nothing_yet', 'Nothing yet.')}</div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto divide-y divide-line">
                      {notifications.map(n => (
                        <button
                          key={n.id}
                          onClick={() => {
                            markNotificationRead(session.userId, n.id);
                            setBellVersion(v => v + 1);
                            setIsBellOpen(false);
                            if (n.href) router.push(href(n.href));
                          }}
                          className="w-full text-start px-3 py-2 hover:bg-paper-2 transition-colors flex items-start gap-2"
                        >
                          <span
                            className={n.read ? 'w-1.5 h-1.5 rounded-full mt-1.5 bg-line' : 'w-1.5 h-1.5 rounded-full mt-1.5 bg-red'}
                          />
                          <span className="flex-1">
                            <span className={n.read ? 'text-xs text-grey-500 block' : 'text-xs text-ink block'}>
                              {n.text}
                            </span>
                            <span className="text-[11px] text-grey-500">{formatNotificationTime(n.at, t)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Settings (§11.8: company admin only) */}
          {settingsAllowed(session) && (
            <Link
              href={href('/app/settings')}
              aria-label={t('shell.settings', 'Settings')}
              title={t('shell.settings', 'Settings')}
              aria-current={pathname === '/app/settings' || pathname.startsWith('/app/settings/') ? 'page' : undefined}
              className={clsx(
                'hidden lg:flex w-9 h-9 items-center justify-center rounded-lg transition-colors',
                pathname.startsWith('/app/settings') ? 'bg-yellow/10 text-ink' : 'text-grey-700 hover:bg-paper-2 hover:text-ink',
              )}
            >
              <Settings size={17} strokeWidth={1.75} aria-hidden />
            </Link>
          )}
          {/* User menu */}
          {session && (
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                aria-expanded={isUserMenuOpen}
                className="flex items-center gap-2 h-9 ps-1 pe-2 rounded-lg text-sm text-grey-700 hover:bg-paper-2 hover:text-ink transition-colors"
              >
                <span className="w-7 h-7 rounded-full bg-ink text-yellow text-[11px] font-semibold flex items-center justify-center">
                  {session.user.name.charAt(0)}
                </span>
                <span className="text-grey-500 text-xs hidden xl:inline">{roleLabel(session.user.role, t)}</span>
                <ChevronDown size={14} aria-hidden className="text-grey-500" />
              </button>

              {isUserMenuOpen && (
                <div className="absolute end-0 top-full mt-1 w-56 bg-surface border border-line rounded-lg shadow-lg overflow-hidden z-50">
                  {/* User info */}
                  <div className="px-3 py-2 border-b border-line">
                    <div className="text-sm font-medium text-ink">{session.user.name}</div>
                    <div className="text-xs text-grey-500">{roleLabel(session.user.role, t)}</div>
                    {!session.isKasper && session.user.tenantId && (
                      <div className="text-xs text-grey-500 mt-0.5">{tenantRows.find(r => r.id === session.user.tenantId)?.name}</div>
                    )}
                  </div>

                  {/* Menu items */}
                  <div className="py-1">
                    {/* Language */}
                    <LanguageToggle variant="menu" />

                    {/* Users & sites (Kasper only) */}
                    {session.isKasper && (
                      <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-grey-700 hover:bg-paper-2 transition-colors">
                        <Users size={14} aria-hidden />
                        {t('shell.users_and_sites', 'Users & sites')}
                      </button>
                    )}

                    {/* Console (Kasper only) */}
                    {session.isKasper && (
                      <Link href="/console" className="w-full flex items-center gap-2 px-3 py-2 text-sm text-grey-700 hover:bg-paper-2 transition-colors">
                        <Monitor size={14} aria-hidden />
                        {t('shell.console', 'Console')}
                      </Link>
                    )}

                    {/* Log out (chunk R): clears the session and returns to the role picker. */}
                    <button
                      type="button"
                      onClick={() => signOutToRoles(path => router.replace(path))}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red hover:bg-paper-2 transition-colors"
                    >
                      <LogOut size={14} aria-hidden />
                      {t('shell.sign_out', 'Log out')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Mobile menu button */}
          {showMobileNav && (
            <button
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              aria-expanded={mobileNavOpen}
              aria-label={t('shell.open_menu', 'Open menu')}
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-paper-2 text-grey-700"
            >
              <Menu size={18} aria-hidden />
            </button>
          )}
        </div>

      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Phones: every allowed item lives in a bottom sheet (spec 11), opened from the header. */}
        {showMobileNav && mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t('shell.open_menu', 'Open menu')}>
            <button
              type="button"
              aria-label={t('common.close', 'Close')}
              onClick={() => setMobileNavOpen(false)}
              className="absolute inset-0 bg-ink/40"
            />
            <div className="absolute bottom-0 inset-x-0 bg-surface rounded-t-xl border-t border-line p-2 max-h-[80vh] overflow-y-auto">
              {visibleNavItems.map(item => {
                const isActive = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={href(item.href)}
                    onClick={() => setMobileNavOpen(false)}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                      isActive ? 'text-ink bg-paper-2' : 'text-grey-700 hover:bg-paper-2'
                    )}
                  >
                    {item.icon}
                    {t(item.labelKey, item.label)}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 lg:p-6 pb-20 sm:pb-6">
          {/* Keyed by user: a switch of user remounts the page, so no state
              from the previous user's screen survives it. */}
          <div key={session?.userId ?? 'signed-out'}>
            {gate.kind === 'ok' && children}
            {gate.kind === 'not_found' && (
              <div className="flex items-center justify-center py-24">
                <div className="text-center">
                  <div className="text-sm font-semibold text-ink">{t('common.page_not_found', 'Page not found')}</div>
                  <div className="text-sm text-grey-500 mt-1">
                    {gate.role ?? t('shell.not_in_your_role', "This page isn't available for your role.")}
                  </div>
                </div>
              </div>
            )}
            {gate.kind === 'locked' && (
              <div className="p-4" data-testid="locked-screen">
                <div className="bg-surface border border-line rounded-lg">
                  <EmptyState title={t('common.not_available', 'Not available')} description={gate.reason} />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/** LIVE pill: the demo clock's Dubai time, so the presenter always sees "now".
 *  Clicking it opens the demo clock in the demo bar. Shared with the console bar. */
export function LivePill() {
  const t = useT();
  const now = useNow();
  return (
    <button
      type="button"
      onClick={openDemoClock}
      title={t('shell.live_open_clock', 'Open the demo clock')}
      aria-label={`${t('shell.live', 'LIVE')} ${clock.formatDubaiTime(now)}. ${t('shell.live_open_clock', 'Open the demo clock')}`}
      className="hidden min-[1760px]:inline-flex items-center gap-1.5 h-7 rounded-full bg-paper-2 border border-line px-2.5 font-mono text-[11px] text-ink me-1 hover:border-line-2 hover:bg-surface transition-colors focus-visible:outline-2 focus-visible:outline-ink"
      data-testid="live-pill"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-live" aria-hidden />
      {t('shell.live', 'LIVE')} {clock.formatDubaiTime(now)}
    </button>
  );
}

function roleLabel(role: string, t: (key: string, fallback: string) => string): string {
  const labels: Record<string, string> = {
    kasper_admin: t('common.roles.kasper_admin', 'Kasper Admin'),
    kasper_ops: t('common.roles.kasper_ops', 'Kasper Ops'),
    tenant_admin: t('common.roles.tenant_admin', 'Tenant Admin'),
    site_user: t('common.roles.site_user', 'Site User'),
  };
  return labels[role] ?? role;
}

