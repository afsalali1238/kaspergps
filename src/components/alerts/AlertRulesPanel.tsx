'use client';

// AlertRulesPanel (UI-UPGRADE §8, reference `.al-rule-row`): per alert type,
// Instant / Daily digest / In-app only. Tenant Admins only; saved per company
// in the db and audited. A prototype: no message is ever sent.

import React, { useMemo, useState } from 'react';
import { Badge, Panel } from '@/components/ui';
import {
  ALERT_DELIVERIES, alertRulesFor, canManageAlertRules, saveAlertRule, useDb,
  type AlertDelivery, type AlertRuleView,
} from '@/server/api';
import type { Session } from '@/domain/types';
import { useT } from '@/i18n';

const DELIVERY_LABEL: Record<AlertDelivery, string> = {
  instant: 'Instant',
  digest: 'Daily digest',
  in_app: 'In-app only',
};

const TYPE_LABEL: Record<string, string> = {
  offline: 'Offline',
  power_cut: 'Power cut',
  fuel_drop: 'Fuel drop',
  fault_code: 'Fault code',
  towing: 'Towing',
  overspeed: 'Over speed',
  harsh_driving: 'Harsh driving',
  geofence_exit: 'Geofence exit',
  after_hours_move: 'After-hours move',
  maintenance_overdue: 'Maintenance overdue',
  maintenance_due: 'Maintenance due soon',
};

export function AlertRulesPanel({ session }: { session: Session }) {
  const t = useT();
  const stored = useDb(s => s.alertRules);
  const [notice, setNotice] = useState<string | null>(null);
  const rules = useMemo<AlertRuleView[]>(
    () => (canManageAlertRules(session) ? alertRulesFor(session) : []),
    // `stored` re-reads the rows after a save.
    [session, stored]
  );
  if (!canManageAlertRules(session) || rules.length === 0) return null;

  const change = (rule: AlertRuleView, delivery: AlertDelivery) => {
    const result = saveAlertRule(session, rule.type, delivery);
    setNotice(result.ok
      ? t('alerts_page.rules.saved', 'Saved. Prototype: no messages are sent.')
      : (result.error ?? null));
  };

  return (
    <Panel
      title={t('alerts_page.rules.title', 'Alert rules')}
      actions={<Badge tone="warn">{t('alerts_page.rules.prototype', 'Prototype — no messages are sent')}</Badge>}
      padding="none"
      className="overflow-hidden"
    >
      <div data-testid="alert-rules-panel">
        <p className="px-4 pt-3 text-xs text-text-secondary">
          {t('alerts_page.rules.hint', 'How your company hears about each alert type. Saved for everyone in your company.')}
        </p>
        <ul className="divide-y divide-line">
          {rules.map(rule => {
            const id = `alert-rule-${rule.type}`;
            return (
              <li key={rule.type} className="flex items-center justify-between gap-3 px-4 py-2">
                <label htmlFor={id} className="min-w-0 truncate text-sm text-ink">
                  {t(`alerts.types.${rule.type}`, TYPE_LABEL[rule.type] ?? rule.type)}
                </label>
                <select
                  id={id}
                  value={rule.delivery}
                  onChange={e => change(rule, e.target.value as AlertDelivery)}
                  className="min-h-10 shrink-0 rounded-md border border-line bg-surface px-2 text-xs text-ink sm:min-h-8"
                >
                  {ALERT_DELIVERIES.map(d => (
                    <option key={d} value={d}>{t(`alerts_page.delivery.${d}`, DELIVERY_LABEL[d])}</option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
        {notice && (
          <p role="status" className="border-t border-line px-4 py-2 text-xs text-text-secondary">{notice}</p>
        )}
      </div>
    </Panel>
  );
}
