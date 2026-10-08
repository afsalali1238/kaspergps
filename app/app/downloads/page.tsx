'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { isAssetVisible } from '@/server/access';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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

const NAME_TO_REPORT_TYPE: Record<string, string> = {
  'Trip & Mileage': 'trip_mileage',
  'Location history': 'location_history',
  'Operating hours': 'operating_hours',
};

function rowsForDownload(download: Download): { Time: string; 'Asset code': string; Speed: string; Ignition: string; Heading: string }[] {
  const rows: { Time: string; 'Asset code': string; Speed: string; Ignition: string; Heading: string }[] = [];
  const startMs = new Date(download.period.from).getTime();
  const endMs = new Date(download.period.to).getTime() + 86400000;
  for (const assetId of download.assetIds) {
    const asset = seed.assets.find(a => a.id === assetId);
    if (!asset) continue;
    const readings = getReadingsForAsset(asset, startMs, endMs);
    for (const r of readings) {
      const t = typeof r.deviceTime === 'number' ? r.deviceTime : new Date(r.deviceTime).getTime();
      if (t >= startMs && t <= endMs) {
        rows.push({
          Time: clock.formatDubaiDateTime(t),
          'Asset code': asset.code,
          Speed: `${r.speedKmh.toFixed(1)} km/h`,
          Ignition: r.ignition ? 'On' : 'Off',
          Heading: `${Math.round(r.heading)}°`,
        });
      }
    }
  }
  rows.sort((a, b) => a.Time.localeCompare(b.Time));
  return rows;
}

function downloadAsExcel(download: Download, rows: ReturnType<typeof rowsForDownload>) {
  const reportType = NAME_TO_REPORT_TYPE[download.name.split(' — ')[0]] ?? 'trip_mileage';
  const wb = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.json_to_sheet([{
    Report: download.name,
    Scope: download.scope,
    From: download.period.from,
    To: download.period.to,
    Format: 'Excel',
    Generated: clock.formatDubaiDateTime(clock.now().getTime()),
    'Number of readings': rows.length,
  }], { header: ['Report', 'Scope', 'From', 'To', 'Format', 'Generated', 'Number of readings'] });
  const dataSheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Data');
  const filename = `Kasper_${reportType}_${download.scope.replace(/\s/g, '_')}_${download.period.from}_to_${download.period.to}.xlsx`;
  XLSX.writeFile(wb, filename);
}

function downloadAsPdf(download: Download, rows: ReturnType<typeof rowsForDownload>) {
  const doc = new jsPDF({ orientation: rows.length > 30 ? 'landscape' : 'portrait' });
  doc.setFontSize(16);
  doc.text(`Kasper — ${download.name}`, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Scope: ${download.scope}  |  From: ${download.period.from}  |  To: ${download.period.to}`, 14, 22);
  doc.text(`Generated: ${clock.formatDubaiDateTime(clock.now().getTime())}  |  Readings: ${rows.length}`, 14, 27);
  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    startY: 32,
    head: [['Time', 'Asset code', 'Speed', 'Ignition', 'Heading']],
    body: rows.map(r => [r.Time, r['Asset code'], r.Speed, r.Ignition, r.Heading]),
    theme: 'grid',
    headStyles: { fillColor: [45, 52, 54] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { minWidth: 28 },
      1: { minWidth: 22 },
      2: { minWidth: 18 },
      3: { minWidth: 16 },
      4: { minWidth: 16 },
    },
  });
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`Kasper GPS  |  ${download.name}  |  Page ${i} of ${pageCount}`, 14, doc.internal.pageSize.height - 8);
  }
  const reportType = NAME_TO_REPORT_TYPE[download.name.split(' — ')[0]] ?? 'location_history';
  const filename = `Kasper_${reportType}_${download.scope.replace(/\s/g, '_')}_${download.period.from}_to_${download.period.to}.pdf`;
  doc.save(filename);
}

export default function DownloadsPage() {
  const store = useStore;
  const session = store.getState().session;

  const [downloads, setDownloads] = useState<Download[]>(DOWNLOADS);

  const visibleDownloads = useMemo(() => {
    if (!session) return [];
    return downloads.filter(d => {
      if (!session.isKasper) {
        return d.assetIds.every(aid => isAssetVisible(session, aid));
      }
      return true;
    });
  }, [session, downloads]);

  const handleDownloadAgain = (download: Download) => {
    const rows = rowsForDownload(download);
    if (rows.length === 0) return;
    if (download.format === 'excel') {
      downloadAsExcel(download, rows);
    } else {
      downloadAsPdf(download, rows);
    }
  };

  const handleDelete = (id: string) => {
    setDownloads(prev => prev.filter(d => d.id !== id));
  };

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
                <Button variant="secondary" size="sm" onClick={() => handleDownloadAgain(download)}>
                  Download again
                </Button>
                <button
                  className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                  onClick={() => handleDelete(download.id)}
                >
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
