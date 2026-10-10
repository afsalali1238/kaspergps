'use client';

// Geofences (spec §12.2, S31): real seeded geofences + enter/exit events,
// scoped to the user's tenant. Create/delete go through geofence.manage.

import React, { useState, useMemo } from 'react';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { useDb, isAssetVisible, visibleGeofences, visibleGeofenceEvents, createGeofence, deleteGeofence, can } from '@/server/api';
import * as clock from '@/lib/clock';
import { useT } from '@/i18n';
import { useSession, useSwitches } from '@/hooks';

function kindLabel(kind: string, t: (k: string, f: string) => string): string {
  switch (kind) {
    case 'site': return t('geofences.kinds.site', 'Site');
    case 'job': return t('geofences.kinds.job', 'Job');
    case 'yard': return t('geofences.kinds.yard', 'Yard');
    case 'restricted': return t('geofences.kinds.restricted', 'Restricted');
    default: return kind;
  }
}

export default function GeofencesPage() {
  const seed = useDb(s => s);
  const t = useT();
  const session = useSession();
  const { phase } = useSwitches();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Create form state
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'site' | 'job' | 'yard' | 'restricted'>('job');
  const [centerLat, setCenterLat] = useState('25.1972');
  const [centerLng, setCenterLng] = useState('55.2744');
  const [radiusM, setRadiusM] = useState('500');
  const [alertEnter, setAlertEnter] = useState(false);
  const [alertExit, setAlertExit] = useState(true);
  const [scope, setScope] = useState<'all' | string>('all');
  const [formError, setFormError] = useState<string | null>(null);

  const geofences = useMemo(
    () => (session ? visibleGeofences(session) : []),
    // version busts the memo after create/delete
    [session, version]
  );
  const events = useMemo(
    () => (session ? visibleGeofenceEvents(session) : []),
    [session, version]
  );
  const canManage = session ? can(session, 'geofence.manage') : false;

  if (!session) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleCreate = () => {
    setFormError(null);
    const result = createGeofence(session, {
      name,
      kind,
      center: { lat: Number(centerLat), lng: Number(centerLng) },
      radiusM: Number(radiusM),
      alertOnEnter: alertEnter,
      alertOnExit: alertExit,
      assetIds: scope === 'all' ? 'all' : [scope],
    });
    if (!result.ok) {
      setFormError(result.error ?? 'Could not create the geofence.');
      return;
    }
    setShowCreateForm(false);
    setName('');
    setVersion(v => v + 1);
    showToast(result.message ?? t('geofences.created', 'Geofence created'));
  };

  const handleDelete = (id: string) => {
    const result = deleteGeofence(session, id);
    if (result.ok) {
      setVersion(v => v + 1);
      showToast(result.message ?? t('geofences.deleted', 'Geofence deleted'));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">{t('geofences.title', 'Geofences')}</h1>
        <p className="text-sm text-grey-500 mt-1">
          {t('geofences.subtitle', 'Draw a geofence and get enter/exit alerts for the assets you choose.')}
        </p>
      </div>

      {phase === 'day_one' ? (
        <EmptyState
          title={t('common.not_available', 'Not available')}
          description={t('geofences.phase_gate', 'Geofences are available in Phase 2.')}
        />
      ) : (
        <>
          {canManage && (
            <div className="flex gap-2">
              <Button onClick={() => setShowCreateForm(!showCreateForm)}>{t('geofences.create', 'Create geofence')}</Button>
            </div>
          )}

          {toast && (
            <div className="fixed bottom-4 right-4 bg-ink text-paper px-4 py-2 rounded-lg shadow-lg text-sm">
              {toast}
            </div>
          )}

          {showCreateForm && (
            <div className="bg-surface border border-line rounded-lg p-4">
              <h2 className="text-sm font-medium text-ink mb-3">{t('geofences.create', 'Create geofence')}</h2>
              <div className="space-y-3">
                <div>
                  <label htmlFor="gf-name" className="text-xs text-grey-500 font-medium">{t('geofences.name', 'Name')}</label>
                  <input
                    id="gf-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder={t('geofences.name_placeholder', 'Geofence name')}
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('geofences.kind', 'Kind')}</label>
                  <select
                    value={kind}
                    onChange={e => setKind(e.target.value as 'site' | 'job' | 'yard' | 'restricted')}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  >
                    <option value="job">{t('geofences.kinds.job', 'Job')}</option>
                    <option value="yard">{t('geofences.kinds.yard', 'Yard')}</option>
                    <option value="site">{t('geofences.kinds.site', 'Site')}</option>
                    <option value="restricted">{t('geofences.kinds.restricted', 'Restricted')}</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label htmlFor="gf-lat" className="text-xs text-grey-500 font-medium">{t('geofences.center_lat', 'Centre latitude')}</label>
                    <input
                      id="gf-lat"
                      type="text"
                      value={centerLat}
                      onChange={e => setCenterLat(e.target.value)}
                      className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 font-mono focus:outline-none focus:border-ink"
                    />
                  </div>
                  <div>
                    <label htmlFor="gf-lng" className="text-xs text-grey-500 font-medium">{t('geofences.center_lng', 'Centre longitude')}</label>
                    <input
                      id="gf-lng"
                      type="text"
                      value={centerLng}
                      onChange={e => setCenterLng(e.target.value)}
                      className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 font-mono focus:outline-none focus:border-ink"
                    />
                  </div>
                  <div>
                    <label htmlFor="gf-radius" className="text-xs text-grey-500 font-medium">{t('geofences.radius', 'Radius (m)')}</label>
                    <input
                      id="gf-radius"
                      type="text"
                      value={radiusM}
                      onChange={e => setRadiusM(e.target.value)}
                      className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 font-mono focus:outline-none focus:border-ink"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-grey-700">
                    <input type="checkbox" checked={alertEnter} onChange={e => setAlertEnter(e.target.checked)} />
                    {t('geofences.enter_yes', 'Enter: Yes')}
                  </label>
                  <label className="flex items-center gap-2 text-xs text-grey-700">
                    <input type="checkbox" checked={alertExit} onChange={e => setAlertExit(e.target.checked)} />
                    {t('geofences.exit_yes', 'Exit: Yes')}
                  </label>
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('geofences.assets', 'Assets')}</label>
                  <select
                    value={scope}
                    onChange={e => setScope(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  >
                    <option value="all">{t('geofences.all_assets', 'All assets')}</option>
                    {seed.assets.filter(a => isAssetVisible(session, a.id)).map(a => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </div>
                {formError && <div className="text-xs text-red">{formError}</div>}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setShowCreateForm(false)}>{t('common.cancel', 'Cancel')}</Button>
                  <Button onClick={handleCreate}>{t('geofences.create_button', 'Create')}</Button>
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
                        {kindLabel(geofence.kind, t)}
                      </Badge>
                      <span className="font-medium text-ink">{geofence.name}</span>
                    </div>
                    <div className="text-sm text-grey-700 mt-1">
                      {geofence.shape === 'circle'
                        ? t('geofences.circle_line', 'Circle · {radius}m radius', { radius: geofence.radiusM ?? 0 })
                        : t('geofences.polygon_line', 'Polygon · {points} points', { points: geofence.points?.length ?? 0 })}
                    </div>
                    <div className="text-xs text-grey-500 mt-1">
                      {geofence.assetIds === 'all'
                        ? t('geofences.all_assets', 'All assets')
                        : seed.assets.filter(a => Array.isArray(geofence.assetIds) && geofence.assetIds.includes(a.id)).map(a => a.code).join(', ')}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-grey-500">
                      {geofence.alertOnEnter && <span>{t('geofences.enter_yes', 'Enter: Yes')}</span>}
                      {geofence.alertOnExit && <span>{t('geofences.exit_yes', 'Exit: Yes')}</span>}
                      <span>{t('geofences.events_7d', 'Events (7d): {count}', { count: geofence.eventsLast7Days })}</span>
                    </div>
                    {geofence.events.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {geofence.events.slice(0, 3).map(ev => (
                          <div key={ev.id} className="text-xs text-grey-500">
                            {clock.formatDubaiDateTime(ev.at)} · {ev.assetCode} — {ev.type === 'enter' ? t('geofences.event_enter', 'entered') : t('geofences.event_exit', 'exited')}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {canManage && (
                    <button
                      onClick={() => handleDelete(geofence.id)}
                      className="text-xs px-2 py-1 rounded bg-red/10 border border-red/30 text-red hover:bg-red/20"
                    >
                      {t('common.delete', 'Delete')}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {geofences.length === 0 && (
              <EmptyState
                title={t('geofences.none', 'No geofences')}
                description={t('geofences.none_hint', 'Create a geofence to track asset entry and exit.')}
              />
            )}
          </div>

          {events.length > 0 && (
            <div className="bg-surface border border-line rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-line text-sm font-medium text-ink">
                {t('geofences.events_title', 'Recent events')}
              </div>
              <div className="divide-y divide-line">
                {events.slice(0, 8).map(ev => (
                  <div key={ev.id} className="px-3 py-2 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-ink">{ev.geofenceName}</span>
                      <span className="text-grey-700"> · {ev.assetCode} — {ev.type === 'enter' ? t('geofences.event_enter', 'entered') : t('geofences.event_exit', 'exited')}</span>
                    </div>
                    <span className="text-grey-500 font-mono">{clock.formatDubaiDateTime(ev.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
