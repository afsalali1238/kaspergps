'use client';

import React, { useState } from 'react';
import {
  Button, Badge, StatusBadge, TierChip, SourceLabel,
  Skeleton, CardSkeleton, EmptyState, ErrorState,
  Panel, PanelHeader, PanelSection,
  Tabs, TabContent,
  Table,
  Sheet,
  InlineConfirm,
} from '@/components/ui';
import type { AssetStatus, Reading } from '@/domain/types';
import { Player } from '@/components/playback/Player';

/** A synthetic day for the playback preview: a trip, a gap, an over-speed and a refuel. */
function demoReadings(): Reading[] {
  const out: Reading[] = [];
  const base = new Date('2026-10-05T03:00:00Z').getTime(); // 07:00 Dubai
  const push = (minute: number, overrides: Partial<Reading> = {}) => {
    const t = base + minute * 60000;
    out.push({
      trackerId: 'tr-demo',
      deviceTime: new Date(t).toISOString(),
      receivedAt: new Date(t + 5000).toISOString(),
      lat: 25.09 + minute * 0.0004,
      lng: 55.14 + minute * 0.0006,
      speedKmh: 42,
      heading: 60,
      satellites: 10,
      ignition: true,
      moving: true,
      extVoltage: 26,
      intBattery: 4,
      gsm: 4,
      gnssOdometerKm: 100 + minute * 0.5,
      ...overrides,
    });
  };
  for (let m = 0; m < 45; m += 0.5) {
    const fuel = 40 + m * 0.2 + (m > 20 ? 35 : 0); // refuel jump at 08:20
    push(m, {
      speedKmh: m > 26 && m < 27 ? 96 : 42,
      rpm: m > 30 ? 1500 : 800,
      engineLoadPct: m > 30 ? 55 : 15,
      coolantC: 88,
      fuelLevelPct: Math.min(95, fuel),
      event: m > 26 && m < 27 ? 'overspeed' : undefined,
    });
  }
  // 13:05 – 15:40 has no data, then a second trip
  for (let m = 200; m < 230; m += 0.5) push(m, { speedKmh: 35, fuelLevelPct: 62 });
  return out;
}

export default function DevUiPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [inlineConfirmOpen, setInlineConfirmOpen] = useState(false);
  const [width, setWidth] = useState<'full' | 'narrow'>('full');

  return (
    <div className={width === 'narrow' ? 'min-h-screen bg-bg p-3 overflow-x-hidden max-w-[390px] mx-auto' : 'min-h-screen bg-bg p-6 overflow-x-hidden'}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-ink">UI Kit — Developer Preview</h1>
              <p className="text-sm text-grey-500 mt-1">Every component in the Kasper GPS prototype.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setWidth(width === 'narrow' ? 'full' : 'narrow')}>
                {width === 'narrow' ? '1440 px' : '390 px'}
              </Button>
            </div>
          </div>
        </div>

        {/* Button */}
        <section className="mb-8">
          <PanelHeader title="Button" subtitle="Variants: primary, secondary, ghost, danger, yellow · Sizes: sm, md, lg" />
          <div className="flex flex-wrap gap-2 items-center">
            <Button variant="primary" size="sm">Primary sm</Button>
            <Button variant="primary">Primary</Button>
            <Button variant="primary" size="lg">Primary lg</Button>
            <Button variant="secondary" size="sm">Secondary</Button>
            <Button variant="ghost" size="sm">Ghost</Button>
            <Button variant="danger" size="sm">Delete</Button>
            <Button variant="yellow" size="sm">Confirm</Button>
            <Button variant="primary" loading>Loading</Button>
            <Button variant="primary" disabled>Disabled</Button>
          </div>
        </section>

        {/* Badge */}
        <section className="mb-8">
          <PanelHeader title="Badge" />
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="yellow">Kasper yellow</Badge>
            <Badge variant="green">Live</Badge>
            <Badge variant="red">Offline</Badge>
            <Badge variant="grey">Muted</Badge>
            <Badge variant="amber">Idle</Badge>
            <Badge variant="ink">Ink</Badge>
            <Badge variant="green" dot>Live dot</Badge>
            <Badge variant="red" dot>Alert dot</Badge>
          </div>
        </section>

        {/* StatusBadge */}
        <section className="mb-8">
          <PanelHeader title="StatusBadge" subtitle="Always colour + word" />
          <div className="flex flex-wrap gap-2 items-center">
            <StatusBadge status="live" />
            <StatusBadge status="idle" />
            <StatusBadge status="stale" />
            <StatusBadge status="offline" />
            <StatusBadge status="unknown" />
            <StatusBadge status="no_tracker" />
            <div className="w-px h-5 bg-line mx-2" />
            <StatusBadge status="live" size="sm" />
            <StatusBadge status="idle" size="sm" />
            <StatusBadge status="offline" size="sm" />
          </div>
        </section>

        {/* TierChip */}
        <section className="mb-8">
          <PanelHeader title="TierChip" subtitle="T1 · T2 · T3 hardware tier" />
          <div className="flex gap-2 items-center">
            <TierChip tier={1} />
            <TierChip tier={2} />
            <TierChip tier={3} />
          </div>
        </section>

        {/* SourceLabel */}
        <section className="mb-8">
          <PanelHeader title="SourceLabel" subtitle="How a value was measured" />
          <div className="flex flex-wrap gap-2">
            <SourceLabel source="ECU" />
            <SourceLabel source="ECU · partial" />
            <SourceLabel source="Estimated" />
            <SourceLabel source="GPS distance" />
            <SourceLabel source="Days on hire" />
            <SourceLabel source="Dummy rate" />
            <SourceLabel source="Not measured" />
          </div>
        </section>

        {/* Skeleton */}
        <section className="mb-8">
          <PanelHeader title="Skeleton" />
          <div className="flex flex-wrap gap-4">
            <CardSkeleton />
            <div className="flex gap-2 items-center">
              <Skeleton width={32} height={32} borderRadius={6} />
              <div className="space-y-1.5">
                <Skeleton width={160} height={14} />
                <Skeleton width={100} height={12} />
              </div>
            </div>
          </div>
        </section>

        {/* EmptyState */}
        <section className="mb-8">
          <PanelHeader title="EmptyState" />
          <div className="grid grid-cols-2 gap-4">
            <EmptyState title="No assets yet" description="Add your first asset from Settings." icon="empty" action={<Button variant="secondary" size="sm">Add asset</Button>} />
            <EmptyState title="No results" description="Try different filters." icon="search" />
          </div>
        </section>

        {/* ErrorState */}
        <section className="mb-8">
          <PanelHeader title="ErrorState" />
          <div className="flex flex-wrap gap-4">
            <ErrorState message="Couldn't load the map tiles right now." onRetry={() => {}} />
            <ErrorState message="Asset data is unavailable." />
          </div>
        </section>

        {/* Panel */}
        <section className="mb-8">
          <PanelHeader title="Panel" subtitle="Card container" />
          <Panel>
            <PanelHeader title="Asset: EX-04" subtitle="CAT 320 Excavator · Tier 3" action={<Button variant="ghost" size="sm">Edit</Button>} />
            <PanelSection title="Status">
              <div className="flex items-center gap-3">
                <StatusBadge status="live" />
                <span className="text-sm text-grey-700">Last updated 14:32 · 2 h ago</span>
              </div>
            </PanelSection>
            <PanelSection title="Location">
              <div className="text-sm text-grey-700">Al Quoz Yard · 25.1366°N, 55.2311°E</div>
            </PanelSection>
          </Panel>
        </section>

        {/* Tabs */}
        <section className="mb-8">
          <PanelHeader title="Tabs" />
          <Tabs
            tabs={[
              { id: 'overview', label: 'Overview', badge: 3 },
              { id: 'history', label: 'History' },
              { id: 'trips', label: 'Trips' },
              { id: 'engine', label: 'Engine & fuel', badge: '3' },
            ]}
            activeId="overview"
            onChange={() => {}}
          />
          <TabContent activeId="overview" id="overview">
            <div className="p-4 bg-paper rounded-lg border border-line text-sm text-grey-700">Overview: mini map, status tiles, hardware feature cards.</div>
          </TabContent>
          <TabContent activeId="overview" id="history">
            <div className="p-4 bg-paper rounded-lg border border-line text-sm text-grey-700">History: positions table with gap rows.</div>
          </TabContent>
          <TabContent activeId="overview" id="trips">
            <div className="p-4 bg-paper rounded-lg border border-line text-sm text-grey-700">Trips: trip list with totals.</div>
          </TabContent>
          <TabContent activeId="overview" id="engine">
            <div className="p-4 bg-paper rounded-lg border border-line text-sm text-grey-700">Engine & fuel: RPM, coolant, load, fuel chart.</div>
          </TabContent>
        </section>

        {/* Table */}
        <section className="mb-8">
          <PanelHeader title="Table" />
          <Table
            keyField="id"
            columns={[
              { key: 'code', header: 'Code', width: '70px', render: (row) => <div className="font-mono text-sm font-medium text-ink">{row.code}</div> },
              { key: 'name', header: 'Asset', render: (row) => <span className="text-sm">{row.name}</span> },
              { key: 'status', header: 'Status', width: '110px', render: (row) => <StatusBadge status={row.status as AssetStatus} size="sm" /> },
              { key: 'tier', header: 'Tier', width: '50px', align: 'center', render: (row) => <TierChip tier={row.tier} /> },
              { key: 'last', header: 'Last', width: '110px', render: (row) => <span className="text-xs text-grey-500">{row.last}</span> },
            ]}
            rows={[
              { id: '1', code: 'EX-04', name: 'Excavator CAT 320', status: 'live' as AssetStatus, tier: 3, last: '14:32 · 2h ago' },
              { id: '2', code: 'FB-12', name: 'Flatbed Mercedes Actros', status: 'live' as AssetStatus, tier: 1, last: '14:31 · 2h ago' },
              { id: '3', code: 'BD-02', name: 'Bulldozer CAT D6', status: 'idle' as AssetStatus, tier: 3, last: '14:20 · 3h ago' },
              { id: '4', code: 'SL-02', name: 'Scissor lift Genie GS', status: 'offline' as AssetStatus, tier: 1, last: '09:15 · 2d ago' },
            ]}
          />
        </section>

        {/* Trip playback (spec 11.15) */}
        <section className="mb-8">
          <PanelHeader title="Trip playback" subtitle="Player bar, state-coloured scrubber with event pins, gap banner, Tier 3 readout" />
          <Player
            assetId="a-demo"
            assetCode="DM-01"
            assetName="Demo excavator"
            tier={3}
            canSupported={['fuelLevel', 'rpm', 'engineLoad', 'coolantTemp', 'engineHours']}
            readings={demoReadings()}
            alerts={[]}
            geofences={[]}
            geofenceEvents={[]}
          />
        </section>

        {/* Sheet */}
        <section className="mb-8">
          <PanelHeader title="Sheet (slide-over)" action={<Button variant="secondary" size="sm" onClick={() => setSheetOpen(true)}>Open sheet →</Button>} />
          <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Share tracking link" width="md">
            <div className="space-y-4">
              <p className="text-sm text-grey-700">Share the live location of this asset with someone who doesn&apos;t have a Kasper account.</p>
              <div className="bg-paper rounded-lg border border-line p-3">
                <div className="text-xs text-grey-500 mb-1">Tracking link</div>
                <div className="font-mono text-sm break-all">https://track.kasper.ae/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5</div>
              </div>
              <Button variant="secondary" size="sm" fullWidth>Copy link</Button>
              <div className="pt-3 border-t border-line">
                <label className="text-xs text-grey-500 block mb-1">Suggested message</label>
                <textarea className="w-full px-3 py-2 text-sm bg-paper border border-line rounded-lg resize-none h-20" defaultValue="Track FB-12 live: https://track.kasper.ae/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5" />
              </div>
            </div>
          </Sheet>
        </section>

        {/* InlineConfirm */}
        <section className="mb-8">
          <PanelHeader title="InlineConfirm" />
          <div className="flex flex-wrap gap-4 items-start">
            <InlineConfirm
              open={inlineConfirmOpen}
              onConfirm={() => setInlineConfirmOpen(false)}
              onCancel={() => setInlineConfirmOpen(false)}
              title="End access now"
              description="Palm Contracting no longer has access to EX-11. This is recorded in the audit log."
              confirmLabel="End access now"
              confirmVariant="danger"
            />
            <Button variant="danger" size="sm" onClick={() => setInlineConfirmOpen(true)}>Trigger confirm</Button>
          </div>
        </section>

        {/* Demo bar preview */}
        <section>
          <PanelHeader title="Demo bar — visual reference" />
          <div className="demo-bar bg-ink text-paper px-4 py-2 flex items-center gap-2 rounded-lg">
            <span className="demo-tag bg-yellow text-ink text-[9px] px-1.5 py-0.5 rounded font-mono font-bold">DEMO</span>
            <span className="text-xs">View as ▾</span>
            <span className="text-xs text-paper/60">|</span>
            <span className="text-xs font-mono">5 Oct 14:32</span>
            <span className="text-xs text-paper/60">|</span>
            <span className="text-xs bg-yellow/10 text-yellow px-1.5 py-0.5 rounded font-mono">Later</span>
            <span className="text-xs text-paper/60">|</span>
            <span className="text-xs text-paper/60">Show hidden: OFF</span>
            <span className="text-xs text-paper/60">|</span>
            <span className="text-xs text-paper/60">Sales view: OFF</span>
            <span className="text-xs text-paper/60 ml-auto">Prototype · dummy data</span>
          </div>
        </section>
      </div>
    </div>
  );
}
