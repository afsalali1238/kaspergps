'use client';

// Kasper console — Geofences (all tenants, real seed data).

import React, { useState, useMemo } from 'react';
import { Badge, Button, EmptyState } from '@/components/ui';
import {
  visibleGeofences, visibleGeofenceEvents, createGeofence, deleteGeofence,
} from '@/server/geofences';
import * as clock from '@/lib/clock';
import { useSession } from '@/hooks';

function kindLabel(kind: string): string {
  return { site: 'Site', job: 'Job', yard: 'Yard', restricted: 'Restricted' }[kind] ?? kind;
}

export default function ConsoleGeofencesPage() {
  const session = useSession();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<'site' | 'job' | 'yard' | 'restricted'>('job');
  const [centerLat, setCenterLat] = useState('25.1972');
  const [centerLng, setCenterLng] = useState('55.2744');
  const [radiusM, setRadiusM] = useState('500');
  const [formError, setFormError] = useState<string | null>(null);

  const geofences = useMemo(() => {
    if (!session) return [];
    return visibleGeofences(session).filter(
      g => !searchQuery || g.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    // version busts the memo after create/delete
  }, [session, searchQuery, version]);

  const events = useMemo(() => (session ? visibleGeofenceEvents(session) : []), [session, version]);

  if (!session) return null;

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreate = () => {
    setFormError(null);
    const result = createGeofence(session, {
      name,
      kind,
      center: { lat: Number(centerLat), lng: Number(centerLng) },
      radiusM: Number(radiusM),
      alertOnEnter: false,
      alertOnExit: true,
      assetIds: 'all',
    });
    if (!result.ok) {
      setFormError(result.error ?? 'Could not create the geofence.');
      return;
    }
    setShowCreateForm(false);
    setName('');
    setVersion(v => v + 1);
    showToast(result.message ?? 'Geofence created');
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Geofences</h1>
          <p className="text-sm text-grey-500 mt-1">
            Define areas on the map to track asset entry and exit.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>Create geofence</Button>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 bg-ink text-paper px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      <input
        type="text"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        placeholder="Search geofences…"
        className="w-full max-w-xs px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
      />

      {showCreateForm && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-3">Create geofence (circle)</h2>
          <div className="space-y-3">
            <div>
              <label htmlFor="gf-name" className="text-xs text-grey-500 font-medium">Name</label>
              <input
                id="gf-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                placeholder="Geofence name"
              />
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Kind</label>
              <select
                value={kind}
                onChange={e => setKind(e.target.value as 'site' | 'job' | 'yard' | 'restricted')}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              >
                <option value="job">Job</option>
                <option value="yard">Yard</option>
                <option value="site">Site</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="gf-lat" className="text-xs text-grey-500 font-medium">Centre latitude</label>
                <input
                  id="gf-lat"
                  type="text"
                  value={centerLat}
                  onChange={e => setCenterLat(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 font-mono focus:outline-none focus:border-ink"
                />
              </div>
              <div>
                <label htmlFor="gf-lng" className="text-xs text-grey-500 font-medium">Centre longitude</label>
                <input
                  id="gf-lng"
                  type="text"
                  value={centerLng}
                  onChange={e => setCenterLng(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 font-mono focus:outline-none focus:border-ink"
                />
              </div>
              <div>
                <label htmlFor="gf-radius" className="text-xs text-grey-500 font-medium">Radius (m)</label>
                <input
                  id="gf-radius"
                  type="text"
                  value={radiusM}
                  onChange={e => setRadiusM(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 font-mono focus:outline-none focus:border-ink"
                />
              </div>
            </div>
            {formError && <div className="text-xs text-red">{formError}</div>}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowCreateForm(false)}>Cancel</Button>
              <Button onClick={handleCreate}>Create</Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {geofences.map(geofence => (
          <div key={geofence.id} className="bg-surface border border-line rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant={geofence.kind === 'restricted' ? 'red' : geofence.kind === 'site' ? 'green' : 'yellow'}>
                    {kindLabel(geofence.kind)}
                  </Badge>
                  <span className="font-medium text-ink">{geofence.name}</span>
                  <span className="text-xs text-grey-500">({geofence.ownerTenantId})</span>
                </div>
                <div className="text-sm text-grey-700 mt-1">
                  {geofence.shape === 'circle'
                    ? `Circle · ${geofence.radiusM ?? 0} m radius`
                    : `Polygon · ${geofence.points?.length ?? 0} points`}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-grey-500">
                  {geofence.alertOnEnter && <span>Enter: Yes</span>}
                  {geofence.alertOnExit && <span>Exit: Yes</span>}
                  <span>Events (7d): {geofence.eventsLast7Days}</span>
                </div>
                {geofence.events.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {geofence.events.slice(0, 3).map(ev => (
                      <div key={ev.id} className="text-xs text-grey-500">
                        {clock.formatDubaiDateTime(ev.at)} · {ev.assetCode} — {ev.type}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  const result = deleteGeofence(session, geofence.id);
                  if (result.ok) {
                    setVersion(v => v + 1);
                    showToast(result.message ?? 'Geofence deleted');
                  }
                }}
                className="text-xs px-2 py-1 rounded bg-red/10 border border-red/30 text-red hover:bg-red/20"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {geofences.length === 0 && (
          <EmptyState title="No geofences" description="Create a geofence to track asset entry and exit." />
        )}
      </div>

      {events.length > 0 && (
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-line text-sm font-medium text-ink">Recent events</div>
          <div className="divide-y divide-line">
            {events.slice(0, 8).map(ev => (
              <div key={ev.id} className="px-3 py-2 flex items-center justify-between text-xs">
                <div>
                  <span className="text-ink">{ev.geofenceName}</span>
                  <span className="text-grey-700"> · {ev.assetCode} — {ev.type}</span>
                </div>
                <span className="text-grey-500 font-mono">{clock.formatDubaiDateTime(ev.at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
