'use client';

import React, { useState } from 'react';
import { Button, Badge, EmptyState } from '@/components/ui';
import * as clock from '@/lib/clock';
import {
  allTrackerRequests, declineTrackerRequest, pairTrackerRequest,
} from '@/server/requests';
import type { TrackerRequestView } from '@/server/requests';
import { stockTrackers } from '@/server/trackers';
import { useSession } from '@/hooks';

function formatDay(ts: string | number): string {
  const ms = typeof ts === 'number' ? ts : new Date(ts).getTime();
  return clock.formatDubaiDate(ms);
}

export default function RequestsPage() {
  const session = useSession();

  const [version, setVersion] = useState(0);
  const [pairingRequestId, setPairingRequestId] = useState<string | null>(null);
  const [pickedTrackerId, setPickedTrackerId] = useState('');
  const [decliningRequestId, setDecliningRequestId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  if (!session || !session.isKasper) {
    return (
      <div className="text-center py-8">
        <EmptyState title="Not available" description="Only Kasper staff can access the console." />
      </div>
    );
  }

  const requests = allTrackerRequests();
  const open = requests.filter(r => r.status === 'open');
  const handled = requests.filter(r => r.status !== 'open');
  const stock = stockTrackers();

  const refresh = () => {
    setVersion(v => v + 1);
    setPairingRequestId(null);
    setDecliningRequestId(null);
    setDeclineReason('');
  };

  const handlePair = (requestId: string) => {
    const trackerId = pickedTrackerId || stock[0]?.id;
    if (!trackerId) {
      setBanner({ kind: 'error', text: 'No trackers in stock — register one first.' });
      return;
    }
    const result = pairTrackerRequest(session, requestId, trackerId);
    if (result.ok) {
      setBanner({ kind: 'ok', text: result.message ?? 'Tracker paired.' });
      setPickedTrackerId('');
      refresh();
    } else {
      setBanner({ kind: 'error', text: result.error ?? 'Could not pair the tracker.' });
    }
  };

  const handleDecline = (requestId: string) => {
    const result = declineTrackerRequest(session, requestId, declineReason);
    if (result.ok) {
      setBanner({ kind: 'ok', text: result.message ?? 'Request declined.' });
      refresh();
    } else {
      setBanner({ kind: 'error', text: result.error ?? 'Could not decline the request.' });
    }
  };

  const row = (r: TrackerRequestView, actions: React.ReactNode) => (
    <tr key={r.id} className="bg-paper hover:bg-paper-2 align-top">
      <td className="px-3 py-2 border-b border-line text-grey-700">{r.asset?.name ?? '—'}</td>
      <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{r.asset?.code ?? '—'}</td>
      <td className="px-3 py-2 border-b border-line text-grey-700">{r.tenantName}</td>
      <td className="px-3 py-2 border-b border-line font-mono text-grey-500">{formatDay(r.at)}</td>
      <td className="px-3 py-2 border-b border-line text-grey-700 text-sm max-w-[22rem]">{r.note}</td>
      <td className="px-3 py-2 text-right border-b border-line">{actions}</td>
    </tr>
  );

  return (
    <div className="space-y-4 p-4" key={version}>
      <div>
        <h1 className="text-lg font-semibold text-ink">Tracker requests</h1>
        <p className="text-sm text-grey-500 mt-1">
          Asset owners request trackers here. Kasper reviews and either pairs or declines.
        </p>
      </div>

      {banner && (
        <div
          className={
            banner.kind === 'ok'
              ? 'bg-green/10 border border-green/30 text-green text-sm px-4 py-2 rounded-lg'
              : 'bg-red/10 border border-red/30 text-red text-sm px-4 py-2 rounded-lg'
          }
        >
          {banner.text}
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-ink mb-2">Open</h2>
        {open.length === 0 ? (
          <div className="bg-surface border border-line rounded-lg p-6 text-center text-sm text-grey-500">
            No open tracker requests.
          </div>
        ) : (
          <div className="bg-surface border border-line rounded-lg overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">Asset</th>
                  <th className="px-3 py-2 text-left font-medium">Code</th>
                  <th className="px-3 py-2 text-left font-medium">Tenant</th>
                  <th className="px-3 py-2 text-left font-medium">Requested</th>
                  <th className="px-3 py-2 text-left font-medium">Note</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {open.map(r => (
                  <React.Fragment key={r.id}>
                    {row(r, (
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" onClick={() => { setPairingRequestId(r.id); setDecliningRequestId(null); setPickedTrackerId(stock[0]?.id ?? ''); }}>
                          Pair a tracker
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => { setDecliningRequestId(r.id); setPairingRequestId(null); setDeclineReason(''); }}>
                          Decline
                        </Button>
                      </div>
                    ))}
                    {pairingRequestId === r.id && (
                      <tr className="bg-paper-2">
                        <td colSpan={6} className="px-3 py-3 border-b border-line">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-grey-500 font-medium">Tracker from stock</span>
                            <select
                              className="px-2 py-1.5 text-xs rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                              value={pickedTrackerId}
                              onChange={e => setPickedTrackerId(e.target.value)}
                            >
                              {stock.length === 0 && <option value="">No trackers in stock</option>}
                              {stock.map(t => (
                                <option key={t.id} value={t.id}>{t.imei} — SIM {t.simIccid}</option>
                              ))}
                            </select>
                            <Button size="sm" onClick={() => handlePair(r.id)} disabled={stock.length === 0}>
                              Pair to {r.asset?.code ?? 'asset'}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setPairingRequestId(null)}>Cancel</Button>
                            <span className="text-xs text-grey-500">
                              {r.requesterName} · {r.tenantName} · the asset becomes Unknown until the first fix.
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {decliningRequestId === r.id && (
                      <tr className="bg-paper-2">
                        <td colSpan={6} className="px-3 py-3 border-b border-line">
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              className="flex-1 min-w-[16rem] px-2 py-1.5 text-xs rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                              placeholder="Reason (at least 10 characters) — sent to the tenant"
                              value={declineReason}
                              onChange={e => setDeclineReason(e.target.value)}
                            />
                            <Button variant="danger" size="sm" onClick={() => handleDecline(r.id)}>Decline request</Button>
                            <Button variant="ghost" size="sm" onClick={() => setDecliningRequestId(null)}>Cancel</Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-ink mb-2">Handled</h2>
        {handled.length === 0 ? (
          <div className="bg-surface border border-line rounded-lg p-6 text-center text-sm text-grey-500">
            Nothing handled yet.
          </div>
        ) : (
          <div className="bg-surface border border-line rounded-lg overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">Asset</th>
                  <th className="px-3 py-2 text-left font-medium">Code</th>
                  <th className="px-3 py-2 text-left font-medium">Tenant</th>
                  <th className="px-3 py-2 text-left font-medium">Requested</th>
                  <th className="px-3 py-2 text-left font-medium">Note</th>
                  <th className="px-3 py-2 text-right font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {handled.map(r =>
                  row(r, (
                    <span className="text-xs text-grey-500">
                      {r.status === 'done' ? <Badge variant="green">Paired</Badge> : <Badge variant="yellow">Declined</Badge>}
                      {r.handledAt && <span className="block mt-1">on {formatDay(r.handledAt)}</span>}
                    </span>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
