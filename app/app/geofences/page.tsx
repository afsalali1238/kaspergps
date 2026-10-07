'use client';

import React, { useMemo, useState } from 'react';
import { Circle, MapContainer, Polygon, TileLayer, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Badge, Button, EmptyState } from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import * as clock from '@/lib/clock';
import { isAssetVisible, getRelationship, rentalWindow } from '@/server/access';
import { can } from '@/server/capabilities';
import { hasFeature } from '@/domain/features';
import type { Geofence, GeofenceEvent, ReportFormat, Session } from '@/domain/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const KIND_COLOURS: Record<Geofence['kind'], string> = {
  site: '#1F9A6D',
  job: '#FFC400',
  yard: '#141518',
  restricted: '#D64545',
};

function toMillis(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === 'number' ? value : new Date(value).getTime();
}

function dubaiDateStamp(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(ms));
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function eventVisible(event: GeofenceEvent, fences: Geofence[], session: Session): boolean {
  const fence = fences.find(item => item.id === event.geofenceId);
  const asset = seed.assets.find(item => item.id === event.assetId);
  if (!fence || !asset || asset.retiredAt || !isAssetVisible(session, asset.id) || !hasFeature(asset, 'geofence.events')) return false;
  if (getRelationship(session, asset.id) === 'renter') {
    const window = rentalWindow(session, asset.id);
    const at = toMillis(event.at);
    if (!window || at < window.start || at > window.end) return false;
  }
  if (!session.isKasper && fence.tenantId !== session.tenantId) return false;
  if (fence.assetIds !== 'all' && !fence.assetIds.includes(asset.id)) return false;
  return true;
}

function fenceAppliesToVisibleAsset(fence: Geofence, assetIds: Set<string>): boolean {
  if (fence.assetIds !== 'all') return fence.assetIds.some(assetId => assetIds.has(assetId));
  return seed.assets.some(asset => {
    if (!assetIds.has(asset.id)) return false;
    if (asset.ownerTenantId === fence.tenantId) return true;
    return seed.bookings.some(booking =>
      booking.assetId === asset.id && booking.renterTenantId === fence.tenantId &&
      (booking.status === 'active' || booking.status === 'scheduled')
    );
  });
}

function eventName(event: GeofenceEvent['type']): string {
  return event === 'enter' ? 'Entered' : 'Exited';
}

export default function GeofencesPage() {
  const session = useStore(state => state.session);
  const phase = useStore(state => state.demoSwitches.phase);
  const [showOverlay, setShowOverlay] = useState(true);
  const [format, setFormat] = useState<ReportFormat>('xlsx');
  const [runningReport, setRunningReport] = useState(false);
  const [notice, setNotice] = useState('');
  const now = clock.now();

  const visibleAssets = useMemo(() => {
    if (!session || !can(session, 'geofence.view')) return [];
    return seed.assets.filter(asset => !asset.retiredAt && isAssetVisible(session, asset.id));
  }, [session]);
  const visibleAssetIds = useMemo(() => new Set(visibleAssets.map(asset => asset.id)), [visibleAssets]);
  const visibleFences = useMemo(() => {
    if (!session || phase === 'day_one' || !can(session, 'geofence.view')) return [];
    return seed.geofences.filter(fence => {
      if (!session.isKasper && fence.tenantId !== session.tenantId) return false;
      return fenceAppliesToVisibleAsset(fence, visibleAssetIds);
    });
  }, [phase, session, visibleAssetIds]);
  const recentEvents = useMemo(() => {
    if (!session) return [];
    const from = now - 7 * DAY_MS;
    return seed.geofenceEvents
      .filter(event => toMillis(event.at) >= from && toMillis(event.at) <= now && eventVisible(event, visibleFences, session))
      .sort((a, b) => toMillis(b.at) - toMillis(a.at));
  }, [now, session, visibleFences]);
  const availableReport = Boolean(session && can(session, 'report.run') && visibleAssets.some(asset => hasFeature(asset, 'report.geofence')));
  const center = visibleFences[0]?.shape.type === 'circle'
    ? [visibleFences[0].shape.center.lat, visibleFences[0].shape.center.lng] as [number, number]
    : visibleFences[0]?.shape.type === 'polygon'
      ? [visibleFences[0].shape.points[0]?.lat ?? 25.2048, visibleFences[0].shape.points[0]?.lng ?? 55.2708] as [number, number]
      : [25.2048, 55.2708] as [number, number];

  const runReport = async () => {
    if (!session || phase === 'day_one' || !availableReport || !can(session, 'report.run') || !can(session, 'geofence.view')) {
      setNotice('You cannot run a geofence report.');
      return;
    }
    const reportEvents = seed.geofenceEvents
      .filter(event => toMillis(event.at) >= now - 30 * DAY_MS && toMillis(event.at) <= now && eventVisible(event, visibleFences, session))
      .sort((a, b) => toMillis(a.at) - toMillis(b.at));
    if (reportEvents.length === 0) {
      setNotice('Nothing to report for this period.');
      return;
    }
    const rentalLimits = new Map<string, string>();
    for (const event of reportEvents) {
      const asset = seed.assets.find(item => item.id === event.assetId);
      if (!asset || getRelationship(session, asset.id) !== 'renter') continue;
      const window = rentalWindow(session, asset.id);
      if (window) rentalLimits.set(asset.id, `${asset.code} ${clock.formatDubaiDate(window.start)} to ${clock.formatDubaiDate(window.end)}`);
    }
    const rentalLimitText = rentalLimits.size
      ? `Limited to your rental period: ${Array.from(rentalLimits.values()).join('; ')}`
      : '';
    setRunningReport(true);
    setNotice('');
    try {
      const rows = reportEvents.map(event => {
        const fence = visibleFences.find(item => item.id === event.geofenceId)!;
        const asset = seed.assets.find(item => item.id === event.assetId)!;
        return {
          Time: clock.formatDubaiDateTime(toMillis(event.at)),
          Asset: asset.code,
          Geofence: fence.name,
          Event: eventName(event.type),
          Kind: fence.kind,
        };
      });
      const from = dubaiDateStamp(now - 30 * DAY_MS);
      const to = dubaiDateStamp(now);
      const extension = format;
      const scopeName = session.isKasper ? 'fleet' : 'tenant';
      const fileName = `Kasper_Geofence_Report_${scopeName}_${from}_to_${to}.${extension}`;
      const columns = Object.keys(rows[0]);
      const body = rows.map(row => columns.map(column => String(row[column as keyof typeof row] ?? '')));
      if (format === 'xlsx') {
        const XLSX = await import('xlsx');
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet([
          ['Kasper GPS', 'Geofence report'],
          ['Period', `${from} to ${to}`],
          ...(rentalLimitText ? [[rentalLimitText]] : []),
          columns,
          ...body,
        ]);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Geofence events');
        XLSX.writeFile(workbook, fileName);
      } else {
        const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
        const doc = new jsPDF();
        doc.setFontSize(14);
        doc.text('Kasper GPS · Geofence report', 14, 16);
        doc.setFontSize(9);
        doc.text(`Period: ${from} to ${to}`, 14, 23);
        const rentalHeader = rentalLimitText ? doc.splitTextToSize(rentalLimitText, doc.internal.pageSize.getWidth() - 28) : [];
        if (rentalHeader.length) doc.text(rentalHeader, 14, 30);
        autoTableModule.default(doc, {
          startY: rentalHeader.length ? 30 + rentalHeader.length * 4 + 2 : 30,
          head: [columns],
          body,
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [20, 21, 24] },
        });
        doc.save(fileName);
      }
      seed.reportRuns.push({
        id: `rr-${seed.reportRuns.length + 1}`,
        userId: session.userId,
        reportType: 'Geofence events',
        scope: scopeName,
        from: now - 30 * DAY_MS,
        to: now,
        format,
        createdAt: now,
        status: 'ready',
        fileName,
      });
      const sequence = seed.auditEntries.length + 1;
      seed.auditEntries.push({
        id: `au-${String(sequence).padStart(3, '0')}`,
        at: now,
        actorUserId: session.userId,
        action: 'report.run',
        tenantId: session.tenantId ?? undefined,
        detail: `Geofence report downloaded (${from} to ${to})`,
      });
      setNotice(`Downloaded ${fileName}`);
    } catch {
      setNotice('The geofence report could not be created.');
    } finally {
      setRunningReport(false);
    }
  };

  if (!session) return null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold text-ink">Geofences</h1>
        <p className="mt-1 text-sm text-grey-500">View permitted geofences and recent enter or exit events.</p>
      </header>

      {notice && <p role="status" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-grey-700">{notice}</p>}

      {phase === 'day_one' ? (
        <EmptyState title="Not available" description="Geofence overlays and events are available in Phase 2." />
      ) : (
        <>
          <section className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Map</h2>
                <p className="mt-0.5 text-xs text-grey-500">Fence outlines use a dashed line and kind colour.</p>
              </div>
              <Button type="button" variant={showOverlay ? 'secondary' : 'ghost'} size="sm" aria-pressed={showOverlay} onClick={() => setShowOverlay(value => !value)}>
                {showOverlay ? 'Hide map overlay' : 'Show map overlay'}
              </Button>
            </div>
            <div className="h-[360px] bg-paper">
              <MapContainer center={center} zoom={10} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {showOverlay && visibleFences.map(fence => {
                  const colour = KIND_COLOURS[fence.kind];
                  const pathOptions = { color: colour, fillColor: colour, fillOpacity: 0.08, weight: 2, dashArray: '7 6' };
                  if (fence.shape.type === 'circle') {
                    return (
                      <Circle key={fence.id} center={[fence.shape.center.lat, fence.shape.center.lng]} radius={fence.shape.radiusM} pathOptions={pathOptions}>
                        <Tooltip>{fence.name}</Tooltip>
                      </Circle>
                    );
                  }
                  const points = fence.shape.points.map(point => [point.lat, point.lng] as [number, number]);
                  return <Polygon key={fence.id} positions={points} pathOptions={pathOptions}><Tooltip>{fence.name}</Tooltip></Polygon>;
                })}
              </MapContainer>
            </div>
            <div className="flex flex-wrap gap-3 border-t border-line px-3 py-2">
              {(Object.keys(KIND_COLOURS) as Geofence['kind'][]).map(kind => (
                <span key={kind} className="flex items-center gap-1.5 text-xs text-grey-700">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: KIND_COLOURS[kind] }} />
                  {kind.charAt(0).toUpperCase() + kind.slice(1)}
                </span>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Geofences</h2>
                <p className="mt-0.5 text-xs text-grey-500">{visibleFences.length} visible</p>
              </div>
            </div>
            {visibleFences.length === 0 ? (
              <EmptyState title="No geofences" description="No geofences are assigned to assets you can view." />
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {visibleFences.map(fence => (
                  <article key={fence.id} className="rounded-lg border border-line bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={fence.kind === 'restricted' ? 'red' : fence.kind === 'site' ? 'green' : fence.kind === 'yard' ? 'ink' : 'yellow'}>{fence.kind}</Badge>
                      <h3 className="text-sm font-medium text-ink">{fence.name}</h3>
                    </div>
                    <p className="mt-2 text-xs text-grey-500">
                      {fence.shape.type === 'circle' ? `Circle · ${fence.shape.radiusM} m radius` : `Polygon · ${fence.shape.points.length} points`}
                    </p>
                    <p className="mt-1 text-xs text-grey-500">{fence.assetIds === 'all' ? 'All assigned assets' : `${fence.assetIds.filter(id => visibleAssetIds.has(id)).length} assigned assets you can view`}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="border-b border-line p-3">
              <h2 className="text-sm font-semibold text-ink">Enter and exit events</h2>
              <p className="mt-0.5 text-xs text-grey-500">Last 7 days</p>
            </div>
            {recentEvents.length === 0 ? (
              <EmptyState title="No geofence events" description="There are no enter or exit events in the last 7 days." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line bg-paper-2 text-left text-xs text-grey-500"><th className="px-3 py-2">Time</th><th className="px-3 py-2">Asset</th><th className="px-3 py-2">Geofence</th><th className="px-3 py-2">Event</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {recentEvents.map(event => {
                      const asset = seed.assets.find(item => item.id === event.assetId)!;
                      const fence = visibleFences.find(item => item.id === event.geofenceId)!;
                      return <tr key={event.id}><td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{clock.formatDubaiDateTime(toMillis(event.at))}</td><td className="px-3 py-2 font-mono text-xs">{asset.code}</td><td className="px-3 py-2">{fence.name}</td><td className="px-3 py-2"><Badge variant={event.type === 'enter' ? 'green' : 'amber'}>{eventName(event.type)}</Badge></td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
            <div>
              <h2 className="text-sm font-semibold text-ink">Geofence report</h2>
              <p className="mt-1 text-xs text-grey-500">Enter and exit events from the last 30 days.</p>
            </div>
            <div className="flex items-center gap-2">
              <select aria-label="Geofence report format" value={format} onChange={event => setFormat(event.target.value as ReportFormat)} className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-grey-700">
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="pdf">PDF</option>
              </select>
              <Button type="button" onClick={runReport} loading={runningReport} disabled={!availableReport || runningReport}>Run report</Button>
            </div>
          </section>
          {!availableReport && <p className="text-xs text-grey-500">A report is available when you can view an asset with geofence support and have report access.</p>}
        </>
      )}
    </div>
  );
}
