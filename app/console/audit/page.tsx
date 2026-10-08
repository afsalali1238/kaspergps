'use client';

import React, { useState, useMemo } from 'react';
import { Button, Badge, EmptyState } from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';

const auditActions = [
  'create',
  'edit',
  'retire',
  'pair',
  'fit',
  'transfer',
  'import',
  'suspend',
  'close',
  'deactivate',
  'reactivate',
  'acknowledge',
  'invite',
  'resend',
];

function formatTs(ts: string | number): string {
  const d = new Date(typeof ts === 'number' ? ts : ts);
  return d.toLocaleString('en-AE', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Dubai',
  });
}

export default function AuditLogPage() {
  const store = useStore;
  const session = store.getState().session;

  const [person, setPerson] = useState('');
  const [tenant, setTenant] = useState('');
  const [action, setAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const exportCsv = () => {
    const header = 'When,Person,Tenant,Action,Detail';
    const rows = filtered.map(e => {
      const when = typeof e.at === 'number' ? new Date(e.at).toISOString() : e.at;
      const detail = `"${String(e.detail).replace(/"/g, '""')}"`;
      return `${when},"${e.person}","${e.tenant}",${e.action},${detail}`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!session || !session.isKasper) {
    return (
      <div className="text-center py-8">
        <EmptyState title="Not available" description="Only Kasper staff can access the console." />
      </div>
    );
  }

  const entries = useMemo(() => {
    // In production this comes from the audit store. In the prototype we show
    // a representative set derived from seed data.
    const items: { id: string; person: string; tenant: string; action: string; at: string | number; detail: string }[] = [];

    // Tenant creates
    for (const t of seed.tenants) {
      items.push({
        id: `audit-tenant-create-${t.id}`,
        person: 'Kasper Admin',
        tenant: t.name,
        action: 'create',
        at: t.createdAt,
        detail: `Tenant created: ${t.name}`,
      });
    }

    // Asset creates
    for (const a of seed.assets) {
      items.push({
        id: `audit-asset-create-${a.id}`,
        person: 'Kasper Admin',
        tenant: seed.tenants.find(t => t.id === a.ownerTenantId)?.name ?? '—',
        action: 'create',
        at: a.createdAt,
        detail: `Asset created: ${a.code} — ${a.name}`,
      });
    }

    // Sort newest first
    return items.sort((a, b) => {
      const ta = typeof a.at === 'number' ? a.at : new Date(a.at).getTime();
      const tb = typeof b.at === 'number' ? b.at : new Date(b.at).getTime();
      return tb - ta;
    });
  }, []);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (person && !e.person.toLowerCase().includes(person.toLowerCase())) return false;
      if (tenant && !e.tenant.toLowerCase().includes(tenant.toLowerCase())) return false;
      if (action && e.action !== action) return false;
      if (dateFrom) {
        const from = new Date(dateFrom).getTime();
        const at = typeof e.at === 'number' ? e.at : new Date(e.at).getTime();
        if (at < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo).getTime() + 86400000;
        const at = typeof e.at === 'number' ? e.at : new Date(e.at).getTime();
        if (at >= to) return false;
      }
      return true;
    });
  }, [entries, person, tenant, action, dateFrom, dateTo]);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Audit log</h1>
        <p className="text-sm text-grey-500 mt-1">
          Every create, change, retire, pair, fit, transfer, and import is recorded here.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-surface border border-line rounded-lg p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-grey-500 font-medium">Person</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              placeholder="Name or email"
              value={person}
              onChange={e => setPerson(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-grey-500 font-medium">Tenant</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              placeholder="Company name"
              value={tenant}
              onChange={e => setTenant(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-grey-500 font-medium">Action</label>
            <select
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              value={action}
              onChange={e => setAction(e.target.value)}
            >
              <option value="">All actions</option>
              {auditActions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-grey-500 font-medium">From date</label>
            <input
              type="date"
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs text-grey-500 font-medium">To date</label>
          <input
            type="date"
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setPerson(''); setTenant(''); setAction(''); setDateFrom(''); setDateTo(''); }}>
            Clear filters
          </Button>
          <Button variant="secondary" size="sm" onClick={exportCsv}>Export CSV</Button>
        </div>
      </div>

      {/* Results */}
      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-grey-500">No audit entries match the current filters.</div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-paper-2 text-grey-500">
                <th className="px-3 py-2 text-left font-medium">When</th>
                <th className="px-3 py-2 text-left font-medium">Person</th>
                <th className="px-3 py-2 text-left font-medium">Tenant</th>
                <th className="px-3 py-2 text-left font-medium">Action</th>
                <th className="px-3 py-2 text-left font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} className="bg-paper hover:bg-paper-2">
                  <td className="px-3 py-2 border-b border-line font-mono text-grey-500 whitespace-nowrap">{formatTs(e.at)}</td>
                  <td className="px-3 py-2 border-b border-line text-grey-700 whitespace-nowrap">{e.person}</td>
                  <td className="px-3 py-2 border-b border-line text-grey-700">{e.tenant}</td>
                  <td className="px-3 py-2 border-b border-line"><Badge>{e.action}</Badge></td>
                  <td className="px-3 py-2 border-b border-line text-grey-700">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
        This is a read-only log. Entries are written by Kasper's backend on every mutating action.
        Use the Export CSV button to download the filtered result.
      </div>
    </div>
  );
}
