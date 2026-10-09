'use client';

import React, { useState, useMemo } from 'react';
import { Button, Badge, EmptyState } from '@/components/ui';
import { actorName, assetCode, auditActions, auditEntriesToCsv, queryAuditEntries, tenantName, can } from '@/server/api';
import * as clock from '@/lib/clock';

import { useSession } from '@/hooks';

function formatTs(ts: string | number): string {
  return clock.formatDubaiDateTime(typeof ts === 'number' ? ts : new Date(ts).getTime());
}

export default function AuditLogPage() {
  const session = useSession();

  const [person, setPerson] = useState('');
  const [tenant, setTenant] = useState('');
  const [action, setAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exportedAt, setExportedAt] = useState<string | null>(null);

  // Actions come from the entries themselves, so anything written during the
  // demo (MUC issue/void, grants, imports) shows up in the filter.
  const actions = auditActions();

  const filtered = useMemo(
    () => queryAuditEntries({ person, tenant, action, from: dateFrom, to: dateTo }),
    [person, tenant, action, dateFrom, dateTo]
  );

  const exportCsv = () => {
    const rows = queryAuditEntries({ person, tenant, action, from: dateFrom, to: dateTo });
    const blob = new Blob([auditEntriesToCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kasper-audit-${clock.dubaiToIso(clock.now()).slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportedAt(`${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} exported`);
  };

  if (!session || !can(session, 'console.audit.view')) {
    return (
      <div className="text-center py-8">
        <EmptyState title="Not available" description="Only Kasper Admin can view the audit log." />
      </div>
    );
  }

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
              {actions.map(a => <option key={a} value={a}>{a}</option>)}
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
          {exportedAt && <span className="text-xs text-grey-500 self-center">{exportedAt}</span>}
        </div>
      </div>

      {/* Results */}
      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-line text-xs text-grey-500">
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          {action || person || tenant || dateFrom || dateTo ? ' (filtered)' : ''}
        </div>
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
                <th className="px-3 py-2 text-left font-medium">Asset</th>
                <th className="px-3 py-2 text-left font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} className="bg-paper hover:bg-paper-2">
                  <td className="px-3 py-2 border-b border-line font-mono text-grey-500 whitespace-nowrap">{formatTs(e.at)}</td>
                  <td className="px-3 py-2 border-b border-line text-grey-700 whitespace-nowrap">{actorName(e.actorUserId)}</td>
                  <td className="px-3 py-2 border-b border-line text-grey-700">{tenantName(e.tenantId)}</td>
                  <td className="px-3 py-2 border-b border-line"><Badge>{e.action}</Badge></td>
                  <td className="px-3 py-2 border-b border-line font-mono text-grey-500">{assetCode(e.assetId)}</td>
                  <td className="px-3 py-2 border-b border-line text-grey-700">
                    {e.detail}
                    {e.reason && <span className="text-grey-500"> — {e.reason}</span>}
                  </td>
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
