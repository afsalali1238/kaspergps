'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useStore } from '@/store';
import { hasCapability } from '@/server/access';
import type { Capability } from '@/server/capabilities';

interface NavItem {
  href: string;
  label: string;
  cap: Capability;
  icon: React.ReactNode;
}

// Spec 11.9: the left nav shows only what the role can view.
const navItems: NavItem[] = [
  {
    href: '/console',
    label: 'Overview',
    cap: 'console.tenants.view',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1L1 15h14L8 1zm0 5l3 3-3 3M8 8V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  },
  {
    href: '/console/tenants',
    label: 'Tenants',
    cap: 'console.tenants.view',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M5 5h6M5 8h6M5 11h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  },
  {
    href: '/console/onboarding',
    label: 'Onboard a company',
    cap: 'console.tenants.manage',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" /></svg>,
  },
  {
    href: '/console/assets',
    label: 'Assets',
    cap: 'console.tenants.view',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2h6l3 3v9.5a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1zm0 2v2h6v2H3V4zm-1 3h8v8h2V6H2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  },
  {
    href: '/console/trackers',
    label: 'Trackers',
    cap: 'console.trackers.view',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" /><path d="M4 12h8M8 12v3M4 4h2M4 6h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  },
  {
    href: '/console/adapters',
    label: 'CAN adapters',
    cap: 'console.adapters.manage',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M4 12v2M12 12v2M5 7h2M9 7h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  },
  {
    href: '/console/bookings',
    label: 'Bookings',
    cap: 'console.bookings.view',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M4 7h8M8 5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  },
  {
    href: '/console/requests',
    label: 'Requests',
    cap: 'console.trackers.view',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3h12v8H6l-4 3V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M5 6h6M5 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  },
  {
    href: '/console/billing',
    label: 'Billing',
    cap: 'console.billing.view',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M1 6.5h14M4 10h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  },
  {
    href: '/console/team',
    label: 'Kasper team',
    cap: 'console.staff.manage',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" /><path d="M2 14c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M11 7.5a2 2 0 100-4M14 14c0-1.8-1.1-3.3-2.7-3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  },
  {
    href: '/console/import',
    label: 'Import',
    cap: 'console.import',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  },
  {
    href: '/console/audit',
    label: 'Audit log',
    cap: 'console.audit.view',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2h6l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" /><path d="M5.5 8h5M5.5 10.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
  },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const store = useStore;
  const session = store.getState().session;

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

  const visibleNav = navItems.filter(item => hasCapability(session, item.cap));

  return (
    <>
      {/* Spec 11.9: the console is desktop only. */}
      <div className="min-[900px]:hidden fixed inset-0 flex items-center justify-center bg-bg px-6 text-center">
        <p className="text-sm text-grey-500">Open the console on a computer.</p>
      </div>

      <div className="hidden min-[900px]:flex h-screen bg-bg">
        {/* Left nav */}
        <nav className="w-56 bg-surface border-r border-line flex-shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-line">
            <Link href="/console" className="flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="5" fill="#141518" />
                <text x="0" y="18" fontSize="16" fontFamily="monospace" fill="#FFC400" fontWeight="700">K</text>
              </svg>
              <span className="text-sm font-semibold text-ink">Kasper Console</span>
            </Link>
          </div>
          <div className="p-2">
            {visibleNav.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  pathname === item.href
                    ? 'bg-yellow/10 text-ink border-l-2 border-yellow -ml-[1px]'
                    : 'text-grey-700 hover:bg-paper-2 hover:text-ink'
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>
          <div className="p-4 text-[11px] text-grey-500 border-t border-line">
            Signed in as {session.user.name} · {session.role === 'kasper_admin' ? 'Kasper Admin' : 'Kasper Ops'}
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </>
  );
}
