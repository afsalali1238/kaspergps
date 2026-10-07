'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useHydrated, useSession } from '@/store';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    href: '/console',
    label: 'Overview',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1L1 15h14L8 1zm0 5l3 3-3 3M8 8V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    href: '/console/tenants',
    label: 'Tenants',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 5h6M5 8h6M5 11h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  },
  {
    href: '/console/assets',
    label: 'Assets',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2h6l3 3v9.5a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1zm0 2v2h6v2H3V4zm-1 3h8v8h2V6H2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  },
  {
    href: '/console/trackers',
    label: 'Trackers',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><path d="M4 12h8M8 12v3M4 4h2M4 6h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  },
  {
    href: '/console/bookings',
    label: 'Bookings',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M4 7h8M8 5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  },
  {
    href: '/console/onboarding',
    label: 'Onboard',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1L1 8h7l2 2.5L15 8h7l-7 5.5L9 14.5 8 10.5 7 14.5 1 8H8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const hydrated = useHydrated();

  // Guard: only Kasper staff can access the console. This waits for the
  // persisted session before deciding — the check used to run on the first
  // render, when the session was still null, and bounced every hard refresh
  // out to /app.
  useEffect(() => {
    if (!hydrated) return;
    if (!session) router.replace('/sign-in');
    else if (!session.isKasper) router.replace('/app');
  }, [hydrated, session, router]);

  if (!hydrated || !session || !session.isKasper) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg">
        <div className="text-sm text-grey-500">Loading…</div>
      </div>
    );
  }

  return (
    // The console is English-only: pin its direction even when the demo
    // language cookie is set to Arabic for the customer screens.
    <div className="flex h-screen bg-bg" dir="ltr">
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
          {navItems.map(item => (
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
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
