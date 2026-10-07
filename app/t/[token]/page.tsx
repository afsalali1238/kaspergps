import type { Metadata } from 'next';
import { resolveTrackingLink, getTrackingLinkState } from '@/server/links';
import * as clock from '@/lib/clock';
import { AutoRefresh } from './AutoRefresh';

export const metadata: Metadata = {
  title: 'Track your asset — Kasper GPS',
  description: 'Live GPS tracking for your rental equipment',
  robots: { index: false, follow: false },
  other: { referrer: 'no-referrer' },
};

function formatTime(ts: string | number): string {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  return clock.formatDubaiTime(t);
}

const INACTIVE_COPY: Record<string, string> = {
  expired: 'This link has expired.',
  revoked: 'This link was revoked.',
  booking_cancelled: 'This booking was cancelled.',
  job_closed: 'This job has been closed.',
  access_ended: 'Access to this asset has ended.',
};

function Inactive({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red/10 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-red">
            <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 001.71 3h15.44a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-ink mb-2">This tracking link is no longer active</h1>
        <p className="text-sm text-grey-500">{INACTIVE_COPY[reason] ?? 'The link is no longer shared.'}</p>
      </div>
    </div>
  );
}

export default async function TrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const state = getTrackingLinkState(token);
  if (state !== 'active') return <Inactive reason={state} />;

  // Architecture rule 8: the resolver returns location + optional ETA — nothing else.
  const resolved = resolveTrackingLink(token);
  if (!resolved) {
    return (
      <div className="min-h-screen bg-bg">
        <AutoRefresh />
        <header className="bg-ink text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-yellow">
              <rect width="24" height="24" rx="5" fill="#141518" />
              <text x="0" y="18" fontSize="14" fontFamily="monospace" fill="#FFC400" fontWeight="700">K</text>
            </svg>
            <span className="text-sm font-semibold">Kasper GPS</span>
          </div>
          <div className="text-xs text-grey-500">Waiting for update</div>
        </header>
        <div className="p-6 text-center text-sm text-grey-500">Waiting for the first position…</div>
      </div>
    );
  }

  const eta = resolved.eta;
  const hasEta = Boolean(eta) && eta!.state !== 'unavailable';

  return (
    <div className="min-h-screen bg-bg">
      <AutoRefresh />

      {/* No app shell. Phone-first: wordmark, asset name, one marker, live dot, updated at. */}
      <header className="bg-ink text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-yellow">
            <rect width="24" height="24" rx="5" fill="#141518" />
            <text x="0" y="18" fontSize="14" fontFamily="monospace" fill="#FFC400" fontWeight="700">K</text>
          </svg>
          <span className="text-sm font-semibold">Kasper GPS</span>
        </div>
        <div className="text-xs text-grey-500">Updated {formatTime(resolved.at)}</div>
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
            <p className="text-sm">Live map</p>
          </div>
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-white/90 px-2 py-1 rounded-md shadow-sm">
            <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
            <span className="text-xs font-medium text-ink">Live</span>
          </div>
        </div>

        <div className="w-full md:w-80 bg-surface border-t border-line p-4 space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-ink">{resolved.assetName}</h1>
          </div>

          {eta && (
            <div className="bg-yellow/5 border border-yellow/20 rounded-lg p-3">
              <div className="text-xs text-yellow-dark font-medium mb-1">Arrival</div>
              {eta.state === 'arrived' ? (
                <div className="text-sm text-ink font-medium">Arrived {formatTime(eta.etaAt)}</div>
              ) : eta.state === 'en_route' ? (
                <div className="text-sm text-ink">
                  Arriving about <span className="font-semibold">{formatTime(eta.etaAt)}</span>
                  {eta.etaAt > clock.now() && (
                    <span className="text-xs text-grey-500"> (in {Math.max(1, Math.round((eta.etaAt - clock.now()) / 60000))} min)</span>
                  )}
                </div>
              ) : (
                <div className="text-sm text-grey-700">ETA unavailable — waiting for update</div>
              )}
              {hasEta && <div className="text-xs text-grey-500 mt-1">Destination: {eta.destinationName}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
