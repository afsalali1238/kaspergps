'use client';

import React from 'react';
import Link from 'next/link';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';

function getClockNow() {
  return Date.now();
}

export default function ConsoleOverviewPage() {
  const store = useStore;
  const session = store.getState().session;

  if (!session || !session.isKasper) {
    return null;
  }

  const stats = {
    tenants: seed.tenants.length,
    sites: seed.sites.length,
    users: seed.users.length,
    assets: seed.assets.length,
    trackers: seed.trackers.length,
    bookings: seed.bookings.length,
    activeBookings: seed.bookings.filter(b => {
      const start = new Date(b.start).getTime();
      const end = b.closedAt ? new Date(b.closedAt).getTime() : new Date(b.end).getTime();
      return getClockNow() >= start && getClockNow() <= end;
    }).length,
  };

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold text-ink mb-4">Kasper Console</h1>
      <p className="text-sm text-grey-500 mb-6">
        Welcome to the Kasper console. Manage tenants, assets, trackers, and bookings.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="text-xs text-grey-500 font-medium uppercase">Tenants</div>
          <div className="text-2xl font-semibold text-ink mt-1">{stats.tenants}</div>
          <Link href="/console/tenants" className="text-xs text-yellow hover:text-ink mt-1 inline-block">
            Manage →
          </Link>
        </div>
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="text-xs text-grey-500 font-medium uppercase">Sites</div>
          <div className="text-2xl font-semibold text-ink mt-1">{stats.sites}</div>
        </div>
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="text-xs text-grey-500 font-medium uppercase">Users</div>
          <div className="text-2xl font-semibold text-ink mt-1">{stats.users}</div>
        </div>
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="text-xs text-grey-500 font-medium uppercase">Assets</div>
          <div className="text-2xl font-semibold text-ink mt-1">{stats.assets}</div>
          <Link href="/console/assets" className="text-xs text-yellow hover:text-ink mt-1 inline-block">
            Manage →
          </Link>
        </div>
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="text-xs text-grey-500 font-medium uppercase">Trackers</div>
          <div className="text-2xl font-semibold text-ink mt-1">{stats.trackers}</div>
          <Link href="/console/trackers" className="text-xs text-yellow hover:text-ink mt-1 inline-block">
            Manage →
          </Link>
        </div>
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="text-xs text-grey-500 font-medium uppercase">Bookings</div>
          <div className="text-2xl font-semibold text-ink mt-1">{stats.bookings}</div>
          <div className="text-xs text-grey-500 mt-1">{stats.activeBookings} active</div>
          <Link href="/console/bookings" className="text-xs text-yellow hover:text-ink mt-1 inline-block">
            Manage →
          </Link>
        </div>
      </div>

      <div className="mt-6 bg-surface border border-line rounded-lg p-4">
        <h2 className="text-sm font-medium text-ink mb-2">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/console/tenants" className="px-3 py-2 text-xs rounded-lg border border-line bg-paper text-grey-700 hover:bg-paper-2 hover:text-ink">
            Create tenant
          </Link>
          <Link href="/console/assets" className="px-3 py-2 text-xs rounded-lg border border-line bg-paper text-grey-700 hover:bg-paper-2 hover:text-ink">
            Create asset
          </Link>
          <Link href="/console/trackers" className="px-3 py-2 text-xs rounded-lg border border-line bg-paper text-grey-700 hover:bg-paper-2 hover:text-ink">
            Register tracker
          </Link>
          <Link href="/console/bookings" className="px-3 py-2 text-xs rounded-lg border border-line bg-paper text-grey-700 hover:bg-paper-2 hover:text-ink">
            New booking
          </Link>
        </div>
      </div>
    </div>
  );
}
