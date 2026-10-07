import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { seed } from '@/server/seed/data';
import {
  resolveTrackingLink,
  trackingLinkEndReason,
  findTrackingLink,
  bookingForLink,
  type LinkEndReason,
} from '@/server/links';
import { formatDubaiClock, formatEtaLine, minutesAway, type Eta } from '@/domain/eta';
import { LiveMap } from '@/components/tracking/LiveMap';
import { LiveRefresh } from '@/components/tracking/LiveRefresh';
import * as clock from '@/lib/clock';
import { translate, type TFunction } from '@/lib/i18n';
import { LANGUAGE_COOKIE, dirOf, languageFromCookie, type Language } from '@/lib/language';

export const metadata: Metadata = {
  title: 'Track your asset — Kasper GPS',
  description: 'Live GPS tracking for your rental equipment',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const END_REASON_KEYS: Record<LinkEndReason, string> = {
  expired: 'publicTracking.inactiveExpired',
  revoked: 'publicTracking.inactiveRevoked',
  booking_cancelled: 'publicTracking.inactiveCancelled',
  job_closed: 'publicTracking.inactiveJobClosed',
  access_ended: 'publicTracking.inactiveAccessEnded',
  not_found: 'publicTracking.inactiveNotFound',
};

const END_REASON_ENGLISH: Record<LinkEndReason, string> = {
  expired: 'This link has expired.',
  revoked: 'This link was revoked.',
  booking_cancelled: 'This booking was cancelled.',
  job_closed: 'This job has been closed.',
  access_ended: 'Access to this asset has ended.',
  not_found: 'This link was not found.',
};

/**
 * The ETA line in the visitor's language. The maths lives in one place
 * (domain/eta.ts); only the sentence is translated, and {time}/{minutes} are
 * injected as Latin digits.
 */
function localisedEtaLine(t: TFunction, eta: Eta, nowMs: number): string {
  const english = formatEtaLine(eta, nowMs);
  if (eta.state === 'arrived' && eta.etaAt !== null) {
    return t('publicTracking.arrived', english, { time: formatDubaiClock(eta.etaAt) });
  }
  if (eta.state === 'en_route' && eta.etaAt !== null) {
    return t('publicTracking.arrivingAbout', english, {
      time: formatDubaiClock(eta.etaAt),
      minutes: minutesAway(eta.etaAt, nowMs),
    });
  }
  return t('publicTracking.etaUnavailable', english);
}

export default async function TrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const now = clock.now();

  // The visitor's language is chosen on the customer screens and stored in a
  // cookie, so this server-rendered page can mirror itself too (spec 16).
  const cookieStore = await cookies();
  const language: Language = languageFromCookie(cookieStore.get(LANGUAGE_COOKIE)?.value);
  const t: TFunction = (key, fallback, vars) => translate(language, key, fallback, vars);
  const dir = dirOf(language);

  const reason = trackingLinkEndReason(token, now);
  if (reason) {
    return (
      <div
        lang={language}
        dir={dir}
        className="min-h-screen bg-bg flex items-center justify-center p-4"
      >
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red/10 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-red">
              <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 001.71 3h15.44a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-ink mb-2">
            {t('publicTracking.inactiveTitle', 'This tracking link is no longer active')}
          </h1>
          <p className="text-sm text-grey-500">
            {t(END_REASON_KEYS[reason], END_REASON_ENGLISH[reason])}
          </p>
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
  const ownerName =
    seed.tenants.find(t2 => t2.id === seed.assets.find(a => a.id === link.assetId)?.ownerTenantId)?.name ?? null;
  const createdAt = new Date(link.createdAt).getTime();
  const expiresAt = new Date(link.expiresAt).getTime();

  return (
    <div lang={language} dir={dir} className="min-h-screen bg-bg">
      <LiveRefresh />

      <header className="bg-ink text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-yellow">
            <rect width="24" height="24" rx="5" fill="#141518" />
            <text x="0" y="18" fontSize="14" fontFamily="monospace" fill="#FFC400" fontWeight="700">K</text>
          </svg>
          <span className="text-sm font-semibold">{t('publicTracking.wordmark', 'Kasper GPS')}</span>
        </div>
        <div className="text-xs text-grey-500">
          {updatedAt
            ? t('publicTracking.updated', `Updated ${clock.formatDubaiTime(updatedAt)}`, {
                time: clock.formatDubaiTime(updatedAt),
              })
            : t('publicTracking.waitingForUpdate', 'Waiting for update')}
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
                  <p className="text-sm">{t('publicTracking.waitingForUpdate', 'Waiting for update')}</p>
                  <p className="text-xs mt-1">
                    {t(
                      'publicTracking.waitingBody',
                      'The tracker has not reported since this link was created.',
                    )}
                  </p>
                </div>
              </div>
            )}
            {resolved && (
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-white/90 px-2 py-1 rounded-md shadow-sm">
                <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
                <span className="text-xs font-medium text-ink">{t('publicTracking.live', 'Live')}</span>
              </div>
            )}
          </div>

          {/* ETA line — under the map, destination name only, never coordinates */}
          {resolved?.eta && (
            <div className="px-4 py-3 border-t border-line bg-surface">
              <div className="text-sm text-ink font-medium">{localisedEtaLine(t, resolved.eta, now)}</div>
              <div className="text-xs text-grey-500 mt-1">
                {t('publicTracking.destination', 'Destination')}: {destinationName}
              </div>
            </div>
          )}
        </div>

        <div className="w-full md:w-80 bg-surface border-t md:border-t-0 md:border-l border-line p-4 space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-ink">
              {resolved?.assetName ?? t('publicTracking.yourRentalAsset', 'Your rental asset')}
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-grey-500">{t('publicTracking.ownerLabel', 'Owner')}:</span>
              <span className="text-xs text-grey-700">
                {ownerName ?? t('publicTracking.ownerUnknown', 'Unknown')}
              </span>
            </div>
          </div>

          <div className="bg-paper-2 rounded-lg p-3 border border-line">
            <div className="text-xs text-grey-500 mb-1">{t('publicTracking.lastPosition', 'Last position')}</div>
            {updatedAt ? (
              <div className="text-sm text-ink">
                {clock.formatDubaiDate(updatedAt)} · {clock.formatDubaiTime(updatedAt)}
              </div>
            ) : (
              <div className="text-sm text-grey-700">{t('publicTracking.waitingForUpdate', 'Waiting for update')}</div>
            )}
          </div>

          {destinationName && (
            <div className="bg-yellow/5 border border-yellow/20 rounded-lg p-3">
              <div className="text-xs text-yellow-dark font-medium mb-1">
                {t('publicTracking.destination', 'Destination')}
              </div>
              <div className="text-sm text-ink">{destinationName}</div>
            </div>
          )}

          <div className="text-xs text-grey-500 space-y-1 pt-2 border-t border-line">
            <div>
              {t('publicTracking.linkCreated', `Link created ${clock.formatDubaiDate(createdAt)} at ${clock.formatDubaiTime(createdAt)}`, {
                date: clock.formatDubaiDate(createdAt),
                time: clock.formatDubaiTime(createdAt),
              })}
            </div>
            <div>
              {t('publicTracking.expires', `Expires ${clock.formatDubaiDate(expiresAt)} at ${clock.formatDubaiTime(expiresAt)}`, {
                date: clock.formatDubaiDate(expiresAt),
                time: clock.formatDubaiTime(expiresAt),
              })}
            </div>
            {booking && (
              <div>
                {t('publicTracking.forBooking', `For booking ${booking.reference}`, {
                  reference: booking.reference,
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
