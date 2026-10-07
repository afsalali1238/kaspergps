'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { isAssetVisible } from '@/server/access';
import type { Session } from '@/domain/types';

interface Download {
  id: string;
  name: string;
  scope: string;
  period: { from: string; to: string };
  format: 'pdf' | 'excel';
  generatedAt: string;
  bySchedule: boolean;
  size: string;
  assetIds: string[];
}

const DOWNLOADS: Download[] = [
  {
    id: 'd-1',
    name: 'Trip & Mileage — EX-04',
    scope: 'Single asset',
    period: { from: '2026-10-01', to: '2026-10-07' },
    format: 'excel',
    generatedAt: '2026-10-07 10:00',
    bySchedule: false,
    size: '45 KB',
    assetIds: ['a-ex04'],
  },
  {
    id: 'd-2',
    name: 'Location history — Fleet',
    scope: 'Multiple assets',
    period: { from: '2026-10-01', to: '2026-10-07' },
    format: 'pdf',
    generatedAt: '2026-10-07 11:30',
    bySchedule: true,
    size: '120 KB',
    assetIds: ['a-ex04', 'a-ex07', 'a-cr02'],
  },
  {
    id: 'd-3',
    name: 'Operating hours — Dubai Hills',
    scope: 'Site',
    period: { from: '2026-10-01', to: '2026-10-07' },
    format: 'excel',
    generatedAt: '2026-10-07 14:00',
    bySchedule: false,
    size: '32 KB',
    assetIds: ['a-ex04', 'a-ex07'],
  },
];

export default function DownloadsPage() {
  const store = useStore;
  const session = store.getState().session;

  const visibleDownloads = useMemo(() => {
    if (!session) return [];
    return DOWNLOADS.filter(d => {
      if (!session.isKasper) {
        return d.assetIds.every(aid => isAssetVisible(session, aid));
      }
      return true;
    });
  }, [session]);

  if (!session) return null;

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Downloads</h1>
        <p className="text-sm text-grey-500 mt-1">
          Your generated reports and downloads.
        </p>
      </div>

      <div className="space-y-2">
        {visibleDownloads.map(download => (
          <div key={download.id} className="bg-surface border border-line rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{download.name}</span>
                  <Badge variant={download.format === 'pdf' ? 'green' : 'default'}>
                    {download.format.toUpperCase()}
                  </Badge>
                  {download.bySchedule && <Badge variant="grey">By schedule</Badge>}
                </div>
                <div className="text-sm text-grey-700 mt-1">
                  {download.scope} · {download.period.from} to {download.period.to}
                </div>
                <div className="text-xs text-grey-500 mt-1">
                  Generated at {download.generatedAt} · {download.size}
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="secondary" size="sm" onClick={() => {}}>
                  Download again
                </Button>
                <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {visibleDownloads.length === 0 && (
          <EmptyState
            title="No downloads"
            description="Your generated reports will appear here."
          />
        )}
      </div>
    </div>
  );
}
