'use client';

import React, { useState, useMemo } from 'react';
import { Button, Badge, EmptyState } from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';
import * as clock from '@/lib/clock';

function formatTs(ts: string | number): string {
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  return new Date(t).toLocaleDateString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Dubai',
  });
}

export default function RequestsPage() {
  const store = useStore;
  const session = store.getState().session;

  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  if (!session || !session.isKasper) {
    return (
      <div className="text-center py-8">
        <EmptyState title="Not available" description="Only Kasper staff can access the console." />
      </div>
    );
  }

  // Use seed.trackerRequests as the data source.
  const requests = useMemo(() => {
    return seed.trackerRequests
      .filter(r => r.status === 'open')
      .map(r => {
        const asset = seed.assets.find(a => a.id === r.assetId);
        const tenant = asset ? seed.tenants.find(t => t.id === asset.ownerTenantId) : null;
        return {
          id: r.id,
          asset,
          tenant,
          status: r.status,
          requestedAt: r.at,
          note: r.note,
          requestedBy: r.requestedBy,
        };
      });
  }, []);

  const handleDecline = (id: string) => {
    setDecliningId(null);
    setDeclineReason('');
    showToast('Request declined.');
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Tracker requests</h1>
        <p className="text-sm text-grey-500 mt-1">
          Asset owners request trackers here. Kasper reviews and either pairs or declines.
        </p>
      </div>

      {/* Open requests */}
      <div>
        <h2 className="text-sm font-medium text-ink mb-2">Open</h2>
        {requests.length === 0 ? (
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
                {requests.map(r => (
                  <tr key={r.id} className="bg-paper hover:bg-paper-2">
                    <td className="px-3 py-2 border-b border-line text-grey-700">{r.asset?.name ?? '—'}</td>
                    <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{r.asset?.code ?? '—'}</td>
                    <td className="px-3 py-2 border-b border-line text-grey-700">{r.tenant?.name ?? '—'}</td>
                    <td className="px-3 py-2 border-b border-line font-mono text-grey-500">{formatTs(r.requestedAt)}</td>
                    <td className="px-3 py-2 border-b border-line text-grey-700 text-sm">{r.note}</td>
                    <td className="px-3 py-2 text-right border-b border-line">
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" onClick={() => {
                          window.location.href = '/console/trackers';
                        }}>
                          Pair tracker
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setDecliningId(r.id)}>
                          Decline
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Decline confirm */}
      {decliningId && (
        <div className="fixed inset-0 flex items-center justify-center bg-ink/50 z-50">
          <div className="bg-surface border border-line rounded-lg p-4 max-w-sm w-full mx-4">
            <h3 className="text-sm font-medium text-ink mb-2">Decline request?</h3>
            <p className="text-xs text-grey-500 mb-3">
              Give a reason (at least 10 characters). The requesting tenant will be notified.
            </p>
            <input
              type="text"
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              placeholder="Reason for declining…"
              maxLength={200}
            />
            {declineReason.length > 0 && declineReason.length < 10 && (
              <p className="text-xs text-red mt-1">At least 10 characters required.</p>
            )}
            <div className="flex gap-2 justify-end mt-3">
              <Button variant="secondary" size="sm" onClick={() => setDecliningId(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={declineReason.length < 10}
                onClick={() => handleDecline(decliningId)}
              >
                Decline
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-ink text-paper px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}
    </div>
  );
}
