'use client';

import React, { useState, useMemo } from 'react';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { useStore } from '@/store';
import { seed } from '@/server/seed/data';
import { isAssetVisible } from '@/server/access';
import type { Geofence, GeofenceEvent } from '@/domain/types';
import * as clock from '@/lib/clock';
import { MapContainer, TileLayer, Circle, Polygon, Tooltip } from 'react-leaflet';
import L from 'leaflet';

function fmtTime(ts: string | number): string {
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  return clock.formatDubaiTime(t);
}

function kindLabel(kind: string): string {
  const labels: Record<string, string> = {
    site: 'Site',
    job: 'Job',
    yard: 'Yard',
    restricted: 'Restricted',
  };
  return labels[kind] ?? kind;
}

function shapeDesc(g: Geofence): string {
  if (g.shape.type === 'circle') return `Circle · ${g.shape.radiusM} m radius`;
  return `Polygon · ${g.shape.points.length} points`;
}

function eventsForGeofence(g: Geofence): GeofenceEvent[] {
  return seed.geofenceEvents.filter(e => e.geofenceId === g.id);
}

function geofenceColor(kind: string): string {
  if (kind === 'restricted') return '#dc2626';
  if (kind === 'site') return '#16a34a';
  if (kind === 'yard') return '#d97706';
  return '#ca8a04';
}

function circleOptions(kind: string): L.CircleOptions {
  return {
    radius: 0,
    color: geofenceColor(kind),
    fillColor: geofenceColor(kind),
    fillOpacity: 0.12,
    weight: 2,
    dashArray: '4 4',
  };
}

function polygonOptions(kind: string): L.PolygonOptions {
  return {
    color: geofenceColor(kind),
    fillColor: geofenceColor(kind),
    fillOpacity: 0.12,
    weight: 2,
    dashArray: '4 4',
  };
}

export default function GeofencesPage() {
  const store = useStore;
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showMapOverlay, setShowMapOverlay] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const visibleGeofences = useMemo(() => {
    if (!session) return [];
    if (phase === 'day_one') return [];
    return seed.geofences.filter(g => {
      if (!session.isKasper && g.tenantId !== session.tenantId) return false;
      return true;
    });
  }, [session, phase]);

  // Center the map on the bounds of all visible geofences, falling back to Dubai.
  const mapCenter = useMemo(() => {
    if (visibleGeofences.length === 0) return [25.2048, 55.2708];
    let latSum = 0;
    let lngSum = 0;
    let count = 0;
    for (const g of visibleGeofences) {
      const c = g.shape.type === 'circle' ? g.shape.center : g.shape.points[0];
      latSum += c.lat;
      lngSum += c.lng;
      count++;
    }
    // Also include all polygon points for a tighter bounds estimate.
    for (const g of visibleGeofences) {
      if (g.shape.type === 'polygon') {
        for (const p of g.shape.points) {
          latSum += p.lat;
          lngSum += p.lng;
          count++;
        }
      }
    }
    return [latSum / count, lngSum / count];
  }, [visibleGeofences]);

  if (!session) return null;

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Geofences</h1>
        <p className="text-sm text-grey-500 mt-1">
          {phase === 'day_one' ? 'Geofences are available in Phase 2.' : 'Define areas on the map to track asset entry and exit.'}
        </p>
      </div>

      {phase === 'day_one' ? (
        <EmptyState
          title="Not available"
          description="Geofences are available in Phase 2."
        />
      ) : (
        <>
          <div className="flex gap-2">
            <Button onClick={() => setShowMapOverlay(!showMapOverlay)}>
              {showMapOverlay ? 'Hide on map' : 'Show on map'}
            </Button>
            <Button onClick={() => setShowCreateForm(!showCreateForm)}>Create geofence</Button>
          </div>

          {showMapOverlay && (
            <div className="rounded-xl border border-line bg-paper overflow-hidden h-[360px] sm:h-[420px] md:h-[480px]">
              <MapContainer
                center={mapCenter}
                zoom={10}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {visibleGeofences.map(g => {
                  if (g.shape.type === 'circle') {
                    return (
                      <Circle
                        key={g.id}
                        center={[g.shape.center.lat, g.shape.center.lng]}
                        radius={g.shape.radiusM}
                        options={circleOptions(g.kind)}
                      >
                        <Tooltip>
                          <div className="text-left">
                            <div className="font-medium text-ink text-xs">{g.name}</div>
                            <div className="text-grey-500 text-xs">{shapeDesc(g)}</div>
                            <div className="text-grey-500 text-xs mt-1">
                              {g.alertOnEnter ? 'Enter alert' : ''} {g.alertOnEnter && g.alertOnExit ? ' · ' : ''}
                              {g.alertOnExit ? 'Exit alert' : ''}
                            </div>
                          </div>
                        </Tooltip>
                      </Circle>
                    );
                  }
                  return (
                    <Polygon
                      key={g.id}
                      positions={g.shape.points.map(p => [p.lat, p.lng] as [number, number])}
                      options={polygonOptions(g.kind)}
                    >
                      <Tooltip>
                        <div className="text-left">
                          <div className="font-medium text-ink text-xs">{g.name}</div>
                          <div className="text-grey-500 text-xs">{shapeDesc(g)}</div>
                          <div className="text-grey-500 text-xs mt-1">
                            {g.alertOnEnter ? 'Enter alert' : ''} {g.alertOnEnter && g.alertOnExit ? ' · ' : ''}
                            {g.alertOnExit ? 'Exit alert' : ''}
                          </div>
                        </div>
                      </Tooltip>
                    </Polygon>
                  );
                })}
              </MapContainer>
              <div className="flex items-center gap-3 px-3 py-2 text-xs text-grey-500 border-t border-line bg-paper-2">
                Showing {visibleGeofences.length} geofence{visibleGeofences.length !== 1 ? 's' : ''}
                {visibleGeofences.filter(g => g.kind === 'restricted').length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red" />
                    Restricted: {visibleGeofences.filter(g => g.kind === 'restricted').length}
                  </span>
                )}
                {visibleGeofences.filter(g => g.kind === 'job').length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-yellow" />
                    Job: {visibleGeofences.filter(g => g.kind === 'job').length}
                  </span>
                )}
                {visibleGeofences.filter(g => g.kind === 'yard').length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber" />
                    Yard: {visibleGeofences.filter(g => g.kind === 'yard').length}
                  </span>
                )}
              </div>
            </div>
          )}

          {toast && (
            <div className="fixed bottom-4 right-4 bg-ink text-paper px-4 py-2 rounded-lg shadow-lg text-sm">
              {toast}
            </div>
          )}

          {showCreateForm && (
            <div className="bg-surface border border-line rounded-lg p-4">
              <h2 className="text-sm font-medium text-ink mb-3">Create geofence</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-grey-500 font-medium">Name</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="Geofence name"
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">Kind</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option value="job">Job</option>
                    <option value="yard">Yard</option>
                    <option value="restricted">Restricted</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">Shape</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option value="circle">Circle</option>
                    <option value="polygon">Polygon</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">Assets</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option value="all">All assets</option>
                    {seed.assets.filter(a => isAssetVisible(session, a.id)).map(a => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setShowCreateForm(false)}>Cancel</Button>
                  <Button onClick={() => { setShowCreateForm(false); showToast('Geofence created'); }}>Create</Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {visibleGeofences.map(geofence => {
              const events = eventsForGeofence(geofence);
              return (
                <div key={geofence.id} className="bg-surface border border-line rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={geofence.kind === 'restricted' ? 'red' : geofence.kind === 'site' ? 'green' : 'yellow'}>
                          {kindLabel(geofence.kind)}
                        </Badge>
                        <span className="font-medium text-ink">{geofence.name}</span>
                      </div>
                      <div className="text-sm text-grey-700 mt-1">
                        {shapeDesc(geofence)}
                      </div>
                      <div className="text-xs text-grey-500 mt-1">
                        {geofence.assetIds === 'all' ? 'All assets' :
                          seed.assets.filter(a => (geofence.assetIds as string[]).includes(a.id)).map(a => a.code).join(', ')}
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-grey-500">
                        <span>Enter alert: {geofence.alertOnEnter ? 'Yes' : 'No'}</span>
                        <span>Exit alert: {geofence.alertOnExit ? 'Yes' : 'No'}</span>
                        {geofence.afterHoursOnly && (
                          <span>After hours: {geofence.afterHoursOnly.from} – {geofence.afterHoursOnly.to}</span>
                        )}
                      </div>
                      {events.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-line">
                          <div className="text-xs text-grey-500 mb-1">Recent events</div>
                          {events.slice(0, 5).map(event => {
                            const asset = seed.assets.find(a => a.id === event.assetId);
                            return (
                              <div key={event.id} className="text-xs text-grey-700">
                                {event.type === 'enter' ? 'Entered' : 'Exited'} · {asset?.code ?? '—'} · {fmtTime(event.at)}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                        Edit
                      </button>
                      <button className="text-xs px-2 py-1 rounded bg-red/10 border border-red/30 text-red hover:bg-red/20">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {visibleGeofences.length === 0 && (
              <EmptyState
                title="No geofences"
                description="Create a geofence to track asset entry and exit."
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
