'use client';

// Alerts (spec §11.4, UI-UPGRADE §8): the user's visible alerts, grouped by
// severity, with a KPI strip, one filter bar, "Acknowledge all (n)" and the
// prototype rules panel for Tenant Admins. Acknowledge is API-checked: Kasper
// and the owner's Tenant Admin only. Every count comes from `visibleAlerts`,
// the same list the bell reads.

import React, { useMemo, useState } from 'react';
import {
  Button, ConfirmDialog, EmptyState, KpiCell, KpiStrip, SegmentedTabs,
} from '@/components/ui';
import { AlertRow } from '@/components/alerts/AlertRow';
import { AlertRulesPanel } from '@/components/alerts/AlertRulesPanel';
import { SEVERITY_ICON, SEVERITY_LABEL, SEVERITY_TONE } from '@/components/alerts/severity';
import { toneText } from '@/components/ui/tones';
import {
  acknowledgeAlert, acknowledgeAlerts, alertKpis, alertTypesIn, canManageAlertRules, groupAlertsBySeverity,
  mayAcknowledge, visibleAlerts, visibleAssetIds, viewerSiteId, useDb, type AlertView,
} from '@/server/api';
import { useT } from '@/i18n';
import { useSession, useSwitches } from '@/hooks';

type StatusFilter = 'open' | 'acknowledged' | 'all';

export default function AlertsPage() {
  const seed = useDb(s => s);
  const alertRows = useDb(s => s.alerts);
  const t = useT();
  const session = useSession();
  const { phase } = useSwitches();
  const [status, setStatus] = useState<StatusFilter>('open');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const alerts = useMemo<AlertView[]>(
    () => (session ? visibleAlerts(session, phase) : []),
    // `alertRows` re-reads after an acknowledge.
    [session, phase, alertRows]
  );
  const kpis = useMemo(
    () => (session ? alertKpis(session, phase) : null),
    [session, phase, alertRows]
  );
  const typeOptions = useMemo(() => (session ? alertTypesIn(session, phase) : []), [session, phase]);

  // Site filter: only sites the user actually sees assets at (S9 — Deepa's two sites).
  const siteOptions = useMemo(() => {
    if (!session) return [];
    const ids = new Set(visibleAssetIds(session).map(id => viewerSiteId(session, id) ?? ''));
    return Array.from(ids)
      .filter(Boolean)
      .map(id => ({ id, name: seed.sites.find(s => s.id === id)?.name ?? id }));
  }, [session, seed.sites]);

  const filtered = useMemo(() => alerts.filter(a => {
    if (status === 'open' && a.status !== 'open') return false;
    if (status === 'acknowledged' && a.status !== 'acknowledged') return false;
    if (typeFilter !== 'all' && a.type !== typeFilter) return false;
    if (siteFilter !== 'all') {
      if (!session || !a.assetId || viewerSiteId(session, a.assetId) !== siteFilter) return false;
    }
    return true;
  }), [alerts, status, typeFilter, siteFilter, session]);

  const groups = useMemo(() => groupAlertsBySeverity(filtered), [filtered]);
  const ackable = useMemo(
    () => (session ? filtered.filter(a => mayAcknowledge(session, a)) : []),
    [filtered, session]
  );

  if (!session) return null;

  const openCount = alerts.filter(a => a.status === 'open').length;
  const ackCount = alerts.filter(a => a.status === 'acknowledged').length;
  const showRules = canManageAlertRules(session);

  const handleAcknowledge = (alertId: string) => {
    const result = acknowledgeAlert(session, alertId);
    setNotice(result.ok ? (result.message ?? null) : (result.error ?? null));
  };

  const handleAcknowledgeAll = () => {
    const result = acknowledgeAlerts(session, ackable.map(a => a.id), phase);
    setConfirmAll(false);
    setNotice(t('alerts_page.ack_all_done', 'Acknowledged {count} alerts. Each one is in the audit log.', { count: result.acknowledged.length }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-ink">{t('alerts.title', 'Alerts')}</h1>
          <p className="mt-1 text-sm text-text-secondary" data-testid="alerts-open-count">
            {openCount === 1
              ? t('alerts.open_count', '{count} open alert', { count: openCount })
              : t('alerts.open_count_plural', '{count} open alerts', { count: openCount })}
            {phase === 'day_one' && ` ${t('alerts.day_one_note', '(Day one: offline alerts only)')}`}
          </p>
        </div>
      </div>

      {kpis && (
        <KpiStrip label={t('alerts_page.kpi.label', 'Alerts summary')}>
          <KpiCell
            label={t('alerts_page.kpi.new_today', 'New today')}
            value={kpis.newToday}
            source={t('alerts_page.kpi.source', 'From alerts')}
          />
          <KpiCell
            label={t('alerts_page.kpi.critical', 'Critical')}
            value={kpis.critical}
            tone={kpis.critical > 0 ? 'bad' : 'neutral'}
            context={t('alerts_page.kpi.open', 'Open')}
            source={t('alerts_page.kpi.source', 'From alerts')}
          />
          <KpiCell
            label={t('alerts_page.kpi.warning', 'Warning')}
            value={kpis.warning}
            tone={kpis.warning > 0 ? 'warn' : 'neutral'}
            context={t('alerts_page.kpi.open', 'Open')}
            source={t('alerts_page.kpi.source', 'From alerts')}
          />
          <KpiCell
            label={t('alerts_page.kpi.ack_today', 'Acknowledged today')}
            value={kpis.acknowledgedToday}
            source={t('alerts_page.kpi.source', 'From alerts')}
          />
        </KpiStrip>
      )}

      {notice && (
        <div role="status" className="rounded-lg border border-ok/30 bg-ok-tint px-4 py-3 text-sm text-ok-ink">{notice}</div>
      )}

      {/* One filter bar */}
      <div className="flex flex-wrap items-center gap-2" data-testid="alerts-filters">
        <SegmentedTabs<StatusFilter>
          label={t('alerts_page.status_label', 'Status')}
          idPrefix="alert-status"
          value={status}
          onChange={setStatus}
          tabs={[
            { id: 'open', label: t('alerts_page.status.open', 'Open'), count: openCount },
            { id: 'acknowledged', label: t('alerts.filter.acknowledged', 'Acknowledged'), count: ackCount },
            { id: 'all', label: t('alerts.filter.all', 'All'), count: alerts.length },
          ]}
        />
        {typeOptions.length > 1 && (
          <select
            aria-label={t('alerts_page.type_label', 'Alert type')}
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="min-h-10 rounded-lg border border-line bg-surface px-2 text-xs text-ink sm:min-h-8"
          >
            <option value="all">{t('alerts.filter.all_types', 'All types')}</option>
            {typeOptions.map(o => <option key={o.type} value={o.type}>{t(`alerts.types.${o.type}`, o.label)}</option>)}
          </select>
        )}
        {siteOptions.length > 1 && (
          <select
            aria-label={t('alerts_page.site_label', 'Site')}
            value={siteFilter}
            onChange={e => setSiteFilter(e.target.value)}
            className="min-h-10 rounded-lg border border-line bg-surface px-2 text-xs text-ink sm:min-h-8"
          >
            <option value="all">{t('alerts.filter.all_sites', 'All sites')}</option>
            {siteOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {ackable.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            className="min-h-10 sm:ms-auto sm:min-h-0"
            onClick={() => setConfirmAll(true)}
          >
            {t('alerts_page.ack_all', 'Acknowledge all ({count})', { count: ackable.length })}
          </Button>
        )}
      </div>

      <div className={showRules ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]' : ''}>
        <div className="min-w-0 space-y-5">
          {groups.length === 0 ? (
            <EmptyState
              title={t('alerts.none', 'No alerts')}
              description={t('alerts.none_hint', 'There are no alerts to show.')}
            />
          ) : groups.map(group => {
            const Icon = SEVERITY_ICON[group.severity];
            return (
              <section key={group.severity} aria-labelledby={`alerts-group-${group.severity}`} data-testid={`alert-group-${group.severity}`}>
                <h2 id={`alerts-group-${group.severity}`} className="mb-2 flex items-center gap-2 text-eyebrow">
                  <Icon aria-hidden className={`h-4 w-4 ${toneText[SEVERITY_TONE[group.severity]]}`} />
                  <span>{t(`alerts_page.severity.${group.severity}`, SEVERITY_LABEL[group.severity])}</span>
                  <span className="font-mono tabular-nums">({group.alerts.length})</span>
                </h2>
                <ul className="space-y-2">
                  {group.alerts.map(alert => (
                    <AlertRow
                      key={alert.id}
                      alert={alert}
                      severity={group.severity}
                      canAcknowledge={mayAcknowledge(session, alert)}
                      onAcknowledge={handleAcknowledge}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        {showRules && (
          <aside className="min-w-0">
            <AlertRulesPanel session={session} />
          </aside>
        )}
      </div>

      <ConfirmDialog
        open={confirmAll}
        title={t('alerts_page.ack_all_title', 'Acknowledge {count} alerts?', { count: ackable.length })}
        body={t('alerts_page.ack_all_body', 'Each alert is marked acknowledged with your name and the time, and logged in the audit trail. Alerts you can’t acknowledge are left as they are.')}
        confirmLabel={t('alerts_page.ack_all_confirm', 'Acknowledge all')}
        onConfirm={handleAcknowledgeAll}
        onCancel={() => setConfirmAll(false)}
      />
    </div>
  );
}
