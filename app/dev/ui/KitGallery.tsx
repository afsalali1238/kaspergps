'use client';

// /dev/ui — the B2 UI kit (UI-UPGRADE §4). Example values only, each with its
// source or "Not measured", so the components can be checked by eye and by
// screenshot at 1440 and 390 px.

import React, { useState } from 'react';
import {
  Badge, BottomSheet, Button, ConfirmDialog, CopyButton, KpiCell, KpiStrip, MetricTile, Panel,
  ProgressBar, RowMenu, SegmentedTabs, SideSheet, Sparkline, StatusDot, Table, TONES,
} from '@/components/ui';

type Row = { id: string; code: string; left: string; due: string; status: 'ok' | 'warn' | 'bad' };

const ROWS: Row[] = [
  { id: 'r1', code: 'EX-04', left: '80 h', due: '~ 6 days', status: 'warn' },
  { id: 'r2', code: 'BD-02', left: '−30 h', due: 'Overdue', status: 'bad' },
  { id: 'r3', code: 'GN-01', left: '412 h', due: '~ 5 weeks', status: 'ok' },
];

export function KitGallery() {
  const [kpi, setKpi] = useState<string | null>('critical');
  const [tab, setTab] = useState('overview');
  const [side, setSide] = useState(false);
  const [bottom, setBottom] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <section className="mb-10 space-y-6" data-testid="kit-gallery">
      <div>
        <h2 className="text-title text-ink">UI kit (B2)</h2>
        <p className="mt-1 text-sm text-text-secondary">Example values for the component preview only.</p>
      </div>

      <div>
        <div className="text-eyebrow mb-2">KpiStrip · KpiCell</div>
        <KpiStrip label="Alerts summary (example)">
          <KpiCell label="New today" value="7" source="From alerts" onClick={() => setKpi('new')} active={kpi === 'new'} />
          <KpiCell label="Critical" value="2" tone="bad" context="1 offline · 1 power cut" source="From alerts" onClick={() => setKpi('critical')} active={kpi === 'critical'} />
          <KpiCell label="Warning" value="5" tone="warn" source="From alerts" onClick={() => setKpi('warning')} active={kpi === 'warning'} />
          <KpiCell label="Fuel used today" value={null} />
        </KpiStrip>
      </div>

      <div>
        <div className="text-eyebrow mb-2">MetricTile · ProgressBar · Sparkline</div>
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <MetricTile label="Engine hours" value="1,284" unit="h" source="ECU" />
          <MetricTile label="Fuel level" value={null} unit="%" />
          <MetricTile label="Service in" value="80" unit="h" tone="warn" source="ECU" />
          <MetricTile label="Idle today" value="1.4" unit="h" source="Estimated" />
        </div>
        <div className="mt-3 grid gap-3 sm:max-w-md">
          <ProgressBar label="Fuel tank" value={62} valueLabel="62%" tone="ok" />
          <ProgressBar label="Service interval used" value={220} max={250} valueLabel="220 / 250 h" tone="warn" />
          <ProgressBar label="AdBlue" value={null} />
          <div className="flex items-center gap-3 text-sm text-text-secondary">
            <Sparkline values={[4, 6, 5, 8, 7, 9, 6]} label="Engine hours per day, last 7 days (example)" area />
            <span>Engine hours per day (example)</span>
          </div>
        </div>
      </div>

      <div>
        <div className="text-eyebrow mb-2">Badge · StatusDot</div>
        <div className="flex flex-wrap items-center gap-2">
          {TONES.map(t => (
            <Badge key={t} tone={t} dot>{t}</Badge>
          ))}
          <span className="inline-flex items-center gap-1.5 text-sm"><StatusDot status="live" /> Live</span>
          <span className="inline-flex items-center gap-1.5 text-sm"><StatusDot status="offline" pulse /> Offline</span>
        </div>
      </div>

      <div>
        <div className="text-eyebrow mb-2">SegmentedTabs</div>
        <div className="max-w-sm">
          <SegmentedTabs
            label="Asset sections (example)"
            value={tab}
            onChange={setTab}
            idPrefix="kit"
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'history', label: 'History' },
              { id: 'engine', label: 'Engine & fuel' },
              { id: 'alerts', label: 'Alerts', count: 3 },
              { id: 'maintenance', label: 'Maintenance' },
              { id: 'documents', label: 'Documents' },
            ]}
          />
        </div>
      </div>

      <Panel
        title="Service schedule (example)"
        eyebrow="Table · RowMenu · CopyButton"
        padding="none"
        actions={<Button size="sm" variant="secondary" onClick={() => setSide(true)}>Side sheet</Button>}
      >
        <Table<Row>
          caption="Service schedule (example)"
          keyField="id"
          rows={ROWS}
          maxHeight="240px"
          columns={[
            { key: 'code', header: 'Asset', mono: true, render: r => (
              <span className="inline-flex items-center gap-1">{r.code}<CopyButton value={r.code} label={`Copy ${r.code}`} /></span>
            ) },
            { key: 'left', header: 'Hours left', numeric: true, render: r => r.left },
            { key: 'due', header: 'Approx. due', render: r => <Badge tone={r.status}>{r.due}</Badge> },
          ]}
          rowMenu={r => [
            { id: 'log', label: 'Log service', onSelect: () => setSide(true) },
            { id: 'skip', label: 'Remove from plan', onSelect: () => setConfirm(true), destructive: true },
          ].filter(() => r.id !== 'r3')}
          rowMenuLabel={r => `Actions for ${r.code}`}
        />
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setBottom(true)}>Bottom sheet</Button>
        <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>Confirm dialog</Button>
        <RowMenu items={[{ id: 'a', label: 'Standalone menu item', onSelect: () => {} }]} label="Example menu" />
      </div>

      <SideSheet open={side} onClose={() => setSide(false)} title="EX-04" eyebrow="Asset (example)" footer={<Button onClick={() => setSide(false)}>Done</Button>}>
        <p className="text-sm text-text-secondary">Right-hand panel content.</p>
      </SideSheet>
      <BottomSheet open={bottom} onClose={() => setBottom(false)} title="Filters (example)" footer={<Button onClick={() => setBottom(false)}>Apply</Button>}>
        <p className="text-sm text-text-secondary">Phone panel content.</p>
      </BottomSheet>
      <ConfirmDialog
        open={confirm}
        title="Remove BD-02 from the plan?"
        body="Example only: nothing is changed."
        confirmLabel="Remove"
        destructive
        onConfirm={() => setConfirm(false)}
        onCancel={() => setConfirm(false)}
      />
    </section>
  );
}
