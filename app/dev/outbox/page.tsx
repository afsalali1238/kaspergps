'use client';

// Simulated email outbox (spec 10, Tools): the scheduled reports and alert
// emails Kasper would have sent, with recipient and time. Nothing is sent.

import React, { useMemo, useState } from 'react';
import { Badge, Button, EmptyState } from '@/components/ui';
import { outboxForSession, outboxItems } from '@/server/outbox';
import { useStore } from '@/store';
import * as clock from '@/lib/clock';

type Kind = 'all' | 'report' | 'alert';

export default function OutboxPage() {
  const session = useStore.getState().session;
  const [kind, setKind] = useState<Kind>('all');
  const [version, setVersion] = useState(0);

  const items = useMemo(() => outboxForSession(session), [session, version]);
  const shown = kind === 'all' ? items : items.filter(i => i.kind === kind);
  const all = useMemo(() => outboxItems(), [version]);

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink flex items-center gap-2">
            Email outbox <Badge variant="yellow">Simulated</Badge>
          </h1>
          <p className="text-sm text-grey-500 mt-1">
            Every scheduled report and alert email Kasper would have sent — {all.length} messages, {all.filter(i => clock.formatDubaiDate(new Date(i.at).getTime()) === clock.formatDubaiDate(clock.now())).length} of them today.
            {session && !session.isKasper ? ' You are seeing your own mail only.' : ' Nothing is actually delivered.'}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setVersion(v => v + 1)}>Refresh</Button>
      </div>

      <div className="flex gap-2">
        {(['all', 'report', 'alert'] as Kind[]).map(k => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={
              kind === k
                ? 'px-3 py-1.5 text-xs rounded-lg bg-ink text-paper'
                : 'px-3 py-1.5 text-xs rounded-lg bg-paper border border-line text-grey-700 hover:border-ink'
            }
          >
            {k === 'all' ? 'All' : k === 'report' ? 'Scheduled reports' : 'Alert emails'}
          </button>
        ))}
      </div>

      <div className="bg-surface border border-line rounded-lg divide-y divide-line">
        {shown.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Nothing in the outbox" description="No mail matches that filter yet." />
          </div>
        ) : (
          shown.map(item => (
            <div key={item.id} className="p-3 flex items-start gap-3">
              <Badge variant={item.kind === 'report' ? 'green' : 'amber'}>
                {item.kind === 'report' ? 'Report' : 'Alert'}
              </Badge>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink">{item.subject}</div>
                <div className="text-xs text-grey-500 mt-0.5 truncate">{item.detail}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xs text-grey-700">{item.toName}</div>
                <div className="text-[11px] text-grey-500 font-mono">{item.to}</div>
                <div className="text-[11px] text-grey-500">{clock.formatDubaiDateTime(item.at)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-grey-500">
        Prototype only: Kasper does not send real email in the demo. Report runs come from the schedules page; alert
        emails go to the owning tenant&apos;s admins.
      </p>
    </div>
  );
}
