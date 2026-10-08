'use client';

import React, { useState, useMemo } from 'react';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';
import * as clock from '@/lib/clock';
import type { Booking } from '@/domain/types';

function bookingStatusWords(booking: Booking): string {
  const start = new Date(booking.start).getTime();
  const end = booking.closedAt ? new Date(booking.closedAt).getTime() : new Date(booking.end).getTime();
  const now = clock.now();

  if (booking.status === 'closed') return 'Ended';
  if (booking.status === 'cancelled') return 'Cancelled';
  if (booking.status === 'scheduled') return 'Upcoming';
  if (now >= start && now <= end) return 'Active';
  if (now > end) return 'Ended';
  return 'Upcoming';
}

function formatBookingTime(ms: string | number): string {
  const time = typeof ms === 'string' ? new Date(ms).getTime() : ms;
  return `${clock.formatDubaiDate(time)} ${clock.formatDubaiTime(time)}`;
}

export default function ConsoleBookingsPage() {
  const store = useStore;
  const session = store.getState().session;

  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState<string | null>(null);
  const [assetFilter, setAssetFilter] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const filteredBookings = useMemo(() => {
    return seed.bookings.filter(b => {
      const status = bookingStatusWords(b);
      if (statusFilter && status !== statusFilter) return false;
      const asset = seed.assets.find(a => a.id === b.assetId);
      if (!asset) return false;
      if (tenantFilter && asset.ownerTenantId !== tenantFilter) return false;
      if (assetFilter && b.assetId !== assetFilter) return false;
      return true;
    });
  }, [statusFilter, tenantFilter, assetFilter]);

  const statusOptions = ['Active', 'Upcoming', 'Ended', 'Cancelled', 'Ended early'];
  const tenantOptions = seed.tenants;
  const assetOptions = seed.assets;

  if (!session || !session.isKasper) {
    return (
      <div className="text-center py-8">
        <EmptyState
          title="Not available"
          description="Only Kasper staff can access the console."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Bookings</h1>
          <p className="text-sm text-grey-500 mt-1">
            Manage bookings across all tenants.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>New booking</Button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-ink text-paper px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter ?? ''}
          onChange={e => setStatusFilter(e.target.value || null)}
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        >
          <option value="">All statuses</option>
          {statusOptions.map(s => (
            <option key={s} value={s.toLowerCase()}>{s}</option>
          ))}
        </select>
        <select
          value={tenantFilter ?? ''}
          onChange={e => setTenantFilter(e.target.value || null)}
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        >
          <option value="">All tenants</option>
          {tenantOptions.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={assetFilter ?? ''}
          onChange={e => setAssetFilter(e.target.value || null)}
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        >
          <option value="">All assets</option>
          {assetOptions.map(a => (
            <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
          ))}
        </select>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-3">New booking</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-grey-500 font-medium">Asset</label>
              <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                {assetOptions.map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Renter</label>
              <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                <option value="">Outside hirer</option>
                {tenantOptions.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Start</label>
              <input
                type="datetime-local"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">End</label>
              <input
                type="datetime-local"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Rate type</label>
              <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Rate (AED)</label>
              <input
                type="number"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowCreateForm(false)}>Cancel</Button>
              <Button onClick={() => { setShowCreateForm(false); showToast('Booking created'); }}>Create</Button>
            </div>
          </div>
        </div>
      )}

      {/* Bookings list */}
      <div className="space-y-2">
        {filteredBookings.map(booking => {
          const status = bookingStatusWords(booking);
          const asset = seed.assets.find(a => a.id === booking.assetId);
          const tenant = seed.tenants.find(t => t.id === booking.renterTenantId);

          return (
            <div
              key={booking.id}
              className="bg-surface border border-line rounded-lg p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{booking.reference}</span>
                    <Badge
                      variant={
                        status === 'Active' ? 'green' :
                        status === 'Upcoming' ? 'ink' :
                        status === 'Cancelled' ? 'grey' :
                        'grey'
                      }
                    >
                      {status}
                    </Badge>
                  </div>
                  <div className="text-sm text-grey-700 mt-1">
                    {asset?.code} — {tenant?.name ?? 'Outside hirer'}
                  </div>
                  <div className="text-xs text-grey-500 mt-1">
                    {formatBookingTime(booking.start)} – {formatBookingTime(booking.end)}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-grey-500">
                    {booking.rateType && <span>{booking.rateType}: {booking.rateAed} AED</span>}
                    {booking.destination && <span>To: {booking.destination.name}</span>}
                    {booking.status === 'closed' && booking.closedAt && (
                      <span>Closed: {formatBookingTime(booking.closedAt)}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  {status === 'Active' && (
                    <>
                      <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink" onClick={() => showToast('Booking extended')}>
                        Extend
                      </button>
                      <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink" onClick={() => showToast('Booking shortened')}>
                        Shorten
                      </button>
                    </>
                  )}
                  {status === 'Upcoming' && (
                    <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink" onClick={() => showToast('Booking cancelled')}>
                      Cancel
                    </button>
                  )}
                  {(status === 'Active' || status === 'Ended') && (
                    <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink" onClick={() => showToast('Job closed')}>
                      Close job
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filteredBookings.length === 0 && (
          <EmptyState
            title="No bookings"
            description="No bookings match the current filters."
          />
        )}
      </div>
    </div>
  );
}
