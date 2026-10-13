import React, { useState, useMemo, useEffect } from 'react';
import { useT } from '@/i18n';
import { Button, Badge, Panel, Table, RowMenu, KpiStrip, KpiCell, SegmentedTabs } from '@/components/ui';
import { useSession, useSwitches } from '@/hooks';
import { reportableAssets, reportRunsFor, regenerateReport, deleteReportRun, runDueSchedules, schedulesFor, can, availableReportTypes, REPORT_TYPES, type ReportTypeId } from '@/server/api';
import { downloadPdf, downloadXlsx } from '@/lib/export';
import * as clock from '@/lib/clock';
import { formatNumber } from '@/lib/format';
import { RunPanel } from '@/components/reports/RunPanel';
import { startOfDubaiMonthLocal } from '@/components/reports/timeHelpers';
import { BarChart3, Clock, Route, MapPin, Timer, Fuel, Gauge, AlertTriangle, Fence, Download, Plus } from 'lucide-react';
import clsx from 'clsx';

/** Lucide icon per report type. */
const REPORT_ICONS: Record<ReportTypeId, React.ReactNode> = {
  trip_mileage: <Route size={20} />,
  location_history: <MapPin size={20} />,
  operating_hours: <Timer size={20} />,
  fuel: <Fuel size={20} />,
  utilisation: <Gauge size={20} />,
  driving_events: <AlertTriangle size={20} />,
  geofence: <Fence size={20} />,
};

/** Cadence badge per report type (spec §5.2: "cadence badges"). */
const REPORT_BADGE: Record<ReportTypeId, string> = {
  trip_mileage: 'Daily',
  location_history: 'Daily',
  operating_hours: 'Weekly',
  fuel: 'Weekly',
  utilisation: 'Weekly',
  driving_events: 'Daily',
  geofence: 'On events',
};

export default function ReportsPage() {
  const t = useT();
  const session = useSession();
  const { phase } = useSwitches();
  const [tab, setTab] = useState<'reports' | 'schedules'>('reports');
  const [runPanelOpen, setRunPanelOpen] = useState(false);
  // Version counter — bump after Download again / Delete to recompute runs.
  const [version, setVersion] = useState(0);

  // Call runDueSchedules on mount and when the clock changes (not in useMemo — D10).
  useEffect(() => {
    runDueSchedules();
    setVersion(v => v + 1);
  }, []);

  // KPI data
  const assets = useMemo(() => (session ? reportableAssets(session) : []), [session]);
  // Include version in deps so runs re-fetch after Download/Delete/scheduler runs.
  // ponytail: version counter in deps, not a store subscription — good enough for a demo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const runs = useMemo(() => (session ? reportRunsFor(session) : []), [session, version]);

  const schedules = useMemo(() => (session ? schedulesFor(session) : []), [session]);

  const { generatedThisMonth, nextScheduled } = useMemo(() => {
    if (!session) return { generatedThisMonth: 0, nextScheduled: null as string | null };
    const nowMs = clock.now();
    const monthStart = startOfDubaiMonthLocal(nowMs);
    const monthlyRuns = runs.filter(r => new Date(String(r.createdAt)).getTime() >= monthStart);
    const generatedThisMonth = monthlyRuns.length;

    // Next scheduled run time (from schedulesFor — no filler numbers).
    const nextScheduled: string | null = (() => {
      const active = schedules.filter(s => s.active).sort((a, b) => Number(a.nextRunAt) - Number(b.nextRunAt));
      if (active.length === 0) return null;
      return clock.formatDubaiDateTime(Number(active[0].nextRunAt));
    })();

    return { generatedThisMonth, nextScheduled };
  }, [session, runs, schedules]);

  // Report types available for the viewer's assets (for cards).
  const availableReports = useMemo(() => {
    if (!session || assets.length === 0) return [];
    return availableReportTypes(session, assets.map(a => a.id), phase);
  }, [session, assets, phase]);

  const canRunReport = session ? can(session, 'report.run') : false;
  const canSchedule = session ? can(session, 'report.schedule') : false;

  // Tab definitions
  const tabs = useMemo(() => [
    { id: 'reports' as const, label: t('reports.tab_reports', 'Reports'), icon: <BarChart3 size={14} /> },
    { id: 'schedules' as const, label: t('reports.tab_schedules', 'Schedules'), icon: <Clock size={14} /> },
  ], [t]);

  const handleDownloadAgain = (runId: string) => {
    const result = regenerateReport(session!, runId);
    if (!result.ok || !result.data) {
      alert(result.error ?? t('downloads.failed', 'The report could not be rebuilt.'));
      return;
    }
    const { meta, tables, run } = result.data;
    if (run.format === 'pdf') downloadPdf(meta, tables as any);
    else downloadXlsx(meta, tables as any);
    setVersion(v => v + 1);
  };

  const handleDelete = (runId: string) => {
    deleteReportRun(session!, runId);
    setVersion(v => v + 1);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-ink">{t('reports.title', 'Reports')}</h1>
        <p className="text-sm text-grey-500 mt-1">{t('reports.subtitle', 'Run reports and view downloads.')}</p>
      </div>

      {/* KPI Strip — real numbers only (D10). */}
      <KpiStrip label={t('reports.kpi_label', 'Summary')}>
        <KpiCell
          label={t('reports.gen_this_month', 'Generated this month')}
          value={formatNumber(generatedThisMonth)}
          source="From runs"
        />
        <KpiCell
          label={t('reports.next_scheduled', 'Next scheduled')}
          value={nextScheduled}
        />
      </KpiStrip>

      {/* Tabs */}
      <SegmentedTabs
        label={t('reports.tab_label', 'Report tabs')}
        value={tab}
        onChange={setTab}
        tabs={tabs}
      />

      {/* Reports Tab */}
      {tab === 'reports' && (
        <div className="space-y-4">
          {/* Report cards — click opens the 3-step run panel */}
          <div>
            <div className="text-sm font-medium text-ink mb-2">{t('reports.type', 'Report type')}</div>
            {assets.length === 0 ? (
              <div className="text-sm text-grey-500 p-4 bg-paper rounded-lg border border-line">
                {t('reports.no_assets', 'No assets available')}
              </div>
            ) : availableReports.length === 0 ? (
              <div className="text-sm text-grey-500 p-4 bg-paper rounded-lg border border-line">
                {t('reports.none_available', 'No reports available.')}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {availableReports.map(report => (
                  <button
                    key={report.id}
                    onClick={() => setRunPanelOpen(true)}
                    className={clsx(
                      'text-left p-3 rounded-lg border border-line bg-surface hover:border-accent transition-colors',
                      'flex flex-col gap-1.5',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-accent">{REPORT_ICONS[report.id]}</span>
                      <Badge tone="neutral">{REPORT_BADGE[report.id]}</Badge>
                    </div>
                    <div className="text-sm font-medium text-ink">{t(`reports.types.${report.id}`, report.label)}</div>
                    <div className="text-xs text-grey-500 leading-snug">{t(`reports.types.${report.id}_desc`, report.description)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recently generated Table — id="recent" for the /app/downloads redirect anchor */}
          <Panel title={t('reports.recent_title', 'Recently generated')} padding="sm">
            {runs.length === 0 ? (
              <div id="recent" className="text-center py-8 text-sm text-grey-500">
                {t('reports.empty', 'No reports yet')}
              </div>
            ) : (
              <div id="recent">
                <Table
                  caption={t('reports.recent_caption', 'Recent report runs')}
                  keyField="id"
                  rows={runs}
                  columns={[
                    { key: 'reportType', header: t('reports.col_type', 'Type'), render: r => r.reportType },
                    { key: 'scope', header: t('reports.col_scope', 'Scope'), render: r => r.scope },
                    { key: 'period', header: t('reports.col_period', 'Period'), render: r => `${String(r.from).slice(0, 10)} → ${String(r.to).slice(0, 10)}` },
                    { key: 'format', header: t('reports.col_format', 'Format'), render: r => <Badge variant="grey">{r.format === 'pdf' ? 'PDF' : 'Excel'}</Badge>, numeric: true },
                    { key: 'generated', header: t('reports.col_generated', 'Generated'), render: r => clock.formatDubaiDateTime(new Date(String(r.createdAt)).getTime()), numeric: true },
                    { key: 'source', header: t('reports.col_source', 'Source'), render: r => r.scheduleId ? <Badge variant="grey">{t('reports.by_schedule', 'Schedule')}</Badge> : <span className="text-xs text-grey-500">{t('reports.by_you', 'You')}</span> },
                  ]}
                  rowMenu={r => [
                    {
                      id: 'download',
                      label: t('reports.download_again', 'Download again'),
                      onSelect: () => handleDownloadAgain(r.id),
                    },
                    {
                      id: 'delete',
                      label: t('reports.delete', 'Delete'),
                      onSelect: () => handleDelete(r.id),
                    },
                  ]}
                />
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* Schedules Tab */}
      {tab === 'schedules' && (
        <div className="space-y-4">
          {schedules.length === 0 ? (
            <div className="bg-surface border border-line rounded-lg p-6 text-center">
              <p className="text-sm text-grey-500 mb-4">
                {t('reports.schedules_note', 'No schedules yet. Schedule a report from the Reports tab.')}
              </p>
              <Button variant="secondary" onClick={() => setTab('reports')}>
                {t('reports.go_to_reports', 'Go to Reports')}
              </Button>
            </div>
          ) : (
            <Panel title={t('reports.schedules_title', 'Schedules')} padding="sm">
              <Table
                caption={t('reports.schedules_caption', 'Scheduled report runs')}
                keyField="id"
                rows={schedules}
                columns={[
                  { key: 'reportType', header: t('reports.col_type', 'Type'), render: r => r.reportType },
                  { key: 'scope', header: t('reports.col_scope', 'Scope'), render: r => r.scope },
                  { key: 'frequency', header: t('reports.col_frequency', 'Frequency'), render: r => t(`reports.freq_${r.frequency}`, r.frequency) },
                  { key: 'next_run', header: t('reports.col_next_run', 'Next run'), render: r => r.active ? clock.formatDubaiDateTime(Number(r.nextRunAt)) : '—', numeric: true },
                  { key: 'status', header: t('reports.col_status', 'Status'), render: r => <Badge tone={r.active ? 'ok' : 'warn'}>{r.active ? t('reports.active', 'Active') : t('reports.paused', 'Paused')}</Badge> },
                ]}
              />
            </Panel>
          )}
        </div>
      )}

      {/* Run Panel — 3-step wizard */}
      {runPanelOpen && (
        <RunPanel onClose={() => setRunPanelOpen(false)} onRunComplete={() => { setRunPanelOpen(false); setVersion(v => v + 1); }} />
      )}
    </div>
  );
}
