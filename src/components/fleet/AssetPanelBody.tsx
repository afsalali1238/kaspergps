'use client';

// The fleet map's asset panel (UI-UPGRADE §6, Agent E). The same content renders in
// the desktop right pane and the phone bottom sheet. Numbers come from
// fleetPanelFor (role-scoped) and are formatted by src/lib/format.ts, so a gap
// reads "Not measured", never 0. No destructive action lives here: "End access"
// stays on the asset page.

import React from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Check, TriangleAlert, ExternalLink, Share2, FileText } from 'lucide-react';
import { StatusBadge, Badge, MetricTile, ProgressBar, Sparkline } from '@/components/ui';
import { variantStyles } from '@/components/ui/Button';
import { can, type FleetPanel, type PanelMetric, type HealthRow, type Session } from '@/server/api';
import { formatHours, formatKm, formatNumber, formatPct, formatSpeed, formatVolts, NOT_MEASURED } from '@/lib/format';
import * as clock from '@/lib/clock';
import { useT, useHref } from '@/i18n';

type T = ReturnType<typeof useT>;

/** format.ts says "Not measured" in English; Arabic gets its own words. */
function nm(text: string, t: T): string {
  return text === NOT_MEASURED ? t('common.not_measured', 'Not measured') : text;
}

function when(msValue: number, t: T): string {
  const sameDay = clock.startOfDubaiDay(msValue) === clock.startOfDubaiDay(clock.now());
  return sameDay
    ? t('fleet.today_at', 'today {time}', { time: clock.formatDubaiTime(msValue) })
    : `${clock.formatDubaiDate(msValue)} ${clock.formatDubaiTime(msValue)}`;
}

function ago(msValue: number, t: T): string {
  const min = Math.max(0, Math.round(clock.minutesSinceDubai(msValue)));
  if (min < 60) return t('shell.min_ago', '{count} min ago', { count: min });
  return t('shell.hours_ago', '{count} h ago', { count: Math.round(min / 60) });
}

function metricTile(m: PanelMetric, t: T) {
  const source = m.source ?? undefined;
  switch (m.key) {
    case 'engine_hours':
      return <MetricTile key={m.key} label={t('fleet.metric.engine_hours', 'Engine hours')} value={m.value === null ? null : formatHours(m.value)} source={source} />;
    case 'rpm':
      return <MetricTile key={m.key} label={t('fleet.metric.rpm', 'Engine RPM')} value={m.value === null ? null : formatNumber(m.value)} unit="rpm" source={source} />;
    case 'speed':
      return <MetricTile key={m.key} label={t('fleet.metric.speed', 'Speed')} value={m.value === null ? null : formatSpeed(m.value)} source={source} />;
    case 'fuel_level':
      return <MetricTile key={m.key} label={t('fleet.metric.fuel_level', 'Fuel level')} value={m.value === null ? null : formatPct(m.value)} source={source} />;
    case 'load':
      return <MetricTile key={m.key} label={t('fleet.metric.load', 'Engine load')} value={m.value === null ? null : formatPct(m.value)} source={source} />;
    case 'ignition':
      return <MetricTile key={m.key} label={t('fleet.metric.ignition', 'Ignition')} value={m.on === undefined ? null : m.on ? t('common.on', 'On') : t('common.off', 'Off')} tone={m.on ? 'ok' : 'neutral'} source={source} />;
    case 'distance_today':
      return <MetricTile key={m.key} label={t('fleet.metric.distance_today', "Today's distance")} value={m.value === null ? null : formatKm(m.value)} source={source} />;
    case 'last_update':
      return <MetricTile key={m.key} label={t('fleet.metric.last_update', 'Last update')} value={m.value === null ? null : clock.formatDubaiTime(m.value)} context={m.value === null ? undefined : ago(m.value, t)} source={source} />;
    default:
      return null;
  }
}

function healthValue(row: HealthRow, t: T): string {
  switch (row.key) {
    case 'coolant': return row.value === null ? t('common.not_measured', 'Not measured') : `${formatNumber(row.value)} °C`;
    case 'voltage': return nm(formatVolts(row.value), t);
    case 'faults': return row.value === 0 ? t('fleet.health.no_faults', 'None active') : t('fleet.health.faults_count', '{count} active', { count: row.value ?? 0 });
    case 'satellites': return nm(formatNumber(row.value), t);
    case 'last_ping': return row.value === null ? t('common.no_data', 'No data') : ago(row.value, t);
  }
}

const HEALTH_LABELS: Record<HealthRow['key'], [string, string]> = {
  coolant: ['fleet.health.coolant', 'Coolant'],
  voltage: ['fleet.health.voltage', 'Vehicle voltage'],
  faults: ['fleet.health.faults', 'Fault codes'],
  satellites: ['fleet.health.satellites', 'Satellites'],
  last_ping: ['fleet.health.last_ping', 'Last ping'],
};

const buttonLink = 'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium min-h-10';

/** The panel's sub-line: site and the company relationship, or the live rental. */
export function panelSubline(panel: FleetPanel, t: T): string {
  if (panel.rental?.kind === 'rented_in') {
    return t('fleet.rented_from_until', 'Rented from {owner} until {when}', { owner: panel.rental.counterparty, when: when(panel.rental.endsAt, t) });
  }
  if (panel.rental?.kind === 'on_hire') {
    return t('fleet.on_hire_until', 'On hire to {renter} until {when}', { renter: panel.rental.counterparty, when: when(panel.rental.endsAt, t) });
  }
  return panel.siteName;
}

export function AssetPanelBody({ panel, session }: { panel: FleetPanel; session: Session }) {
  const t = useT();
  const href = useHref();
  const canShare = can(session, 'link.create', panel.id);
  const canReport = can(session, 'report.run');

  return (
    <div className="space-y-4" data-testid="asset-panel">
      <div className="space-y-2">
        <p className="text-xs text-text-secondary">
          {panel.rental ? `${panel.siteName} · ${panelSubline(panel, t)}` : panelSubline(panel, t)}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={panel.status} size="sm" />
          {panel.ignition !== null && (
            <Badge tone={panel.ignition ? 'ok' : 'neutral'}>{panel.ignition ? t('fleet.ignition_on', 'Ignition on') : t('fleet.ignition_off', 'Ignition off')}</Badge>
          )}
          {panel.maintenanceDue && <Badge tone="warn">{t('fleet.maintenance_due', 'Maintenance due')}</Badge>}
          {panel.rental?.kind === 'rented_in' && <Badge tone="accent">{t('common.status.rented', 'Rented')}</Badge>}
          {panel.rental?.kind === 'on_hire' && <Badge tone="info">{t('fleet.on_hire', 'On hire')}</Badge>}
          {panel.openAlerts > 0 && <Badge tone="bad">{t('fleet.open_alerts_count', '{count} open alerts', { count: panel.openAlerts })}</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {panel.metrics.map(m => metricTile(m, t))}
      </div>

      {panel.fuel && (
        <section aria-label={t('fleet.fuel', 'Fuel')} className="space-y-2 rounded-md border border-line p-3">
          <ProgressBar
            label={t('fleet.fuel_tank', 'Fuel tank')}
            value={panel.fuel.levelPct}
            tone={panel.fuel.levelPct < 20 ? 'bad' : panel.fuel.levelPct < 35 ? 'warn' : 'ok'}
            valueLabel={t('fleet.litres_of', '{left} L of {tank} L', { left: formatNumber(panel.fuel.litresLeft), tank: formatNumber(panel.fuel.tankL) })}
          />
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-eyebrow">{t('fleet.fuel_used_today', 'Used today')}</div>
              <div className="font-mono text-sm text-ink">
                {panel.fuel.usedTodayL === null ? t('common.not_measured', 'Not measured') : `${formatNumber(panel.fuel.usedTodayL, 1)} L`}
                {panel.fuel.usedSource && <span className="ms-1.5 text-[10px] text-text-secondary">{panel.fuel.usedSource}</span>}
              </div>
            </div>
            {panel.fuel.week.some(v => v !== null) && (
              <div className="text-end">
                <div className="text-eyebrow">{t('fleet.fuel_7_days', 'Fuel used, 7 days')}</div>
                <Sparkline values={panel.fuel.week} label={t('fleet.fuel_7_days', 'Fuel used, 7 days')} width={112} height={28} tone="info" area />
              </div>
            )}
          </div>
        </section>
      )}

      <section aria-label={t('fleet.health_title', 'Health')}>
        <h3 className="text-eyebrow mb-1">{t('fleet.health_title', 'Health')}</h3>
        <ul className="divide-y divide-line rounded-md border border-line">
          {panel.health.map(row => (
            <li key={row.key} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <span className="text-text-secondary">{t(HEALTH_LABELS[row.key][0], HEALTH_LABELS[row.key][1])}</span>
              <span className={clsx('inline-flex items-center gap-1.5 font-mono text-xs', row.ok ? 'text-ink' : 'text-bad-ink')}>
                {healthValue(row, t)}
                {row.ok
                  ? <Check size={14} className="text-ok-ink" aria-label={t('fleet.health.ok', 'OK')} />
                  : <TriangleAlert size={14} aria-label={t('fleet.health.check', 'Check')} />}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {panel.nextService && (
        <section aria-label={t('fleet.next_service', 'Next service')} className="rounded-md border border-line px-3 py-2">
          <div className="text-eyebrow">{t('fleet.next_service', 'Next service')}</div>
          <div className="text-sm text-ink">{panel.nextService.name}</div>
          <div className={clsx('text-xs', panel.nextService.state === 'overdue' ? 'text-bad-ink' : panel.nextService.state === 'due_soon' ? 'text-warn-ink' : 'text-text-secondary')}>
            {panel.nextService.headline}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-2">
        <Link href={href(`/app/assets/${panel.id}`)} className={clsx(buttonLink, variantStyles.primary)}>
          <ExternalLink size={15} aria-hidden /> {t('fleet.open_asset', 'Open asset page')}
        </Link>
        <div className="grid grid-cols-2 gap-2">
          {canShare && (
            <Link href={href(`/app/assets/${panel.id}?panel=share`)} className={clsx(buttonLink, variantStyles.secondary)}>
              <Share2 size={15} aria-hidden /> {t('fleet.share_link', 'Share link')}
            </Link>
          )}
          {canReport && (
            <Link href={href('/app/reports')} className={clsx(buttonLink, variantStyles.secondary)}>
              <FileText size={15} aria-hidden /> {t('fleet.run_report', 'Run report')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
