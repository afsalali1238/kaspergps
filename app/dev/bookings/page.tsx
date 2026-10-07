'use client';

import React, { useState, useMemo } from 'react';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import type { Session, Booking } from '@/domain/types';

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

function canModifyBooking(session: Session, booking: Booking): boolean {
  // Owner tenant admin or Kasper can modify bookings
  const asset = seed.assets.find(a => a.id === booking.assetId);
  if (!asset) return false;
  if (session.isKasper) return true;
  if (session.role === 'tenant_admin' && asset.ownerTenantId === session.tenantId) return true;
  return false;
}

export default function BookingsSimulatorPage() {
  const store = useStore;
  const session = store.getState().session;

  const [bookings, setBookings] = useState<Booking[]>(seed.bookings);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [_phase] = useState<'day_one' | 'phase2' | 'later'>(store.getState().demoSwitches.phase);
  const [toast, setToast] = useState<string | null>(null);

  // Filter bookings the user can see
  const visibleBookings = useMemo(() => {
    if (!session) return [];
    if (session.isKasper) return bookings;
    // Tenant admins see bookings for their tenant's assets
    return bookings.filter(b => {
      const asset = seed.assets.find(a => a.id === b.assetId);
      return asset && asset.ownerTenantId === session.tenantId;
    });
  }, [bookings, session]);

  const activeBookings = useMemo(() => visibleBookings.filter(b => bookingStatusWords(b) === 'Active'), [visibleBookings]);
  const upcomingBookings = useMemo(() => visibleBookings.filter(b => bookingStatusWords(b) === 'Upcoming'), [visibleBookings]);
  const endedBookings = useMemo(() => visibleBookings.filter(b => bookingStatusWords(b) === 'Ended' || bookingStatusWords(b) === 'Ended early'), [visibleBookings]);
  const cancelledBookings = useMemo(() => visibleBookings.filter(b => bookingStatusWords(b) === 'Cancelled'), [visibleBookings]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleExtend = (booking: Booking) => {
    if (!canModifyBooking(session!, booking)) {
      showToast('You do not have permission to modify this booking.');
      return;
    }
    const newEnd = new Date(booking.end).getTime() + 86400000; // Extend by 1 day
    setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, end: newEnd } : b));
    showToast(`Extended ${seed.tenants.find(t => t.id === booking.renterTenantId)?.name}'s access by 1 day`);
  };

  const handleShorten = (booking: Booking) => {
    if (!canModifyBooking(session!, booking)) {
      showToast('You do not have permission to modify this booking.');
      return;
    }
    const newEnd = new Date(booking.end).getTime() - 86400000; // Shorten by 1 day
    setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, end: newEnd } : b));
    showToast(`Shortened ${seed.tenants.find(t => t.id === booking.renterTenantId)?.name}'s access by 1 day`);
  };

  const handleCancel = (booking: Booking) => {
    if (!canModifyBooking(session!, booking)) {
      showToast('You do not have permission to modify this booking.');
      return;
    }
    setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b));
    showToast(`Cancelled ${seed.tenants.find(t => t.id === booking.renterTenantId)?.name}'s booking`);
  };

  const handleClose = (booking: Booking) => {
    if (!canModifyBooking(session!, booking)) {
      showToast('You do not have permission to modify this booking.');
      return;
    }
    setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'closed', closedAt: clock.now() } : b));
    showToast(`Closed ${seed.tenants.find(t => t.id === booking.renterTenantId)?.name}'s job`);
  };

  const handleNightlyCheck = () => {
    // Recompute all windows - never undoes an override
    showToast('Nightly check complete. All booking windows recomputed.');
  };

  if (!session) return null;
  if (!session.isKasper && session.role !== 'tenant_admin') {
    return (
      <div className="text-center py-8">
        <EmptyState
          title="Not available"
          description="Only Kasper staff and tenant admins can access the booking simulator."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-ink">Booking simulator</h1>
        <p className="text-sm text-grey-500 mt-1">
          Manage bookings for your assets. This is a demo tool — changes are not persisted.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-ink text-paper px-4 py-2 rounded-lg shadow-lg text-sm animate-fade-in">
          {toast}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>Create booking</Button>
        <Button variant="secondary" onClick={handleNightlyCheck}>Run nightly check</Button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-3">Create booking</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-grey-500 font-medium">Asset</label>
              <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                {seed.assets.map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Renter tenant</label>
              <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                {seed.tenants.map(t => (
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
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowCreateForm(false)}>Cancel</Button>
              <Button onClick={() => { setShowCreateForm(false); showToast('Booking created'); }}>Create</Button>
            </div>
          </div>
        </div>
      )}

      {/* Booking list */}
      <div className="space-y-4">
        {/* Active bookings */}
        {activeBookings.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-ink mb-2">Active ({activeBookings.length})</h2>
            <div className="space-y-2">
              {activeBookings.map(booking => (
                <div
                  key={booking.id}
                  className="bg-surface border border-line rounded-lg p-4"
                  onClick={() => setSelectedBooking(selectedBooking?.id === booking.id ? null : booking)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{booking.reference}</span>
                        <Badge variant="yellow">Active</Badge>
                      </div>
                      <div className="text-sm text-grey-700 mt-1">
                        {seed.assets.find(a => a.id === booking.assetId)?.code} — {seed.tenants.find(t => t.id === booking.renterTenantId)?.name}
                      </div>
                      <div className="text-xs text-grey-500 mt-1">
                        {formatBookingTime(booking.start)} – {formatBookingTime(booking.end)}
                      </div>
                      {booking.rateType && (
                        <div className="text-xs text-grey-500 mt-1">
                          {booking.rateType}: {booking.rateAed} AED
                        </div>
                      )}
                    </div>
                    {canModifyBooking(session!, booking) && (
                      <div className="flex gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); handleExtend(booking); }}
                          className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                        >
                          Extend
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleShorten(booking); }}
                          className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                        >
                          Shorten
                        </button>
                      </div>
                    )}
                  </div>
                  {selectedBooking?.id === booking.id && (
                    <div className="mt-3 pt-3 border-t border-line">
                      <div className="text-xs text-grey-500 mb-2">Actions:</div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => { handleCancel(booking); setSelectedBooking(null); }}>
                          Cancel
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => { handleClose(booking); setSelectedBooking(null); }}>
                          Close job
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming bookings */}
        {upcomingBookings.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-ink mb-2">Upcoming ({upcomingBookings.length})</h2>
            <div className="space-y-2">
              {upcomingBookings.map(booking => (
                <div
                  key={booking.id}
                  className="bg-surface border border-line rounded-lg p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{booking.reference}</span>
                        <Badge variant="ink">Upcoming</Badge>
                      </div>
                      <div className="text-sm text-grey-700 mt-1">
                        {seed.assets.find(a => a.id === booking.assetId)?.code} — {seed.tenants.find(t => t.id === booking.renterTenantId)?.name}
                      </div>
                      <div className="text-xs text-grey-500 mt-1">
                        Starts {formatBookingTime(booking.start)}
                      </div>
                    </div>
                    {canModifyBooking(session!, booking) && (
                      <button
                        onClick={() => handleCancel(booking)}
                        className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ended bookings */}
        {endedBookings.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-ink mb-2">Ended ({endedBookings.length})</h2>
            <div className="space-y-2">
              {endedBookings.map(booking => (
                <div
                  key={booking.id}
                  className="bg-surface border border-line rounded-lg p-4 opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{booking.reference}</span>
                        <Badge variant="grey">Ended</Badge>
                      </div>
                      <div className="text-sm text-grey-700 mt-1">
                        {seed.assets.find(a => a.id === booking.assetId)?.code} — {seed.tenants.find(t => t.id === booking.renterTenantId)?.name}
                      </div>
                      <div className="text-xs text-grey-500 mt-1">
                        {formatBookingTime(booking.start)} – {formatBookingTime(booking.end)}
                      </div>
                    </div>
                    {canModifyBooking(session!, booking) && booking.status !== 'closed' && (
                      <button
                        onClick={() => handleClose(booking)}
                        className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                      >
                        Close job
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cancelled bookings */}
        {cancelledBookings.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-ink mb-2">Cancelled ({cancelledBookings.length})</h2>
            <div className="space-y-2">
              {cancelledBookings.map(booking => (
                <div
                  key={booking.id}
                  className="bg-surface border border-line rounded-lg p-4 opacity-40"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{booking.reference}</span>
                        <Badge variant="grey">Cancelled</Badge>
                      </div>
                      <div className="text-sm text-grey-700 mt-1">
                        {seed.assets.find(a => a.id === booking.assetId)?.code} — {seed.tenants.find(t => t.id === booking.renterTenantId)?.name}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
