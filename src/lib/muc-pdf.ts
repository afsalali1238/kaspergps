// Monthly Utilisation Certificate PDF (spec §11.5 MUC, S36–S39).
// One page (or two) per certificate: meter summary, day table, gap rule,
// seal hash, and a QR + verify code that resolves to the public verify page.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import type { Muc } from '@/domain/types';
import * as clock from '@/lib/clock';

export function mucVerifyUrl(muc: Muc): string {
  return `https://kaspergps.ae/verify/${encodeURIComponent(muc.number)}`;
}

function fmt(ms: string | number): string {
  return clock.formatDubaiDateTime(typeof ms === 'number' ? ms : new Date(ms).getTime());
}

function fmtDate(ms: string | number): string {
  return clock.formatDubaiDate(typeof ms === 'number' ? ms : new Date(ms).getTime());
}

export function mucFileName(muc: Muc): string {
  const code = muc.payload.asset.code.replace(/\s+/g, '');
  return `Kasper_MUC_${code}_${muc.number}`;
}

/**
 * Builds the certificate PDF and returns it as a Uint8Array.
 * Split from downloadMucPdf so it can be tested without a DOM.
 */
export async function buildMucPdf(muc: Muc): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const p = muc.payload;

  doc.setFontSize(16);
  doc.text('Kasper GPS', 40, 48);
  doc.setFontSize(12);
  doc.text('Monthly Utilisation Certificate', 40, 68);
  doc.setFontSize(9);
  doc.text(`Certificate ${muc.number} · ${muc.status}`, 40, 84);

  autoTable(doc, {
    startY: 100,
    head: [['Field', 'Value']],
    body: [
      ['Asset', `${p.asset.code} — ${p.asset.name} (${p.asset.make} ${p.asset.model}, ${p.asset.serial})`],
      ['Owner', p.owner.name],
      ['Renter', p.renter?.name ?? '—'],
      ['Period', `${fmt(p.periodFrom)} to ${fmt(p.periodTo)}`],
      ['Opening meter (ECU)', `${p.openingHoursEcu.toFixed(1)} h`],
      ['Closing meter (ECU)', `${p.closingHoursEcu.toFixed(1)} h`],
      ['Billable hours', `${p.billableHours.toFixed(1)} h`],
      ['Meter source', 'ECU'],
      ['Gap rule', 'Delta disclosed — gaps are never interpolated'],
      ['Issued', `${fmt(muc.issuedAt)} by ${muc.issuedBy}`],
      ...(muc.voidedAt ? [['Voided', fmt(muc.voidedAt)]] : []),
    ],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [20, 21, 24], textColor: [255, 255, 255] },
    margin: { left: 40, right: 40 },
  });

  const afterSummary = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;

  autoTable(doc, {
    startY: afterSummary + 16,
    head: [['Day', 'Engine (h)', 'Working (h)', 'Idling (h)', 'Gap (min)']],
    body: p.days.map(d => [
      d.date,
      d.engineHours.toFixed(1),
      d.workingHours.toFixed(1),
      d.idlingHours.toFixed(1),
      d.gapMinutes ? String(d.gapMinutes) : '—',
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [20, 21, 24], textColor: [255, 255, 255] },
    margin: { left: 40, right: 40 },
  });

  const afterDays = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 300;
  let y = afterDays + 20;

  if (y > 640) {
    doc.addPage();
    y = 60;
  }

  if (p.gaps.length > 0) {
    doc.setFontSize(9);
    doc.text(`Gaps: ${p.gaps.map(g => `${fmtDate(g.from)} ${typeof g.from === 'number' ? clock.formatDubaiTime(g.from) : ''}–${typeof g.to === 'number' ? clock.formatDubaiTime(g.to) : ''}`).join('; ')}`, 40, y, { maxWidth: 515 });
    y += 24;
  }

  // Verification block: QR + code + URL
  const verifyUrl = mucVerifyUrl(muc);
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 160 });
  doc.setFontSize(10);
  doc.text('Verify this certificate', 40, y);
  y += 8;
  doc.addImage(qrDataUrl, 'PNG', 40, y, 96, 96);
  doc.setFontSize(8);
  doc.text('Scan the code or open the URL below:', 152, y + 12);
  doc.setFontSize(9);
  doc.text(muc.number, 152, y + 30);
  doc.text(verifyUrl, 152, y + 46, { maxWidth: 360 });

  doc.setFontSize(7);
  doc.text('Seal (SHA-256):', 152, y + 70);
  doc.setFontSize(6.5);
  doc.text(muc.sealSha256, 152, y + 82, { maxWidth: 360 });

  return new Uint8Array(doc.output('arraybuffer'));
}

/** Browser: build and save the certificate PDF. */
export async function downloadMucPdf(muc: Muc): Promise<void> {
  const bytes = await buildMucPdf(muc);
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${mucFileName(muc)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
