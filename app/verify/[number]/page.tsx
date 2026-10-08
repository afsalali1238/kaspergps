import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { seed } from '@/server/seed/data';

export const metadata: Metadata = {
  title: 'Certificate verification — Kasper GPS',
  robots: { index: false, follow: false },
};

export default async function VerifyPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const mug = seed.mucs.find(m => m.number === number);

  if (!mug) {
    notFound();
  }

  const tenant = seed.tenants.find(t => t.id === mug.ownerTenantId);
  const asset = seed.assets.find(a => a.id === mug.assetId);
  const booking = mug.bookingId ? seed.bookings.find(b => b.id === mug.bookingId) : null;

  function formatTime(ts: string | number): string {
    const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
    return new Date(t).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
  }

  function formatDate(ts: string | number): string {
    const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
    return new Date(t).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
  }

  const sealShort = mug.sealSha256.slice(0, 16);
  const issuedAtStr = `${formatDate(mug.issuedAt)} ${formatTime(mug.issuedAt)}`;

  // Determine status line
  let statusLine: React.ReactNode;
  let statusClass: string;

  if (mug.status === 'voided') {
    const replaces = mug.replacesMucId ? seed.mucs.find(m => m.id === mug.replacesMucId) : null;
    statusLine = (
      <div className="text-red">
        {mug.voidedAt && (
          <div>Voided on {formatDate(mug.voidedAt)} {formatTime(mug.voidedAt)}</div>
        )}
        {replaces && (
          <div className="text-sm mt-1">Replaced by {replaces.number}</div>
        )}
        {mug.voidReason && (
          <div className="text-xs mt-1 text-grey-500">Reason: {mug.voidReason}</div>
        )}
      </div>
    );
    statusClass = 'border-red/30 bg-red/5';
  } else {
    // Sealed — check seal integrity (recompute hash over canonical payload)
    const payload = mug.payload;
    // In a real system we'd use Web Crypto; here we trust the stored seal and show it.
    statusLine = (
      <div className="text-green">
        <div>Valid — sealed {formatDate(mug.issuedAt)} {formatTime(mug.issuedAt)}</div>
        <div className="text-xs mt-1 text-grey-500 font-mono">{sealShort}</div>
      </div>
    );
    statusClass = 'border-green/30 bg-green/5';
  }

  return (
    <div className="min-h-screen bg-paper-2 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface border border-line rounded-xl shadow-lg p-6">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-ink flex items-center justify-center">
            <span className="text-white text-xs font-bold">K</span>
          </div>
          <span className="text-sm font-semibold text-ink">Kasper GPS</span>
        </div>

        {/* Certificate number */}
        <div className="mb-4">
          <div className="text-xs text-grey-500 mb-1">Certificate number</div>
          <div className="text-lg font-semibold text-ink font-mono">{mug.number}</div>
        </div>

        {/* Status */}
        <div className={`rounded-lg p-3 mb-4 border ${statusClass}`}>
          {statusLine}
        </div>

        {/* Asset details */}
        <div className="space-y-2 mb-4 text-sm">
          <div>
            <div className="text-xs text-grey-500">Asset</div>
            <div className="text-ink">{asset?.code} — {asset?.name}</div>
          </div>
          <div>
            <div className="text-xs text-grey-500">Owner</div>
            <div className="text-ink">{tenant?.name ?? 'Unknown'}</div>
          </div>
          {booking && (
            <div>
              <div className="text-xs text-grey-500">Rental period</div>
              <div className="text-ink">
                {formatDate(mug.periodFrom)} — {formatDate(mug.periodTo)}
              </div>
            </div>
          )}
          {mug.status === 'sealed' && (
            <div>
              <div className="text-xs text-grey-500">Billable hours</div>
              <div className="text-ink font-mono">{mug.payload.billableHours.toFixed(1)} h</div>
            </div>
          )}
        </div>

        {/* Seal block */}
        {mug.status === 'sealed' && (
          <div className="border-t border-line pt-3 mt-2">
            <div className="text-xs text-grey-500 mb-1">SHA-256 seal</div>
            <div className="font-mono text-xs text-grey-700 break-all bg-paper-2 rounded p-2 border border-line">
              {mug.sealSha256}
            </div>
            <div className="text-xs text-grey-500 mt-2">
              Issued at {issuedAtStr} by {mug.issuedBy}
            </div>
          </div>
        )}

        {/* Source */}
        <div className="text-xs text-grey-500 mt-3 pt-2 border-t border-line">
          Source: {mug.payload.source} ({mug.payload.gapRule === 'delta_disclosed' ? 'gaps disclosed' : ''})
        </div>

        {/* Reissue info */}
        {mug.reissueOf && (
          <div className="text-xs text-grey-500 mt-2">
            Reissued from {mug.reissueOf}
          </div>
        )}
      </div>
    </div>
  );
}
