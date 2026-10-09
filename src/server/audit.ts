// Audit log helpers (spec 11.9 Audit log).
// Every create, change, retire, pair, fit, transfer and import writes an entry here.

import type { AuditEntry, Session } from '@/domain/types';
import { db, append, nextNumber } from '@/server/db';
import * as clock from '@/lib/clock';

export interface AuditInput {
  actorUserId: string;
  action: string;
  tenantId?: string;
  assetId?: string;
  bookingId?: string;
  detail: string;
  reason?: string;
}

/** Append an entry to the audit log. Returns the created entry. */
export function recordAudit(input: AuditInput): AuditEntry {
  const entry: AuditEntry = {
    id: `au-${nextNumber('au-', db.getState().auditEntries, 1000)}`,
    at: new Date(clock.now()).toISOString(),
    actorUserId: input.actorUserId,
    action: input.action,
    tenantId: input.tenantId,
    assetId: input.assetId,
    bookingId: input.bookingId,
    detail: input.detail,
    reason: input.reason,
  };
  append('auditEntries', entry);
  return entry;
}

export function recordAuditForSession(session: Session, input: Omit<AuditInput, 'actorUserId'>): AuditEntry {
  return recordAudit({ ...input, actorUserId: session.userId });
}

/**
 * Kasper staff opening a tenant's asset (spec §2 rule 10, §5). Written at most
 * once per user per asset per hour, so a page that re-renders does not flood
 * the log. Returns null when the view is already recorded for this window.
 */
export const CROSS_TENANT_WINDOW_MS = 3600_000;

export function recordCrossTenantView(session: Session, asset: { id: string; ownerTenantId: string }): AuditEntry | null {
  const since = clock.now() - CROSS_TENANT_WINDOW_MS;
  const seen = db.getState().auditEntries.some(e =>
    e.action === 'asset.view.crossTenant' &&
    e.actorUserId === session.userId &&
    e.assetId === asset.id &&
    new Date(e.at).getTime() > since
  );
  if (seen) return null;
  return recordAuditForSession(session, {
    action: 'asset.view.crossTenant',
    tenantId: asset.ownerTenantId,
    assetId: asset.id,
    detail: `${actorName(session.userId)} viewed ${tenantName(asset.ownerTenantId)} assets`,
  });
}

export function actorName(actorUserId: string): string {
  return db.getState().users.find(u => u.id === actorUserId)?.name ?? actorUserId;
}

export function tenantName(tenantId?: string): string {
  if (!tenantId) return '—';
  return db.getState().tenants.find(t => t.id === tenantId)?.name ?? tenantId;
}

export function assetCode(assetId?: string): string {
  if (!assetId) return '—';
  return db.getState().assets.find(a => a.id === assetId)?.code ?? assetId;
}

// ── Querying (Audit log page) ────────────────────────────────────────────────

export interface AuditFilters {
  /** Person: id, name or email, matched loosely. */
  person?: string;
  /** Tenant id or name, matched loosely. */
  tenant?: string;
  /** Action key, e.g. `muc.issue`. */
  action?: string;
  /** Inclusive ISO date (YYYY-MM-DD, Dubai) lower bound. */
  from?: string;
  /** Inclusive ISO date (YYYY-MM-DD, Dubai) upper bound. */
  to?: string;
}

function atMs(entry: AuditEntry): number {
  return typeof entry.at === 'number' ? entry.at : new Date(entry.at).getTime();
}

export function queryAuditEntries(filters: AuditFilters = {}): AuditEntry[] {
  const person = filters.person?.trim().toLowerCase();
  const tenant = filters.tenant?.trim().toLowerCase();
  let fromMs: number | null = null;
  let toMs: number | null = null;
  if (filters.from) {
    const t = new Date(`${filters.from}T00:00:00+04:00`).getTime();
    if (Number.isFinite(t)) fromMs = t;
  }
  if (filters.to) {
    const t = new Date(`${filters.to}T23:59:59.999+04:00`).getTime();
    if (Number.isFinite(t)) toMs = t;
  }

  return db.getState().auditEntries
    .filter(e => {
      if (filters.action && e.action !== filters.action) return false;
      if (person) {
        const haystack = `${actorName(e.actorUserId)} ${e.actorUserId}`.toLowerCase();
        if (!haystack.includes(person)) return false;
      }
      if (tenant) {
        const names = `${tenantName(e.tenantId)} ${e.tenantId ?? ''}`.toLowerCase();
        const detail = e.detail.toLowerCase();
        if (!names.includes(tenant) && !detail.includes(tenant)) return false;
      }
      const t = atMs(e);
      if (fromMs !== null && t < fromMs) return false;
      if (toMs !== null && t > toMs) return false;
      return true;
    })
    .sort((a, b) => atMs(b) - atMs(a));
}

export function auditActions(): string[] {
  const actions = new Set(db.getState().auditEntries.map(e => e.action));
  return [...actions].sort();
}

function csvCell(value: string | number | undefined): string {
  const s = value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function auditEntriesToCsv(entries: AuditEntry[]): string {
  const header = ['When', 'Person', 'Tenant', 'Action', 'Asset', 'Detail', 'Reason'];
  const rows = entries.map(e => [
    new Date(atMs(e)).toISOString(),
    actorName(e.actorUserId),
    tenantName(e.tenantId),
    e.action,
    assetCode(e.assetId),
    e.detail,
    e.reason ?? '',
  ]);
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
}
