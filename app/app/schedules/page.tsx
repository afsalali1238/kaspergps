'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { CLOCK_CHANGED_EVENT, useHydrated, useStore } from '@/store';
import { useT } from '@/lib/useT';
import * as clock from '@/lib/clock';
import type { Session } from '@/domain/types';
import type { TFunction } from '@/lib/i18n';
import {
  deleteSchedule,
  listSchedules,
  materialiseSchedules,
  pauseSchedule,
  resumeSchedule,
  updateSchedule,
  type ReportSchedule,
  type ScheduleFrequency,
} from '@/server/reports';

const FREQUENCY_KEYS: Record<ScheduleFrequency, { key: string; fallback: string }> = {
  daily: { key: 'schedules.frequency.daily', fallback: 'Daily' },
  weekly: { key: 'schedules.frequency.weekly', fallback: 'Weekly' },
  monthly: { key: 'schedules.frequency.monthly', fallback: 'Monthly' },
};

const WEEKDAYS = [
  { value: 1, key: 'schedules.weekday.mon', fallback: 'Monday' },
  { value: 2, key: 'schedules.weekday.tue', fallback: 'Tuesday' },
  { value: 3, key: 'schedules.weekday.wed', fallback: 'Wednesday' },
  { value: 4, key: 'schedules.weekday.thu', fallback: 'Thursday' },
  { value: 5, key: 'schedules.weekday.fri', fallback: 'Friday' },
  { value: 6, key: 'schedules.weekday.sat', fallback: 'Saturday' },
  { value: 0, key: 'schedules.weekday.sun', fallback: 'Sunday' },
];

export default function SchedulesPage() {
  const store = useStore;
  const { t } = useT();
  const session = store.getState().session;

  const hydrated = useHydrated();
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);

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

  const schedules = useMemo(() => {
    void tick;
    return session && hydrated ? listSchedules(session) : [];
  }, [session, tick, hydrated]);

  if (!session) return null;

  const phase = store.getState().demoSwitches.phase;
  if (phase === 'day_one') {
    return (
      <div className="space-y-4 p-4">
        <h1 className="text-lg font-semibold text-ink">{t('schedules.title', 'Schedules')}</h1>
        <EmptyState
          title={t('schedules.notAvailable', 'Not available')}
          description={t('schedules.phase2', 'Schedules are available in Phase 2.')}
        />
      </div>
    );
  }

  const refresh = () => setTick(x => x + 1);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">{t('schedules.title', 'Schedules')}</h1>
          <p className="text-sm text-grey-500 mt-1">
            {t('schedules.subtitle', 'Reports that run themselves. Delivery is simulated into the email outbox on Downloads.')}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => window.location.assign('/app/reports')}>
          {t('schedules.create', 'Schedule a report')}
        </Button>
      </div>

      <div className="space-y-2">
        {schedules.map(schedule => (
          <ScheduleRow
            key={schedule.id}
            schedule={schedule}
            session={session}
            t={t}
            editing={editing === schedule.id}
            onToggleEdit={() => setEditing(editing === schedule.id ? null : schedule.id)}
            onRefresh={refresh}
          />
        ))}
        {schedules.length === 0 && (
          <EmptyState
            title={t('schedules.emptyTitle', 'No schedules')}
            description={t('schedules.emptyDescription', 'Schedule a report from Reports or the Downloads page.')}
          />
        )}
      </div>
    </div>
  );

}

function ScheduleRow({
schedule,
session,
t,
editing: isEditing,
onToggleEdit,
onRefresh,
}: {
schedule: ReportSchedule;
session: Session;
t: TFunction;
editing: boolean;
onToggleEdit: () => void;
onRefresh: () => void;
}) {
  const paused = schedule.pausedAt !== undefined;
  return (
    <div className="bg-surface border border-line rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink">{schedule.name}</span>
            <Badge variant={schedule.format === 'pdf' ? 'green' : 'default'}>
              {schedule.format.toUpperCase()}
            </Badge>
            {paused ? (
              <Badge variant="grey">{t('schedules.paused', 'Paused')}</Badge>
            ) : (
              <Badge variant="yellow">{t('schedules.active', 'Active')}</Badge>
            )}
          </div>
          <div className="text-sm text-grey-700 mt-1">
            {t(FREQUENCY_KEYS[schedule.frequency].key, FREQUENCY_KEYS[schedule.frequency].fallback)}
            {' · '}
            {t('schedules.atHour', `at ${String(schedule.hour).padStart(2, '0')}:00`, {
              hour: String(schedule.hour).padStart(2, '0'),
            })}
            {schedule.frequency === 'weekly' && schedule.weekday !== undefined && (
              <>
                {' · '}
                {t(WEEKDAYS.find(d => d.value === schedule.weekday)?.key ?? '', WEEKDAYS.find(d => d.value === schedule.weekday)?.fallback ?? '')}
              </>
            )}
            {' · '}
            {t('schedules.deliverTo', `Deliver to ${session.user.email}`, { email: session.user.email })}
          </div>
          <div className="text-xs text-grey-500 mt-1">
            {paused && schedule.pausedReason === 'skips' ? (
              <span className="text-red">
                {t('schedules.pausedAfterSkips', `Paused after ${schedule.skipStreak} skipped runs in a row.`, { count: schedule.skipStreak })}
              </span>
            ) : (
              <>
                {t('schedules.nextRun', `Next run ${clock.formatDubaiDateTime(schedule.nextRunAt)}`, {
                  time: clock.formatDubaiDateTime(schedule.nextRunAt),
                })}
                {schedule.lastRunAt !== undefined && (
                  <>
                    {' · '}
                    {t('schedules.lastRun', `Last run ${clock.formatDubaiDateTime(schedule.lastRunAt)}`, {
                      time: clock.formatDubaiDateTime(schedule.lastRunAt),
                    })}
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {paused ? (
            <Button size="sm" variant="secondary" onClick={() => { resumeSchedule(session, schedule.id); onRefresh(); }}>
              {t('schedules.resume', 'Resume')}
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => { pauseSchedule(session, schedule.id); onRefresh(); }}>
              {t('schedules.pause', 'Pause')}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={onToggleEdit}>
            {t('common.edit', 'Edit')}
          </Button>
          <button
            onClick={() => { deleteSchedule(session, schedule.id); onRefresh(); }}
            className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink"
          >
            {t('common.delete', 'Delete')}
          </button>
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-end gap-2">
          <label className="text-xs text-grey-500">
            {t('schedules.frequencyLabel', 'Frequency')}
            <select
              value={schedule.frequency}
              onChange={e => {
                updateSchedule(session, schedule.id, { frequency: e.target.value as ScheduleFrequency });
                onRefresh();
              }}
              className="block mt-1 px-2 py-1.5 text-xs rounded-lg border border-line bg-paper text-grey-700"
            >
              {(['daily', 'weekly', 'monthly'] as ScheduleFrequency[]).map(f => (
                <option key={f} value={f}>{t(FREQUENCY_KEYS[f].key, FREQUENCY_KEYS[f].fallback)}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-grey-500">
            {t('schedules.hourLabel', 'Hour (Dubai)')}
            <select
              value={schedule.hour}
              onChange={e => {
                updateSchedule(session, schedule.id, { hour: Number(e.target.value) });
                onRefresh();
              }}
              className="block mt-1 px-2 py-1.5 text-xs rounded-lg border border-line bg-paper text-grey-700"
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-grey-500">
            {t('schedules.formatLabel', 'Format')}
            <select
              value={schedule.format}
              onChange={e => {
                updateSchedule(session, schedule.id, { format: e.target.value as 'pdf' | 'excel' });
                onRefresh();
              }}
              className="block mt-1 px-2 py-1.5 text-xs rounded-lg border border-line bg-paper text-grey-700"
            >
              <option value="excel">Excel (.xlsx)</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
