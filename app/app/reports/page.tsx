'use client';

import React, { useState, useMemo } from 'react';
import clsx from 'clsx';
import {
  Button, EmptyState,
} from '@/components/ui';
import { useStore } from '@/store';
import { useT } from '@/lib/useT';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { isAssetVisible, hasCapability } from '@/server/access';
import { FEATURES } from '@/domain/features';
import { createRun, createSchedule, nextRunAfter, type ScheduleFrequency } from '@/server/reports';
import { buildReportFile } from '@/lib/report-file';

type ReportType = 'trip_mileage' | 'location_history' | 'operating_hours' | 'fuel' | 'utilisation' | 'driving_events';
type ScopeType = 'single_asset' | 'multiple_assets' | 'site';
type FormatType = 'pdf' | 'excel';

const REPORT_TYPES: {
  id: ReportType;
  label: string;
  description: string;
  phase: 'day_one' | 'phase2' | 'later';
  needs: string;
}[] = [
  {
    id: 'trip_mileage',
    label: 'Trip & Mileage',
    description: 'Trips, distances, and mileage',
    phase: 'day_one',
    needs: 'trips',
  },
  {
    id: 'location_history',
    label: 'Location history',
    description: 'Position history over time',
    phase: 'day_one',
    needs: 'history.track',
  },
  {
    id: 'operating_hours',
    label: 'Operating hours',
    description: 'Ignition hours (estimated) and ECU engine hours',
    phase: 'phase2',
    needs: 'hours.ignition',
  },
  {
    id: 'fuel',
    label: 'Fuel',
    description: 'Fuel used, refuels, drops, and L/h',
    phase: 'phase2',
    needs: 'fuel.used',
  },
  {
    id: 'utilisation',
    label: 'Utilisation',
    description: 'Working, idling, and off time',
    phase: 'phase2',
    needs: 'utilisation',
  },
  {
    id: 'driving_events',
    label: 'Driving events',
    description: 'Harsh events and over-speed incidents',
    phase: 'phase2',
    needs: 'driving.events',
  },
];

const DATE_PRESETS = [
  { label: 'Last 24 hours', key: 'common.last24h', days: 1 },
  { label: 'Last 7 days', key: 'common.last7d', days: 7 },
  { label: 'Last 30 days', key: 'common.last30d', days: 30 },
];

const REPORT_DESCRIPTION_KEYS: Record<ReportType, { key: string; fallback: string }> = {
  trip_mileage: { key: 'reports.types.tripMileageDescription', fallback: 'Trips, distances, and mileage' },
  location_history: { key: 'reports.types.locationHistoryDescription', fallback: 'Position history over time' },
  operating_hours: { key: 'reports.types.operatingHoursDescription', fallback: 'Ignition hours (estimated) and ECU engine hours' },
  fuel: { key: 'reports.types.fuelDescription', fallback: 'Fuel used, refuels, drops, and L/h' },
  utilisation: { key: 'reports.types.utilisationDescription', fallback: 'Working, idling, and off time' },
  driving_events: { key: 'reports.types.drivingEventsDescription', fallback: 'Harsh events and over-speed incidents' },
};

const PHASE_KEYS: Record<string, { key: string; fallback: string }> = {
  day_one: { key: 'reports.phases.dayOne', fallback: 'Day one' },
  phase2: { key: 'reports.phases.phase2', fallback: 'Phase 2' },
  later: { key: 'reports.phases.later', fallback: 'Later' },
};

const REPORT_LABELS: Record<ReportType, { key: string; fallback: string }> = {
  trip_mileage: { key: 'reports.types.tripAndMileage', fallback: 'Trip & Mileage' },
  location_history: { key: 'reports.types.locationHistory', fallback: 'Location history' },
  operating_hours: { key: 'reports.types.operatingHours', fallback: 'Operating hours' },
  fuel: { key: 'reports.types.fuel', fallback: 'Fuel' },
  utilisation: { key: 'reports.types.utilisation', fallback: 'Utilisation' },
  driving_events: { key: 'reports.types.drivingEvents', fallback: 'Driving events' },
};

export default function ReportsPage() {
  const store = useStore;
  const { t } = useT();
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [scope, setScope] = useState<ScopeType>('multiple_assets');
  const [format, setFormat] = useState<FormatType>('excel');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [presetDays, setPresetDays] = useState<number | null>(7);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [frequency, setFrequency] = useState<ScheduleFrequency>('daily');
  const [hour, setHour] = useState(7);

  // Visible assets for the current user
  const visibleAssets = useMemo(() => {
    if (!session) return [];
    return seed.assets.filter(a => isAssetVisible(session, a.id));
  }, [session]);

  // Available report types based on phase and visible assets
  const availableReports = useMemo(() => {
    return REPORT_TYPES.filter(report => {
      // Check phase
      if (report.phase === 'phase2' && phase === 'day_one') return false;
      if (report.phase === 'later' && phase !== 'later') return false;

      // Check if any visible asset supports this report
      return visibleAssets.some(() => {
        const featureKey = report.needs;
        return FEATURES.some(f => f.key === featureKey);
      });
    });
  }, [visibleAssets, phase]);

  // Date handling
  const effectiveDateFrom = useMemo(() => {
    if (dateFrom) return dateFrom;
    if (presetDays !== null) {
      const from = new Date(clock.dubaiNow());
      from.setDate(from.getDate() - presetDays);
      return from.toISOString().split('T')[0];
    }
    return '';
  }, [dateFrom, presetDays]);

  const effectiveDateTo = useMemo(() => {
    if (dateTo) return dateTo;
    return new Date(clock.dubaiNow()).toISOString().split('T')[0];
  }, [dateTo]);

  const canRunReport = hasCapability(session!, 'report.run');

  if (!session) return null;

  const chosenAssetIds = selectedAssetIds.length > 0 ? selectedAssetIds : visibleAssets.slice(0, 1).map(a => a.id);
  const reportName = selectedReport
    ? `${t(REPORT_LABELS[selectedReport].key, REPORT_LABELS[selectedReport].fallback)} — ${chosenAssetIds
        .map(id => seed.assets.find(a => a.id === id)?.code ?? id)
        .join(', ')}`
    : '';
  // The label describes what was actually chosen, not the scope radio.
  const reportScope =
    scope === 'site' ? 'Site' : chosenAssetIds.length > 1 ? 'Multiple assets' : 'Single asset';

  const periodBounds = () => {
    const toMs = effectiveDateTo
      ? new Date(`${effectiveDateTo}T23:59:59+04:00`).getTime()
      : clock.now();
    const fromMs = effectiveDateFrom
      ? new Date(`${effectiveDateFrom}T00:00:00+04:00`).getTime()
      : toMs - 24 * 3600000;
    return { fromMs, toMs };
  };

  const onRunReport = async () => {
    if (!selectedReport) return;
    setStatus(null);
    const { fromMs, toMs } = periodBounds();
    const run = createRun(session, {
      type: selectedReport,
      name: reportName,
      scopeLabel: reportScope,
      assetIds: chosenAssetIds,
      fromMs,
      toMs,
      format,
    });
    if (run.status === 'skipped') {
      setStatus(run.skippedReason ?? '');
      return;
    }
    const file = await buildReportFile(run);
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(t('reports.runCreated', 'Report generated — it is listed in Downloads.'));
  };

  const onScheduleReport = () => {
    if (!selectedReport) return;
    createSchedule(session, {
      type: selectedReport,
      name: reportName,
      assetIds: chosenAssetIds,
      format,
      frequency,
      hour,
    });
    setScheduleOpen(false);
    setStatus(t('reports.scheduleCreated', 'Schedule saved — see Schedules for its next run.'));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-ink">{t('reports.title', 'Reports')}</h1>
        <p className="text-sm text-grey-500 mt-1">
          {t('reports.subtitle', 'Run reports on your assets. Choose a report type, scope, and date range.')}
        </p>
      </div>

      {/* Report selection */}
      <div>
        <div className="text-sm font-medium text-ink mb-2">{t('reports.reportType', 'Report type')}</div>
        <div className="grid gap-2">
          {availableReports.map(report => (
            <button
              key={report.id}
              onClick={() => setSelectedReport(report.id)}
              className={clsx(
                'text-left px-4 py-3 rounded-lg border transition-colors',
                selectedReport === report.id
                  ? 'bg-surface border-ink'
                  : 'bg-paper border-line hover:border-grey-500'
              )}
            >
              <div className="font-medium text-ink">
                {t(REPORT_LABELS[report.id].key, REPORT_LABELS[report.id].fallback)}
              </div>
              <div className="text-xs text-grey-500 mt-0.5">
                {t(REPORT_DESCRIPTION_KEYS[report.id].key, REPORT_DESCRIPTION_KEYS[report.id].fallback)}
              </div>
              <div className="text-xs text-grey-500 mt-1">
                {t(PHASE_KEYS[report.phase].key, PHASE_KEYS[report.phase].fallback)}
              </div>
            </button>
          ))}
          {availableReports.length === 0 && (
            <div className="text-sm text-grey-500 p-4 bg-paper rounded-lg border border-line">
              {t('reports.noneInPhase', 'No reports available for the current phase.')}
            </div>
          )}
        </div>
      </div>

      {/* Scope selection */}
      {selectedReport && (
        <div className="space-y-4">
          <div className="text-sm font-medium text-ink mb-2">{t('reports.scope', 'Scope')}</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setScope('single_asset')}
              className={clsx(
                'px-3 py-2 text-xs rounded-lg border transition-colors',
                scope === 'single_asset' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
              )}
            >
              {t('reports.scopeSingle', 'Single asset')}
            </button>
            <button
              onClick={() => setScope('multiple_assets')}
              className={clsx(
                'px-3 py-2 text-xs rounded-lg border transition-colors',
                scope === 'multiple_assets' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
              )}
            >
              {t('reports.scopeMultiple', 'Multiple assets')}
            </button>
            <button
              onClick={() => setScope('site')}
              className={clsx(
                'px-3 py-2 text-xs rounded-lg border transition-colors',
                scope === 'site' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
              )}
            >
              {t('reports.scopeSite', 'Site')}
            </button>
          </div>

          {/* Asset selection for single/multiple scope */}
          {(scope === 'single_asset' || scope === 'multiple_assets') && (
            <div className="space-y-2">
              <div className="text-xs text-grey-500 font-medium">
                {scope === 'single_asset'
                  ? t('reports.selectAsset', 'Select an asset')
                  : t('reports.selectAssets', 'Select assets (hold Ctrl/Cmd to multi-select)')}
              </div>
              <div className="flex flex-wrap gap-2">
                {visibleAssets.map(asset => {
                  const chosen = selectedAssetIds.includes(asset.id);
                  return (
                    <button
                      key={asset.id}
                      onClick={() =>
                        setSelectedAssetIds(prev =>
                          scope === 'single_asset'
                            ? [asset.id]
                            : chosen
                              ? prev.filter(id => id !== asset.id)
                              : [...prev, asset.id],
                        )
                      }
                      className={clsx(
                        'px-3 py-2 text-xs rounded-lg border transition-colors flex items-center gap-1',
                        chosen
                          ? 'bg-ink text-white border-ink'
                          : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                      )}
                    >
                      <span className="font-mono font-medium">{asset.code}</span>
                      <span className={chosen ? 'text-paper/70' : 'text-grey-500'}>{asset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Date presets */}
          <div className="space-y-2">
            <div className="text-xs text-grey-500 font-medium">{t('reports.dateRange', 'Date range')}</div>
            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => setPresetDays(preset.days)}
                  className={clsx(
                    'px-3 py-2 text-xs rounded-lg border transition-colors',
                    presetDays === preset.days ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                  )}
                >
                  {t(preset.key, preset.label)}
                </button>
              ))}
              <button
                onClick={() => setPresetDays(null)}
                className={clsx(
                  'px-3 py-2 text-xs rounded-lg border transition-colors',
                  presetDays === null ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                )}
              >
                {t('downloads.custom', 'Custom')}
              </button>
            </div>
            {presetDays === null && (
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                />
                <span className="text-grey-500">{t('reports.to', 'to')}</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                />
              </div>
            )}
          </div>

          {/* Format selection */}
          <div className="space-y-2">
            <div className="text-xs text-grey-500 font-medium">{t('reports.format', 'Format')}</div>
            <div className="flex gap-2">
              <button
                onClick={() => setFormat('excel')}
                className={clsx(
                  'px-3 py-2 text-xs rounded-lg border transition-colors',
                  format === 'excel' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                )}
              >
                {t('reports.formatExcel', 'Excel (.xlsx)')}
              </button>
              <button
                onClick={() => setFormat('pdf')}
                className={clsx(
                  'px-3 py-2 text-xs rounded-lg border transition-colors',
                  format === 'pdf' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                )}
              >
                {t('reports.formatPdf', 'PDF')}
              </button>
            </div>
          </div>

          {/* Run button */}
          <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <div className="text-xs text-grey-500">
              {effectiveDateFrom && effectiveDateTo && (
                <span>
                  {t('reports.fromTo', `From ${effectiveDateFrom} to ${effectiveDateTo}`, {
                    from: effectiveDateFrom,
                    to: effectiveDateTo,
                  })}
                  {' · '}
                  {t(
                    'reports.assetCount',
                    chosenAssetIds.length === 1 ? '1 asset' : `${chosenAssetIds.length} assets`,
                    { count: chosenAssetIds.length },
                  )}
                </span>
              )}
            </div>
            {canRunReport && (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setScheduleOpen(!scheduleOpen)}>
                  {t('reports.scheduleThis', 'Schedule this report')}
                </Button>
                <Button onClick={() => void onRunReport()}>
                  {t('reports.run', 'Run report')}
                </Button>
              </div>
            )}
          </div>

          {scheduleOpen && (
            <div className="bg-paper-2 border border-line rounded-lg p-3 flex flex-wrap items-end gap-2">
              <label className="text-xs text-grey-500">
                {t('schedules.frequencyLabel', 'Frequency')}
                <select
                  value={frequency}
                  onChange={e => setFrequency(e.target.value as ScheduleFrequency)}
                  className="block mt-1 px-2 py-1.5 text-xs rounded-lg border border-line bg-paper text-grey-700"
                >
                  <option value="daily">{t('schedules.frequency.daily', 'Daily')}</option>
                  <option value="weekly">{t('schedules.frequency.weekly', 'Weekly')}</option>
                  <option value="monthly">{t('schedules.frequency.monthly', 'Monthly')}</option>
                </select>
              </label>
              <label className="text-xs text-grey-500">
                {t('schedules.hourLabel', 'Hour (Dubai)')}
                <select
                  value={hour}
                  onChange={e => setHour(Number(e.target.value))}
                  className="block mt-1 px-2 py-1.5 text-xs rounded-lg border border-line bg-paper text-grey-700"
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </label>
              <div className="text-xs text-grey-500 pb-2">
                {t('schedules.deliverTo', `Deliver to ${session.user.email}`, { email: session.user.email })}
                {' · '}
                {t('schedules.firstRun', `first run ${clock.formatDubaiDateTime(nextRunAfter(clock.now(), frequency, hour))}`, {
                  time: clock.formatDubaiDateTime(nextRunAfter(clock.now(), frequency, hour)),
                })}
              </div>
              <Button size="sm" onClick={onScheduleReport}>
                {t('common.save', 'Save')}
              </Button>
            </div>
          )}

          {status && (
            <div className="text-sm text-ink bg-paper-2 border border-line rounded-lg px-3 py-2">{status}</div>
          )}
        </div>
      )}

      {/* Nothing to report state */}
      {selectedReport && effectiveDateFrom && effectiveDateTo && (
        <div className="text-center py-8">
          <EmptyState
            title="Nothing to report for this period"
            description="There is no data available for the selected date range."
          />
        </div>
      )}
    </div>
  );
}
