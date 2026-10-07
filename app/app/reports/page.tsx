'use client';

import React, { useState, useMemo } from 'react';
import clsx from 'clsx';
import {
  Button, EmptyState,
} from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { isAssetVisible, hasCapability } from '@/server/access';
import { FEATURES } from '@/domain/features';
import { useT } from '@/i18n';

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

const DATE_PRESETS: { key: string; label: string; days: number }[] = [
  { key: 'last_24h', label: 'Last 24 hours', days: 1 },
  { key: 'last_7d', label: 'Last 7 days', days: 7 },
  { key: 'last_30d', label: 'Last 30 days', days: 30 },
];

export default function ReportsPage() {
  const t = useT();
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [scope, setScope] = useState<ScopeType>('multiple_assets');
  const [format, setFormat] = useState<FormatType>('excel');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [presetDays, setPresetDays] = useState<number | null>(null);

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
        <div className="text-sm font-medium text-ink mb-2">{t('reports.type', 'Report type')}</div>
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
              <div className="font-medium text-ink">{t(`reports.types.${report.id}`, report.label)}</div>
              <div className="text-xs text-grey-500 mt-0.5">{t(`reports.types.${report.id}_desc`, report.description)}</div>
              <div className="text-xs text-grey-500 mt-1">
                {report.phase === 'day_one' ? 'Day one' : report.phase === 'phase2' ? 'Phase 2' : 'Later'}
              </div>
            </button>
          ))}
          {availableReports.length === 0 && (
            <div className="text-sm text-grey-500 p-4 bg-paper rounded-lg border border-line">
              {t('reports.none_available', 'No reports available for the current phase.')}
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
              {t('reports.scope_single', 'Single asset')}
            </button>
            <button
              onClick={() => setScope('multiple_assets')}
              className={clsx(
                'px-3 py-2 text-xs rounded-lg border transition-colors',
                scope === 'multiple_assets' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
              )}
            >
              {t('reports.scope_multiple', 'Multiple assets')}
            </button>
            <button
              onClick={() => setScope('site')}
              className={clsx(
                'px-3 py-2 text-xs rounded-lg border transition-colors',
                scope === 'site' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
              )}
            >
              {t('reports.scope_site', 'Site')}
            </button>
          </div>

          {/* Asset selection for single/multiple scope */}
          {(scope === 'single_asset' || scope === 'multiple_assets') && (
            <div className="space-y-2">
              <div className="text-xs text-grey-500 font-medium">
                {scope === 'single_asset'
                  ? t('reports.select_asset', 'Select an asset')
                  : t('reports.select_assets', 'Select assets (hold Ctrl/Cmd to multi-select)')}
              </div>
              <div className="flex flex-wrap gap-2">
                {visibleAssets.map(asset => (
                  <button
                    key={asset.id}
                    className={clsx(
                      'px-3 py-2 text-xs rounded-lg border transition-colors flex items-center gap-1',
                      'bg-paper border-line text-grey-700 hover:border-grey-500'
                    )}
                  >
                    <span className="font-mono font-medium">{asset.code}</span>
                    <span className="text-grey-500">{asset.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date presets */}
          <div className="space-y-2">
            <div className="text-xs text-grey-500 font-medium">{t('reports.date_range', 'Date range')}</div>
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
                  {t(`reports.presets.${preset.key}`, preset.label)}
                </button>
              ))}
              <button
                onClick={() => setPresetDays(null)}
                className={clsx(
                  'px-3 py-2 text-xs rounded-lg border transition-colors',
                  presetDays === null ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                )}
              >
                {t('reports.presets.custom', 'Custom')}
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
                <span className="text-grey-500">to</span>
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
                {t('reports.excel', 'Excel (.xlsx)')}
              </button>
              <button
                onClick={() => setFormat('pdf')}
                className={clsx(
                  'px-3 py-2 text-xs rounded-lg border transition-colors',
                  format === 'pdf' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                )}
              >
                {t('reports.pdf', 'PDF')}
              </button>
            </div>
          </div>

          {/* Run button */}
          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-grey-500">
              {effectiveDateFrom && effectiveDateTo && (
                <span>
                  {t('reports.range_line', 'From {from} to {to}', { from: effectiveDateFrom, to: effectiveDateTo })}
                </span>
              )}
            </div>
            {canRunReport && (
              <Button onClick={() => {}}>
                {t('reports.run', 'Run report')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Nothing to report state */}
      {selectedReport && effectiveDateFrom && effectiveDateTo && (
        <div className="text-center py-8">
          <EmptyState
            title={t('reports.nothing', 'Nothing to report for this period')}
            description={t('reports.nothing_hint', 'There is no data available for the selected date range.')}
          />
        </div>
      )}
    </div>
  );
}
