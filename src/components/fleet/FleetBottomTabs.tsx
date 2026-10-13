'use client';

// The fleet map's bottom tabs (UI-UPGRADE §6, Agent E): Active alerts | Event log |
// Fuel events (T2/3 only). Collapsible; a row selects its asset on the map.

import React, { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { SegmentedTabs } from '@/components/ui';
import type { FleetEvent } from '@/server/api';
import * as clock from '@/lib/clock';
import { useT } from '@/i18n';

type TabId = 'alerts' | 'log' | 'fuel';

export function FleetBottomTabs({
  events, showFuel, onSelect, defaultOpen = true,
}: {
  events: { alerts: FleetEvent[]; log: FleetEvent[]; fuel: FleetEvent[] };
  showFuel: boolean;
  onSelect: (assetId: string) => void;
  defaultOpen?: boolean;
}) {
  const t = useT();
  const [tab, setTab] = useState<TabId>('alerts');
  const [open, setOpen] = useState(defaultOpen);
  const tabs = [
    { id: 'alerts' as const, label: t('fleet.tabs.alerts', 'Active alerts'), count: events.alerts.length },
    { id: 'log' as const, label: t('fleet.tabs.log', 'Event log'), count: events.log.length },
    ...(showFuel ? [{ id: 'fuel' as const, label: t('fleet.tabs.fuel', 'Fuel events'), count: events.fuel.length }] : []),
  ];
  const rows = tab === 'alerts' ? events.alerts : tab === 'log' ? events.log : events.fuel;

  return (
    <section className="rounded-lg border border-line bg-surface" aria-label={t('fleet.tabs.title', 'Fleet activity')} data-testid="fleet-bottom-tabs">
      <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1.5">
        <SegmentedTabs tabs={tabs} value={tab} onChange={id => { setTab(id); setOpen(true); }} label={t('fleet.tabs.title', 'Fleet activity')} idPrefix="fleet-tabs" />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs text-text-secondary hover:bg-paper-2 hover:text-ink"
        >
          {open ? t('fleet.tabs.hide', 'Hide') : t('fleet.tabs.show', 'Show')}
          <ChevronDown size={14} aria-hidden className={clsx('transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open && (
        <div className="max-h-56 overflow-y-auto" role="tabpanel" id={`fleet-tabs-panel-${tab}`} aria-labelledby={`fleet-tabs-tab-${tab}`}>
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-secondary">
              {tab === 'alerts' ? t('fleet.tabs.no_alerts', 'No open alerts on these assets.') : tab === 'fuel' ? t('fleet.tabs.no_fuel', 'No refuels or drops in the last 7 days.') : t('fleet.tabs.no_events', 'No events yet.')}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-start font-mono text-[10px] uppercase tracking-wide text-text-secondary">
                  <th scope="col" className="px-3 py-1.5 text-start font-normal">{t('fleet.tabs.time', 'Time')}</th>
                  <th scope="col" className="px-3 py-1.5 text-start font-normal">{t('fleet.tabs.asset', 'Asset')}</th>
                  <th scope="col" className="px-3 py-1.5 text-start font-normal">{t('fleet.tabs.event', 'Event')}</th>
                  <th scope="col" className="px-3 py-1.5 text-start font-normal">{t('fleet.tabs.status', 'Status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(e => (
                  <tr key={e.id} className="hover:bg-paper-2">
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-text-secondary">
                      {e.kind === 'alert' ? `${clock.formatDubaiDate(e.at)} ${clock.formatDubaiTime(e.at)}` : clock.formatDubaiDate(e.at)}
                    </td>
                    <td className="px-3 py-1.5">
                      <button type="button" onClick={() => onSelect(e.assetId)} className="font-mono text-xs font-bold text-ink underline-offset-2 hover:underline">
                        {e.assetCode}
                      </button>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={clsx('inline-block border-s-2 ps-2', e.severity === 'critical' ? 'border-bad-ink' : 'border-warn-ink')}>
                        {e.kind === 'alert' ? e.words : e.kind === 'refuel' ? t('fleet.tabs.refuel', 'Refuel ▲') : t('fleet.tabs.drop', 'Fuel drop, engine off ▼')}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-text-secondary">
                      {e.status === 'open' ? t('fleet.tabs.open', 'Open') : e.status === 'acknowledged' ? t('fleet.tabs.acknowledged', 'Acknowledged') : e.status === 'closed' ? t('fleet.tabs.closed', 'Closed') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
