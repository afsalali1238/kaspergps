'use client';

// Alerts (spec §11.4): the user's visible alerts from the seeded alert set —
// offline and hardware-gated types only, tenant-owned alerts to their tenant.
// Acknowledge is API-checked: Kasper and the owner's Tenant Admin only.

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { useStore } from '@/store';
import { visibleAlerts, alertTypesIn, acknowledgeAlert, type AlertView } from '@/server/alerts';
import { hasCapability, visibleAssetIds } from '@/server/access';
import { useDb } from '@/server/db';
import * as clock from '@/lib/clock';
import { useT } from '@/i18n';

export default function AlertsPage() {
  const seed = useDb(s => s);
  const t = useT();
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;
  const [alertFilter, setAlertFilter] = useState<'unacknowledged' | 'acknowledged' | 'all'>('unacknowledged');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const alerts = useMemo<AlertView[]>(
    () => (session ? visibleAlerts(session, phase) : []),
    [session, phase]
  );

  const typeOptions = useMemo(() => (session ? alertTypesIn(session, phase) : []), [session, phase]);

  // Site filter: only sites the user actually sees alerts at (S9 — Deepa's two sites).
  const siteOptions = useMemo(() => {
    if (!session) return [];
    const ids = new Set(visibleAssetIds(session).map(id => seed.assets.find(a => a.id === id)?.homeSiteId ?? ''));
    return Array.from(ids)
      .filter(Boolean)
      .map(id => ({ id, name: seed.sites.find(s => s.id === id)?.name ?? id }));
  }, [session]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      if (alertFilter === 'unacknowledged' && a.status !== 'open') return false;
      if (alertFilter === 'acknowledged' && a.status !== 'acknowledged') return false;
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (siteFilter !== 'all') {
        const asset = seed.assets.find(x => x.id === a.assetId);
        if (!asset || asset.homeSiteId !== siteFilter) return false;
      }
      return true;
    });
  }, [alerts, alertFilter, typeFilter, siteFilter]);

  const openCount = useMemo(() => alerts.filter(a => a.status === 'open').length, [alerts]);
  const canAcknowledge = session ? hasCapability(session, 'alert.acknowledge') : false;

  if (!session) return null;

  const handleAcknowledge = (alertId: string) => {
    setNotice(null);
    const result = acknowledgeAlert(session, alertId);
    if (result.ok && result.message) setNotice(result.message);
    setTick(x => x + 1);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-ink">{t('alerts.title', 'Alerts')}</h1>
        <p className="text-sm text-grey-500 mt-1">
          {openCount === 1
            ? t('alerts.open_count', '{count} open alert', { count: openCount })
            : t('alerts.open_count_plural', '{count} open alerts', { count: openCount })}
          {phase === 'day_one' && ` ${t('alerts.day_one_note', '(Day one: offline alerts only)')}`}
        </p>
      </div>

      {notice && (
        <div className="bg-green/10 border border-green/30 rounded-lg px-4 py-3 text-sm text-green">{notice}</div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-grey-500 font-medium">{t('alerts.show', 'Show:')}</span>
        {(['unacknowledged', 'acknowledged', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setAlertFilter(f)}
            className={clsx(
              'px-2 py-1 text-xs rounded-lg border transition-colors',
              alertFilter === f ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'
            )}
          >
            {t(`alerts.filter.${f}`, f === 'unacknowledged' ? 'Unacknowledged' : f === 'acknowledged' ? 'Acknowledged' : 'All')}
          </button>
        ))}
        {typeOptions.length > 1 && (
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-2 py-1 text-xs rounded-lg border border-line bg-paper text-grey-700"
          >
            <option value="all">{t('alerts.filter.all_types', 'All types')}</option>
            {typeOptions.map(o => <option key={o.type} value={o.type}>{o.label}</option>)}
          </select>
        )}
        {siteOptions.length > 1 && (
          <select
            value={siteFilter}
            onChange={e => setSiteFilter(e.target.value)}
            className="px-2 py-1 text-xs rounded-lg border border-line bg-paper text-grey-700"
          >
            <option value="all">{t('alerts.filter.all_sites', 'All sites')}</option>
            {siteOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {/* Alerts list */}
      {filteredAlerts.length === 0 ? (
        <EmptyState
          title={t('alerts.none', 'No alerts')}
          description={t('alerts.none_hint', 'There are no alerts to show.')}
        />
      ) : (
        <div className="space-y-2">
          {filteredAlerts.map(alert => (
            <div
              key={alert.id}
              className={clsx(
                'bg-surface border rounded-lg p-4',
                alert.status === 'open' ? 'border-red/20' : 'border-line'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {alert.assetId && <span className="font-medium text-ink">{alert.assetCode}</span>}
                    {alert.assetId && <span className="text-grey-500">— {alert.assetName}</span>}
                    <Badge variant={alert.status === 'open' ? 'red' : alert.status === 'acknowledged' ? 'grey' : 'green'}>
                      {t(`alerts.types.${alert.type}`, alert.typeLabel)}
                    </Badge>
                    {alert.tenantOwned && (
                      <Badge variant="grey">{t('alerts.company', 'Company')}</Badge>
                    )}
                  </div>
                  <div className="text-sm text-grey-700 mt-1">{t(`alerts.words.${alert.type}`, alert.typeWords)}</div>
                  <div className="text-xs text-grey-500 mt-1">
                    {t('alerts.since', 'Since {time} · {site}', {
                      time: clock.formatDubaiDateTime(typeof alert.openedAt === 'number' ? alert.openedAt : new Date(alert.openedAt).getTime()),
                      site: alert.siteName || '—',
                    })}
                  </div>
                  {alert.status === 'acknowledged' && alert.acknowledgedBy && (
                    <div className="text-xs text-grey-500 mt-1">
                      {t('alerts.acknowledged_by', 'Acknowledged by {name} at {at}', {
                        name: alert.acknowledgedBy,
                        at: alert.acknowledgedAt ? clock.formatDubaiTime(typeof alert.acknowledgedAt === 'string' ? new Date(alert.acknowledgedAt).getTime() : alert.acknowledgedAt) : '',
                      })}
                    </div>
                  )}
                  {alert.status === 'closed' && (
                    <div className="text-xs text-grey-500 mt-1">{t('alerts.closed', 'Closed')}</div>
                  )}
                </div>
                {alert.status === 'open' && canAcknowledge && (
                  <Button size="sm" variant="secondary" onClick={() => handleAcknowledge(alert.id)}>
                    {t('alerts.acknowledge', 'Acknowledge')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
