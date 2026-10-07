'use client';

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Button, EmptyState } from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { isAssetVisible, getRelationship, rentalWindow } from '@/server/access';
import { can } from '@/server/capabilities';
import { hasFeature } from '@/domain/features';
import { getReadingsForAsset } from '@/server/telemetry/simulator';
import type { Asset, Reading, ReportFormat } from '@/domain/types';

type ReportType = 'trip_mileage' | 'location_history' | 'operating_hours' | 'fuel' | 'utilisation' | 'driving_events';
type ScopeType = 'single_asset' | 'multiple_assets' | 'site';
type ExportFormat = ReportFormat;
type Cell = string | number;
type ExportRow = Record<string, Cell>;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LOCATION_ROWS = 2_000;

const REPORT_TYPES: { id: ReportType; label: string; description: string; phase: 'day_one' | 'phase2'; feature: string }[] = [
  { id: 'trip_mileage', label: 'Trip & Mileage', description: 'Trip start and end times, distance, and speed', phase: 'day_one', feature: 'trips' },
  { id: 'location_history', label: 'Location history', description: 'Timestamped positions for the selected period', phase: 'day_one', feature: 'history.track' },
  { id: 'operating_hours', label: 'Operating hours', description: 'Ignition hours and ECU engine hours where measured', phase: 'phase2', feature: 'hours.ignition' },
  { id: 'fuel', label: 'Fuel', description: 'Fuel readings and measured usage where available', phase: 'phase2', feature: 'fuel.used' },
  { id: 'utilisation', label: 'Utilisation', description: 'Working, idling, and off time', phase: 'phase2', feature: 'utilisation' },
  { id: 'driving_events', label: 'Driving events', description: 'Harsh driving and over-speed readings', phase: 'phase2', feature: 'driving.events' },
];

function toMillis(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : new Date(value).getTime();
}

function dubaiDateInput(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(ms));
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function inputDateMs(value: string, endOfDay = false): number {
  if (!value) return Number.NaN;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}+04:00`);
  return date.getTime();
}

function supportsReport(asset: Asset, report: ReportType): boolean {
  switch (report) {
    case 'trip_mileage': return hasFeature(asset, 'trips');
    case 'location_history': return hasFeature(asset, 'history.track');
    case 'operating_hours': return hasFeature(asset, 'hours.ignition') || hasFeature(asset, 'hours.ecu') || hasFeature(asset, 'hours.ecuPartial');
    case 'fuel': return hasFeature(asset, 'fuel.used') || hasFeature(asset, 'fuel.level');
    case 'utilisation': return hasFeature(asset, 'utilisation');
    case 'driving_events': return hasFeature(asset, 'driving.events');
  }
}

function getTripRows(asset: Asset, readings: Reading[]): ExportRow[] {
  const groups: Reading[][] = [];
  let group: Reading[] = [];
  let previousAt: number | null = null;
  for (const reading of readings) {
    const at = toMillis(reading.deviceTime);
    const moving = reading.ignition && reading.speedKmh >= 3;
    if (moving && previousAt !== null && at - previousAt > 15 * 60 * 1000 && group.length) {
      groups.push(group);
      group = [];
    }
    if (moving) {
      group.push(reading);
      previousAt = at;
    } else if (previousAt !== null && at - previousAt > 15 * 60 * 1000 && group.length) {
      groups.push(group);
      group = [];
      previousAt = null;
    }
  }
  if (group.length) groups.push(group);
  return groups.map((items, index) => {
    const first = items[0];
    const last = items[items.length - 1];
    return {
      Asset: asset.code,
      Trip: index + 1,
      Start: clock.formatDubaiDateTime(toMillis(first.deviceTime)),
      End: clock.formatDubaiDateTime(toMillis(last.deviceTime)),
      'Distance (km)': Math.max(0, last.gnssOdometerKm - first.gnssOdometerKm).toFixed(1),
      'Duration (min)': Math.max(0, (toMillis(last.deviceTime) - toMillis(first.deviceTime)) / 60_000).toFixed(0),
      'Max speed (km/h)': Math.max(...items.map(item => item.speedKmh)).toFixed(0),
    };
  });
}

function measuredHours(readings: Reading[]): number {
  let milliseconds = 0;
  for (let index = 1; index < readings.length; index += 1) {
    const previous = readings[index - 1];
    const current = readings[index];
    const gap = toMillis(current.deviceTime) - toMillis(previous.deviceTime);
    if (previous.ignition && gap > 0 && gap <= 15 * 60 * 1000) milliseconds += gap;
  }
  return milliseconds / 3_600_000;
}

function buildRows(asset: Asset, report: ReportType, readings: Reading[]): ExportRow[] {
  if (readings.length === 0) return [];
  if (report === 'location_history') {
    const stride = Math.max(1, Math.ceil(readings.length / MAX_LOCATION_ROWS));
    return readings.filter((_, index) => index % stride === 0).map(reading => ({
      Asset: asset.code,
      Time: clock.formatDubaiDateTime(toMillis(reading.deviceTime)),
      Latitude: reading.lat.toFixed(6),
      Longitude: reading.lng.toFixed(6),
      'Speed (km/h)': reading.speedKmh.toFixed(1),
      Ignition: reading.ignition ? 'On' : 'Off',
      'GPS distance (km)': reading.gnssOdometerKm.toFixed(1),
    }));
  }
  if (report === 'trip_mileage') return getTripRows(asset, readings);
  if (report === 'operating_hours') {
    const measured = measuredHours(readings);
    const ecuValues = readings.map(reading => reading.engineHours).filter((value): value is number => value !== undefined && Number.isFinite(value));
    return [{
      Asset: asset.code,
      'Ignition hours (estimated)': measured.toFixed(2),
      'Engine hours (ECU)': ecuValues.length > 1 ? Math.max(0, ecuValues[ecuValues.length - 1] - ecuValues[0]).toFixed(2) : 'Not measured',
      Basis: ecuValues.length > 1 ? 'ECU and Estimated' : 'Estimated',
    }];
  }
  if (report === 'fuel') {
    const used = readings.map(reading => reading.fuelUsedL).filter((value): value is number => value !== undefined && Number.isFinite(value));
    const levels = readings.map(reading => reading.fuelLevelPct).filter((value): value is number => value !== undefined && Number.isFinite(value));
    const usedTotal = used.length > 1 ? Math.max(0, used[used.length - 1] - used[0]) : null;
    return [{
      Asset: asset.code,
      'Fuel used (L)': usedTotal === null ? 'Not measured' : usedTotal.toFixed(1),
      'Latest fuel level (%)': levels.length ? levels[levels.length - 1].toFixed(0) : 'Not measured',
      Basis: usedTotal === null && levels.length === 0 ? 'Not measured' : 'ECU',
    }];
  }
  if (report === 'utilisation') {
    let runningMs = 0;
    let idlingMs = 0;
    for (let index = 1; index < readings.length; index += 1) {
      const previous = readings[index - 1];
      const current = readings[index];
      const gap = toMillis(current.deviceTime) - toMillis(previous.deviceTime);
      if (gap <= 0 || gap > 15 * 60 * 1000 || !previous.ignition) continue;
      if (previous.speedKmh >= 3) runningMs += gap;
      else idlingMs += gap;
    }
    return [{
      Asset: asset.code,
      'Working (h)': (runningMs / 3_600_000).toFixed(2),
      'Idling (h)': (idlingMs / 3_600_000).toFixed(2),
      'Off (h)': Math.max(0, (toMillis(readings[readings.length - 1].deviceTime) - toMillis(readings[0].deviceTime) - runningMs - idlingMs) / 3_600_000).toFixed(2),
      Basis: 'Estimated from ignition and speed',
    }];
  }
  return readings.filter(reading => reading.event).map(reading => ({
    Asset: asset.code,
    Time: clock.formatDubaiDateTime(toMillis(reading.deviceTime)),
    Event: reading.event ?? '',
    'Speed (km/h)': reading.speedKmh.toFixed(1),
    Latitude: reading.lat.toFixed(6),
    Longitude: reading.lng.toFixed(6),
  }));
}

function safeSlug(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export default function ReportsPage() {
  const session = useStore(state => state.session);
  const phase = useStore(state => state.demoSwitches.phase);
  const now = clock.now();
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [scope, setScope] = useState<ScopeType>('multiple_assets');
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [dateFrom, setDateFrom] = useState(() => dubaiDateInput(now - 7 * DAY_MS));
  const [dateTo, setDateTo] = useState(() => dubaiDateInput(now));
  const [presetDays, setPresetDays] = useState<number | null>(7);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('');
  const [nothingToReport, setNothingToReport] = useState(false);

  const visibleAssets = useMemo(() => {
    if (!session || !can(session, 'report.run')) return [];
    return seed.assets.filter(asset => !asset.retiredAt && isAssetVisible(session, asset.id) && can(session, 'asset.view', asset.id));
  }, [session]);
  const availableReports = useMemo(() => REPORT_TYPES.filter(report => {
    if (report.phase === 'phase2' && phase === 'day_one') return false;
    return visibleAssets.some(asset => supportsReport(asset, report.id));
  }), [phase, visibleAssets]);
  const sites = useMemo(() => {
    const ids = new Set(visibleAssets.map(asset => asset.homeSiteId));
    return seed.sites.filter(site => ids.has(site.id));
  }, [visibleAssets]);
  const currentSiteId = selectedSiteId || sites[0]?.id || '';
  const selectedAssets = useMemo(() => {
    if (scope === 'site') return visibleAssets.filter(asset => asset.homeSiteId === currentSiteId);
    if (scope === 'single_asset') return visibleAssets.filter(asset => asset.id === selectedAssetIds[0]);
    return visibleAssets.filter(asset => selectedAssetIds.includes(asset.id));
  }, [currentSiteId, scope, selectedAssetIds, visibleAssets]);
  const requestedFrom = inputDateMs(dateFrom);
  const requestedTo = inputDateMs(dateTo, true);
  const validDateRange = Number.isFinite(requestedFrom) && Number.isFinite(requestedTo) && requestedFrom <= requestedTo;

  const rentalLimits = useMemo(() => {
    if (!session) return [];
    return selectedAssets.flatMap(asset => {
      if (getRelationship(session, asset.id) !== 'renter') return [];
      const window = rentalWindow(session, asset.id);
      return window ? [{ asset, start: toMillis(window.start), end: toMillis(window.end) }] : [];
    });
  }, [selectedAssets, session]);
  const rentalLimitText = rentalLimits.length
    ? `Limited to your rental period: ${rentalLimits.map(limit => `${limit.asset.code} ${clock.formatDubaiDate(limit.start)} to ${clock.formatDubaiDate(limit.end)}`).join('; ')}`
    : '';

  const setPreset = (days: number) => {
    const current = clock.now();
    setPresetDays(days);
    setDateFrom(dubaiDateInput(current - days * DAY_MS));
    setDateTo(dubaiDateInput(current));
  };

  const toggleAsset = (assetId: string) => {
    if (scope === 'single_asset') {
      setSelectedAssetIds([assetId]);
      return;
    }
    setSelectedAssetIds(current => current.includes(assetId)
      ? current.filter(id => id !== assetId)
      : [...current, assetId]);
  };

  const buildExportRows = (): ExportRow[] => {
    const selectedDefinition = REPORT_TYPES.find(report => report.id === selectedReport);
    if (!selectedReport || !selectedDefinition || (selectedDefinition.phase === 'phase2' && phase === 'day_one') || !validDateRange) return [];
    return selectedAssets.flatMap(asset => {
      if (!supportsReport(asset, selectedReport)) return [];
      let start = requestedFrom;
      let end = requestedTo;
      if (session && getRelationship(session, asset.id) === 'renter') {
        const window = rentalWindow(session, asset.id);
        if (!window) return [];
        start = Math.max(start, toMillis(window.start));
        end = Math.min(end, toMillis(window.end));
      }
      if (end < start) return [];
      const boundedEnd = Math.min(end, clock.now());
      if (boundedEnd < start) return [];
      const readings = getReadingsForAsset(asset, start, boundedEnd);
      return buildRows(asset, selectedReport, readings);
    });
  };

  const runReport = async () => {
    if (!session || !can(session, 'report.run')) {
      setNotice('You cannot run reports.');
      return;
    }
    const selectedDefinition = REPORT_TYPES.find(report => report.id === selectedReport);
    if (!selectedReport || !selectedDefinition || (selectedDefinition.phase === 'phase2' && phase === 'day_one') || !selectedAssets.length || !validDateRange) {
      setNothingToReport(true);
      setNotice('Choose a report, at least one asset or site, and a valid date range.');
      return;
    }
    setRunning(true);
    setNotice('');
    setNothingToReport(false);
    try {
      const rows = buildExportRows();
      if (rows.length === 0) {
        setNothingToReport(true);
        setNotice('Nothing to report for this period.');
        return;
      }
      const report = REPORT_TYPES.find(item => item.id === selectedReport)!;
      const fromName = dateFrom;
      const toName = dateTo;
      const scopeName = scope;
      const fileName = `Kasper_${safeSlug(report.label)}_${scopeName}_${fromName}_to_${toName}.${format}`;
      const columns = Object.keys(rows[0]);
      const exportRows = rows.map(row => columns.map(column => String(row[column] ?? '')));
      const header = [
        ['Kasper GPS', report.label],
        ['Period', `${dateFrom} to ${dateTo}`],
        ...(rentalLimitText ? [[rentalLimitText]] : []),
      ];

      if (format === 'xlsx') {
        const XLSX = await import('xlsx');
        const workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.aoa_to_sheet([...header, columns, ...exportRows]);
        XLSX.utils.book_append_sheet(workbook, sheet, 'Report');
        XLSX.writeFile(workbook, fileName);
      } else {
        const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
        const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' });
        doc.setFontSize(14);
        doc.text('Kasper GPS', 14, 16);
        doc.setFontSize(11);
        doc.text(report.label, 14, 23);
        doc.setFontSize(9);
        doc.text(`Period: ${dateFrom} to ${dateTo}`, 14, 30);
        const startY = 38;
        const rentalHeader = rentalLimitText ? doc.splitTextToSize(rentalLimitText, doc.internal.pageSize.getWidth() - 28) : [];
        if (rentalHeader.length) doc.text(rentalHeader, 14, startY);
        autoTableModule.default(doc, {
          startY: rentalHeader.length ? startY + rentalHeader.length * 4 + 2 : startY,
          head: [columns],
          body: exportRows,
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [20, 21, 24] },
        });
        doc.save(fileName);
      }

      seed.reportRuns.push({
        id: `rr-${seed.reportRuns.length + 1}`,
        userId: session.userId,
        reportType: report.label,
        scope: scopeName,
        from: requestedFrom,
        to: requestedTo,
        format,
        createdAt: clock.now(),
        status: 'ready',
        fileName,
      });
      const sequence = seed.auditEntries.length + 1;
      seed.auditEntries.push({
        id: `au-${String(sequence).padStart(3, '0')}`,
        at: clock.now(),
        actorUserId: session.userId,
        action: 'report.run',
        tenantId: session.tenantId ?? undefined,
        detail: `${report.label} report downloaded (${scopeName}, ${dateFrom} to ${dateTo})`,
      });
      setNotice(`Downloaded ${fileName}`);
    } catch {
      setNotice('The report could not be created. Try another format or date range.');
    } finally {
      setRunning(false);
    }
  };

  if (!session) return null;
  const reportPermission = can(session, 'report.run');

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold text-ink">Reports</h1>
        <p className="mt-1 text-sm text-grey-500">Choose a report, scope, period, and file format.</p>
      </header>

      {notice && <p role="status" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-grey-700">{notice}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Report type</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {availableReports.map(report => (
            <button
              key={report.id}
              type="button"
              onClick={() => { setSelectedReport(report.id); setNothingToReport(false); }}
              aria-pressed={selectedReport === report.id}
              className={clsx('rounded-lg border p-3 text-left transition-colors', selectedReport === report.id ? 'border-ink bg-surface' : 'border-line bg-paper hover:border-grey-500')}
            >
              <span className="block text-sm font-medium text-ink">{report.label}</span>
              <span className="mt-1 block text-xs text-grey-500">{report.description}</span>
            </button>
          ))}
          {availableReports.length === 0 && <EmptyState title="No reports available" description="No supported report types are available for the assets you can view in this phase." />}
        </div>
      </section>

      {selectedReport && availableReports.some(report => report.id === selectedReport) && (
        <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Scope</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['single_asset', 'multiple_assets', 'site'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value)}
                  aria-pressed={scope === value}
                  className={clsx('rounded-lg border px-3 py-1.5 text-xs', scope === value ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-grey-700')}
                >
                  {value === 'single_asset' ? 'Single asset' : value === 'multiple_assets' ? 'Multiple assets' : 'Site'}
                </button>
              ))}
            </div>
          </div>

          {scope === 'site' ? (
            <label className="block text-xs font-medium text-grey-500">
              Site
              <select value={currentSiteId} onChange={event => setSelectedSiteId(event.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink">
                {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </label>
          ) : scope === 'single_asset' ? (
            <label className="block text-xs font-medium text-grey-500">
              Asset
              <select value={selectedAssetIds[0] ?? ''} onChange={event => setSelectedAssetIds(event.target.value ? [event.target.value] : [])} className="mt-1 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink">
                <option value="">Choose an asset</option>
                {visibleAssets.filter(asset => supportsReport(asset, selectedReport)).map(asset => <option key={asset.id} value={asset.id}>{asset.code} — {asset.name}</option>)}
              </select>
            </label>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-grey-500">Select assets</span>
                <button type="button" className="text-xs text-grey-700 underline" onClick={() => setSelectedAssetIds(selectedAssetIds.length === visibleAssets.length ? [] : visibleAssets.filter(asset => supportsReport(asset, selectedReport)).map(asset => asset.id))}>
                  {selectedAssetIds.length ? 'Clear selection' : 'Select supported assets'}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {visibleAssets.filter(asset => supportsReport(asset, selectedReport)).map(asset => (
                  <label key={asset.id} className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-grey-700">
                    <input type="checkbox" checked={selectedAssetIds.includes(asset.id)} onChange={() => toggleAsset(asset.id)} className="accent-ink" />
                    <span><span className="font-mono font-medium text-ink">{asset.code}</span> — {asset.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-ink">Date range</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {[1, 7, 30].map(days => (
                <button key={days} type="button" onClick={() => setPreset(days)} aria-pressed={presetDays === days} className={clsx('rounded-lg border px-3 py-1.5 text-xs', presetDays === days ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-grey-700')}>
                  Last {days === 1 ? '24 hours' : `${days} days`}
                </button>
              ))}
              <button type="button" onClick={() => setPresetDays(null)} aria-pressed={presetDays === null} className={clsx('rounded-lg border px-3 py-1.5 text-xs', presetDays === null ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-grey-700')}>Custom</button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-xs text-grey-500">From <input type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPresetDays(null); }} className="ml-1 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs text-ink" /></label>
              <label className="text-xs text-grey-500">To <input type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); setPresetDays(null); }} className="ml-1 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs text-ink" /></label>
            </div>
            {!validDateRange && <p className="mt-2 text-xs text-red">Choose a valid date range.</p>}
            {rentalLimitText && <p className="mt-2 rounded-lg bg-paper-2 px-3 py-2 text-xs text-grey-700">{rentalLimitText}</p>}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-ink">Format</h2>
            <div className="mt-2 flex gap-2">
              {(['xlsx', 'pdf'] as const).map(value => (
                <button key={value} type="button" onClick={() => setFormat(value)} aria-pressed={format === value} className={clsx('rounded-lg border px-3 py-1.5 text-xs', format === value ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-grey-700')}>
                  {value === 'xlsx' ? 'Excel (.xlsx)' : 'PDF'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <span className="text-xs text-grey-500">
              {selectedAssets.length ? `${selectedAssets.length} asset${selectedAssets.length === 1 ? '' : 's'} in scope` : 'Choose assets or a site'}
            </span>
            <Button type="button" onClick={runReport} loading={running} disabled={!reportPermission || running}>
              Run report
            </Button>
          </div>
          {nothingToReport && <EmptyState title="Nothing to report" description="No readings were found for the selected assets and period." />}
        </section>
      )}
    </div>
  );
}
