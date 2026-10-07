'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Badge, Button, EmptyState,
} from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import { getGrantEnd, getRelationship, hasCapability, isAssetVisible } from '@/server/access';
import { hasFeature } from '@/domain/features';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import { buildEcuBreakdown, ecuHoursAt } from '@/server/muc';
import { estimatedHoursAt } from '@/server/maintenance';
import {
  CUSTOMER_GEOFENCES_STORAGE_KEY, deriveGeofenceEvents, parseStoredGeofences, timestampMs, visitsFromGeofenceEvents,
} from '@/domain/geofences';
import { downloadXlsx, type ExportTable } from '@/lib/export';
import * as clock from '@/lib/clock';
import type { Asset, Geofence, GeofenceEvent, Reading, Session } from '@/domain/types';

type ReportType = 'trip_mileage' | 'location_history' | 'operating_hours' | 'fuel' | 'utilisation' | 'driving_events' | 'geofence';
type ScopeType = 'single_asset' | 'multiple_assets' | 'site';
type FormatType = 'pdf' | 'excel';

type ReportDefinition = {
  id: Exclude<ReportType, 'geofence'>;
  label: string;
  description: string;
  phase: 'day_one' | 'phase2';
  needs: string;
};

const REPORT_TYPES: ReportDefinition[] = [
  { id: 'trip_mileage', label: 'Trip & Mileage', description: 'Trips, distances, and trip duration', phase: 'day_one', needs: 'trips' },
  { id: 'location_history', label: 'Location history', description: 'Position history over time', phase: 'day_one', needs: 'history.track' },
  { id: 'operating_hours', label: 'Operating hours', description: 'Estimated ignition hours or ECU engine hours', phase: 'phase2', needs: 'hours.ignition' },
  { id: 'fuel', label: 'Fuel', description: 'Fuel used, refuels, drops, and fuel rate where reported', phase: 'phase2', needs: 'fuel.used' },
  { id: 'utilisation', label: 'Utilisation', description: 'Working, idling, off time, and reporting gaps', phase: 'phase2', needs: 'utilisation' },
  { id: 'driving_events', label: 'Driving events', description: 'Harsh driving and over-speed incidents', phase: 'phase2', needs: 'driving.events' },
];

const DATE_PRESETS = [
  { label: 'Last 24 hours', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
];

const DUBAI_DAY_MS = 86400000;
const MAX_READING_GAP_MS = 30 * 60 * 1000;

interface RentalWindow {
  startMs: number;
  endMs: number;
  past: boolean;
}

interface ReportSegment {
  asset: Asset;
  fromMs: number;
  toMs: number;
  rentalLabel?: string;
  pastRental: boolean;
}

interface ReportContent {
  columns: string[];
  rows: (string | number)[][];
}

function dateOnly(ms: number): string {
  return clock.dubaiToIso(ms).slice(0, 10);
}

function shiftDateOnly(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function dateStartMs(value: string): number {
  return new Date(`${value}T00:00:00+04:00`).getTime();
}

function dateEndExclusiveMs(value: string): number {
  return dateStartMs(shiftDateOnly(value, 1));
}

function ms(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : new Date(value).getTime();
}

function timeLabel(value: string | number): string {
  return clock.formatDubaiDateTime(ms(value));
}

function dateRangeLabel(fromMs: number, toMs: number): string {
  const lastIncluded = Math.max(fromMs, toMs - 1);
  return `${clock.formatDubaiDate(fromMs)}–${clock.formatDubaiDate(lastIncluded)}`;
}

function renterWindowsFor(session: Session, asset: Asset): RentalWindow[] {
  if (!session.tenantId || session.isKasper || asset.ownerTenantId === session.tenantId) return [];
  const nowMs = clock.now();
  return seed.bookings
    .filter(booking => booking.assetId === asset.id
      && booking.renterTenantId === session.tenantId
      && (booking.status === 'active' || booking.status === 'scheduled' || booking.status === 'closed' || booking.status === 'cancelled'))
    .filter(booking => session.siteIds.length === 0 || (booking.renterSiteId !== null && session.siteIds.includes(booking.renterSiteId)))
    .map(booking => {
      const startMs = ms(booking.start);
      const endMs = getGrantEnd(booking);
      return {
        startMs,
        endMs,
        past: booking.status === 'closed' || booking.status === 'cancelled' || endMs < nowMs,
      };
    })
    .filter(window => Number.isFinite(window.startMs) && Number.isFinite(window.endMs) && window.endMs > window.startMs)
    .sort((a, b) => a.startMs - b.startMs);
}

function reportAssetsFor(session: Session): Asset[] {
  return seed.assets.filter(asset => isAssetVisible(session, asset.id) || renterWindowsFor(session, asset).length > 0);
}

function fenceVisibleTo(session: Session, fence: Geofence): boolean {
  if (session.isKasper) return true;
  if (fence.tenantId !== session.tenantId) return false;
  if (session.siteIds.length > 0) return Boolean(fence.siteId && session.siteIds.includes(fence.siteId));
  return true;
}

function assetInFenceScope(asset: Asset, fence: Geofence): boolean {
  const assigned = fence.assetIds === 'all' || fence.assetIds.includes(asset.id);
  if (!assigned) return false;
  if (asset.ownerTenantId === fence.tenantId) return true;
  return seed.bookings.some(booking => booking.assetId === asset.id
    && booking.renterTenantId === fence.tenantId
    && (booking.status === 'active' || booking.status === 'scheduled' || booking.status === 'closed' || booking.status === 'cancelled'));
}

function scopedSiteAssets(session: Session, assets: Asset[], siteId: string): Asset[] {
  return assets.filter(asset => asset.homeSiteId === siteId || seed.bookings.some(booking =>
    booking.assetId === asset.id
    && booking.renterTenantId === session.tenantId
    && booking.renterSiteId === siteId
    && (booking.status === 'active' || booking.status === 'closed' || booking.status === 'cancelled'),
  ));
}

function clipToRentalWindows(session: Session, asset: Asset, fromMs: number, toMs: number): ReportSegment[] {
  const windows = renterWindowsFor(session, asset);
  if (windows.length === 0) return [{ asset, fromMs, toMs, pastRental: false }];
  return windows.flatMap(window => {
    const start = Math.max(fromMs, window.startMs);
    const end = Math.min(toMs, window.endMs);
    if (end <= start) return [];
    const rentalLabel = window.past
      ? `Past rental: ${dateRangeLabel(window.startMs, window.endMs)}`
      : dateRangeLabel(window.startMs, window.endMs);
    return [{ asset, fromMs: start, toMs: end, rentalLabel, pastRental: window.past }];
  });
}

function formatDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function distanceKm(a: Reading, b: Reading): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function tripRows(asset: Asset, readings: Reading[]): (string | number)[][] {
  const ordered = [...readings].sort((a, b) => ms(a.deviceTime) - ms(b.deviceTime));
  const trips: Reading[][] = [];
  let current: Reading[] = [];
  let previousMs: number | null = null;
  const finish = () => {
    if (current.length > 0) trips.push(current);
    current = [];
  };
  for (const reading of ordered) {
    const at = ms(reading.deviceTime);
    if (previousMs !== null && at - previousMs > MAX_READING_GAP_MS) finish();
    if (reading.ignition && reading.moving) current.push(reading);
    else finish();
    previousMs = at;
  }
  finish();
  return trips.map(points => {
    const first = points[0];
    const last = points[points.length - 1];
    let km = 0;
    for (let i = 1; i < points.length; i += 1) km += distanceKm(points[i - 1], points[i]);
    return [
      asset.code,
      timeLabel(first.deviceTime),
      timeLabel(last.deviceTime),
      formatDuration(ms(last.deviceTime) - ms(first.deviceTime)),
      Math.round(km * 10) / 10,
      `${first.lat.toFixed(5)}, ${first.lng.toFixed(5)}`,
      `${last.lat.toFixed(5)}, ${last.lng.toFixed(5)}`,
    ];
  });
}

function operatingHoursRows(segment: ReportSegment): (string | number)[][] {
  const asset = segment.asset;
  const hasEcuHours = hasFeature(asset, 'hours.ecu');
  const hasPartialEcuHours = hasFeature(asset, 'hours.ecuPartial');
  const usesEcuHours = hasEcuHours || hasPartialEcuHours;
  if (!usesEcuHours && !hasFeature(asset, 'hours.ignition')) return [];
  const rows: (string | number)[][] = [];
  let dayStart = clock.startOfDubaiDay(segment.fromMs);
  while (dayStart < segment.toMs) {
    const from = Math.max(segment.fromMs, dayStart);
    const to = Math.min(segment.toMs, dayStart + DUBAI_DAY_MS);
    const hours = usesEcuHours
      ? Math.max(0, ecuHoursAt(asset, to) - ecuHoursAt(asset, from))
      : Math.max(0, estimatedHoursAt(asset, to) - estimatedHoursAt(asset, from));
    rows.push([
      asset.code,
      clock.formatDubaiDate(dayStart),
      Math.round(hours * 10) / 10,
      hasEcuHours ? 'ECU (ALL-CAN300)' : hasPartialEcuHours ? 'ECU · partial' : 'Estimated (ignition hours)',
    ]);
    dayStart += DUBAI_DAY_MS;
  }
  return rows;
}

function fuelRows(segment: ReportSegment, readings: Reading[]): (string | number)[][] {
  const rows: (string | number)[][] = [];
  const ordered = [...readings].sort((a, b) => ms(a.deviceTime) - ms(b.deviceTime));
  let previousUsed: number | null = null;
  let previousLevel: number | null = null;
  for (const reading of ordered) {
    const at = timeLabel(reading.deviceTime);
    if (typeof reading.fuelUsedL === 'number') {
      if (previousUsed !== null && reading.fuelUsedL > previousUsed) {
        rows.push([segment.asset.code, at, 'Fuel used', Math.round((reading.fuelUsedL - previousUsed) * 10) / 10, 'L', 'ECU reading']);
      }
      previousUsed = reading.fuelUsedL;
    }
    if (typeof reading.fuelLevelPct === 'number') {
      if (previousLevel !== null) {
        const change = reading.fuelLevelPct - previousLevel;
        if (change >= 5) rows.push([segment.asset.code, at, 'Refuel', Math.round(change * 10) / 10, '%', 'Fuel level change']);
        if (change <= -5) rows.push([segment.asset.code, at, 'Fuel drop', Math.round(Math.abs(change) * 10) / 10, '%', 'Fuel level change']);
      }
      previousLevel = reading.fuelLevelPct;
    }
    if (typeof reading.fuelRateLph === 'number' && reading.fuelRateLph > 0) {
      rows.push([segment.asset.code, at, 'Fuel rate', Math.round(reading.fuelRateLph * 10) / 10, 'L/h', 'ECU reading']);
    }
  }
  const from = segment.fromMs;
  const to = segment.toMs;
  const alerts = seed.alerts.filter(alert => alert.assetId === segment.asset.id
    && alert.type === 'fuel_drop'
    && ms(alert.openedAt) >= from && ms(alert.openedAt) < to);
  for (const alert of alerts) {
    const alreadyReported = rows.some(row => row[1] === timeLabel(alert.openedAt) && row[2] === 'Fuel drop');
    if (!alreadyReported) rows.push([segment.asset.code, timeLabel(alert.openedAt), alert.detail, '—', '—', 'Recorded alert']);
  }
  return rows;
}

function utilisationRows(segment: ReportSegment): (string | number)[][] {
  const breakdown = buildEcuBreakdown(segment.asset, segment.fromMs, Math.max(segment.fromMs, segment.toMs - 1));
  const byDate = new Map(breakdown.days.map(day => [day.date, day]));
  const rows: (string | number)[][] = [];
  let dayStart = clock.startOfDubaiDay(segment.fromMs);
  while (dayStart < segment.toMs) {
    const day = byDate.get(clock.formatDubaiDate(dayStart));
    const from = Math.max(segment.fromMs, dayStart);
    const to = Math.min(segment.toMs, dayStart + DUBAI_DAY_MS);
    if (day && to > from) {
      const coveredHours = Math.max(0, (to - from) / 3600000);
      rows.push([
        segment.asset.code,
        day.date,
        day.workingHours,
        day.idlingHours,
        Math.round(Math.max(0, coveredHours - day.engineHours) * 10) / 10,
        day.gapMinutes,
      ]);
    }
    dayStart += DUBAI_DAY_MS;
  }
  return rows;
}

function drivingRows(segment: ReportSegment, readings: Reading[]): (string | number)[][] {
  const rows: (string | number)[][] = [];
  const labelForEvent: Record<string, string> = {
    harsh_brake: 'Harsh braking', harsh_accel: 'Harsh acceleration', harsh_corner: 'Harsh cornering', overspeed: 'Over-speed',
  };
  for (const reading of readings) {
    if (!reading.event || !labelForEvent[reading.event]) continue;
    rows.push([segment.asset.code, timeLabel(reading.deviceTime), labelForEvent[reading.event], reading.speedKmh, 'Reading history']);
  }
  const alerts = seed.alerts.filter(alert => alert.assetId === segment.asset.id
    && (alert.type === 'overspeed' || alert.type === 'harsh_driving')
    && ms(alert.openedAt) >= segment.fromMs && ms(alert.openedAt) < segment.toMs);
  for (const alert of alerts) {
    const event = alert.type === 'overspeed' ? 'Over-speed' : 'Harsh driving';
    if (!rows.some(row => row[1] === timeLabel(alert.openedAt) && row[2] === event)) {
      rows.push([segment.asset.code, timeLabel(alert.openedAt), event, alert.detail, 'Recorded alert']);
    }
  }
  return rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
}

function geofenceRows(
  session: Session,
  segments: ReportSegment[],
  fences: Geofence[],
): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const segment of segments) {
    for (const fence of fences) {
      if (!assetInFenceScope(segment.asset, fence)) continue;
      const renter = !session.isKasper && segment.asset.ownerTenantId !== session.tenantId;
      // Owners can use earlier context to pair a visit; renter history never reads outside its clipped rental window.
      const readFrom = renter ? segment.fromMs : Math.max(0, segment.fromMs - 12 * 3600000);
      const readings = getReadingsForAsset(segment.asset, readFrom, Math.max(readFrom, segment.toMs - 1));
      const tracker = seed.trackers.find(item => item.assetId === segment.asset.id);
      const allowedGap = tracker?.pingIntervalSec
        ? Math.max(MAX_READING_GAP_MS, tracker.pingIntervalSec * 3 * 1000)
        : MAX_READING_GAP_MS;
      const seeded = seed.geofenceEvents.filter(event => event.geofenceId === fence.id && event.assetId === segment.asset.id)
        .filter(event => {
          const at = timestampMs(event.at);
          return at >= readFrom && at < segment.toMs;
        });
      const derived = deriveGeofenceEvents(fence, segment.asset.id, readings, allowedGap)
        .filter(event => timestampMs(event.at) >= readFrom && timestampMs(event.at) < segment.toMs);
      const unique = new Map<string, GeofenceEvent>();
      for (const event of [...seeded, ...derived]) {
        const key = `${event.type}:${Math.round(timestampMs(event.at) / 60000)}`;
        if (!unique.has(key)) unique.set(key, event);
      }
      const visits = visitsFromGeofenceEvents([...unique.values()], segment.toMs)
        .filter(visit => visit.exitedAt === null || visit.exitedAt >= segment.fromMs)
        .filter(visit => visit.enteredAt < segment.toMs);
      const visitCounts = new Map<string, number>();
      visits.forEach(visit => visitCounts.set(visit.assetId, (visitCounts.get(visit.assetId) ?? 0) + 1));
      for (const visit of visits) {
        rows.push([
          segment.asset.code,
          fence.name,
          timeLabel(visit.enteredAt),
          visit.exitedAt === null ? 'Still inside at period end' : timeLabel(visit.exitedAt),
          visit.dwellMs === null ? '—' : formatDuration(visit.dwellMs),
          visitCounts.get(visit.assetId) ?? 1,
        ]);
      }
    }
  }
  return rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[2]).localeCompare(String(b[2])));
}

function generateContent(type: ReportType, session: Session, segments: ReportSegment[], fences: Geofence[]): ReportContent {
  if (type === 'trip_mileage') {
    return {
      columns: ['Asset', 'Trip start (GST)', 'Trip end (GST)', 'Duration', 'Distance (km)', 'Start position', 'End position'],
      rows: segments.flatMap(segment => tripRows(segment.asset, getReadingsForAsset(segment.asset, segment.fromMs, Math.max(segment.fromMs, segment.toMs - 1)))),
    };
  }
  if (type === 'location_history') {
    return {
      columns: ['Asset', 'Time (GST)', 'Latitude', 'Longitude', 'Speed (km/h)', 'Ignition', 'Moving'],
      rows: segments.flatMap(segment => getReadingsForAsset(segment.asset, segment.fromMs, Math.max(segment.fromMs, segment.toMs - 1)).map(reading => [
        segment.asset.code, timeLabel(reading.deviceTime), reading.lat.toFixed(6), reading.lng.toFixed(6), reading.speedKmh,
        reading.ignition ? 'On' : 'Off', reading.moving ? 'Yes' : 'No',
      ])),
    };
  }
  if (type === 'operating_hours') {
    return { columns: ['Asset', 'Day', 'Operating hours', 'Basis'], rows: segments.flatMap(operatingHoursRows) };
  }
  if (type === 'fuel') {
    return {
      columns: ['Asset', 'Time (GST)', 'Event', 'Value', 'Unit', 'Source'],
      rows: segments.flatMap(segment => fuelRows(segment, getReadingsForAsset(segment.asset, segment.fromMs, Math.max(segment.fromMs, segment.toMs - 1)))),
    };
  }
  if (type === 'utilisation') {
    return { columns: ['Asset', 'Day', 'Working (h)', 'Idling (h)', 'Off (h)', 'Gap (min)'], rows: segments.flatMap(utilisationRows) };
  }
  if (type === 'driving_events') {
    return {
      columns: ['Asset', 'Time (GST)', 'Event', 'Reading / detail', 'Source'],
      rows: segments.flatMap(segment => drivingRows(segment, getReadingsForAsset(segment.asset, segment.fromMs, Math.max(segment.fromMs, segment.toMs - 1)))),
    };
  }
  return {
    columns: ['Asset', 'Geofence', 'Time in (GST)', 'Time out (GST)', 'Dwell time', 'Visits in period'],
    rows: geofenceRows(session, segments, fences),
  };
}

function reportFilename(label: string, scope: ScopeType, siteName: string, from: string, to: string): string {
  const reportSlug = label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const scopeSlug = scope === 'site' ? `site_${siteName.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}` : scope;
  return `Kasper_${reportSlug}_${scopeSlug}_${from}_to_${to}`;
}

function downloadReportPdf(input: {
  fileName: string;
  title: string;
  company: string;
  assetNames: string[];
  period: string;
  generatedAt: string;
  generatedBy: string;
  summary: ExportTable;
  data: ExportTable;
  rentalHeader: string;
}): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const margin = 34;
  const pageWidth = doc.internal.pageSize.getWidth();

  // Kasper wordmark and report header block.
  doc.setFillColor(20, 21, 24);
  doc.roundedRect(margin, 22, 31, 27, 4, 4, 'F');
  doc.setTextColor(255, 196, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('K', margin + 9, 42);
  doc.setTextColor(20, 21, 24);
  doc.setFontSize(18);
  doc.text('Kasper', margin + 42, 42);
  doc.setFontSize(12);
  doc.setTextColor(91, 95, 102);
  doc.text(input.title, margin, 68);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(20, 21, 24);
  const assetsText = input.assetNames.length > 0 ? input.assetNames.join(', ') : 'None';
  const headerLines = [
    `Company: ${input.company}`,
    `Assets: ${assetsText}`,
    `Period: ${input.period}`,
    `Generated: ${input.generatedAt} by ${input.generatedBy}`,
    'Times in Dubai time (GST)',
    ...(input.rentalHeader ? [input.rentalHeader] : []),
  ];
  const splitLines = doc.splitTextToSize(headerLines.join('   ·   '), pageWidth - margin * 2);
  doc.text(splitLines, margin, 84);
  let startY = 84 + splitLines.length * 11 + 8;

  autoTable(doc, {
    head: [input.summary.columns],
    body: input.summary.rows.map(row => row.map(String)),
    startY,
    styles: { fontSize: 8, cellPadding: 4, textColor: [20, 21, 24] },
    headStyles: { fillColor: [20, 21, 24], textColor: [255, 255, 255] },
    margin: { left: margin, right: margin },
  });
  startY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY) + 18;
  if (startY > doc.internal.pageSize.getHeight() - 60) {
    doc.addPage();
    startY = margin;
  }
  doc.setFontSize(10);
  doc.setTextColor(20, 21, 24);
  doc.text(input.data.title, margin, startY);
  autoTable(doc, {
    head: [input.data.columns],
    body: input.data.rows.map(row => row.map(String)),
    startY: startY + 8,
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak', textColor: [20, 21, 24] },
    headStyles: { fillColor: [20, 21, 24], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [246, 246, 243] },
    margin: { left: margin, right: margin, bottom: 32 },
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(91, 95, 102);
    doc.text(`Kasper · ${input.title}`, margin, doc.internal.pageSize.getHeight() - 14);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 14, { align: 'right' });
  }
  doc.save(`${input.fileName}.pdf`);
}

function rentalHeaderFor(segments: ReportSegment[]): string {
  const labels = [...new Set(segments.map(segment => segment.rentalLabel).filter((label): label is string => Boolean(label)))];
  return labels.length > 0 ? `Limited to your rental period: ${labels.join('; ')}` : '';
}

export default function ReportsPage() {
  const session = useStore.getState().session;
  const phase = useStore.getState().demoSwitches.phase;
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [scope, setScope] = useState<ScopeType>('multiple_assets');
  const [format, setFormat] = useState<FormatType>('excel');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [presetDays, setPresetDays] = useState<number | null>(30);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>(() => session ? reportAssetsFor(session).map(asset => asset.id) : []);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [geofences, setGeofences] = useState<Geofence[]>(() => seed.geofences.map(fence => ({ ...fence })));
  const [runMessage, setRunMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!session || typeof window === 'undefined') return;
    setSelectedAssetIds(reportAssetsFor(session).map(asset => asset.id));
  }, [session]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setGeofences(parseStoredGeofences(window.localStorage.getItem(CUSTOMER_GEOFENCES_STORAGE_KEY), seed.geofences));
    } catch {
      setGeofences(seed.geofences.map(fence => ({ ...fence })));
    }
  }, []);

  const reportAssets = useMemo(() => session ? reportAssetsFor(session) : [], [session]);
  const visibleGeofences = useMemo(() => session ? geofences.filter(fence => fenceVisibleTo(session, fence)) : [], [session, geofences]);

  useEffect(() => {
    if (typeof window === 'undefined' || visibleGeofences.length === 0) return;
    if (new URLSearchParams(window.location.search).get('type') === 'geofence') setSelectedReport('geofence');
  }, [visibleGeofences.length]);
  const siteOptions = useMemo(() => {
    if (!session) return [];
    return seed.sites.filter(site => session.isKasper
      || (session.role === 'site_user' ? session.siteIds.includes(site.id) : site.tenantId === session.tenantId));
  }, [session]);

  const availableReports = useMemo(() => {
    const normalReports = REPORT_TYPES.filter(report => {
      if (report.phase === 'phase2' && phase === 'day_one') return false;
      return reportAssets.some(asset => hasFeature(asset, report.needs));
    });
    const geofenceReport = phase !== 'day_one' && visibleGeofences.length > 0
      ? [{ id: 'geofence' as const, label: 'Geofence report', description: 'Entry, exit, dwell time, and visits per asset and fence', phase: 'phase2' as const, needs: 'geofence' }]
      : [];
    return [...normalReports, ...geofenceReport];
  }, [phase, reportAssets, visibleGeofences]);

  const nowMs = clock.now();
  const today = dateOnly(nowMs);
  const effectiveDateTo = presetDays !== null ? today : dateTo;
  const effectiveDateFrom = presetDays !== null ? dateOnly(nowMs - presetDays * DUBAI_DAY_MS) : dateFrom;
  const fromMs = presetDays !== null
    ? nowMs - presetDays * DUBAI_DAY_MS
    : effectiveDateFrom ? dateStartMs(effectiveDateFrom) : Number.NaN;
  const requestedToMs = presetDays !== null
    ? nowMs + 1
    : effectiveDateTo ? dateEndExclusiveMs(effectiveDateTo) : Number.NaN;
  const toMs = Math.min(requestedToMs, nowMs + 1);
  const validRange = Number.isFinite(fromMs) && Number.isFinite(requestedToMs) && fromMs < toMs;
  const periodLabel = presetDays !== null
    ? `${clock.formatDubaiDateTime(fromMs)} to ${clock.formatDubaiDateTime(Math.max(fromMs, toMs - 1))}`
    : `${effectiveDateFrom} to ${effectiveDateTo}`;
  const fileDateFrom = Number.isFinite(fromMs) ? dateOnly(fromMs) : 'invalid';
  const fileDateTo = Number.isFinite(toMs) ? dateOnly(Math.max(fromMs, toMs - 1)) : 'invalid';

  const selectedAssets = useMemo(() => {
    if (scope === 'site') return session && selectedSiteId ? scopedSiteAssets(session, reportAssets, selectedSiteId) : [];
    if (scope === 'single_asset') return reportAssets.filter(asset => selectedAssetIds.includes(asset.id)).slice(0, 1);
    return reportAssets.filter(asset => selectedAssetIds.includes(asset.id));
  }, [scope, session, reportAssets, selectedSiteId, selectedAssetIds]);

  const previewSegments = useMemo(() => {
    if (!validRange || !session) return [];
    return selectedAssets.flatMap(asset => clipToRentalWindows(session, asset, fromMs, toMs));
  }, [validRange, session, selectedAssets, fromMs, toMs]);
  const rentalHeader = rentalHeaderFor(previewSegments);
  const pastRentalNotes = [...new Set(previewSegments.filter(segment => segment.pastRental).map(segment => segment.rentalLabel).filter((label): label is string => Boolean(label)))];
  const canRunReport = Boolean(session && hasCapability(session, 'report.run'));
  const selectedReportDefinition = availableReports.find(report => report.id === selectedReport);
  const reportLabel = selectedReportDefinition?.label ?? 'Geofence report';

  const generateReport = useCallback((requestedFormat: FormatType) => {
    if (!session || !selectedReport || !canRunReport) return;
    if (!availableReports.some(report => report.id === selectedReport)) {
      setRunMessage({ tone: 'error', text: 'That report is not available for the current assets or phase.' });
      return;
    }
    if (!validRange) {
      setRunMessage({ tone: 'error', text: 'Choose a valid date range.' });
      return;
    }
    if (selectedAssets.length === 0) {
      setRunMessage({ tone: 'error', text: 'Choose at least one asset or site.' });
      return;
    }
    const segments = selectedAssets.flatMap(asset => clipToRentalWindows(session, asset, fromMs, toMs));
    const content = generateContent(selectedReport, session, segments, visibleGeofences);
    if (content.rows.length === 0) {
      setRunMessage({ tone: 'error', text: 'Nothing to report for this period.' });
      return;
    }

    const selectedAssetCodes = [...new Set(segments.map(segment => segment.asset.code))];
    const company = session.isKasper
      ? 'All tenants'
      : seed.tenants.find(tenant => tenant.id === session.tenantId)?.name ?? session.user.name;
    const generatedAt = clock.formatDubaiDateTime(clock.now());
    const scopeLabel = scope === 'site'
      ? seed.sites.find(site => site.id === selectedSiteId)?.name ?? 'Site'
      : scope;
    const fileName = reportFilename(reportLabel, scope, scopeLabel, fileDateFrom, fileDateTo);
    const summaryRows: (string | number)[][] = [
      ['Company', company],
      ['Report', reportLabel],
      ['Scope', scopeLabel],
      ['Assets included', selectedAssetCodes.join(', ')],
      ['Requested period', periodLabel],
      ['Rows', content.rows.length],
      ['Generated at (GST)', generatedAt],
      ['Time zone', 'GST (Dubai)'],
      ['Generated by', session.user.name],
      ...(rentalHeader ? [['Rental limit', rentalHeader] as (string | number)[]] : []),
      ...[...new Set(segments.filter(segment => segment.pastRental && segment.rentalLabel).map(segment => segment.rentalLabel!))]
        .map(note => ['Rental history', note] as (string | number)[]),
    ];
    const summary: ExportTable = { title: 'Summary', columns: ['Field', 'Value'], rows: summaryRows };
    const data: ExportTable = { title: reportLabel, columns: content.columns, rows: content.rows };

    if (requestedFormat === 'excel') {
      downloadXlsx({ fileName, subtitle: `${reportLabel} · ${periodLabel}` }, [summary, data]);
    } else {
      downloadReportPdf({
        fileName,
        title: reportLabel,
        company,
        assetNames: selectedAssetCodes,
        period: periodLabel,
        generatedAt,
        generatedBy: session.user.name,
        summary,
        data,
        rentalHeader,
      });
    }
    setRunMessage({ tone: 'ok', text: `${content.rows.length.toLocaleString('en-US')} rows prepared.` });
  }, [
    session, selectedReport, canRunReport, availableReports, validRange, selectedAssets, fromMs, toMs,
    visibleGeofences, reportLabel, scope, selectedSiteId, effectiveDateFrom, effectiveDateTo,
    fileDateFrom, fileDateTo, periodLabel, rentalHeader,
  ]);

  const toggleAsset = (assetId: string) => setSelectedAssetIds(current => current.includes(assetId)
    ? current.filter(id => id !== assetId)
    : [...current, assetId]);

  const selectAllAssets = () => setSelectedAssetIds(reportAssets.map(asset => asset.id));
  const clearAssets = () => setSelectedAssetIds([]);
  const selectCustomRange = () => {
    setDateFrom(dateOnly(fromMs));
    setDateTo(dateOnly(Math.max(fromMs, toMs - 1)));
    setPresetDays(null);
  };

  if (!session) return null;
  if (!canRunReport) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="text-sm font-semibold text-ink">Page not found</div>
          <div className="text-sm text-grey-500 mt-1">This page isn&apos;t available for your role.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Reports</h1>
        <p className="mt-1 text-sm text-grey-500">Run an asset report for a date range. Report times use Dubai time (GST).</p>
      </div>

      <section>
        <div className="mb-2 text-sm font-medium text-ink">Report type</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {availableReports.map(report => (
            <button
              key={report.id}
              onClick={() => { setSelectedReport(report.id); setRunMessage(null); }}
              className={clsx(
                'rounded-lg border px-4 py-3 text-left transition-colors',
                selectedReport === report.id ? 'border-ink bg-surface' : 'border-line bg-paper hover:border-grey-500',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink">{report.label}</span>
                {report.id === 'geofence' && <Badge variant="grey">Phase 2</Badge>}
              </div>
              <div className="mt-0.5 text-xs text-grey-500">{report.description}</div>
              {report.id !== 'geofence' && <div className="mt-1 text-[11px] text-grey-500">{report.phase === 'day_one' ? 'Day one' : 'Phase 2'}</div>}
            </button>
          ))}
          {availableReports.length === 0 && <EmptyState title="No reports available" description="No visible asset supports a report in the current phase." />}
        </div>
      </section>

      {selectedReport && (
        <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <div>
            <div className="text-sm font-medium text-ink">Scope</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {([
                ['single_asset', 'Single asset'],
                ['multiple_assets', 'Multiple assets'],
                ['site', 'Site'],
              ] as [ScopeType, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setScope(id)} className={clsx(
                  'rounded-lg border px-3 py-2 text-xs transition-colors',
                  scope === id ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-grey-700 hover:border-grey-500',
                )}>{label}</button>
              ))}
            </div>
          </div>

          {(scope === 'single_asset' || scope === 'multiple_assets') && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium text-grey-500">{scope === 'single_asset' ? 'Select one asset' : 'Select assets'}</div>
                {scope === 'multiple_assets' && <div className="flex gap-3 text-xs"><button onClick={selectAllAssets} className="text-grey-700 underline">Select all</button><button onClick={clearAssets} className="text-grey-700 underline">Clear</button></div>}
              </div>
              <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-lg border border-line bg-paper-2 p-2">
                {reportAssets.map(asset => {
                  const selected = selectedAssetIds.includes(asset.id);
                  return (
                    <button key={asset.id} onClick={() => scope === 'single_asset' ? setSelectedAssetIds([asset.id]) : toggleAsset(asset.id)} className={clsx(
                      'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                      selected ? 'border-ink bg-surface text-ink' : 'border-line bg-paper text-grey-700 hover:border-grey-500',
                    )}>
                      {scope === 'multiple_assets' && <input type="checkbox" checked={selected} readOnly className="accent-yellow" />}
                      <span className="font-mono font-medium">{asset.code}</span><span className="text-grey-500">{asset.name}</span>
                      {getRelationship(session, asset.id) === 'renter' && <Badge variant="yellow">Rented</Badge>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {scope === 'site' && (
            <label className="block max-w-xl text-xs font-medium text-grey-500">
              Site
              <select value={selectedSiteId} onChange={event => setSelectedSiteId(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-grey-700 focus:border-ink focus:outline-none">
                <option value="">Choose a site</option>
                {siteOptions.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </label>
          )}

          <div className="space-y-2">
            <div className="text-xs font-medium text-grey-500">Date range</div>
            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map(preset => (
                <button key={preset.days} onClick={() => { setPresetDays(preset.days); setRunMessage(null); }} className={clsx(
                  'rounded-lg border px-3 py-2 text-xs transition-colors',
                  presetDays === preset.days ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-grey-700 hover:border-grey-500',
                )}>{preset.label}</button>
              ))}
              <button onClick={selectCustomRange} className={clsx(
                'rounded-lg border px-3 py-2 text-xs transition-colors',
                presetDays === null ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-grey-700 hover:border-grey-500',
              )}>Custom</button>
            </div>
            {presetDays === null && (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <label className="text-xs text-grey-500">From<input type="date" max={today} value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-grey-700" /></label>
                <span className="hidden text-xs text-grey-500 sm:block">to</span>
                <label className="text-xs text-grey-500">To<input type="date" max={today} value={dateTo} onChange={event => setDateTo(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-grey-700" /></label>
              </div>
            )}
          </div>

          {previewSegments.length > 0 && (rentalHeader || pastRentalNotes.length > 0) && (
            <div className="rounded-lg border border-yellow-dark/30 bg-yellow/5 px-3 py-2 text-xs text-grey-700">
              {rentalHeader && <div>{rentalHeader}</div>}
              {pastRentalNotes.map(note => <div key={note}>{note}</div>)}
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-grey-500">Format</div>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setFormat('excel')} className={clsx('rounded-lg border px-3 py-2 text-xs', format === 'excel' ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-grey-700')}>Excel (.xlsx)</button>
              <button onClick={() => setFormat('pdf')} className={clsx('rounded-lg border px-3 py-2 text-xs', format === 'pdf' ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-grey-700')}>PDF</button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <div className="text-xs text-grey-500">
              {validRange ? `${periodLabel} · ${selectedAssets.length} asset${selectedAssets.length === 1 ? '' : 's'}` : 'Choose a valid date range.'}
            </div>
            <Button disabled={!selectedReport || !validRange} onClick={() => generateReport(format)}>Run report</Button>
          </div>
          {runMessage && (
            <div className={runMessage.tone === 'ok' ? 'rounded-lg border border-green/30 bg-green/10 px-3 py-2 text-sm text-green' : 'rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-sm text-red'} role="status">
              {runMessage.text}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
