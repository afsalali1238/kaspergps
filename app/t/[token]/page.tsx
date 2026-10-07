import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { seed } from '@/server/seed/data';
import {
  resolveTrackingLink,
  trackingLinkEndReason,
  findTrackingLink,
  bookingForLink,
  type LinkEndReason,
} from '@/server/links';
import { formatEtaLine } from '@/domain/eta';
import { LiveMap } from '@/components/tracking/LiveMap';
import { LiveRefresh } from '@/components/tracking/LiveRefresh';
import * as clock from '@/lib/clock';

export const metadata: Metadata = {
  title: 'Track your asset — Kasper GPS',
  description: 'Live GPS tracking for your rental equipment',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

function endReasonMessage(reason: LinkEndReason): string {
  switch (reason) {
    case 'expired':
      return 'This link has expired.';
    case 'revoked':
      return 'This link was revoked.';
    case 'booking_cancelled':
      return 'This booking was cancelled.';
    case 'job_closed':
      return 'This job has been closed.';
    case 'access_ended':
      return 'Access to this asset has ended.';
    default:
      return 'This link was not found.';
  }
}

export default async function TrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const now = clock.now();

  const reason = trackingLinkEndReason(token, now);
  if (reason) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red/10 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-red">
              <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 001.71 3h15.44a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-ink mb-2">This tracking link is no longer active</h1>
          <p className="text-sm text-grey-500">{endReasonMessage(reason)}</p>
        </div>
      </div>
    );
  }

  // The resolver is the only way in — it never exposes booking, tenant or
  // destination coordinates (architecture rule 8).
  const resolved = resolveTrackingLink(token, now);
  const link = findTrackingLink(token);
  if (!link) notFound();

  const booking = bookingForLink(link);
  const destinationName = resolved?.eta?.destinationName;
  const updatedAt = resolved ? new Date(resolved.at).getTime() : null;

  return (
    <div className="min-h-screen bg-bg">
      <LiveRefresh />

      <header className="bg-ink text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-yellow">
            <rect width="24" height="24" rx="5" fill="#141518" />
            <text x="0" y="18" fontSize="14" fontFamily="monospace" fill="#FFC400" fontWeight="700">K</text>
          </svg>
          <span className="text-sm font-semibold">Kasper GPS</span>
        </div>
        <div className="text-xs text-grey-500">
          {updatedAt ? `Updated ${clock.formatDubaiTime(updatedAt)}` : 'Waiting for update'}
        </div>
      </header>

      <div className="flex flex-col md:flex-row">
        <div className="flex-1">
          <div className="h-[45vh] md:h-[60vh] relative bg-paper-2">
            {resolved ? (
              <LiveMap position={{ lat: resolved.lat, lng: resolved.lng }} />
            ) : (
              <div className="h-full flex items-center justify-center text-center text-grey-500">
                <div>
                  <p className="text-sm">Waiting for update</p>
                  <p className="text-xs mt-1">The tracker has not reported since this link was created.</p>
                </div>
              </div>
            )}
            {resolved && (
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-white/90 px-2 py-1 rounded-md shadow-sm">
                <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
                <span className="text-xs font-medium text-ink">Live</span>
              </div>
            )}
          </div>

          {/* ETA line — under the map, destination name only, never coordinates */}
          {resolved?.eta && (
            <div className="px-4 py-3 border-t border-line bg-surface">
              <div className="text-sm text-ink font-medium">{formatEtaLine(resolved.eta, now)}</div>
              <div className="text-xs text-grey-500 mt-1">Destination: {destinationName}</div>
            </div>
          )}
        </div>

        <div className="w-full md:w-80 bg-surface border-t md:border-t-0 md:border-l border-line p-4 space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-ink">{resolved?.assetName ?? 'Your rental asset'}</h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-grey-500">Owner:</span>
              <span className="text-xs text-grey-700">
                {seed.tenants.find(t => t.id === seed.assets.find(a => a.id === link.assetId)?.ownerTenantId)?.name ?? 'Unknown'}
              </span>
            </div>
          </div>

          <div className="bg-paper-2 rounded-lg p-3 border border-line">
            <div className="text-xs text-grey-500 mb-1">Last position</div>
            {updatedAt ? (
              <div className="text-sm text-ink">
                {clock.formatDubaiDate(updatedAt)} · {clock.formatDubaiTime(updatedAt)}
              </div>
            ) : (
              <div className="text-sm text-grey-700">Waiting for update</div>
            )}
          </div>

          {destinationName && (
            <div className="bg-yellow/5 border border-yellow/20 rounded-lg p-3">
              <div className="text-xs text-yellow-dark font-medium mb-1">Destination</div>
              <div className="text-sm text-ink">{destinationName}</div>
            </div>
          )}

          <div className="text-xs text-grey-500 space-y-1 pt-2 border-t border-line">
            <div>Link created {clock.formatDubaiDate(new Date(link.createdAt).getTime())} at {clock.formatDubaiTime(new Date(link.createdAt).getTime())}</div>
            <div>Expires {clock.formatDubaiDate(new Date(link.expiresAt).getTime())} at {clock.formatDubaiTime(new Date(link.expiresAt).getTime())}</div>
            {booking && <div>For booking {booking.reference}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
