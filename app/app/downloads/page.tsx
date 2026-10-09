'use client';

// Downloads (spec §11.13): every report you generate is listed. "Download
// again" regenerates from the same parameters and re-checks permission now — if
// you lost access it says so and creates no file. Each user sees only their own
// runs.

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Button, Badge, EmptyState } from '@/components/ui';
import { reportRunsFor, regenerateReport, deleteReportRun } from '@/server/reports';
import { runDueSchedules } from '@/server/schedules';
import { downloadPdf, downloadXlsx, type ExportTable } from '@/lib/export';
import * as clock from '@/lib/clock';
import { useT } from '@/i18n';
import { useSession } from '@/hooks';

export default function DownloadsPage() {
  const t = useT();
  const session = useSession();
  const [notice, setNotice] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Any schedule whose clock time has passed produces runs now.
  useMemo(() => {
    if (session) runDueSchedules();
  }, [session]);

  const runs = useMemo(() => (session ? reportRunsFor(session) : []), [session]);

  if (!session) return null;

  const handleDownloadAgain = (runId: string) => {
    setNotice(null);
    setBlocked(null);
    const result = regenerateReport(session, runId);
    if (!result.ok || !result.data) {
      setBlocked(result.error ?? t('downloads.failed', 'The report could not be rebuilt.'));
      return;
    }
    const { meta, tables, run } = result.data;
    if (run.format === 'pdf') downloadPdf(meta, tables as ExportTable[]);
    else downloadXlsx(meta, tables as ExportTable[]);
    setNotice(run.fileName ?? t('downloads.ready', 'Report ready.'));
    setTick(x => x + 1);
  };

  const handleDelete = (runId: string) => {
    setNotice(null);
    setBlocked(null);
    deleteReportRun(session, runId);
    setTick(x => x + 1);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">{t('downloads.title', 'Downloads')}</h1>
        <p className="text-sm text-grey-500 mt-1">
          {t('downloads.subtitle', 'Reports you generate appear here. Files rebuild from the same parameters.')}
        </p>
      </div>

      {blocked && (
        <div className="bg-red/10 border border-red/30 rounded-lg px-4 py-3 text-sm text-red">{blocked}</div>
      )}
      {notice && (
        <div className="bg-green/10 border border-green/30 rounded-lg px-4 py-3 text-sm text-green">{notice}</div>
      )}

      {runs.length === 0 ? (
        <EmptyState
          title={t('downloads.empty', 'Reports you generate appear here.')}
          description={t('downloads.empty_hint', 'Run a report from the Reports page, or schedule one.')}
        />
      ) : (
        <div className="bg-surface border border-line rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-grey-500">
                <th className="px-3 py-2 font-medium">{t('downloads.name', 'Name')}</th>
                <th className="px-3 py-2 font-medium">{t('downloads.scope', 'Scope')}</th>
                <th className="px-3 py-2 font-medium">{t('downloads.period', 'Period')}</th>
                <th className="px-3 py-2 font-medium">{t('downloads.format', 'Format')}</th>
                <th className="px-3 py-2 font-medium">{t('downloads.generated', 'Generated')}</th>
                <th className="px-3 py-2 font-medium">{t('downloads.source', 'Source')}</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr key={run.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink">{run.reportType}</div>
                    <div className="text-xs text-grey-500 font-mono">{run.fileName}</div>
                    {run.status === 'skipped' && (
                      <Badge variant="yellow">{run.skipReason ?? t('downloads.skipped', 'Skipped')}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-grey-700">{run.scope}</td>
                  <td className="px-3 py-2 text-grey-700 font-mono text-xs">
                    {String(run.from).slice(0, 10)} → {String(run.to).slice(0, 10)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="grey">{run.format === 'pdf' ? 'PDF' : 'Excel'}</Badge>
                  </td>
                  <td className="px-3 py-2 text-grey-700 text-xs">{clock.formatDubaiDateTime(new Date(String(run.createdAt)).getTime())}</td>
                  <td className="px-3 py-2">
                    {run.scheduleId
                      ? <Badge variant="grey">{t('downloads.by_schedule', 'By schedule')}</Badge>
                      : <span className="text-xs text-grey-500">{t('downloads.by_you', 'By you')}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 justify-end">
                      {run.status === 'ready' && (
                        <Button size="sm" variant="secondary" onClick={() => handleDownloadAgain(run.id)}>
                          {t('downloads.again', 'Download again')}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(run.id)}>
                        {t('downloads.delete', 'Delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={clsx('text-xs text-grey-500')}>
        {t('downloads.recheck_note', 'Download again re-checks permission now. If you lost access to the assets, no file is created.')}
      </div>
    </div>
  );
}
