import React, { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import { useT } from '@/i18n';
import { Button, Badge, Panel, Table, RowMenu, KpiStrip, KpiCell, SegmentedTabs } from '@/components/ui';
import { useSession, useSwitches } from '@/hooks';
import { reportableAssets, runReport, REPORT_TYPES, type ReportTypeId, availableReportTypes, reportRunsFor, regenerateReport, deleteReportRun, can } from '@/server/api';
import { KpiStrip as KpiStripImpl } from '@/components/ui/KpiStrip';
import { downloadPdf, downloadXlsx } from '@/lib/export';
import * as clock from '@/lib/clock';
import { formatNumber } from '@/lib/format';
import { RunPanel } from '@/components/reports/RunPanel';
import { ChevronLeft, BarChart3, Download, Clock, CheckCircle, X } from 'lucide-react';

export default function ReportsPage() {
  const t = useT();
  const session = useSession();
  const { phase } = useSwitches();
  const [tab, setTab] = useState<'reports' | 'schedules'>('reports');
  const [runPanelOpen, setRunPanelOpen] = useState(false);

  // KPI data
  const assets = useMemo(() => (session ? reportableAssets(session) : []), [session]);
  const runs = useMemo(() => (session ? reportRunsFor(session) : []), [session]);
  const { generatedThisMonth, nextScheduled } = useMemo(() => {
    if (!session) return { generatedThisMonth: 0, nextScheduled: null as string | null };
    const nowMs = clock.now();
    const monthStart = clock.startOfDubaiMonth(nowMs);
    const monthlyRuns = runs.filter(r => new Date(String(r.createdAt)).getTime() >= monthStart);
    const generatedThisMonth = monthlyRuns.length;

    // Find next scheduled run from schedules in DB (placeholder for now - use schedulesFor if available)
    const nextScheduled: string | null = null;

    return { generatedThisMonth, nextScheduled };
  }, [session, runs]);

  const canRunReport = session ? can(session, 'report.run') : false;
  const canSchedule = session ? can(session, 'report.schedule') : false;

  // Tab tabs
  const tabs = useMemo(() => [
    { id: 'reports' as const, label: t('reports.tab_reports', 'Reports'), icon: <BarChart3 size={14} /> },
    { id: 'schedules' as const, label: t('reports.tab_schedules', 'Schedules'), icon: <Clock size={14} /> },
  ], [t]);

  const handleDownloadAgain = async (runId: string) => {
    const result = await regenerateReport(session!, runId);
    if (!result.ok || !result.data) {
      alert(result.error ?? t('downloads.failed', 'The report could not be rebuilt.'));
      return;
    }
    const { meta, tables, run } = result.data;
    if (run.format === 'pdf') downloadPdf(meta, tables as any);
    else downloadXlsx(meta, tables as any);
  };

  const handleDelete = (runId: string) => {
    deleteReportRun(session!, runId);
  };

  return (
    <div className="space-y-4">
      {/* Header with tabs */}
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-lg font-semibold text-ink">{t('reports.title', 'Reports')}</h1>
          <p className="text-sm text-grey-500 mt-1">{t('reports.subtitle', 'Run reports and view downloads.')}</p>
        </div>
      </div>

      {/* KPI Strip */}
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
          {/* Available Report Types */}
          <div>
            <div className="text-sm font-medium text-ink mb-2">{t('reports.type', 'Report type')}</div>
            <div className="grid gap-2">
              {assets.length > 0 ? (
                <Button onClick={() => setRunPanelOpen(true)} className="w-full">
                  {t('reports.new_report', 'New Report')}
                </Button>
              ) : (
                <div className="text-sm text-grey-500 p-4 bg-paper rounded-lg border border-line">
                  {t('reports.no_assets', 'No assets available')}
                </div>
              )}
            </div>
          </div>

          {/* Recently Generated Table */}
          <Panel title={t('reports.recent_title', 'Recently generated')} padding="sm">
            {runs.length === 0 ? (
              <div className="text-center py-8 text-sm text-grey-500">
                {t('reports.empty', 'No reports yet')}
              </div>
            ) : (
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
            )}
          </Panel>
        </div>
      )}

      {/* Schedules Tab (placeholder - just links to /app/schedules) */}
      {tab === 'schedules' && (
        <div className="bg-surface border border-line rounded-lg p-6 text-center">
          <p className="text-sm text-grey-500 mb-4">
            {t('reports.schedules_note', 'View and manage your scheduled reports')}
          </p>
          <Button
            onClick={() => window.location.href = '/app/schedules'}
          >
            {t('reports.go_to_schedules', 'Go to Schedules page')}
          </Button>
        </div>
      )}

      {/* Run Panel */}
      {runPanelOpen && <RunPanel onClose={() => setRunPanelOpen(false)} onRunComplete={() => { setRunPanelOpen(false); }} />}
    </div>
  );
}
