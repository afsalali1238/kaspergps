'use client';

import React, { useState, useMemo } from 'react';
import { useT } from '@/i18n';
import { Button } from '@/components/ui';
import { useSession } from '@/hooks';
import { reportableAssets, pastRentalLabel, runReport, type ReportTypeId, createSchedule, type ScheduleFrequency, can, labelIdsByAsset, labelsVisibleTo, viewerSiteId, viewerSiteName, availableReportTypes } from '@/server/api';
import * as clock from '@/lib/clock';
import { Download, Calendar, ChevronRight, X } from 'lucide-react';
import clsx from 'clsx';

const DATE_PRESETS: { key: string; label: string; days: number }[] = [
  { key: 'last_24h', label: 'Last 24 hours', days: 1 },
  { key: 'last_7d', label: 'Last 7 days', days: 7 },
  { key: 'last_30d', label: 'Last 30 days', days: 30 },
];

type ScopeType = 'single_asset' | 'multiple_assets' | 'site' | 'label';

interface RunPanelProps {
  onClose: () => void;
  onRunComplete: () => void;
  /** The report type chosen from the cards above, so the panel starts pre-selected. */
  initialReport?: ReportTypeId | null;
}

export function RunPanel({ onClose, onRunComplete, initialReport }: RunPanelProps) {
  const t = useT();
  const session = useSession();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedReport, setSelectedReport] = useState<ReportTypeId | null>(initialReport ?? null);
  const [scope, setScope] = useState<ScopeType>('multiple_assets');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [siteId, setSiteId] = useState<string>('');
  const [labelId, setLabelId] = useState<string>('');
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
  const labelOptions = useMemo(() => (session ? labelsVisibleTo(session) : []), [session]);
  const labelMap = useMemo(() => (session ? labelIdsByAsset(session) : new Map<string, string[]>()), [session]);

  const scopeAssetIds = useMemo(() => {
    if (scope === 'site') return assets.filter(a => session && viewerSiteId(session, a.id) === siteId).map(a => a.id);
    if (scope === 'label') return assets.filter(a => (labelMap.get(a.id) ?? []).includes(labelId)).map(a => a.id);
    return selectedAssetIds;
  }, [scope, siteId, labelId, labelMap, selectedAssetIds, assets, session]);

  const availableReports = useMemo(() => {
    if (!session) return [];
    const ids = scopeAssetIds.length ? scopeAssetIds : assets.map(a => a.id);
    // The demo always runs in the 'later' phase (src/store pins phase: 'later'),
    // so this is the full type list — kept as a literal so the call stays explicit.
    return availableReportTypes(session, ids, 'later');
  }, [session, scopeAssetIds, assets]);

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

  const siteOptions = session
    ? Array.from(new Set(assets.map(a => viewerSiteId(session, a.id)).filter((id): id is string => Boolean(id)))).map(id => ({
        id,
        name: viewerSiteName(session, id) || id,
      }))
    : [];

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
    const result = runReport(session!, {
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
    if (format === 'pdf') {
      import('@/lib/export').then(({ downloadPdf }) => downloadPdf(meta, tables));
    } else {
      import('@/lib/export').then(({ downloadXlsx }) => downloadXlsx(meta, tables));
    }
    setClipNotes(notes);
    setMessage(`${run.fileName} — saved to Downloads.`);
    onRunComplete();
  };

  const handleSchedule = () => {
    setSchedMessage(null);
    if (!selectedReport || scopeAssetIds.length === 0) return;
    const label = scopeAssetIds.length === 1
      ? (assets.find(a => a.id === scopeAssetIds[0])?.code ?? '')
      : `${scopeAssetIds.length} assets`;
    const result = createSchedule(session!, {
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
    onRunComplete();
  };

  const goNext = () => {
    if (step === 1 && selectedReport) setStep(2);
    else if (step === 2 && scopeAssetIds.length > 0) setStep(3);
  };

  const goBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const steps: { id: 1 | 2 | 3; label: string; icon: React.ReactNode }[] = [
    { id: 1, label: t('reports_page.reports_panel.step1', 'What'), icon: <Calendar size={16} /> },
    { id: 2, label: t('reports_page.reports_panel.step2', 'Scope'), icon: <Download size={16} /> },
    { id: 3, label: t('reports_page.reports_panel.step3', 'Period & Format'), icon: <ChevronRight size={16} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-surface rounded-t-2xl sm:rounded-xl shadow-pop overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="border-b border-line px-4 py-3 bg-surface-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-4">
              {steps.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                  <span className={clsx('flex h-6 w-6 items-center justify-center rounded-full text-xs font-mono', step >= s.id ? 'bg-accent text-white' : 'bg-line text-slate')}>
                    {step > s.id ? <ChevronRight size={12} /> : s.icon}
                  </span>
                  {i < steps.length - 1 && <span className={clsx('h-1 w-12', step > s.id ? 'bg-accent' : 'bg-line')} />}
                </div>
              ))}
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-line transition-colors" aria-label={t('common.close', 'Close')}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-ink">{t('reports_page.reports_panel.step1', 'What')}</h3>
              <p className="text-sm text-grey-500">{t('reports_page.reports_panel.step1_hint', 'Choose the report type you want to generate.')}</p>
              <div className="grid gap-2">
                {availableReports.map(report => (
                  <button
                    key={report.id}
                    onClick={() => setSelectedReport(report.id)}
                    aria-pressed={selectedReport === report.id}
                    className={clsx(
                      'text-left px-4 py-3 rounded-lg border transition-colors',
                      selectedReport === report.id
                        ? 'bg-surface-2 border-accent'
                        : 'bg-paper border-line hover:border-grey-500'
                    )}
                  >
                    <div className="font-medium text-ink">{t(`reports.types.${report.id}`, report.label)}</div>
                    <div className="text-xs text-grey-500 mt-0.5">{t(`reports.types.${report.id}_desc`, report.description)}</div>
                  </button>
                ))}
                {availableReports.length === 0 && (
                  <div className="text-sm text-grey-500 p-4 bg-paper rounded-lg border border-line">
                    {t('reports.none_available', 'No reports available for the current phase.')}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={goNext} disabled={!selectedReport}>{t('reports_page.common.next', 'Next')}</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-ink">{t('reports_page.reports_panel.step2', 'Scope')}</h3>
              <p className="text-sm text-grey-500">{t('reports_page.reports_panel.step2_hint', 'Choose which assets or sites this report covers.')}</p>
              <div className="flex flex-wrap gap-2">
                {(['single_asset', 'multiple_assets', 'site', ...(labelOptions.length > 0 ? ['label' as const] : [])] as ScopeType[]).map(s => (
                  <button
                    key={s}
                    onClick={() => { setScope(s); setSelectedAssetIds([]); setSiteId(''); setLabelId(''); }}
                    className={clsx(
                      'px-3 py-2 text-xs rounded-lg border transition-colors',
                      scope === s ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                    )}
                  >
                    {s === 'single_asset' ? t('reports.scope_single', 'Single asset')
                      : s === 'multiple_assets' ? t('reports.scope_multiple', 'Multiple assets')
                      : s === 'label' ? t('reports.scope_label', 'Assets with label')
                      : t('reports.scope_site', 'Site')}
                  </button>
                ))}
              </div>

              {scope === 'label' ? (
                <select
                  aria-label={t('reports.scope_label', 'Assets with label')}
                  value={labelId}
                  onChange={e => setLabelId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-ink"
                >
                  <option value="">{t('reports.pick_label', 'Pick a label')}</option>
                  {labelOptions.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              ) : scope === 'site' ? (
                <select
                  value={siteId}
                  onChange={e => setSiteId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-ink"
                >
                  <option value="">{t('reports.pick_site', 'Pick a site')}</option>
                  {siteOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto">
                  {assets.map(asset => {
                    const selected = selectedAssetIds.includes(asset.id);
                    const past = pastRentalLabel(session!, asset.id);
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

              <div className="flex justify-between gap-2 pt-2">
                <Button variant="secondary" onClick={goBack}>{t('common.back', 'Back')}</Button>
                <Button onClick={goNext} disabled={scopeAssetIds.length === 0}>{t('reports_page.common.next', 'Next')}</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-ink">{t('reports_page.reports_panel.step3', 'Period & Format')}</h3>
              <p className="text-sm text-grey-500">{t('reports_page.reports_panel.step3_hint', 'Select the date range and output format.')}</p>

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

              {canSchedule && (
                <div className="pt-2">
                  <Button variant="secondary" onClick={() => setScheduleOpen(v => !v)} className="w-full">
                    {t('reports.schedule_this', 'Schedule this report')}
                  </Button>
                </div>
              )}

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

              <div className="flex items-center justify-between pt-2 gap-2 flex-wrap border-t border-line">
                <div className="text-xs text-grey-500">
                  {effectiveFrom && effectiveTo && (
                    <span>{t('reports.range_line', 'From {from} to {to}', { from: effectiveFrom, to: effectiveTo })}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={goBack}>{t('common.back', 'Back')}</Button>
                  {canRunReport && (
                    <Button onClick={handleRun} className="flex-1 sm:flex-none">{t('reports.run', 'Run report')}</Button>
                  )}
                </div>
              </div>

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
                  <div className="bg-surface border border-line rounded-lg p-4 text-center">
                    <p className="text-sm text-ink">{t('reports.nothing', 'Nothing to report for this period')}</p>
                    <p className="text-xs text-grey-500 mt-1">{t('reports.nothing_hint', 'There is no data available for the selected date range.')}</p>
                    <button onClick={handleRun} className="mt-2 underline text-accent">{t('common.retry', 'Retry')}</button>
                  </div>
                ) : (
                  <div className="bg-red/10 border border-red/30 rounded-lg px-4 py-3 text-sm text-red">
                    {error}
                    <button onClick={handleRun} className="ms-2 underline">{t('common.retry', 'Retry')}</button>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
