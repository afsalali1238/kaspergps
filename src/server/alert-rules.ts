// Alert notification rules (UI-UPGRADE §8, Agent G). A prototype: each
// company's Tenant Admin picks, per alert type, Instant / Daily digest /
// In-app only. The choice is saved per tenant in the db and audited, but no
// message is ever sent (§17: no real WhatsApp, SMS or email).

import type { AlertType, Session } from '@/domain/types';
import { append, db, nextNumber, touch } from '@/server/db';
import { fail, ok, type OpResult } from '@/server/result';
import { can } from '@/server/capabilities';
import { anyAssetHasFeature } from '@/server/access';
import { recordAuditForSession } from '@/server/audit';
import { alertSeverity } from '@/server/alerts-screen';
import * as clock from '@/lib/clock';

export type AlertDelivery = 'instant' | 'digest' | 'in_app';

export const ALERT_DELIVERIES: readonly AlertDelivery[] = ['instant', 'digest', 'in_app'];

/** One saved choice: tenant × alert type. */
export interface AlertRule {
  id: string;
  tenantId: string;
  type: AlertType;
  delivery: AlertDelivery;
  updatedBy: string;
  updatedAt: string;
}

export interface AlertRuleView {
  type: AlertType;
  delivery: AlertDelivery;
  /** False while the row still shows the default. */
  saved: boolean;
}

/** The types a company can set a rule for, in severity order. Hardware types need the hardware. */
const RULE_TYPES: { type: AlertType; feature?: string }[] = [
  { type: 'offline' },
  { type: 'power_cut' },
  { type: 'fuel_drop', feature: 'fuel.level' },
  { type: 'fault_code', feature: 'faults' },
  { type: 'towing' },
  { type: 'overspeed' },
  { type: 'harsh_driving' },
  { type: 'geofence_exit' },
  { type: 'after_hours_move' },
  { type: 'maintenance_overdue' },
  { type: 'maintenance_due' },
];

/** Default before a company saves anything: critical is instant, the rest stay in the app. */
function defaultDelivery(type: AlertType): AlertDelivery {
  return alertSeverity(type) === 'critical' ? 'instant' : 'in_app';
}

/** Tenant Admins of a company only. Site Users and Kasper staff (no company) don't get the panel. */
export function canManageAlertRules(session: Session | null): boolean {
  if (!session || session.isKasper || !session.tenantId) return false;
  return can(session, 'users.manage');
}

/** The rule rows for the user's company, or [] when they may not manage rules. */
export function alertRulesFor(session: Session): AlertRuleView[] {
  if (!canManageAlertRules(session)) return [];
  const saved = db.getState().alertRules.filter(r => r.tenantId === session.tenantId);
  return RULE_TYPES
    .filter(r => !r.feature || anyAssetHasFeature(session, r.feature))
    .map(({ type }) => {
      const row = saved.find(r => r.type === type);
      return { type, delivery: row?.delivery ?? defaultDelivery(type), saved: Boolean(row) };
    });
}

/** Save one choice for the user's company. Audited; sends nothing. */
export function saveAlertRule(session: Session, type: AlertType, delivery: AlertDelivery): OpResult<AlertRuleView> {
  if (!canManageAlertRules(session)) return fail('You can’t change alert rules.');
  if (!ALERT_DELIVERIES.includes(delivery)) return fail('Pick Instant, Daily digest or In-app only.');
  if (!alertRulesFor(session).some(r => r.type === type)) return fail('That alert type isn’t available for your fleet.');

  const tenantId = session.tenantId as string;
  const at = new Date(clock.now()).toISOString();
  const rules = db.getState().alertRules;
  const existing = rules.find(r => r.tenantId === tenantId && r.type === type);
  if (existing) {
    if (existing.delivery === delivery) return ok({ type, delivery, saved: true }, 'No change.');
    existing.delivery = delivery;
    existing.updatedBy = session.user.name;
    existing.updatedAt = at;
    touch('alertRules');
  } else {
    append('alertRules', {
      id: `ar-${nextNumber('ar-', rules)}`,
      tenantId,
      type,
      delivery,
      updatedBy: session.user.name,
      updatedAt: at,
    });
  }
  recordAuditForSession(session, {
    action: 'alert.rule',
    tenantId,
    detail: `Alert rule for ${type} set to ${delivery} (prototype, no messages sent)`,
  });
  return ok({ type, delivery, saved: true }, 'Saved. Prototype: no messages are sent.');
}
