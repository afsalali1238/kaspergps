'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { LayoutDashboard, Building2, UserPlus, Truck, Radio, Cable, CalendarDays, Inbox, CreditCard, Users, Upload, ScrollText, Menu } from 'lucide-react';

import { type Capability, can, hasRole } from '@/server/api';
import { useSession } from '@/hooks';
import { TopTabs } from '@/components/layout/TopTabs';

interface NavItem {
  href: string;
  label: string;
  cap: Capability;
  icon: React.ReactNode;
}

// Spec 11.9: the nav shows only what the role can view. Top tabs, no sidebar (UI-UPGRADE.md §5.1).
const navItems: NavItem[] = [
  {
    href: '/console',
    label: 'Overview',
    cap: 'console.tenants.view',
    icon: <LayoutDashboard size={16} strokeWidth={1.75} />,
  },
  {
    href: '/console/tenants',
    label: 'Tenants',
    cap: 'console.tenants.view',
    icon: <Building2 size={16} strokeWidth={1.75} />,
  },
  {
    href: '/console/onboarding',
    label: 'Onboard a company',
    cap: 'console.tenants.manage',
    icon: <UserPlus size={16} strokeWidth={1.75} />,
  },
  {
    href: '/console/assets',
    label: 'Assets',
    cap: 'console.tenants.view',
    icon: <Truck size={16} strokeWidth={1.75} />,
  },
  {
    href: '/console/trackers',
    label: 'Trackers',
    cap: 'console.trackers.view',
    icon: <Radio size={16} strokeWidth={1.75} />,
  },
  {
    href: '/console/adapters',
    label: 'CAN adapters',
    cap: 'console.adapters.manage',
    icon: <Cable size={16} strokeWidth={1.75} />,
  },
  {
    href: '/console/bookings',
    label: 'Bookings',
    cap: 'console.bookings.view',
    icon: <CalendarDays size={16} strokeWidth={1.75} />,
  },
  {
    href: '/console/requests',
    label: 'Requests',
    cap: 'console.trackers.view',
    icon: <Inbox size={16} strokeWidth={1.75} />,
  },
  {
    href: '/console/billing',
    label: 'Billing',
    cap: 'console.billing.view',
    icon: <CreditCard size={16} strokeWidth={1.75} />,
  },
  {
    href: '/console/team',
    label: 'Kasper team',
    cap: 'console.staff.manage',
    icon: <Users size={16} strokeWidth={1.75} />,
  },
  {
    href: '/console/import',
    label: 'Import',
    cap: 'console.import',
    icon: <Upload size={16} strokeWidth={1.75} />,
  },
  {
    href: '/console/audit',
    label: 'Audit log',
    cap: 'console.audit.view',
    icon: <ScrollText size={16} strokeWidth={1.75} />,
  },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const session = useSession();

  // Spec 11.9: customers get "Page not found" on every /console route — the
  // console never renders for them, and never redirects to the app either.
  if (!session || !session.isKasper) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg px-6 text-center">
        <div>
          <div className="text-sm font-semibold text-ink">Page not found</div>
          <p className="text-sm text-grey-500 mt-1">The console is only for Kasper staff.</p>
          <Link href="/app" className="text-sm text-ink underline mt-3 inline-block">Back to Kasper GPS</Link>
        </div>
      </div>
    );
  }

  const visibleNav = navItems.filter(item => can(session, item.cap));

  return (
    <>
      {/* Spec 11.9: the console is desktop only. */}
      <div className="min-[900px]:hidden fixed inset-0 flex items-center justify-center bg-bg px-6 text-center">
        <p className="text-sm text-grey-500">Open the console on a computer.</p>
      </div>

      <div className="hidden min-[900px]:flex flex-col h-screen bg-bg">
        <header className="bg-surface border-b border-line ps-5 pe-4 h-14 flex items-center gap-5 shrink-0 shadow-panel">
          <Link href="/console" className="flex items-center gap-2 shrink-0">
            <svg width="24" height="24" viewBox="0 0 22 22" aria-hidden>
              <rect width="22" height="22" rx="5" className="fill-ink" />
              <text x="11" y="16" textAnchor="middle" direction="ltr" fontSize="14" fontFamily="var(--font-mono)" className="fill-yellow" fontWeight="700">K</text>
            </svg>
            <span className="text-section text-ink">Kasper Console</span>
          </Link>
          <div className="flex-1 min-w-0 self-stretch flex">
            <TopTabs
              label="Console pages"
              moreLabel="More"
              tabs={visibleNav.map(item => ({
                href: item.href,
                label: item.label,
                icon: item.icon,
                active: item.href === '/console' ? pathname === '/console' : pathname === item.href || pathname.startsWith(item.href + '/'),
              }))}
            />
            {/* 900–1023 px: the tabs need 1024 px, so the pages sit in a menu. */}
            <details className="lg:hidden relative">
              <summary className="list-none cursor-pointer h-14 flex items-center gap-2 text-sm font-medium text-grey-700"><Menu size={16} aria-hidden /> Menu</summary>
              <div className="absolute start-0 top-full z-50 min-w-52 bg-surface border border-line rounded-b-lg shadow-pop py-1">
                {visibleNav.map(item => (
                  <Link key={item.href} href={item.href} className={clsx('flex items-center gap-2.5 px-3 py-2 text-sm', pathname === item.href ? 'text-ink bg-yellow/10' : 'text-grey-700 hover:bg-paper-2')}>
                    {item.icon}{item.label}
                  </Link>
                ))}
              </div>
            </details>
          </div>
          <div className="text-xs text-grey-500 shrink-0 text-end leading-tight">
            <div className="text-ink font-medium">{session.user.name}</div>
            {hasRole(session, 'kasper_admin') ? 'Kasper Admin' : 'Kasper Ops'}
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </>
  );
}
