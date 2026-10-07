// Report files — the prototype really produces a file when a download is
// allowed, built deterministically from the same parameters as the run so
// "Download again" gives an identical document (spec 11.13).
//
// Client-only: the readings come from the simulator and the PDF path uses jsPDF.

import { seed } from '@/server/seed/data';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import * as clock from '@/lib/clock';
import type { ReportRun } from '@/server/reports';

interface Row {
  asset: string;
  time: string;
  lat: string;
  lng: string;
  speed: string;
  ignition: string;
}

/** Position rows for the run's period, sampled so a month does not produce 80k lines. */
export function reportRows(run: ReportRun, maxRows = 2000): Row[] {
  const rows: Row[] = [];
  for (const assetId of run.assetIds) {
    const asset = seed.assets.find(a => a.id === assetId);
    if (!asset) continue;
    const readings = getReadingsForAsset(asset, run.fromMs, run.toMs);
    const stride = Math.max(1, Math.ceil(readings.length / Math.max(1, Math.floor(maxRows / run.assetIds.length))));
    for (let i = 0; i < readings.length; i += stride) {
      const r = readings[i];
      const t = new Date(r.deviceTime).getTime();
      rows.push({
        asset: asset.code,
        time: clock.formatDubaiDateTime(t),
        lat: r.lat.toFixed(5),
        lng: r.lng.toFixed(5),
        speed: r.speedKmh.toFixed(0),
        ignition: r.ignition ? 'on' : 'off',
      });
    }
  }
  return rows;
}

function csvFor(run: ReportRun, rows: Row[]): string {
  const header = `# ${run.name}\n# Scope: ${run.scopeLabel}\n# Period: ${clock.formatDubaiDateTime(run.fromMs)} — ${clock.formatDubaiDateTime(run.toMs)}\n# Generated: ${clock.formatDubaiDateTime(run.generatedAtMs)} (Kasper GPS prototype)\n`;
  const body = ['Asset,Time (Dubai),Latitude,Longitude,Speed km/h,Ignition']
    .concat(rows.map(r => [r.asset, r.time, r.lat, r.lng, r.speed, r.ignition].join(',')))
    .join('\n');
  return `${header}${body}\n`;
}

/** The file a permitted download produces. */
export async function buildReportFile(run: ReportRun): Promise<{ blob: Blob; filename: string }> {
  const rows = reportRows(run);
  const stamp = clock.formatDubaiDate(run.generatedAtMs).replace(/ /g, '-');
  const slug = run.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  if (run.format === 'excel') {
    return {
      blob: new Blob([csvFor(run, rows)], { type: 'text/csv;charset=utf-8' }),
      filename: `${slug}-${stamp}.csv`,
    };
  }

  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text(run.name, 14, 16);
  doc.setFontSize(9);
  doc.text(`${run.scopeLabel} · ${clock.formatDubaiDateTime(run.fromMs)} — ${clock.formatDubaiDateTime(run.toMs)}`, 14, 22);
  doc.text(`Generated ${clock.formatDubaiDateTime(run.generatedAtMs)} · Kasper GPS prototype`, 14, 27);
  autoTable(doc, {
    startY: 32,
    head: [['Asset', 'Time (Dubai)', 'Latitude', 'Longitude', 'Speed km/h', 'Ignition']],
    body: rows.slice(0, 500).map(r => [r.asset, r.time, r.lat, r.lng, r.speed, r.ignition]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [20, 21, 24] },
  });
  return {
    blob: doc.output('blob'),
    filename: `${slug}-${stamp}.pdf`,
  };
}
