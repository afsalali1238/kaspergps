'use client';

// Schedules (spec §11.13): your automated report runs. When the simulated
// clock passes a schedule's next run time, a run appears in Downloads for the
// period just ended. Two skips in a row (you lost access) pause the schedule.

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Button, Badge, EmptyState } from '@/components/ui';
import { schedulesFor, runDueSchedules, setScheduleActive, deleteSchedule, createSchedule, type ScheduleFrequency } from '@/server/schedules';
import { reportableAssets, REPORT_TYPES, type ReportTypeId } from '@/server/reports';
import { hasCapability } from '@/server/access';
import * as clock from '@/lib/clock';
import { useT } from '@/i18n';
import { useSession } from '@/hooks';

export default function SchedulesPage() {
  const t = useT();
  const session = useSession();
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportTypeId>('location_history');
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [frequency, setFrequency] = useState<ScheduleFrequency>('daily');
  const [runAt, setRunAt] = useState('18:00');
  const [weekday, setWeekday] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useMemo(() => {
    if (session) runDueSchedules();
  }, [session]);

  const schedules = useMemo(() => (session ? schedulesFor(session) : []), [session]);
  const assets = useMemo(() => (session ? reportableAssets(session) : []), [session]);

  if (!session) return null;

  const canSchedule = hasCapability(session, 'report.schedule');

  const handleCreate = () => {
    setMessage(null);
    setError(null);
    const label = assetIds.length === 1
      ? (assets.find(a => a.id === assetIds[0])?.code ?? '')
      : `${assetIds.length} assets`;
    const result = createSchedule(session, {
      reportType,
      scope: label,
      assetIds,
      frequency,
      runAt,
      weekday: frequency === 'weekly' ? weekday : undefined,
      format: 'xlsx',
    });
    if (result.ok && result.data) {
      setMessage(result.message ?? 'Schedule saved.');
      setOpen(false);
      setAssetIds([]);
      setTick(x => x + 1);
    } else {
      setError(result.error ?? 'The schedule could not be saved.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-ink">{t('schedules.title', 'Schedules')}</h1>
          <p className="text-sm text-grey-500 mt-1">
            {t('schedules.subtitle', 'Automated report generation on a schedule. Runs appear in Downloads and the email outbox.')}
          </p>
        </div>
        {canSchedule && (
          <Button onClick={() => setOpen(v => !v)}>{t('schedules.new', 'New schedule')}</Button>
        )}
      </div>

      {message && <div className="bg-green/10 border border-green/30 rounded-lg px-4 py-3 text-sm text-green">{message}</div>}
      {error && <div className="bg-red/10 border border-red/30 rounded-lg px-4 py-3 text-sm text-red">{error}</div>}

      {open && canSchedule && (
        <div className="bg-surface border border-line rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium text-ink">{t('schedules.new', 'New schedule')}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={reportType} onChange={e => setReportType(e.target.value as ReportTypeId)} className="px-3 py-2 text-sm rounded-lg border border-line bg-paper">
              {REPORT_TYPES.map(rt => <option key={rt.id} value={rt.id}>{rt.label}</option>)}
            </select>
            <select value={frequency} onChange={e => setFrequency(e.target.value as ScheduleFrequency)} className="px-3 py-2 text-sm rounded-lg border border-line bg-paper">
              <option value="daily">{t('reports.schedule_daily', 'Daily')}</option>
              <option value="weekly">{t('reports.schedule_weekly', 'Weekly')}</option>
              <option value="monthly">{t('reports.schedule_monthly', 'Monthly (1st)')}</option>
            </select>
            {frequency === 'weekly' && (
              <select value={weekday} onChange={e => setWeekday(Number(e.target.value))} className="px-3 py-2 text-sm rounded-lg border border-line bg-paper">
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </select>
            )}
            <input type="time" value={runAt} onChange={e => setRunAt(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-line bg-paper" />
          </div>
          <div>
            <div className="text-xs text-grey-500 font-medium mb-1">{t('schedules.scope', 'Assets')}</div>
            <div className="flex flex-wrap gap-2">
              {assets.map(asset => {
                const selected = assetIds.includes(asset.id);
                return (
                  <button
                    key={asset.id}
                    onClick={() => setAssetIds(prev => selected ? prev.filter(x => x !== asset.id) : [...prev, asset.id])}
                    className={clsx(
                      'px-3 py-2 text-xs rounded-lg border transition-colors',
                      selected ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
                    )}
                  >
                    <span className="font-mono font-medium">{asset.code}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <Button size="sm" onClick={handleCreate}>{t('schedules.save', 'Save schedule')}</Button>
        </div>
      )}

      {schedules.length === 0 ? (
        <EmptyState
          title={t('schedules.empty', 'No schedules yet')}
          description={t('schedules.empty_hint', 'Schedule a report from the Reports page or here.')}
        />
      ) : (
        <div className="bg-surface border border-line rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-grey-500">
                <th className="px-3 py-2 font-medium">{t('schedules.report', 'Report')}</th>
                <th className="px-3 py-2 font-medium">{t('schedules.scope', 'Scope')}</th>
                <th className="px-3 py-2 font-medium">{t('schedules.frequency', 'Frequency')}</th>
                <th className="px-3 py-2 font-medium">{t('schedules.next_run', 'Next run')}</th>
                <th className="px-3 py-2 font-medium">{t('schedules.status', 'Status')}</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">{s.reportType}</td>
                  <td className="px-3 py-2 text-grey-700">{s.scope}</td>
                  <td className="px-3 py-2 text-grey-700">
                    {s.frequency === 'daily' ? `Daily at ${s.runAt}`
                      : s.frequency === 'weekly' ? `Weekly at ${s.runAt}`
                      : `Monthly at ${s.runAt}`}
                  </td>
                  <td className="px-3 py-2 text-grey-700 font-mono text-xs">
                    {s.active ? clock.formatDubaiDateTime(Number(s.nextRunAt)) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {s.active
                      ? <Badge variant="green">{t('schedules.active', 'Active')}</Badge>
                      : <Badge variant="yellow">{t('schedules.paused', 'Paused')}</Badge>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => { setScheduleActive(session, s.id, !s.active); setTick(x => x + 1); }}
                      >
                        {s.active ? t('schedules.pause', 'Pause') : t('schedules.resume', 'Resume')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { deleteSchedule(session, s.id); setTick(x => x + 1); }}>
                        {t('schedules.delete', 'Delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-grey-500">
        {t('schedules.note', 'Runs are checked against the demo clock — use the demo bar to jump forward and watch runs appear. After 2 skipped runs (lost access) a schedule pauses itself.')}
      </div>
    </div>
  );
}
