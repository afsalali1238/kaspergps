'use client';

import React, { useMemo, useState } from 'react';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { useDb } from '@/server/db';
import * as clock from '@/lib/clock';
import type { Booking } from '@/domain/types';
import {
  cancelBooking, closeBooking, createBooking, endEarly, extendBooking, shortenBooking,
} from '@/server/bookings';
import { useSession } from '@/hooks';

function bookingStatusWords(booking: Booking): string {
  const start = new Date(booking.start).getTime();
  const end = new Date(booking.end).getTime();
  const now = clock.now();

  if (booking.status === 'closed') return 'Ended';
  if (booking.status === 'cancelled') return 'Cancelled';
  if (booking.status === 'scheduled') return now > end ? 'Ended' : 'Upcoming';
  if (now >= start && now <= end) return 'Active';
  if (now > end) return 'Ended';
  return 'Upcoming';
}

function formatBookingTime(ms: string | number): string {
  const time = typeof ms === 'string' ? new Date(ms).getTime() : ms;
  return `${clock.formatDubaiDate(time)} ${clock.formatDubaiTime(time)}`;
}

/** `YYYY-MM-DDTHH:mm` in Dubai, for a datetime-local input. */
function toLocalInput(ms: number): string {
  const d = clock.dubaiMsToDate(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ConsoleBookingsPage() {
  const seed = useDb(s => s);
  const session = useSession();

  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState<string | null>(null);
  const [assetFilter, setAssetFilter] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [endingEarlyId, setEndingEarlyId] = useState<string | null>(null);
  const [endReason, setEndReason] = useState('');

  const showToast = (kind: 'ok' | 'error', message: string) => {
    setToast({ kind, text: message });
    setTimeout(() => setToast(null), 4000);
  };
  const refresh = () => setVersion(v => v + 1);

  const bookings = useMemo(
    // version busts the memo after a create/extend/shorten/cancel/close
    () => [...seed.bookings].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()),
    [version]
  );

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

  const filteredBookings = bookings.filter(b => {
    const status = bookingStatusWords(b);
    if (statusFilter && status !== statusFilter) return false;
    const asset = seed.assets.find(a => a.id === b.assetId);
    if (!asset) return false;
    if (tenantFilter && asset.ownerTenantId !== tenantFilter) return false;
    if (assetFilter && b.assetId !== assetFilter) return false;
    return true;
  });

  const statusOptions = ['Active', 'Upcoming', 'Ended', 'Cancelled'];
  const tenantOptions = seed.tenants;

  const run = (result: { ok: boolean; error?: string; message?: string }) => {
    if (result.ok) {
      showToast('ok', result.message ?? 'Done.');
      setEndingEarlyId(null);
      setEndReason('');
      refresh();
    } else {
      showToast('error', result.error ?? 'Could not do that.');
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Bookings</h1>
          <p className="text-sm text-grey-500 mt-1">
            Rentals across all tenants. A booking is the renter&apos;s access window — extend, shorten, cancel or close it.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>New booking</Button>
      </div>

      {toast && (
        <div
          className={
            toast.kind === 'ok'
              ? 'bg-green/10 border border-green/30 text-green text-sm px-4 py-2 rounded-lg'
              : 'bg-red/10 border border-red/30 text-red text-sm px-4 py-2 rounded-lg'
          }
        >
          {toast.text}
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
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={tenantFilter ?? ''}
          onChange={e => setTenantFilter(e.target.value || null)}
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        >
          <option value="">All owners</option>
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
          {seed.assets.map(a => (
            <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
          ))}
        </select>
      </div>

      {showCreateForm && (
        <CreateBookingForm
          onCancel={() => setShowCreateForm(false)}
          onDone={message => { setShowCreateForm(false); showToast('ok', message); refresh(); }}
          onError={message => showToast('error', message)}
        />
      )}

      {/* Bookings list */}
      <div className="space-y-2">
        {filteredBookings.map(booking => {
          const status = bookingStatusWords(booking);
          const asset = seed.assets.find(a => a.id === booking.assetId);
          const tenant = seed.tenants.find(t => t.id === booking.renterTenantId);
          const startMs = new Date(booking.start).getTime();
          const endMs = new Date(booking.end).getTime();

          return (
            <div key={booking.id} className="bg-surface border border-line rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{booking.reference}</span>
                    <Badge
                      variant={
                        status === 'Active' ? 'green' :
                        status === 'Upcoming' ? 'ink' :
                        'grey'
                      }
                    >
                      {status}
                    </Badge>
                    {booking.status === 'closed' && <Badge variant="yellow">Ended early</Badge>}
                  </div>
                  <div className="text-sm text-grey-700 mt-1">
                    {asset?.code} — {tenant?.name ?? 'Outside hirer'}
                  </div>
                  <div className="text-xs text-grey-500 mt-1">
                    {formatBookingTime(booking.start)} – {formatBookingTime(booking.end)}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-grey-500 flex-wrap">
                    {booking.rateType && <span>{booking.rateType}: AED {booking.rateAed}</span>}
                    {booking.renterSiteId && (
                      <span>Site: {seed.sites.find(s => s.id === booking.renterSiteId)?.name}</span>
                    )}
                    {booking.destination && <span>To: {booking.destination.name}</span>}
                    {booking.closedAt && <span>Closed: {formatBookingTime(booking.closedAt)}</span>}
                    {seed.grantOverrides.find(o => o.bookingId === booking.id)?.reason && (
                      <span>Cut short: {seed.grantOverrides.find(o => o.bookingId === booking.id)!.reason}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap justify-end max-w-[20rem]">
                  {status === 'Active' && (
                    <>
                      <button
                        className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                        onClick={() => run(extendBooking(session, booking.id, endMs + 86400000))}
                      >
                        Extend 1 day
                      </button>
                      <button
                        className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                        onClick={() => run(shortenBooking(session, booking.id, endMs - 86400000))}
                      >
                        Shorten 1 day
                      </button>
                    </>
                  )}
                  {status === 'Upcoming' && (
                    <button
                      className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                      onClick={() => run(cancelBooking(session, booking.id, 'Cancelled from the console'))}
                    >
                      Cancel
                    </button>
                  )}
                  {(status === 'Active' || status === 'Ended') && booking.status !== 'closed' && (
                    <>
                      <button
                        className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                        onClick={() => run(closeBooking(session, booking.id, 'Job finished'))}
                      >
                        Close job
                      </button>
                      {status === 'Active' && (
                        <button
                          className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                          onClick={() => { setEndingEarlyId(endingEarlyId === booking.id ? null : booking.id); setEndReason(''); }}
                        >
                          End early
                        </button>
                      )}
                    </>
                  )}
                  <span className="text-[10px] text-grey-400 self-center font-mono">
                    {booking.renterTenantId ? 'renter' : 'outside'} · {clock.differenceInDubaiDays(startMs, endMs)} d
                  </span>
                </div>
              </div>

              {endingEarlyId === booking.id && (
                <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={endReason}
                    onChange={e => setEndReason(e.target.value)}
                    placeholder="Reason (shown on the rental)"
                    className="flex-1 min-w-[16rem] px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  />
                  <Button variant="danger" size="sm" onClick={() => run(endEarly(session, booking.id, endReason))}>
                    Cut the rental now
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEndingEarlyId(null)}>Cancel</Button>
                </div>
              )}
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

// ── New booking ───────────────────────────────────────────────────────────────

function CreateBookingForm({ onCancel, onDone, onError }: {
  onCancel: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const seed = useDb(s => s);
  const session = useSession()!;
  const [assetId, setAssetId] = useState(seed.assets[0]?.id ?? '');
  const [renterTenantId, setRenterTenantId] = useState('');
  const [renterSiteId, setRenterSiteId] = useState('');
  const [start, setStart] = useState(toLocalInput(clock.now() + 86400000));
  const [end, setEnd] = useState(toLocalInput(clock.now() + 4 * 86400000));
  const [rateType, setRateType] = useState<'daily' | 'hourly'>('daily');
  const [rateAed, setRateAed] = useState('1200');
  const [destinationName, setDestinationName] = useState('');
  const [destinationLat, setDestinationLat] = useState('25.1123');
  const [destinationLng, setDestinationLng] = useState('55.2012');

  const asset = seed.assets.find(a => a.id === assetId);
  const sites = renterTenantId ? seed.sites.filter(s => s.tenantId === renterTenantId) : [];

  return (
    <div className="bg-surface border border-line rounded-lg p-4">
      <h2 className="text-sm font-medium text-ink mb-3">New booking</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-grey-500 font-medium">Asset</label>
          <select
            value={assetId}
            onChange={e => setAssetId(e.target.value)}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          >
            {seed.assets.map(a => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name} · {seed.tenants.find(t => t.id === a.ownerTenantId)?.name}
              </option>
            ))}
          </select>
          {asset && (
            <div className="text-xs text-grey-500 mt-1">
              Owner: {seed.tenants.find(t => t.id === asset.ownerTenantId)?.name}
              {asset.retiredAt ? ' · retired' : ''}
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-grey-500 font-medium">Renter</label>
          <select
            value={renterTenantId}
            onChange={e => { setRenterTenantId(e.target.value); setRenterSiteId(''); }}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          >
            <option value="">Outside hirer (tracking link only)</option>
            {seed.tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        {renterTenantId && (
          <div>
            <label className="text-xs text-grey-500 font-medium">Renter site (narrows the grant)</label>
            <select
              value={renterSiteId}
              onChange={e => setRenterSiteId(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
            >
              <option value="">All of the renter&apos;s sites</option>
              {sites.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs text-grey-500 font-medium">Start (Dubai)</label>
          <input
            type="datetime-local"
            value={start}
            onChange={e => setStart(e.target.value)}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="text-xs text-grey-500 font-medium">End (Dubai)</label>
          <input
            type="datetime-local"
            value={end}
            onChange={e => setEnd(e.target.value)}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-grey-500 font-medium">Rate type</label>
            <select
              value={rateType}
              onChange={e => setRateType(e.target.value as 'daily' | 'hourly')}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
            >
              <option value="daily">Daily</option>
              <option value="hourly">Hourly</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-grey-500 font-medium">Rate (AED)</label>
            <input
              type="number"
              value={rateAed}
              onChange={e => setRateAed(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-grey-500 font-medium">Destination (optional — enables the ETA)</label>
          <input
            type="text"
            value={destinationName}
            onChange={e => setDestinationName(e.target.value)}
            placeholder="e.g. Al Habtoor site, Al Barsha"
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          />
          {destinationName && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <input
                type="text"
                value={destinationLat}
                onChange={e => setDestinationLat(e.target.value)}
                placeholder="Latitude"
                className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              />
              <input
                type="text"
                value={destinationLng}
                onChange={e => setDestinationLng(e.target.value)}
                placeholder="Longitude"
                className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button
          onClick={() => {
            const result = createBooking(session, {
              assetId,
              renterTenantId: renterTenantId || null,
              renterSiteId: renterSiteId || null,
              start: clock.isoFromDubai(start),
              end: clock.isoFromDubai(end),
              rateType,
              rateAed: Number(rateAed) || 0,
              destination: destinationName
                ? { name: destinationName, lat: Number(destinationLat), lng: Number(destinationLng) }
                : undefined,
            });
            if (result.ok) onDone(result.message ?? 'Booking created.');
            else onError(result.error ?? 'Could not create the booking.');
          }}
        >
          Create booking
        </Button>
      </div>
    </div>
  );
}
