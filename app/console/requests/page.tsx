'use client';

import React, { useState, useMemo } from 'react';
import { Button, Badge, EmptyState } from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';
import * as clock from '@/lib/clock';

function formatTs(ts: string | number): string {
  const d = new Date(typeof ts === 'number' ? ts : ts);
  return d.toLocaleDateString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Dubai',
  });
}

export default function RequestsPage() {
  const store = useStore;
  const session = store.getState().session;

  if (!session || !session.isKasper) {
    return (
      <div className="text-center py-8">
        <EmptyState title="Not available" description="Only Kasper staff can access the console." />
      </div>
    );
  }

  const trackerRequests = useMemo(() => {
    // In the prototype we derive open tracker requests from assets that have
    // no tracker and a flaggedForSupport note.
    return seed.assets
      .filter(a => !a.canProfile.adapter || a.canProfile.adapter === 'none')
      .filter(a => {
        // Assets with a requested tracker show "Tracker requested …" in the UI.
        // In the prototype we show any no-tracker asset as a potential request.
        return true;
      })
      .map(a => ({
        id: `req-${a.id}`,
        asset: a,
        status: 'open' as const,
        requestedAt: a.createdAt,
        note: 'Tracker requested by tenant.',
      }));
  }, []);

  const openRequests = trackerRequests;

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
        {openRequests.length === 0 ? (
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
                {openRequests.map(r => {
                  const tenant = seed.tenants.find(t => t.id === r.asset.ownerTenantId);
                  return (
                    <tr key={r.id} className="bg-paper hover:bg-paper-2">
                      <td className="px-3 py-2 border-b border-line text-grey-700">{r.asset.name}</td>
                      <td className="px-3 py-2 border-b border-line font-mono text-grey-700">{r.asset.code}</td>
                      <td className="px-3 py-2 border-b border-line text-grey-700">{tenant?.name ?? '—'}</td>
                      <td className="px-3 py-2 border-b border-line font-mono text-grey-500">{formatTs(r.requestedAt)}</td>
                      <td className="px-3 py-2 border-b border-line text-grey-700 text-sm">{r.note}</td>
                      <td className="px-3 py-2 text-right border-b border-line">
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" onClick={() => { /* pair */ }}>Pair tracker</Button>
                          <Button variant="secondary" size="sm" onClick={() => { /* decline */ }}>Decline</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
