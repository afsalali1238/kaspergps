// Simulated email outbox (spec 10, Tools): what Kasper would have emailed —
// scheduled report runs to their owner, and alert notifications to the
// asset's owning tenant admins. Nothing is ever actually sent.

import type { Alert, ReportRun, Session } from '@/domain/types';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { actorName } from '@/server/audit';
import { hasRole } from '@/server/capabilities';

export interface OutboxItem {
  id: string;
  kind: 'report' | 'alert';
  to: string;
  toName: string;
  subject: string;
  detail: string;
  at: number;
}

const MAIL_DOMAIN = 'kasper.ae';

function emailFor(userId: string): string {
  return seed.users.find(u => u.id === userId)?.email ?? `no-reply@${MAIL_DOMAIN}`;
}

function toMs(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : new Date(v).getTime();
}

function reportItem(run: ReportRun): OutboxItem {
  const user = seed.users.find(u => u.id === run.userId);
  const name = user?.name ?? run.userId;
  return {
    id: `mail-${run.id}`,
    kind: 'report',
    to: user?.email ?? `no-reply@${MAIL_DOMAIN}`,
    toName: name,
    subject: `Kasper ${run.reportType} — ${run.scope}`,
    detail: `${run.format.toUpperCase()} attached as ${run.fileName}`,
    at: toMs(run.createdAt),
  };
}

function alertItem(alert: Alert): OutboxItem | null {
  const asset = seed.assets.find(a => a.id === alert.assetId);
  if (!asset) return null;
  const admins = seed.users.filter(u => u.tenantId === asset.ownerTenantId && hasRole(u, 'tenant_admin'));
  const toAlert = seed.alerts.filter(a => a.id === alert.id);
  const owner = admins[0];
  return {
    id: `mail-${alert.id}`,
    kind: 'alert',
    to: emailFor(owner?.id ?? ''),
    toName: owner?.name ?? actorName(asset.createdBy),
    subject: `${asset.code} — ${alert.type.replace(/([A-Z])/g, ' $1').toLowerCase()}`,
    detail: toAlert[0]?.detail ?? alert.detail,
    at: toMs(alert.openedAt),
  };
}

/** Newest first; the demo runner sees every tenant, not just the current one. */
export function outboxItems(): OutboxItem[] {
  const reports = seed.reportRuns.map(reportItem);
  const alerts = seed.alerts.map(alertItem).filter((a): a is OutboxItem => a !== null);
  return [...reports, ...alerts].sort((a, b) => b.at - a.at);
}

export function outboxForSession(session: Session | null): OutboxItem[] {
  if (!session || session.isKasper) return outboxItems();
  return outboxItems().filter(i => i.to === session.user.email);
}

export function outboxCountLabel(nowMs: number = clock.now()): string {
  const items = outboxItems();
  const today = items.filter(i => clock.formatDubaiDate(i.at) === clock.formatDubaiDate(nowMs)).length;
  return `${items.length} simulated emails · ${today} today`;
}
