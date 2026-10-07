// File exports used by reports and billing (spec 11.17 / 11.19: PDF and Excel).
// Everything is generated in the browser from the rows on screen. Dummy data only.

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExportTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface ExportMeta {
  fileName: string;
  subtitle?: string;
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv(meta: ExportMeta, table: ExportTable): void {
  const lines = [table.columns.map(csvCell).join(','), ...table.rows.map(r => r.map(csvCell).join(','))];
  triggerDownload(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `${meta.fileName}.csv`);
}

export function downloadXlsx(meta: ExportMeta, tables: ExportTable[]): void {
  const workbook = XLSX.utils.book_new();
  tables.forEach((table, index) => {
    const sheet = XLSX.utils.aoa_to_sheet([table.columns, ...table.rows]);
    const name = (table.title || `Sheet${index + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  });
  const out = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  triggerDownload(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${meta.fileName}.xlsx`);
}

export function downloadPdf(meta: ExportMeta, tables: ExportTable[]): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text('Kasper GPS', 40, 40);
  doc.setFontSize(10);
  doc.text(meta.subtitle ?? meta.fileName, 40, 58);

  let startY = 80;
  tables.forEach(table => {
    if (table.title) {
      doc.setFontSize(11);
      doc.text(table.title, 40, startY);
      startY += 8;
    }
    autoTable(doc, {
      head: [table.columns],
      body: table.rows.map(r => r.map(v => String(v))),
      startY: startY + 8,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [20, 21, 24], textColor: [255, 255, 255] },
      margin: { left: 40, right: 40 },
    });
    startY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY;
    startY += 24;
  });

  doc.save(`${meta.fileName}.pdf`);
}

export function downloadBoth(meta: ExportMeta, tables: ExportTable[]): void {
  downloadXlsx(meta, tables);
  downloadPdf(meta, tables);
}
