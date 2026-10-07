import type { Metadata } from 'next';
import { resolveTrackingLink } from '@/server/links';
import * as clock from '@/lib/clock';

export const metadata: Metadata = {
  title: 'Track an asset — Kasper',
  description: 'Current asset location shared through Kasper.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

function toMillis(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : new Date(value).getTime();
}

function mapEmbedUrl(lat: number, lng: number): string {
  const padding = 0.01;
  const bounds = [lng - padding, lat - padding, lng + padding, lat + padding].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bounds}&layer=mapnik&marker=${lat}%2C${lng}`;
}

function coordinatesUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
}

export default async function TrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tracking = resolveTrackingLink(token);
  if (!tracking) {
    return (
      <main className="flex min-h-screen flex-col bg-paper-2 text-ink">
        <header className="flex items-center gap-2 bg-ink px-4 py-3 text-white">
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-yellow font-mono font-bold text-ink">K</span>
          <span className="text-sm font-semibold">Kasper</span>
        </header>
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <h1 className="text-lg font-semibold">This tracking link is no longer active.</h1>
        </div>
      </main>
    );
  }

  const positionTime = toMillis(tracking.at);
  const eta = tracking.eta;

  return (
    <main className="min-h-screen bg-paper-2 text-ink">
      <header className="flex items-center justify-between bg-ink px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-yellow font-mono font-bold text-ink">K</span>
          <span className="text-sm font-semibold">Kasper</span>
        </div>
        <span className="text-xs text-grey-500">Shared tracking</span>
      </header>

      <div className="mx-auto grid max-w-5xl gap-4 p-4 md:grid-cols-[1fr_300px] md:p-6">
        <section className="overflow-hidden rounded-xl border border-line bg-paper">
          <iframe
            title={`Map showing ${tracking.assetName}'s shared position`}
            src={mapEmbedUrl(tracking.lat, tracking.lng)}
            className="h-[55vh] min-h-[340px] w-full border-0 md:h-[70vh]"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
            <div>
              <h1 className="text-lg font-semibold text-ink">{tracking.assetName}</h1>
              <p className="mt-1 text-xs text-grey-500">Latest shared position</p>
              <p className="mt-1 font-mono text-sm text-ink">{tracking.lat.toFixed(5)}, {tracking.lng.toFixed(5)}</p>
              <p className="mt-1 text-xs text-grey-500">Updated {clock.formatDubaiDateTime(positionTime)}</p>
            </div>
            <a
              href={coordinatesUrl(tracking.lat, tracking.lng)}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-[#25262a]"
            >
              Open map
            </a>
          </div>
        </section>

        <aside className="space-y-3">
          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-grey-500">Asset</div>
            <div className="mt-1 text-lg font-semibold text-ink">{tracking.assetName}</div>
            <div className="mt-3 border-t border-line pt-3 text-xs text-grey-500">
              Last update <span className="font-mono text-grey-700">{clock.formatDubaiDateTime(positionTime)}</span>
            </div>
          </section>
          {eta && (
            <section className="rounded-xl border border-yellow-dark/20 bg-yellow/5 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-yellow-dark">Arrival</div>
              {eta.state === 'arrived' && eta.etaAt !== null ? (
                <p className="mt-1 text-sm font-semibold text-ink">Arrived {clock.formatDubaiTime(toMillis(eta.etaAt))}</p>
              ) : eta.state === 'unavailable' || eta.etaAt === null ? (
                <p className="mt-1 text-sm text-grey-700">ETA unavailable — waiting for update</p>
              ) : (
                <p className="mt-1 text-sm font-semibold text-ink">Arriving about {clock.formatDubaiTime(toMillis(eta.etaAt))}</p>
              )}
              <p className="mt-2 text-xs text-grey-500">Destination: {eta.destinationName}</p>
            </section>
          )}
          <p className="px-1 text-xs text-grey-500">This page shows only the location shared by the link owner.</p>
        </aside>
      </div>
    </main>
  );
}
