'use client';

// Reports (spec §11.5): pick a report type (gated by the selected assets'
// hardware and the demo phase), a scope and a date range; run it to get a PDF or
// Excel file, recorded in Downloads. Renters' ranges are clipped to their rental
// windows with a header line. "Schedule this report" creates a §11.13 schedule.

import React, { useState, useMemo } from 'react';
import clsx from 'clsx';
import { Button, EmptyState } from '@/components/ui';
import { useDb, availableReportTypes, reportableAssets, pastRentalLabel, runReport, REPORT_TYPES, type ReportTypeId, createSchedule, type ScheduleFrequency, can } from '@/server/api';
import * as clock from '@/lib/clock';

import { downloadPdf, downloadXlsx, type ExportTable } from '@/lib/export';
import { useT } from '@/i18n';
import { useSession, useSwitches } from '@/hooks';

const DATE_PRESETS: { key: string; label: string; days: number }[] = [
  { key: 'last_24h', label: 'Last 24 hours', days: 1 },
  { key: 'last_7d', label: 'Last 7 days', days: 7 },
  { key: 'last_30d', label: 'Last 30 days', days: 30 },
];

type ScopeType = 'single_asset' | 'multiple_assets' | 'site';

export default function ReportsPage() {
  const seed = useDb(s => s);
  const t = useT();
  const session = useSession();
  const { phase } = useSwitches();

  const [selectedReport, setSelectedReport] = useState<ReportTypeId | null>(null);
  const [scope, setScope] = useState<ScopeType>('multiple_assets');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [siteId, setSiteId] = useState<string>('');
  const [format, setFormat] = useState<'xlsx' | 'pdf'>('xlsx');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [presetDays, setPresetDays] = useState<number | null>(7);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clipNotes, setClipNotes] = useState<string[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedFreq, setSchedFreq] = useState<ScheduleFrequency>('daily');
  const [schedTime, setSchedTime] = useState('18:00');
  const [schedWeekday, setSchedWeekday] = useState(1);
  const [schedMessage, setSchedMessage] = useState<string | null>(null);

  const assets = useMemo(() => (session ? reportableAssets(session) : []), [session]);

  const scopeAssetIds = useMemo(() => {
    if (scope === 'site') return assets.filter(a => a.homeSiteId === siteId).map(a => a.id);
    return selectedAssetIds;
  }, [scope, siteId, selectedAssetIds, assets]);

  // §11.5: a report type is listed only if at least one selected (or visible)
  // asset supports it, and the phase allows it.
  const availableReports = useMemo(() => {
    if (!session) return [];
    const ids = scopeAssetIds.length ? scopeAssetIds : assets.map(a => a.id);
    return availableReportTypes(session, ids, phase);
  }, [session, scopeAssetIds, assets, phase]);

  const effectiveFrom = useMemo(() => {
    if (dateFrom) return dateFrom;
    if (presetDays !== null) {
      return clock.dubaiDateKey(clock.now() - presetDays * 86_400_000);
    }
    return '';
  }, [dateFrom, presetDays]);

  const effectiveTo = useMemo(() => {
    if (dateTo) return dateTo;
    return clock.dubaiDateKey(clock.now());
  }, [dateTo]);

  const canRunReport = session ? can(session, 'report.run') : false;
  const canSchedule = session ? can(session, 'report.schedule') : false;

  if (!session) return null;

  const siteOptions = Array.from(new Set(assets.map(a => a.homeSiteId))).map(id => ({
    id,
    name: seed.sites.find(s => s.id === id)?.name ?? id,
  }));

  const toggleAsset = (id: string) => {
    if (scope === 'single_asset') {
      setSelectedAssetIds([id]);
      return;
    }
    setSelectedAssetIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const handleRun = () => {
    setMessage(null);
    setError(null);
    setClipNotes([]);
    if (!selectedReport || scopeAssetIds.length === 0) {
      setError(t('reports.pick_scope', 'Pick a report type and at least one asset.'));
      return;
    }
    const result = runReport(session, {
      reportType: selectedReport,
      assetIds: scopeAssetIds,
      from: effectiveFrom,
      to: effectiveTo,
      format,
    });
    if (!result.ok || !result.data) {
      setError(result.error ?? t('reports.failed', 'The report could not be run.'));
      return;
    }
    const { meta, tables, run, clipNotes: notes } = result.data;
    if (format === 'pdf') downloadPdf(meta, tables as ExportTable[]);
    else downloadXlsx(meta, tables as ExportTable[]);
    setClipNotes(notes);
    setMessage(`${run.fileName} — saved to Downloads.`);
  };

  const handleSchedule = () => {
    setSchedMessage(null);
    if (!selectedReport || scopeAssetIds.length === 0) return;
    const label = scopeAssetIds.length === 1
      ? (assets.find(a => a.id === scopeAssetIds[0])?.code ?? '')
      : `${scopeAssetIds.length} assets`;
    const result = createSchedule(session, {
      reportType: selectedReport,
      scope: label,
      assetIds: scopeAssetIds,
      frequency: schedFreq,
      runAt: schedTime,
      weekday: schedFreq === 'weekly' ? schedWeekday : undefined,
      format,
    });
    setSchedMessage(result.ok
      ? (result.message ?? t('reports.schedule_saved', 'Schedule saved.'))
      : (result.error ?? t('reports.failed', 'The report could not be run.')));
  };

  return (
    <div className="space-y-4">
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
            {(['single_asset', 'multiple_assets', 'site'] as ScopeType[]).map(s => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={clsx(
                  'px-3 py-2 text-xs rounded-lg border transition-colors',
                  scope === s ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                )}
              >
                {s === 'single_asset' ? t('reports.scope_single', 'Single asset')
                  : s === 'multiple_assets' ? t('reports.scope_multiple', 'Multiple assets')
                  : t('reports.scope_site', 'Site')}
              </button>
            ))}
          </div>

          {scope === 'site' ? (
            <select
              value={siteId}
              onChange={e => setSiteId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-ink"
            >
              <option value="">{t('reports.pick_site', 'Pick a site')}</option>
              {siteOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : (
            <div className="flex flex-wrap gap-2">
              {assets.map(asset => {
                const selected = selectedAssetIds.includes(asset.id);
                const past = pastRentalLabel(session, asset.id);
                return (
                  <button
                    key={asset.id}
                    onClick={() => toggleAsset(asset.id)}
                    title={past ?? undefined}
                    className={clsx(
                      'px-3 py-2 text-xs rounded-lg border transition-colors flex items-center gap-1',
                      selected ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                    )}
                  >
                    <span className="font-mono font-medium">{asset.code}</span>
                    <span className={selected ? 'text-white/80' : 'text-grey-500'}>{asset.name}</span>
                    {past && (
                      <span className={clsx('px-1.5 py-0.5 rounded border text-[10px]', selected ? 'border-white/40 text-white/90' : 'border-yellow-dark/40 text-yellow-dark')}>
                        {past}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Date presets */}
          <div className="space-y-2">
            <div className="text-xs text-grey-500 font-medium">{t('reports.date_range', 'Date range')}</div>
            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => { setPresetDays(preset.days); setDateFrom(''); setDateTo(''); }}
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
              <div className="flex gap-2 items-center">
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
                onClick={() => setFormat('xlsx')}
                className={clsx(
                  'px-3 py-2 text-xs rounded-lg border transition-colors',
                  format === 'xlsx' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
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
          <div className="flex items-center justify-between pt-2 gap-2 flex-wrap">
            <div className="text-xs text-grey-500">
              {effectiveFrom && effectiveTo && (
                <span>{t('reports.range_line', 'From {from} to {to}', { from: effectiveFrom, to: effectiveTo })}</span>
              )}
            </div>
            <div className="flex gap-2">
              {canSchedule && (
                <Button variant="secondary" onClick={() => setScheduleOpen(v => !v)}>
                  {t('reports.schedule_this', 'Schedule this report')}
                </Button>
              )}
              {canRunReport && (
                <Button onClick={handleRun}>{t('reports.run', 'Run report')}</Button>
              )}
            </div>
          </div>

          {/* Schedule form */}
          {scheduleOpen && canSchedule && (
            <div className="bg-surface border border-line rounded-lg p-4 space-y-3">
              <div className="text-sm font-medium text-ink">{t('reports.schedule_this', 'Schedule this report')}</div>
              <div className="flex flex-wrap gap-2 items-center">
                <select value={schedFreq} onChange={e => setSchedFreq(e.target.value as ScheduleFrequency)} className="px-3 py-2 text-xs rounded-lg border border-line bg-paper">
                  <option value="daily">{t('reports.schedule_daily', 'Daily')}</option>
                  <option value="weekly">{t('reports.schedule_weekly', 'Weekly')}</option>
                  <option value="monthly">{t('reports.schedule_monthly', 'Monthly (1st)')}</option>
                </select>
                {schedFreq === 'weekly' && (
                  <select value={schedWeekday} onChange={e => setSchedWeekday(Number(e.target.value))} className="px-3 py-2 text-xs rounded-lg border border-line bg-paper">
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                      <option key={d} value={i}>{d}</option>
                    ))}
                  </select>
                )}
                <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-line bg-paper" />
                <Button size="sm" onClick={handleSchedule}>{t('reports.schedule_save', 'Save schedule')}</Button>
              </div>
              <div className="text-xs text-grey-500">{t('reports.schedule_note', 'Deliver to: my email (simulated). Runs appear in Downloads and the email outbox.')}</div>
              {schedMessage && <div className="text-sm text-ink">{schedMessage}</div>}
            </div>
          )}

          {/* Result / error states */}
          {clipNotes.length > 0 && (
            <div className="bg-yellow/10 border border-yellow-dark/30 rounded-lg px-4 py-3 text-sm text-ink">
              {clipNotes.map(n => <div key={n}>{n}</div>)}
            </div>
          )}
          {message && (
            <div className="bg-green/10 border border-green/30 rounded-lg px-4 py-3 text-sm text-green">{message}</div>
          )}
          {error && (
            error === 'Nothing to report for this period' ? (
              <EmptyState
                title={t('reports.nothing', 'Nothing to report for this period')}
                description={t('reports.nothing_hint', 'There is no data available for the selected date range.')}
              />
            ) : (
              <div className="bg-red/10 border border-red/30 rounded-lg px-4 py-3 text-sm text-red">
                {error}
                <button onClick={handleRun} className="ms-2 underline">{t('common.retry', 'Retry')}</button>
              </div>
            )
          )}
        </div>
      )}

      {/* What this picker offers */}
      {!selectedReport && assets.length === 0 && (
        <EmptyState
          title={t('reports.no_assets', 'No assets yet')}
          description={t('reports.no_assets_hint', 'Assets appear here when you own them or hold a rental on them.')}
        />
      )}
      <div className="text-xs text-grey-500">
        {t('reports.types_hint', 'Report types appear here only when your assets can measure them.')}
        {' '}
        ({REPORT_TYPES.length} {t('reports.types_total', 'types defined')} —{' '}
        {availableReports.length} {t('reports.types_available', 'available to you')})
      </div>
    </div>
  );
}
