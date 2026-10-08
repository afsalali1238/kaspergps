'use client';

import React, { useState, useMemo } from 'react';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { hasCapability } from '@/server/access';
import type { Session } from '@/domain/types';

type ReportType = 'trip_mileage' | 'location_history' | 'operating_hours' | 'fuel' | 'utilisation' | 'driving_events';
type ScopeType = 'single_asset' | 'multiple_assets' | 'site';
type FrequencyType = 'daily' | 'weekly' | 'monthly';

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  trip_mileage: 'Trip & Mileage',
  location_history: 'Location history',
  operating_hours: 'Operating hours',
  fuel: 'Fuel',
  utilisation: 'Utilisation',
  driving_events: 'Driving events',
};

const FREQUENCY_LABELS: Record<FrequencyType, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Schedule {
  id: string;
  name: string;
  reportType: ReportType;
  scope: ScopeType;
  assetIds: string[];
  siteId: string | null;
  frequency: FrequencyType;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hour: number;
  minute: number;
  format: 'pdf' | 'excel';
  active: boolean;
  createdAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

const INITIAL_SCHEDULES: Schedule[] = [
  {
    id: 'sch-001',
    name: 'Daily trip report — Al Quoz',
    reportType: 'trip_mileage',
    scope: 'site',
    assetIds: [],
    siteId: 's-emirates-alq',
    frequency: 'daily',
    dayOfWeek: null,
    dayOfMonth: null,
    hour: 6,
    minute: 0,
    format: 'excel',
    active: true,
    createdAt: '2026-09-15T08:00:00+04:00',
    lastRunAt: '2026-10-07T06:00:00+04:00',
    nextRunAt: null,
  },
  {
    id: 'sch-002',
    name: 'Weekly location history — EX-04',
    reportType: 'location_history',
    scope: 'single_asset',
    assetIds: ['a-ex04'],
    siteId: null,
    frequency: 'weekly',
    dayOfWeek: 0,
    dayOfMonth: null,
    hour: 8,
    minute: 0,
    format: 'pdf',
    active: true,
    createdAt: '2026-09-20T10:00:00+04:00',
    lastRunAt: '2026-10-05T08:00:00+04:00',
    nextRunAt: null,
  },
  {
    id: 'sch-003',
    name: 'Monthly operating hours — fleet',
    reportType: 'operating_hours',
    scope: 'multiple_assets',
    assetIds: ['a-ex04', 'a-ex07', 'a-bd02', 'a-gn01'],
    siteId: null,
    frequency: 'monthly',
    dayOfWeek: null,
    dayOfMonth: 1,
    hour: 9,
    minute: 0,
    format: 'excel',
    active: false,
    createdAt: '2026-10-01T12:00:00+04:00',
    lastRunAt: '2026-09-01T09:00:00+04:00',
    nextRunAt: null,
  },
];

function calculateNextRun(schedule: Schedule): string {
  const now = clock.now();
  const startOfDay = clock.startOfDubaiDay(now);
  const currentHour = clock.dubaiNow().getHours();
  const currentMinute = clock.dubaiNow().getMinutes();
  const currentTimeMs = startOfDay + currentHour * 3600000 + currentMinute * 60000;
  const targetTimeMs = startOfDay + schedule.hour * 3600000 + schedule.minute * 60000;
  const dayMs = 86400000;

  if (schedule.frequency === 'daily') {
    if (targetTimeMs > currentTimeMs) {
      return toIsoDubaiTime(targetTimeMs);
    }
    return toIsoDubaiTime(targetTimeMs + dayMs);
  }

  if (schedule.frequency === 'weekly') {
    const currentDow = (new Date(now).getDay() + 1) % 7;
    const daysAhead = (schedule.dayOfWeek! - currentDow + 7) % 7;
    const targetDowMs = startOfDay + daysAhead * dayMs + schedule.hour * 3600000 + schedule.minute * 60000;
    if (targetDowMs > currentTimeMs) {
      return toIsoDubaiTime(targetDowMs);
    }
    return toIsoDubaiTime(targetDowMs + 7 * dayMs);
  }

  if (schedule.frequency === 'monthly') {
    const currentDate = new Date(now);
    const currentDom = currentDate.getDate();
    const targetDom = schedule.dayOfMonth!;
    const thisMonthTarget = new Date(currentDate.getFullYear(), currentDate.getMonth(), targetDom, schedule.hour, schedule.minute, 0);
    const thisMonthMs = thisMonthTarget.getTime();
    if (thisMonthMs > currentTimeMs && targetDom <= new Date(now).getDate() + 5) {
      return thisMonthTarget.toISOString();
    }
    const nextMonthTarget = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, targetDom, schedule.hour, schedule.minute, 0);
    return nextMonthTarget.toISOString();
  }

  return new Date(now).toISOString();
}

function toIsoDubaiTime(ms: number): string {
  return clock.dubaiMsToDate(ms).toISOString();
}

function formatScheduleTime(hour: number, minute: number): string {
  const h = hour.toString().padStart(2, '0');
  const m = minute.toString().padStart(2, '0');
  return `${h}:${m}`;
}

function frequencyDescription(schedule: Schedule): string {
  if (schedule.frequency === 'daily') return 'Daily';
  if (schedule.frequency === 'weekly') {
    const day = DAY_LABELS[schedule.dayOfWeek!];
    return `Weekly (${day})`;
  }
  return `Monthly (day ${schedule.dayOfMonth})`;
}

function scopeLabel(scope: ScopeType): string {
  if (scope === 'single_asset') return 'Single asset';
  if (scope === 'site') return 'Site';
  return 'Multiple assets';
}

export default function SchedulesPage() {
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  const [schedules, setSchedules] = useState<Schedule[]>(INITIAL_SCHEDULES);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const canManage = hasCapability(session!, 'report.schedule');

  const [formName, setFormName] = useState('');
  const [formReportType, setFormReportType] = useState<ReportType>('trip_mileage');
  const [formScope, setFormScope] = useState<ScopeType>('site');
  const [formAssetIds, setFormAssetIds] = useState<string[]>([]);
  const [formSiteId, setFormSiteId] = useState('');
  const [formFrequency, setFormFrequency] = useState<FrequencyType>('daily');
  const [formDayOfWeek, setFormDayOfWeek] = useState<number | null>(null);
  const [formDayOfMonth, setFormDayOfMonth] = useState<number | null>(null);
  const [formHour, setFormHour] = useState(6);
  const [formMinute, setFormMinute] = useState(0);
  const [formFormat, setFormFormat] = useState<'pdf' | 'excel'>('excel');
  const [formActive, setFormActive] = useState(true);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const resetForm = () => {
    setFormName('');
    setFormReportType('trip_mileage');
    setFormScope('site');
    setFormAssetIds([]);
    setFormSiteId('');
    setFormFrequency('daily');
    setFormDayOfWeek(null);
    setFormDayOfMonth(null);
    setFormHour(6);
    setFormMinute(0);
    setFormFormat('excel');
    setFormActive(true);
    setEditingId(null);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (schedule: Schedule) => {
    setEditingId(schedule.id);
    setFormName(schedule.name);
    setFormReportType(schedule.reportType);
    setFormScope(schedule.scope);
    setFormAssetIds([...schedule.assetIds]);
    setFormSiteId(schedule.siteId ?? '');
    setFormFrequency(schedule.frequency);
    setFormDayOfWeek(schedule.dayOfWeek);
    setFormDayOfMonth(schedule.dayOfMonth);
    setFormHour(schedule.hour);
    setFormMinute(schedule.minute);
    setFormFormat(schedule.format);
    setFormActive(schedule.active);
    setShowForm(true);
  };

  const saveSchedule = () => {
    if (!formName.trim()) {
      showToast('Please enter a schedule name.');
      return;
    }
    const now = clock.dubaiNow().toISOString();
    if (editingId) {
      setSchedules(prev => prev.map(s =>
        s.id === editingId
          ? { ...s, name: formName.trim(), reportType: formReportType, scope: formScope,
              assetIds: formAssetIds, siteId: formSiteId || null, frequency: formFrequency,
              dayOfWeek: formDayOfWeek, dayOfMonth: formDayOfMonth,
              hour: formHour, minute: formMinute, format: formFormat, active: formActive,
              nextRunAt: calculateNextRun({ ...s, frequency: formFrequency, dayOfWeek: formDayOfWeek, dayOfMonth: formDayOfMonth, hour: formHour, minute: formMinute }) }
          : s
      ));
      showToast(`“${formName.trim()}” updated.`);
    } else {
      const newSchedule: Schedule = {
        id: `sch-${Date.now()}`,
        name: formName.trim(),
        reportType: formReportType,
        scope: formScope,
        assetIds: formAssetIds,
        siteId: formSiteId || null,
        frequency: formFrequency,
        dayOfWeek: formDayOfWeek,
        dayOfMonth: formDayOfMonth,
        hour: formHour,
        minute: formMinute,
        format: formFormat,
        active: formActive,
        createdAt: now,
        lastRunAt: null,
        nextRunAt: calculateNextRun({
          id: '', name: '', reportType: formReportType, scope: formScope,
          assetIds: formAssetIds, siteId: formSiteId || null, frequency: formFrequency,
          dayOfWeek: formDayOfWeek, dayOfMonth: formDayOfMonth,
          hour: formHour, minute: formMinute, format: formFormat, active: formActive,
          createdAt: '', lastRunAt: null, nextRunAt: null,
        }),
      };
      setSchedules(prev => [newSchedule, ...prev]);
      showToast(`“${formName.trim()}” created.`);
    }
    setShowForm(false);
    resetForm();
  };

  const deleteSchedule = (id: string, name: string) => {
    setSchedules(prev => prev.filter(s => s.id !== id));
    showToast(`“${name}” deleted.`);
  };

  const toggleActive = (schedule: Schedule) => {
    setSchedules(prev => prev.map(s =>
      s.id === schedule.id ? { ...s, active: !s.active,
        nextRunAt: !s.active ? calculateNextRun(s) : null } : s
    ));
    showToast(`${schedule.name} ${!schedule.active ? 'activated' : 'deactivated'}.`);
  };

  const visibleSchedules = useMemo(() => {
    return schedules.map(s => ({
      ...s,
      nextRunAt: s.active ? calculateNextRun(s) : s.nextRunAt,
    }));
  }, [schedules]);

  const siteOptions = useMemo(() => {
    if (!session) return [];
    return seed.sites.filter(s => s.tenantId === session.tenantId);
  }, [session]);
  const assetOptions = useMemo(() => {
    if (!session) return [];
    return seed.assets.filter(a => a.ownerTenantId === session.tenantId);
  }, [session]);

  if (!session) return null;

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Schedules</h1>
        <p className="text-sm text-grey-500 mt-1">
          Automatically generate and download reports on a recurring schedule.
        </p>
      </div>

      {phase === 'day_one' ? (
        <EmptyState title="Not available" description="Schedules are available in Phase 2." />
      ) : (
        <>
          <div className="flex items-start justify-between">
            <div />
            {canManage && (
              <Button onClick={openCreateForm}>Create schedule</Button>
            )}
          </div>

          {toast && (
            <div className="fixed bottom-4 right-4 bg-ink text-paper px-4 py-2 rounded-lg shadow-lg text-sm">
              {toast}
            </div>
          )}

          {showForm && (
            <div className="bg-surface border border-line rounded-lg p-4">
              <h2 className="text-sm font-medium text-ink mb-3">
                {editingId ? 'Edit schedule' : 'Create schedule'}
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-grey-500 font-medium">Name</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="e.g. Daily trip report — Al Quoz"
                    maxLength={60}
                  />
                </div>

                <div>
                  <label className="text-xs text-grey-500 font-medium">Report type</label>
                  <select
                    value={formReportType}
                    onChange={e => setFormReportType(e.target.value as ReportType)}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  >
                    {Object.entries(REPORT_TYPE_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-grey-500 font-medium">Scope</label>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${formScope === 'single_asset' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'}`}
                      onClick={() => setFormScope('single_asset')}
                    >
                      Single asset
                    </button>
                    <button
                      type="button"
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${formScope === 'multiple_assets' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'}`}
                      onClick={() => setFormScope('multiple_assets')}
                    >
                      Multiple assets
                    </button>
                    <button
                      type="button"
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${formScope === 'site' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'}`}
                      onClick={() => setFormScope('site')}
                    >
                      Site
                    </button>
                  </div>
                </div>

                {formScope === 'single_asset' && (
                  <div>
                    <label className="text-xs text-grey-500 font-medium">Asset</label>
                    <select
                      value={formAssetIds[0] ?? ''}
                      onChange={e => setFormAssetIds([e.target.value])}
                      className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    >
                      <option value="">Select an asset</option>
                      {assetOptions.map(a => (
                        <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {formScope === 'multiple_assets' && (
                  <div>
                    <label className="text-xs text-grey-500 font-medium">Assets (select at least one)</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {assetOptions.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          className={`px-3 py-1 text-xs rounded-lg border transition-colors ${formAssetIds.includes(a.id) ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'}`}
                          onClick={() => {
                            if (formAssetIds.includes(a.id)) {
                              setFormAssetIds(formAssetIds.filter(id => id !== a.id));
                            } else {
                              setFormAssetIds([...formAssetIds, a.id]);
                            }
                          }}
                        >
                          {a.code}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {formScope === 'site' && (
                  <div>
                    <label className="text-xs text-grey-500 font-medium">Site</label>
                    <select
                      value={formSiteId}
                      onChange={e => setFormSiteId(e.target.value)}
                      className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    >
                      <option value="">Select a site</option>
                      {siteOptions.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-xs text-grey-500 font-medium">Frequency</label>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${formFrequency === 'daily' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'}`}
                      onClick={() => { setFormFrequency('daily'); setFormDayOfWeek(null); setFormDayOfMonth(null); }}
                    >
                      Daily
                    </button>
                    <button
                      type="button"
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${formFrequency === 'weekly' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'}`}
                      onClick={() => { setFormFrequency('weekly'); setFormDayOfWeek(0); setFormDayOfMonth(null); }}
                    >
                      Weekly
                    </button>
                    <button
                      type="button"
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${formFrequency === 'monthly' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'}`}
                      onClick={() => { setFormFrequency('monthly'); setFormDayOfWeek(null); setFormDayOfMonth(1); }}
                    >
                      Monthly
                    </button>
                  </div>
                </div>

                {formFrequency === 'weekly' && (
                  <div>
                    <label className="text-xs text-grey-500 font-medium">Day of week</label>
                    <div className="flex gap-1 mt-1">
                      {DAY_LABELS.map((day, i) => (
                        <button
                          key={day}
                          type="button"
                          className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${formDayOfWeek === i ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'}`}
                          onClick={() => setFormDayOfWeek(i)}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {formFrequency === 'monthly' && (
                  <div>
                    <label className="text-xs text-grey-500 font-medium">Day of month</label>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      value={formDayOfMonth ?? 1}
                      onChange={e => setFormDayOfMonth(Math.min(28, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs text-grey-500 font-medium">Time (Dubai)</label>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={formHour}
                      onChange={e => setFormHour(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-20 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    />
                    <span className="text-grey-500 text-sm">:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={formMinute}
                      onChange={e => setFormMinute(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-20 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    />
                    <span className="text-grey-500 text-sm ml-1">Dubai time</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-grey-500 font-medium">Format</label>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${formFormat === 'excel' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'}`}
                      onClick={() => setFormFormat('excel')}
                    >
                      Excel (.xlsx)
                    </button>
                    <button
                      type="button"
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${formFormat === 'pdf' ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'}`}
                      onClick={() => setFormFormat('pdf')}
                    >
                      PDF
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="active-toggle"
                    checked={formActive}
                    onChange={e => setFormActive(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="active-toggle" className="text-sm text-grey-700">Active — generate on schedule</label>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" onClick={() => { setShowForm(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button onClick={saveSchedule}>
                    {editingId ? 'Save changes' : 'Create schedule'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {visibleSchedules.length === 0 ? (
              <EmptyState title="No schedules" description="Create a schedule to generate reports automatically." />
            ) : (
              <div className="space-y-2">
                {visibleSchedules.map(schedule => (
                  <div key={schedule.id} className="bg-surface border border-line rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={schedule.active ? 'green' : 'grey'}>
                            {schedule.active ? 'Active' : 'Inactive'}
                          </Badge>
                          <span className="font-medium text-ink text-sm">{schedule.name}</span>
                          <Badge variant="yellow">{REPORT_TYPE_LABELS[schedule.reportType]}</Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-grey-500">
                          <span>Scope: {scopeLabel(schedule.scope)}</span>
                          <span>Frequency: {frequencyDescription(schedule)}</span>
                          <span>Format: {schedule.format.toUpperCase()}</span>
                          <span>Time: {formatScheduleTime(schedule.hour, schedule.minute)} Dubai</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-grey-500">
                          {schedule.lastRunAt && (
                            <span>Last run: {new Date(schedule.lastRunAt).toLocaleString('en-AE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })}</span>
                          )}
                          {schedule.nextRunAt && (
                            <span className="text-yellow-dark">Next: {new Date(schedule.nextRunAt).toLocaleString('en-AE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {canManage && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => toggleActive(schedule)}
                          >
                            {schedule.active ? 'Pause' : 'Resume'}
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openEditForm(schedule)}
                          >
                            Edit
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => deleteSchedule(schedule.id, schedule.name)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
            Schedules generate reports in the background and make them available in your Downloads page.
            All times are in Dubai (Asia/Dubai). Edit a schedule to change any setting.
          </div>
        </>
      )}
    </div>
  );
}
