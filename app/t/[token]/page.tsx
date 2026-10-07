import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { seed } from '@/server/seed/data';
import { getReadingForAsset } from '@/server/telemetry/simulator';
import * as clock from '@/lib/clock';
import { ETA_ROAD_FACTOR, ETA_ARRIVED_M } from '@/config/thresholds';

export const metadata: Metadata = {
  title: 'Track your asset — Kasper GPS',
  description: 'Live GPS tracking for your rental equipment',
  robots: { index: false, follow: false },
};

function calcEta(lat: number, lng: number, dest: { lat: number; lng: number }, avgSpeedKmh: number): { etaAt: number; state: 'en_route' | 'arrived' | 'unavailable' } | null {
  const R = 6371;
  const dLat = (dest.lat - lat) * Math.PI / 180;
  const dLng = (dest.lng - lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(dest.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const roadDistKm = distKm * ETA_ROAD_FACTOR;
  const etaMs = roadDistKm / avgSpeedKmh * 3600 * 1000;
  return {
    etaAt: clock.now() + etaMs,
    state: distKm < ETA_ARRIVED_M / 1000 ? 'arrived' : 'en_route',
  };
}

function formatTime(ts: string | number): string {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const d = new Date(t);
  return d.toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
}

function formatDate(ts: string | number): string {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const d = new Date(t);
  return d.toLocaleDateString('en-AE', { day: '2-digit', month: 'short', timeZone: 'Asia/Dubai' });
}

export default async function TrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const link = seed.trackingLinks.find(l => l.token === token);
  if (!link) notFound();

  const asset = seed.assets.find(a => a.id === link.assetId);
  if (!asset) notFound();

  const now = clock.now();
  const isExpired = typeof link.expiresAt === 'number' && now > link.expiresAt;
  const isRevoked = !!link.revokedAt;
  const booking = link.bookingId ? seed.bookings.find(b => b.id === link.bookingId) : null;
  const isCancelled = booking ? booking.status === 'cancelled' : false;
  const isJobClosed = booking ? booking.status === 'closed' : false;
  const accessEnded = booking && typeof booking.closedAt === 'number' ? now > booking.closedAt : false;

  if (isExpired || isRevoked || isCancelled || isJobClosed || accessEnded) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red/10 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-red">
              <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 001.71 3h15.44a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-ink mb-2">This tracking link is no longer active</h1>
          <p className="text-sm text-grey-500">
            {isExpired ? 'This link has expired.' : isRevoked ? 'This link was revoked.' : isCancelled ? 'This booking was cancelled.' : isJobClosed ? 'This job has been closed.' : 'Access to this asset has ended.'}
          </p>
        </div>
      </div>
    );
  }

  const reading = getReadingForAsset(asset);
  const hasReading = reading && now - (typeof reading.deviceTime === 'string' ? new Date(reading.deviceTime).getTime() : reading.deviceTime) < 5 * 60 * 1000;

  const destination = booking?.destination;
  const eta = destination && link.showEta && hasReading
    ? calcEta(reading.lat, reading.lng, destination, 40)
    : null;

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-ink text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-yellow">
            <rect width="24" height="24" rx="5" fill="#141518" />
            <text x="0" y="18" fontSize="14" fontFamily="monospace" fill="#FFC400" fontWeight="700">K</text>
          </svg>
          <span className="text-sm font-semibold">Kasper GPS</span>
        </div>
        <div className="text-xs text-grey-500">
          {!hasReading ? 'Waiting for update' : `Updated ${formatTime(reading.deviceTime)}`}
        </div>
      </header>

      <div className="flex flex-col md:flex-row">
        <div className="flex-1 h-[60vh] md:h-[70vh] relative bg-paper-2 flex items-center justify-center">
          <div className="text-center text-grey-500">
            <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-ink/10 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-ink/40">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="12" cy="12" r="3" fill="currentColor"/>
              </svg>
            </div>
            <p className="text-sm">Live map — {asset.code}</p>
            <p className="text-xs mt-1">{asset.name}</p>
          </div>
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-white/90 px-2 py-1 rounded-md shadow-sm">
            <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
            <span className="text-xs font-medium text-ink">Live</span>
          </div>
          {!hasReading && (
            <div className="absolute top-3 right-3 bg-amber/10 border border-amber/30 text-amber-dark px-3 py-1.5 rounded-md text-xs font-medium">
              Waiting for first reading…
            </div>
          )}
        </div>

        <div className="w-full md:w-80 bg-surface border-t border-line p-4 space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-ink">{asset.code}</h1>
            <p className="text-sm text-grey-500">{asset.name}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-grey-500">Owner:</span>
              <span className="text-xs text-grey-700">
                {seed.tenants.find(t => t.id === asset.ownerTenantId)?.name ?? 'Unknown'}
              </span>
            </div>
          </div>

          <div className="bg-paper-2 rounded-lg p-3 border border-line">
            <div className="text-xs text-grey-500 mb-1">Status</div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green" />
              <span className="text-sm text-ink font-medium">{asset.status === 'live' ? 'On the move' : asset.status === 'idle' ? 'Parked' : asset.status}</span>
            </div>
            {reading && (
              <div className="mt-2 text-xs text-grey-500 space-y-1">
                <div>Speed: <span className="font-mono text-grey-700">{reading.speedKmh.toFixed(1)} km/h</span></div>
                <div>Heading: <span className="font-mono text-grey-700">{reading.heading.toFixed(0)}°</span></div>
                <div>Satellites: <span className="font-mono text-grey-700">{reading.satellites}</span></div>
                <div>Battery: <span className="font-mono text-grey-700">{reading.intBattery.toFixed(2)} V</span></div>
              </div>
            )}
          </div>

          {eta && destination && (
            <div className="bg-yellow/5 border border-yellow/20 rounded-lg p-3">
              <div className="text-xs text-yellow-dark font-medium mb-1">Arrival</div>
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-yellow-dark">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {eta.state === 'arrived' ? (
                  <span className="text-sm text-ink font-medium">Arrived</span>
                ) : (
                  <>
                    <span className="text-sm text-ink">Arriving about</span>
                    <span className="text-sm font-semibold text-ink">
                      {formatTime(eta.etaAt)}
                    </span>
                    <span className="text-xs text-grey-500">
                      ({formatDate(eta.etaAt)})
                    </span>
                  </>
                )}
              </div>
              {eta.state !== 'arrived' && (
                <div className="text-xs text-grey-500 mt-1">
                  Destination: {destination.name}
                </div>
              )}
            </div>
          )}

          {link.showEta && destination && !hasReading && (
            <div className="bg-paper-2 rounded-lg p-3 border border-line">
              <div className="text-xs text-grey-500">ETA</div>
              <p className="text-sm text-grey-700 mt-1">Waiting for update — ETA unavailable</p>
            </div>
          )}

          <div className="text-xs text-grey-500 space-y-1 pt-2 border-t border-line">
            <div>Link created {formatDate(link.createdAt)} at {formatTime(link.createdAt)}</div>
            <div>Expires {formatDate(link.expiresAt)} at {formatTime(link.expiresAt)}</div>
            {booking && (
              <div>For booking {booking.reference}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
