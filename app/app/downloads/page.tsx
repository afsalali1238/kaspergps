'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { CLOCK_CHANGED_EVENT, useHydrated, useStore } from '@/store';
import { useT } from '@/lib/useT';
import * as clock from '@/lib/clock';
import {
  clearOutbox,
  deleteRun,
  downloadAgain,
  listOutbox,
  listRuns,
  materialiseSchedules,
  type OutboxEmail,
  type ReportRun,
} from '@/server/reports';
import { buildReportFile } from '@/lib/report-file';

function formatPeriod(run: ReportRun): string {
  return `${clock.formatDubaiDate(run.fromMs)} — ${clock.formatDubaiDate(run.toMs)}`;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DownloadsPage() {
  const store = useStore;
  const router = useRouter();
  const { t } = useT();
  const session = store.getState().session;

  const hydrated = useHydrated();
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [busyRunId, setBusyRunId] = useState<string | null>(null);

  // The simulated clock may have moved past a schedule's next run while the app
  // was idle elsewhere, so catch up on arrival.
  useEffect(() => {
    if (!session) return;
    const catchUp = () => {
      materialiseSchedules();
      setTick(t => t + 1);
    };
    catchUp();
    // The demo clock lives in the demo bar: when it jumps, schedules are due.
    window.addEventListener(CLOCK_CHANGED_EVENT, catchUp);
    return () => window.removeEventListener(CLOCK_CHANGED_EVENT, catchUp);
  }, [session]);

  // `tick` is a manual refresh counter: the module keeps the runs, so React has
  // nothing else to compare against.
  const runs = useMemo(() => {
    void tick;
    // Persisted state is invisible to the server, so the list appears after
    // hydration rather than mismatching it.
    if (!session || !hydrated) return [];
    materialiseSchedules();
    return listRuns(session);
  }, [session, tick]);

  const outbox = useMemo(() => {
    void tick;
    return session && hydrated ? listOutbox(session) : [];
  }, [session, tick, hydrated]);

  if (!session) return null;

  const onDownloadAgain = async (run: ReportRun) => {
    setMessage(null);
    setBusyRunId(run.id);
    // Permission is re-checked right now — a lost rental means no file.
    const result = downloadAgain(session, run.id);
    if (!result.ok || !result.run) {
      setBusyRunId(null);
      setMessage({ kind: 'error', text: t('downloads.noAccess', "You no longer have access to this report's assets.") });
      return;
    }
    const file = await buildReportFile(result.run);
    download(file.blob, file.filename);
    setBusyRunId(null);
    setMessage({ kind: 'ok', text: t('downloads.regenerated', 'Regenerated from the same parameters — the file is identical.') });
  };

  const onDelete = (run: ReportRun) => {
    deleteRun(session, run.id);
    setTick(t => t + 1);
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">{t('downloads.title', 'Downloads')}</h1>
          <p className="text-sm text-grey-500 mt-1">
            {t('downloads.subtitle', 'Your generated reports and downloads.')}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => router.push('/app/schedules')}>
          {t('downloads.schedules', 'Schedules')}
        </Button>
      </div>

      {message && (
        <div
          className={
            message.kind === 'error'
              ? 'text-sm text-red bg-red/5 border border-red/20 rounded-lg px-3 py-2'
              : 'text-sm text-ink bg-paper-2 border border-line rounded-lg px-3 py-2'
          }
        >
          {message.text}
        </div>
      )}

      <div className="space-y-2">
        {runs.map(run => (
          <div key={run.id} className="bg-surface border border-line rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-ink">{run.name}</span>
                  <Badge variant={run.format === 'pdf' ? 'green' : 'default'}>{run.format.toUpperCase()}</Badge>
                  <Badge variant={run.bySchedule ? 'grey' : 'yellow'}>
                    {run.bySchedule ? t('downloads.bySchedule', 'By schedule') : t('downloads.byYou', 'By you')}
                  </Badge>
                  {run.status === 'skipped' && (
                    <Badge variant="red">{t('downloads.skipped', 'Skipped')}</Badge>
                  )}
                </div>
                <div className="text-sm text-grey-700 mt-1">
                  {run.scopeLabel} · {formatPeriod(run)}
                </div>
                {run.status === 'skipped' ? (
                  <div className="text-xs text-red mt-1">{run.skippedReason}</div>
                ) : (
                  <div className="text-xs text-grey-500 mt-1">
                    {t('downloads.generatedAt', `Generated at ${clock.formatDubaiDateTime(run.generatedAtMs)}`, {
                      time: clock.formatDubaiDateTime(run.generatedAtMs),
                    })}
                    {' · '}
                    {t('downloads.size', `${run.sizeKb} KB`, { size: run.sizeKb })}
                  </div>
                )}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {run.status === 'ready' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busyRunId === run.id}
                    onClick={() => void onDownloadAgain(run)}
                  >
                    {t('downloads.downloadAgain', 'Download again')}
                  </Button>
                )}
                <button
                  onClick={() => onDelete(run)}
                  className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
                >
                  {t('downloads.delete', 'Delete from list')}
                </button>
              </div>
            </div>
          </div>
        ))}

        {runs.length === 0 && (
          <EmptyState
            title={t('downloads.emptyTitle', 'No downloads')}
            description={t('downloads.emptyDescription', 'Reports you generate appear here.')}
          />
        )}
      </div>

      {/* Simulated email outbox — how scheduled runs are "delivered" */}
      <div className="bg-surface border border-line rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-sm font-medium text-ink">{t('downloads.outbox', 'Email outbox')}</h2>
            <p className="text-xs text-grey-500 mt-0.5">
              {t('downloads.outboxNote', 'Scheduled reports are “emailed” here — nothing actually leaves the prototype.')}
            </p>
          </div>
          {outbox.length > 0 && (
            <button
              onClick={() => {
                clearOutbox(session);
                setTick(t => t + 1);
              }}
              className="text-xs text-grey-500 hover:text-ink"
            >
              {t('downloads.clearOutbox', 'Clear')}
            </button>
          )}
        </div>
        {outbox.length === 0 ? (
          <div className="text-xs text-grey-500 bg-paper-2 border border-line rounded-lg p-3">
            {t('downloads.outboxEmpty', 'No emails yet. Schedule a report to see delivery here.')}
          </div>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {outbox.map((mail: OutboxEmail) => (
              <div key={mail.id} className="bg-paper-2 border border-line rounded-lg p-3">
                <div className="text-xs font-mono text-grey-500">
                  {clock.formatDubaiDateTime(mail.sentAtMs)} → {mail.to}
                </div>
                <div className="text-sm text-ink font-medium mt-0.5">{mail.subject}</div>
                <div className="text-xs text-grey-700 mt-0.5">{mail.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
