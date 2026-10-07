'use client';

// Demo view of the audit log (spec 10, Tools): read-only, labelled as such,
// and visible to the demo runner even when the current user cannot see audit.
// The console page (/console/audit) keeps the permission gate for Kasper staff.

import React, { useMemo, useState } from 'react';
import { Badge, Button, EmptyState } from '@/components/ui';
import {
  actorName, assetCode, auditActions, auditEntriesToCsv, queryAuditEntries, tenantName,
} from '@/server/audit';
import * as clock from '@/lib/clock';

function formatTs(ts: string | number): string {
  return clock.formatDubaiDateTime(typeof ts === 'number' ? ts : new Date(ts).getTime());
}

export default function DemoAuditPage() {
  const [action, setAction] = useState('');
  const [person, setPerson] = useState('');
  const [rows, setRows] = useState(50);
  const [version, setVersion] = useState(0);

  const actions = useMemo(() => auditActions(), []);
  const entries = useMemo(
    () => queryAuditEntries({ action, person }).slice(0, rows),
    [action, person, rows, version]
  );
  const total = useMemo(() => queryAuditEntries({ action, person }).length, [action, person, version]);

  const exportCsv = () => {
    const all = queryAuditEntries({ action, person });
    const blob = new Blob([auditEntriesToCsv(all)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kasper-audit-demo-${clock.dubaiToIso(clock.now()).slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 p-4 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink flex items-center gap-2">
            Audit log <Badge variant="yellow">Demo view</Badge>
          </h1>
          <p className="text-sm text-grey-500 mt-1">
            Read-only, and shown regardless of who you are viewing as. {total} entries; the newest {Math.min(rows, total)} below.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setVersion(v => v + 1)}>Refresh</Button>
          <Button variant="secondary" size="sm" onClick={exportCsv}>Export CSV</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={action}
          onChange={e => setAction(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        >
          <option value="">All actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input
          type="text"
          value={person}
          onChange={e => setPerson(e.target.value)}
          placeholder="Filter by person…"
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        />
        <select
          value={rows}
          onChange={e => setRows(Number(e.target.value))}
          className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
        >
          <option value={25}>25 rows</option>
          <option value={50}>50 rows</option>
          <option value={200}>200 rows</option>
        </select>
      </div>

      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-line text-xs text-grey-500">
          {total === 0 ? 'No entries' : `showing ${entries.length} of ${total}`}
          {action || person ? ' (filtered)' : ''}
        </div>
        {entries.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No entries" description="Nothing matches those filters." />
          </div>
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
              {entries.map(e => (
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

      <p className="text-xs text-grey-500">
        Every create, change, retire, pair, fit, transfer, MUC and import is recorded. Nothing here can be edited or deleted.
      </p>
    </div>
  );
}
