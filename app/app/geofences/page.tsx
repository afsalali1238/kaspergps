'use client';

import React, { useState, useMemo } from 'react';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { useStore } from '@/store';
import { useT } from '@/lib/useT';
import type { TFunction } from '@/lib/i18n';
import { seed } from '@/server/seed/data';
import { isAssetVisible } from '@/server/access';

interface Geofence {
  id: string;
  name: string;
  kind: 'site' | 'job' | 'yard' | 'restricted';
  shape: 'circle' | 'polygon';
  center: { lat: number; lng: number };
  radius?: number;
  points?: { lat: number; lng: number }[];
  tenantId: string;
  assetIds: string[] | 'all';
  alerts: { enter: boolean; exit: boolean; afterHours: boolean };
  eventsLast7Days: number;
}

const GEOFENCES: Geofence[] = [
  {
    id: 'g-1',
    name: 'Business Bay site',
    kind: 'site',
    shape: 'circle',
    center: { lat: 25.2048, lng: 55.2708 },
    radius: 500,
    tenantId: 't-alnoor',
    assetIds: 'all',
    alerts: { enter: true, exit: true, afterHours: false },
    eventsLast7Days: 5,
  },
  {
    id: 'g-2',
    name: 'Dubai Hills job',
    kind: 'job',
    shape: 'circle',
    center: { lat: 25.0836, lng: 55.1660 },
    radius: 1000,
    tenantId: 't-marina',
    assetIds: ['a-ex04', 'a-ex07'],
    alerts: { enter: true, exit: true, afterHours: true },
    eventsLast7Days: 3,
  },
];

const KIND_KEYS: Record<string, { key: string; fallback: string }> = {
  site: { key: 'geofences.kinds.site', fallback: 'Site' },
  job: { key: 'geofences.kinds.job', fallback: 'Job' },
  yard: { key: 'geofences.kinds.yard', fallback: 'Yard' },
  restricted: { key: 'geofences.kinds.restricted', fallback: 'Restricted' },
};

function kindLabel(kind: string, t: TFunction): string {
  const entry = KIND_KEYS[kind];
  return entry ? t(entry.key, entry.fallback) : kind;
}

export default function GeofencesPage() {
  const store = useStore;
  const { t } = useT();
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const visibleGeofences = useMemo(() => {
    if (!session) return [];
    const allGeofences = phase === 'day_one' ? [] : GEOFENCES;
    return allGeofences.filter(g => {
      if (!session.isKasper && g.tenantId !== session.tenantId) return false;
      return true;
    });
  }, [session, phase]);

  if (!session) return null;

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">{t('geofences.title', 'Geofences')}</h1>
        <p className="text-sm text-grey-500 mt-1">
          {phase === 'day_one'
            ? t('geofences.phase2Short', 'Geofences are available in Phase 2.')
            : t('geofences.subtitle', 'Define areas on the map to track asset entry and exit.')}
        </p>
      </div>

      {phase === 'day_one' ? (
        <EmptyState
          title={t('geofences.notAvailable', 'Not available')}
          description={t('geofences.phase2', 'Geofences are available in Phase 2.')}
        />
      ) : (
        <>
          <div className="flex gap-2">
            <Button onClick={() => setShowCreateForm(!showCreateForm)}>{t('geofences.create', 'Create geofence')}</Button>
          </div>

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
                  <label className="text-xs text-grey-500 font-medium">{t('geofences.name', 'Name')}</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder={t('geofences.namePlaceholder', 'Geofence name')}
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('geofences.kind', 'Kind')}</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    {(['job', 'yard', 'restricted'] as const).map(k => (
                      <option key={k} value={k}>{t(KIND_KEYS[k].key, KIND_KEYS[k].fallback)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('geofences.shape', 'Shape')}</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option value="circle">{t('geofences.shapeCircle', 'Circle')}</option>
                    <option value="polygon">{t('geofences.shapePolygon', 'Polygon')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('geofences.assets', 'Assets')}</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option value="all">{t('geofences.allAssets', 'All assets')}</option>
                    {seed.assets.filter(a => isAssetVisible(session, a.id)).map(a => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setShowCreateForm(false)}>
                    {t('common.cancel', 'Cancel')}
                  </Button>
                  <Button onClick={() => { setShowCreateForm(false); showToast(t('geofences.created', 'Geofence created')); }}>
                    {t('geofences.createAction', 'Create')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {visibleGeofences.map(geofence => (
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
                        ? t('geofences.circleShape', `Circle · ${geofence.radius}m radius`, { radius: geofence.radius ?? 0 })
                        : t('geofences.polygonShape', `Polygon · ${geofence.points?.length} points`, { count: geofence.points?.length ?? 0 })}
                    </div>
                    <div className="text-xs text-grey-500 mt-1">
                      {geofence.assetIds === 'all' ? t('geofences.allAssets', 'All assets') :
                        seed.assets.filter(a => geofence.assetIds.includes(a.id)).map(a => a.code).join(', ')}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-grey-500">
                      {geofence.alerts.enter && <span>{t('geofences.alertEnter', 'Enter: Yes')}</span>}
                      {geofence.alerts.exit && <span>{t('geofences.alertExit', 'Exit: Yes')}</span>}
                      {geofence.alerts.afterHours && <span>{t('geofences.alertAfterHours', 'After hours: Yes')}</span>}
                      <span>{t('geofences.events7d', `Events (7d): ${geofence.eventsLast7Days}`, { count: geofence.eventsLast7Days })}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                      {t('common.edit', 'Edit')}
                    </button>
                    <button className="text-xs px-2 py-1 rounded bg-red/10 border border-red/30 text-red hover:bg-red/20">
                      {t('common.delete', 'Delete')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {visibleGeofences.length === 0 && (
              <EmptyState
                title={t('geofences.emptyTitle', 'No geofences')}
                description={t('geofences.emptyDescription', 'Create a geofence to track asset entry and exit.')}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
