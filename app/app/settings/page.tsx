'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Button, Badge, EmptyState, Tabs, KpiStrip, KpiCell,
} from '@/components/ui';
import { useDb, hasRole, computeStatus, createUser, updateUserSites, deactivateUser, reactivateUser, createAsset, retireAsset, reinstateAsset, createSite, updateSite, deleteSite, createSiteGeofence } from '@/server/api';
import { searchPlaces } from '@/domain/places';
import { renameLabel, deleteLabel, labelUsage, labelsVisibleTo } from '@/server/api';
import { useT, useHref } from '@/i18n';
import * as clock from '@/lib/clock';
import { useSession, useSwitches } from '@/hooks';
import type { Asset, AssetClass, Role } from '@/domain/types';

const STATUS_WORD: Record<string, string> = {
  live: 'Live', idle: 'Idle', stale: 'Stale', offline: 'Offline', unknown: 'Unknown', no_tracker: 'No tracker',
};

const EMPTY_INVITE = { name: '', email: '', role: 'tenant_admin' as Role, siteIds: [] as string[] };

const EMPTY_ASSET = {
  code: '', name: '', type: 'Excavator', assetClass: 'plant' as AssetClass, make: '', model: '',
  year: String(clock.dubaiNow().getFullYear()), plate: '', homeSiteId: '', tank: '', behaviour: 'parked' as Asset['behaviour'],
};
const EMPTY_SITE = { name: '', radius: '300', center: null as null | { lat: number; lng: number }, placeName: '' };
const ASSET_CLASS_OPTIONS = [
  { value: 'plant', label: 'Plant' },
  { value: 'lifting', label: 'Lifting' },
  { value: 'truck', label: 'Truck' },
  { value: 'light_vehicle', label: 'Light vehicle' },
  { value: 'power', label: 'Power' },
];

type T = (key: string, fallback: string) => string;

function roleBadge(userRole: string, t: T): React.ReactNode {
  return <Badge variant={userRole === 'tenant_admin' ? 'default' : 'grey'}>
    {userRole === 'tenant_admin'
      ? t('settings.users.tenant_admin', 'Tenant Admin')
      : t('settings.users.site_user', 'Site User')}
  </Badge>;
}

function userStatusBadge(status: string, t: T): React.ReactNode {
  return <Badge variant={
    status === 'active' ? 'green'
    : status === 'invited' ? 'yellow'
    : 'grey'
  }>{t(`settings.users.status.${status}`, status)}</Badge>;
}

export default function SettingsPage() {
  const seed = useDb(s => s);
  const t = useT();
  const href = useHref();
  const session = useSession();
  const { phase } = useSwitches();

  const [activeTab, setActiveTab] = useState('users');
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<{ userId: string; siteIds: string[] } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [showAddSite, setShowAddSite] = useState(false);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [assetDraft, setAssetDraft] = useState(EMPTY_ASSET);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [assetNotice, setAssetNotice] = useState<string | null>(null);
  const [newAssetId, setNewAssetId] = useState<string | null>(null);
  const [siteDraft, setSiteDraft] = useState(EMPTY_SITE);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [siteNotice, setSiteNotice] = useState<string | null>(null);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);
  const [labelNotice, setLabelNotice] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [confirmDeleteLabel, setConfirmDeleteLabel] = useState<string | null>(null);
  const [invite, setInvite] = useState(EMPTY_INVITE);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [userActionError, setUserActionError] = useState<string | null>(null);
  const [userActionNotice, setUserActionNotice] = useState<string | null>(null);

  if (!session) return null;

  if (phase === 'day_one') {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold text-ink mb-4">{t('settings.title', 'Settings')}</h1>
        <EmptyState
          title={t('common.not_available', 'Not available')}
          description={t('settings.phase_gate', 'Settings are available in Phase 2.')}
        />
      </div>
    );
  }

  const myTenantId = session.tenantId;
  const myUsers = seed.users.filter(u => u.tenantId === myTenantId);
  const mySites = seed.sites.filter(s => s.tenantId === myTenantId);
  const myAssets = seed.assets.filter(a => a.ownerTenantId === myTenantId);
  const visibleLabels = labelsVisibleTo(session);

  // Sites with asset counts
  const sitesWithCounts = mySites.map(s => ({
    ...s,
    assetCount: myAssets.filter(a => a.homeSiteId === s.id).length,
    userCount: myUsers.filter(u => u.siteIds.includes(s.id)).length,
  }));

  // ── Assets and sites (§11.8): each write goes through the server rules. ──
  const saveAsset = () => {
    const result = createAsset(session, {
      code: assetDraft.code,
      name: assetDraft.name,
      type: assetDraft.type,
      assetClass: assetDraft.assetClass,
      make: assetDraft.make,
      model: assetDraft.model,
      year: Number(assetDraft.year),
      plateOrSerial: assetDraft.plate,
      homeSiteId: assetDraft.homeSiteId,
      tankLitres: assetDraft.tank.trim() ? Number(assetDraft.tank) : undefined,
      behaviour: assetDraft.behaviour,
    });
    if (!result.ok) {
      setAssetError(result.error ?? 'The asset could not be saved.');
      return;
    }
    setAssetDraft(EMPTY_ASSET);
    setAssetError(null);
    setAssetNotice(result.message ?? null);
    setNewAssetId(result.data?.id ?? null);
    setShowAddAsset(false);
    setRowError(null);
  };

  const saveSite = () => {
    if (!siteDraft.center) {
      setSiteError('Pick a location from the list.');
      return;
    }
    const input = { name: siteDraft.name, center: siteDraft.center, radiusM: Number(siteDraft.radius) };
    const result = editingSiteId ? updateSite(session, editingSiteId, input) : createSite(session, input);
    if (!result.ok) {
      setSiteError(result.error ?? 'The site could not be saved.');
      return;
    }
    setSiteDraft(EMPTY_SITE);
    setSiteError(null);
    setSiteNotice(result.message ?? null);
    setEditingSiteId(null);
    setShowAddSite(false);
    setRowError(null);
  };

  const startEditSite = (id: string) => {
    const site = seed.sites.find(s => s.id === id);
    if (!site) return;
    setEditingSiteId(id);
    setSiteDraft({ name: site.name, radius: String(site.radiusM), center: site.center, placeName: '' });
    setSiteError(null);
    setShowAddSite(true);
  };

  const makeSiteGeofence = (id: string) => {
    const result = createSiteGeofence(session, id);
    if (!result.ok) {
      setRowError(result.error ?? 'The site geofence could not be created.');
      return;
    }
    setRowError(null);
    setSiteNotice(t('settings.sites.geofence_made', 'Site geofence created.'));
  };

  const removeSite = (id: string) => {
    const result = deleteSite(session, id);
    if (!result.ok) {
      setRowError(result.error ?? 'The site could not be deleted.');
      return;
    }
    setRowError(null);
    setSiteNotice(result.message ?? null);
  };

  const runAssetAction = (action: () => { ok: boolean; error?: string; message?: string }) => {
    const result = action();
    if (!result.ok) {
      setRowError(result.error ?? 'That did not work.');
      return;
    }
    setRowError(null);
    setAssetNotice(result.message ?? null);
  };

  // Sends the invite through the same rules as the console (name, email, duplicate).
  const handleInvite = () => {
    const result = createUser(session, {
      tenantId: session.tenantId ?? '',
      name: invite.name,
      email: invite.email,
      role: invite.role,
      siteIds: invite.siteIds,
    });
    if (!result.ok) {
      setInviteError(result.error ?? 'The invite could not be sent.');
      return;
    }
    setInvite(EMPTY_INVITE);
    setInviteError(null);
    setInviteNotice(result.message ?? null);
    setShowInvite(false);
  };

  // Deactivate / reactivate go through src/server/team.ts, which also owns the
  // refusal rules (last active Tenant Admin, "already deactivated", and the
  // self-deactivate refusal). The UI simply surfaces what it says.
  const handleUserStatus = (userId: string, next: 'deactivated' | 'active') => {
    const result = next === 'deactivated'
      ? deactivateUser(session, userId)
      : reactivateUser(session, userId);
    if (!result.ok) {
      setUserActionError(result.error ?? 'That change could not be made.');
      setUserActionNotice(null);
      return;
    }
    setUserActionError(null);
    setUserActionNotice(result.message ?? null);
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">{t('settings.title', 'Settings')}</h1>
        <p className="text-sm text-grey-500 mt-1">
          {t('settings.subtitle', "Manage your company's users, sites, and assets.")}
        </p>
      </div>

      <KpiStrip label="Organization">
        <KpiCell label="Users" value={myUsers.length} />
        <KpiCell label="Sites" value={mySites.length} />
        <KpiCell label="Assets" value={myAssets.length} />
        <KpiCell label="Labels" value={visibleLabels.length} />
      </KpiStrip>

      <Tabs
        tabs={[
          { id: 'users', label: t('settings.tabs.users', 'Users') },
          { id: 'sites', label: t('settings.tabs.sites', 'Sites') },
          { id: 'assets', label: t('settings.tabs.assets', 'Assets') },
          { id: 'labels', label: t('settings.tabs.labels', 'Labels') },
        ]}
        activeId={activeTab}
        onChange={setActiveTab}
      />

      {/* Users tab */}
      {activeTab === 'users' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-ink">{t('settings.users.title', 'Users')}</h2>
            <Button size="sm" onClick={() => { setInviteError(null); setShowInvite(!showInvite); }}>
              {showInvite ? t('common.cancel', 'Cancel') : t('settings.users.invite', 'Invite user')}
            </Button>
          </div>

          {inviteNotice && (
            <p role="status" className="text-xs text-ink bg-yellow/10 border border-yellow-dark/40 rounded-lg px-3 py-2 mb-3">{inviteNotice}</p>
          )}

          {userActionNotice && (
            <p role="status" className="text-xs text-ink bg-yellow/10 border border-yellow-dark/40 rounded-lg px-3 py-2 mb-3">{userActionNotice}</p>
          )}

          {userActionError && (
            <p role="alert" className="text-xs text-red mb-3">{userActionError}</p>
          )}

          {showInvite && (
            <div className="bg-paper-2 rounded-lg p-4 border border-line space-y-3 mb-4">
              <h3 className="text-xs text-grey-500 font-medium">{t('settings.users.invite_title', 'Invite a user')}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="inv-name" className="text-xs text-grey-500 font-medium">{t('settings.users.full_name', 'Full name')}</label>
                  <input id="inv-name"
                    type="text"
                    value={invite.name}
                    onChange={e => setInvite({ ...invite, name: e.target.value })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder={t('settings.users.full_name', 'Full name')}
                  />
                </div>
                <div>
                  <label htmlFor="inv-email" className="text-xs text-grey-500 font-medium">{t('settings.users.email', 'Email')}</label>
                  <input id="inv-email"
                    type="email"
                    aria-label="Email"
                    value={invite.email}
                    onChange={e => setInvite({ ...invite, email: e.target.value })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="user@company.com"
                  />
                </div>
                <div>
                  <label htmlFor="inv-role" className="text-xs text-grey-500 font-medium">{t('settings.users.role', 'Role')}</label>
                  <select
                    id="inv-role"
                    value={invite.role}
                    onChange={e => setInvite({ ...invite, role: e.target.value as Role })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  >
                    <option value="tenant_admin">{t('settings.users.tenant_admin', 'Tenant Admin')}</option>
                    <option value="site_user">{t('settings.users.site_user', 'Site User')}</option>
                  </select>
                </div>
                <div>
                  <span id="inv-sites-label" className="text-xs text-grey-500 font-medium">{t('settings.users.sites', 'Sites')}</span>
                  <div role="group" aria-labelledby="inv-sites-label" className="mt-1 space-y-1">
                    {mySites.map(s => (
                      <label key={s.id} className="flex items-center gap-2 text-sm text-grey-700">
                        <input
                          type="checkbox"
                          checked={invite.siteIds.includes(s.id)}
                          onChange={e => setInvite({
                            ...invite,
                            siteIds: e.target.checked
                              ? [...invite.siteIds, s.id]
                              : invite.siteIds.filter(id => id !== s.id),
                          })}
                        />
                        {s.name}
                      </label>
                    ))}
                    <p className="text-[11px] text-grey-500">{t('settings.users.sites_hint', 'Pick at least one site (Site User only)')}</p>
                  </div>
                </div>
              </div>
              {inviteError && (
                <p role="alert" className="text-xs text-red">{inviteError}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleInvite}>{t('settings.users.send_invite', 'Send invite')}</Button>
                <Button variant="secondary" size="sm" onClick={() => setShowInvite(false)}>{t('common.cancel', 'Cancel')}</Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">{t('settings.users.columns.name', 'Name')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.users.columns.email', 'Email')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.users.columns.role', 'Role')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.users.columns.sites', 'Sites')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.users.columns.status', 'Status')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('settings.users.columns.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {myUsers.map(u => (
                  <tr key={u.id} data-user-id={u.id} className="bg-paper hover:bg-paper-2">
                    <td className="px-3 py-2 border-b border-line text-grey-700 font-medium">{u.name}</td>
                    <td className="px-3 py-2 border-b border-line font-mono text-grey-500">{u.email}</td>
                    <td className="px-3 py-2 border-b border-line">{roleBadge(u.role, t)}</td>
                    <td className="px-3 py-2 border-b border-line text-grey-700 text-xs">
                      {u.siteIds.map(sid => {
                        const s = seed.sites.find(si => si.id === sid);
                        return s?.name ?? sid;
                      }).join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2 border-b border-line">{userStatusBadge(u.status, t)}</td>
                    <td className="px-3 py-2 text-right border-b border-line">
                      <div className="flex gap-1 justify-end">
                        {hasRole(u, 'site_user') && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => { setEditing({ userId: u.id, siteIds: [...u.siteIds] }); setEditError(null); }}
                          >
                            {t('common.edit', 'Edit')}
                          </Button>
                        )}
                        {/* You can't deactivate yourself: the button is absent on
                            your own row, and team.ts refuses it anyway. */}
                        {u.status === 'active' ? (
                          u.id === session.userId ? (
                            <span className="text-xs text-grey-400">—</span>
                          ) : (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleUserStatus(u.id, 'deactivated')}
                            >
                              {t('settings.users.actions.deactivate', 'Deactivate')}
                            </Button>
                          )
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleUserStatus(u.id, 'active')}
                          >
                            {t('settings.users.actions.reactivate', 'Reactivate')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {myUsers.length === 0 && (
                  <tr className="bg-paper">
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-grey-500">
                      No users yet. Invite the first admin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {editing && (() => {
            const target = myUsers.find(u => u.id === editing.userId);
            if (!target) return null;
            const save = () => {
              const result = updateUserSites(session, target.id, editing.siteIds);
              if (!result.ok) { setEditError(result.error ?? 'The sites could not be saved.'); return; }
              setEditing(null);
              setEditError(null);
            };
            return (
              <div className="bg-paper-2 rounded-lg p-4 border border-line space-y-3 mt-4">
                <h3 className="text-xs text-grey-500 font-medium">{t('settings.users.edit_sites', 'Sites for {name}', { name: target.name })}</h3>
                <span id="edit-sites-label" className="text-xs text-grey-500 font-medium">{t('settings.users.sites', 'Sites')}</span>
                <div role="group" aria-labelledby="edit-sites-label" className="space-y-1">
                  {mySites.map(s => (
                    <label key={s.id} className="flex items-center gap-2 text-sm text-grey-700">
                      <input
                        type="checkbox"
                        checked={editing.siteIds.includes(s.id)}
                        onChange={e => setEditing({
                          ...editing,
                          siteIds: e.target.checked
                            ? [...editing.siteIds, s.id]
                            : editing.siteIds.filter(id => id !== s.id),
                        })}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
                {editError && <p role="alert" className="text-xs text-red">{editError}</p>}
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={save}>{t('common.save', 'Save')}</Button>
                  <Button variant="secondary" size="sm" onClick={() => { setEditing(null); setEditError(null); }}>{t('common.cancel', 'Cancel')}</Button>
                </div>
              </div>
            );
          })()}

          {myUsers.filter(u => hasRole(u, 'tenant_admin') && u.status === 'active').length < 1 && myUsers.length > 0 && (
            <div className="bg-yellow/10 border border-yellow/30 text-yellow-dark text-sm px-4 py-3 rounded-lg mt-4">
              {t('settings.users.last_admin', 'Every company needs at least one Tenant Admin.')}
            </div>
          )}
        </div>
      )}

      {/* Sites tab */}
      {activeTab === 'sites' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-ink">{t('settings.sites.title', 'Sites')}</h2>
            {!showAddSite && (
              <Button size="sm" onClick={() => { setShowAddSite(true); setEditingSiteId(null); setSiteDraft(EMPTY_SITE); setSiteError(null); }}>
                {t('settings.sites.add', 'Add site')}
              </Button>
            )}
          </div>

          {siteNotice && <p role="status" className="text-xs text-ink bg-yellow/10 border border-yellow-dark/40 rounded-lg px-3 py-2 mb-3">{siteNotice}</p>}

          {showAddSite && (
            <div className="bg-paper-2 rounded-lg p-4 border border-line space-y-3 mb-4">
              <h3 className="text-xs text-grey-500 font-medium">
                {editingSiteId ? t('settings.sites.edit', 'Edit site') : t('settings.sites.add_title', 'Add a site')}
              </h3>
              <div className="space-y-3">
                <div>
                  <label htmlFor="site-name" className="text-xs text-grey-500 font-medium">{t('settings.sites.name', 'Site name')}</label>
                  <input id="site-name"
                    type="text"
                    value={siteDraft.name}
                    onChange={e => setSiteDraft({ ...siteDraft, name: e.target.value })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder={t('settings.sites.name_placeholder', 'e.g. Business Bay Tower')}
                  />
                </div>
                <div>
                  <span className="text-xs text-grey-500 font-medium">{t('settings.sites.location', 'Location')}</span>
                  <div className="mt-1 space-y-2">
                    <input
                      type="search"
                      aria-label={t('settings.sites.search_area', 'Search a Dubai or UAE area')}
                      value={placeQuery}
                      onChange={e => setPlaceQuery(e.target.value)}
                      placeholder={t('settings.sites.search_placeholder', 'Search an area, e.g. Jebel Ali')}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    />
                    <div className="flex flex-wrap gap-1">
                      {searchPlaces(placeQuery).map(place => (
                        <button
                          key={place.name}
                          type="button"
                          onClick={() => setSiteDraft({ ...siteDraft, center: place.center, placeName: place.name })}
                          aria-pressed={siteDraft.placeName === place.name}
                          className={`px-2 py-1 text-xs rounded-lg border ${siteDraft.placeName === place.name ? 'bg-ink text-white border-ink' : 'bg-paper border-line text-grey-700 hover:border-grey-500'}`}
                        >
                          {place.name}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-grey-500">
                      {siteDraft.center
                        ? `${siteDraft.placeName || t('settings.sites.picked', 'Picked location')} · ${siteDraft.center.lat.toFixed(4)}, ${siteDraft.center.lng.toFixed(4)}`
                        : t('settings.sites.no_location', 'No location picked yet.')}
                    </div>
                  </div>
                </div>
                <div>
                  <label htmlFor="site-radius" className="text-xs text-grey-500 font-medium">{t('settings.sites.radius', 'Radius (100–2,000 m)')}</label>
                  <input id="site-radius"
                    type="number"
                    min={100}
                    max={2000}
                    value={siteDraft.radius}
                    onChange={e => setSiteDraft({ ...siteDraft, radius: e.target.value })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="300"
                  />
                </div>
                {siteError && <p role="alert" className="text-xs text-red">{siteError}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveSite}>{t('settings.sites.save', 'Save site')}</Button>
                  <Button variant="secondary" size="sm" onClick={() => { setShowAddSite(false); setEditingSiteId(null); setSiteError(null); }}>{t('common.cancel', 'Cancel')}</Button>
                </div>
              </div>
            </div>
          )}

          {rowError && <p role="alert" className="text-xs text-red mb-3">{rowError}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">{t('settings.sites.columns.site', 'Name')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.sites.location', 'Location')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('settings.sites.radius_short', 'Radius')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('settings.sites.columns.assets', 'Assets')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.sites.columns.users', 'Users')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('settings.users.columns.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {sitesWithCounts.map(s => (
                  <tr key={s.id} className="bg-paper hover:bg-paper-2">
                    <td className="px-3 py-2 border-b border-line text-grey-700 font-medium">{s.name}</td>
                    <td className="px-3 py-2 border-b border-line font-mono text-grey-500">
                      {s.center.lat.toFixed(4)}, {s.center.lng.toFixed(4)}
                    </td>
                    <td className="px-3 py-2 border-b border-line text-right font-mono text-grey-700">{s.radiusM}m</td>
                    <td className="px-3 py-2 border-b border-line text-right">{s.assetCount}</td>
                    <td className="px-3 py-2 border-b border-line text-grey-700 text-xs">
                      {myUsers.filter(u => u.siteIds.includes(s.id)).map(u => u.name).join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2 text-right border-b border-line">
                      <div className="flex gap-1 justify-end">
                        <Button variant="secondary" size="sm" onClick={() => startEditSite(s.id)}>{t('common.edit', 'Edit')}</Button>
                        <Button variant="secondary" size="sm" onClick={() => makeSiteGeofence(s.id)}>{t('settings.sites.make_geofence', 'Create site geofence')}</Button>
                        <Button variant="danger" size="sm" onClick={() => removeSite(s.id)}>{t('common.delete', 'Delete')}</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {mySites.length === 0 && (
                  <tr className="bg-paper">
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-grey-500">
                      {t('settings.sites.empty', 'No sites yet. Add your first site.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'assets' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-ink">{t('settings.assets.title', 'Assets')}</h2>
            {!showAddAsset && (
              <Button size="sm" onClick={() => { setShowAddAsset(true); setAssetError(null); }}>
                {t('settings.assets.add', 'Add asset')}
              </Button>
            )}
          </div>

          {assetNotice && (
            <p role="status" className="text-xs text-ink bg-yellow/10 border border-yellow-dark/40 rounded-lg px-3 py-2 mb-3">
              {assetNotice}
              {newAssetId && (
                <>
                  {' '}
                  <Link href={href(`/app/assets/${newAssetId}`)} className="underline">
                    {t('settings.assets.request_tracker', 'Request a tracker')}
                  </Link>
                </>
              )}
            </p>
          )}
          {rowError && <p role="alert" className="text-xs text-red mb-3">{rowError}</p>}

          {showAddAsset && (
            <div className="bg-paper-2 rounded-lg p-4 border border-line space-y-3 mb-4">
              <h3 className="text-xs text-grey-500 font-medium">{t('settings.assets.add_title', 'Add an asset')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="asset-code" className="text-xs text-grey-500 font-medium">{t('settings.assets.code', 'Code')}</label>
                  <input id="asset-code"
                    type="text"
                    value={assetDraft.code}
                    onChange={e => setAssetDraft({ ...assetDraft, code: e.target.value })}
                    placeholder={t('settings.assets.code_placeholder', 'EX-15')}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                  />
                </div>
                <Field id="asset-name" label={t('settings.assets.name', 'Name')} placeholder={t('settings.assets.name_placeholder', 'Excavator 15')}
                  value={assetDraft.name} onChange={v => setAssetDraft({ ...assetDraft, name: v })} />
                <SelectField id="asset-type" label={t('settings.assets.type', 'Type')} value={assetDraft.type}
                  onChange={v => setAssetDraft({ ...assetDraft, type: v })}
                  options={['Excavator', 'Wheel loader', 'Dozer', 'Crane', 'Pickup', 'Tipper', 'Van', 'Flatbed truck', 'Compactor']} />
                <SelectField id="asset-class" label={t('settings.assets.class', 'Class')} value={assetDraft.assetClass}
                  onChange={v => setAssetDraft({ ...assetDraft, assetClass: v as AssetClass })}
                  options={ASSET_CLASS_OPTIONS} />
                <Field id="asset-make" label={t('settings.assets.make', 'Make')} placeholder={t('settings.assets.make_placeholder', 'CAT')}
                  value={assetDraft.make} onChange={v => setAssetDraft({ ...assetDraft, make: v })} />
                <Field id="asset-model" label={t('settings.assets.model', 'Model')} placeholder="320"
                  value={assetDraft.model} onChange={v => setAssetDraft({ ...assetDraft, model: v })} />
                <Field id="asset-year" label={t('settings.assets.year', 'Year')} type="number"
                  value={assetDraft.year} onChange={v => setAssetDraft({ ...assetDraft, year: v })} />
                <Field id="asset-plate" label={t('settings.assets.plate', 'Plate or serial')}
                  value={assetDraft.plate} onChange={v => setAssetDraft({ ...assetDraft, plate: v })} />
                <div>
                  <label htmlFor="asset-home_site" className="text-xs text-grey-500 font-medium">{t('settings.assets.home_site', 'Home site')}</label>
                  <select id="asset-home_site" value={assetDraft.homeSiteId} onChange={e => setAssetDraft({ ...assetDraft, homeSiteId: e.target.value })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option value="">{t('settings.assets.select_site', 'Select a site')}</option>
                    {mySites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <Field id="asset-tank" label={t('settings.assets.tank', 'Tank size, litres (optional)')} type="number"
                  value={assetDraft.tank} onChange={v => setAssetDraft({ ...assetDraft, tank: v })} />
                <div>
                  <label htmlFor="asset-behaviour" className="text-xs text-grey-500 font-medium">{t('settings.assets.behaviour', 'How it behaves in the demo')}</label>
                  <select id="asset-behaviour" value={assetDraft.behaviour} onChange={e => setAssetDraft({ ...assetDraft, behaviour: e.target.value as Asset['behaviour'] })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option value="parked">{t('settings.assets.behaviours.parked', 'Parked')}</option>
                    <option value="works_at_site">{t('settings.assets.behaviours.works_at_site', 'Works at site')}</option>
                    <option value="drives_between_sites">{t('settings.assets.behaviours.drives_between_sites', 'Drives between sites')}</option>
                    <option value="light_vehicle_day">{t('settings.assets.behaviours.light_vehicle', 'Light vehicle (day trips)')}</option>
                  </select>
                </div>
              </div>
              {/* Hardware is read-only here: the asset starts as No tracker, Tier 1. */}
              <div className="rounded-lg border border-line bg-paper-2 px-3 py-2 text-xs text-grey-700 space-y-0.5">
                <div><span className="text-grey-500">{t('settings.assets.hw_tracker', 'Tracker')}:</span> {t('settings.assets.hw_none', 'None')}</div>
                <div><span className="text-grey-500">{t('settings.assets.hw_adapter', 'CAN adapter')}:</span> {t('settings.assets.hw_none', 'None')}</div>
                <div className="italic text-grey-500">{t('settings.assets.hw_locked', 'Contact Kasper to change hardware.')}</div>
              </div>
              {assetError && <p role="alert" className="text-xs text-red">{assetError}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={saveAsset}>{t('settings.assets.save', 'Save asset')}</Button>
                <Button variant="secondary" size="sm" onClick={() => { setShowAddAsset(false); setAssetError(null); }}>{t('common.cancel', 'Cancel')}</Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">{t('settings.assets.code', 'Code')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.assets.columns.asset', 'Name')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.assets.class', 'Class')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.assets.home_site', 'Home site')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.assets.tracker', 'Tracker')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.users.columns.status', 'Status')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('settings.users.columns.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {myAssets.map(a => {
                  const site = seed.sites.find(s => s.id === a.homeSiteId);
                  const tracker = seed.trackers.find(t =>
                    t.stockStatus === 'paired' &&
                    seed.pairings.some(p => p.assetId === a.id && p.trackerId === t.id)
                  );
                  return (
                    <tr key={a.id} className="bg-paper hover:bg-paper-2">
                      <td className="px-3 py-2 border-b border-line font-mono text-ink font-medium">{a.code}</td>
                      <td className="px-3 py-2 border-b border-line text-grey-700">{a.name}</td>
                      <td className="px-3 py-2 border-b border-line text-grey-500">{a.assetClass}</td>
                      <td className="px-3 py-2 border-b border-line text-grey-700">{site?.name ?? '—'}</td>
                      <td className="px-3 py-2 border-b border-line">
                        {/* Customers never see IMEIs or SIMs (spec §5): only whether one is fitted. */}
                        {tracker ? (
                          <span className="text-xs text-grey-700">{t('settings.assets.tracker_fitted', 'Fitted')}</span>
                        ) : (
                          <span className="text-grey-400 text-xs">{t('settings.assets.no_tracker', 'No tracker')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-line">
                        {a.retiredAt ? (
                          <Badge variant="grey">{t('settings.assets.retired', 'Retired')}</Badge>
                        ) : (
                          (() => {
                            // The same status the map shows (one status function, H3).
                            const live = computeStatus(a, clock.now());
                            return (
                              <Badge variant={live === 'live' ? 'green' : live === 'offline' ? 'red' : live === 'idle' || live === 'stale' ? 'yellow' : 'grey'}>
                                {t(`common.status.${live}`, STATUS_WORD[live] ?? live)}
                              </Badge>
                            );
                          })()
                        )}
                      </td>
                      <td className="px-3 py-2 text-right border-b border-line">
                        <div className="flex gap-1 justify-end">
                          <Link href={href(`/app/assets/${a.id}`)} className="text-xs text-yellow-600 hover:text-yellow font-medium px-2">
                            {t('certificates.actions.view', 'View')}
                          </Link>
                          {a.retiredAt ? (
                            <Button variant="secondary" size="sm" onClick={() => runAssetAction(() => reinstateAsset(session, a.id))}>
                              {t('settings.assets.reinstate', 'Reinstate')}
                            </Button>
                          ) : (
                            <Button variant="danger" size="sm" onClick={() => runAssetAction(() => retireAsset(session, a.id))}>
                              {t('settings.assets.retire', 'Retire')}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {myAssets.length === 0 && (
                  <tr className="bg-paper">
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-grey-500">
                      {t('settings.assets.empty', 'No assets yet. Add your first asset.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {activeTab === 'labels' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-1">{t('settings.labels.title', 'Labels')}</h2>
          <p className="text-xs text-grey-500 mb-3">
            {t('settings.labels.hint', 'Labels group your assets for filters, reports and schedules. Your renters never see them.')}
          </p>

          {labelNotice && <p role="status" className="text-xs text-ink bg-yellow/10 border border-yellow-dark/40 rounded-lg px-3 py-2 mb-3">{labelNotice}</p>}
          {labelError && <p role="alert" className="text-xs text-red mb-3">{labelError}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">{t('settings.labels.name', 'Label')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('settings.labels.assets', 'Assets')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('settings.users.columns.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {labelsVisibleTo(session).map(l => {
                  const used = labelUsage(session, l.id);
                  const draft = labelDrafts[l.id] ?? l.name;
                  return (
                    <tr key={l.id} className="bg-paper hover:bg-paper-2">
                      <td className="px-3 py-2 border-b border-line">
                        <input
                          aria-label={`Name for ${l.name}`}
                          value={draft}
                          onChange={e => setLabelDrafts({ ...labelDrafts, [l.id]: e.target.value })}
                          className="w-full max-w-xs px-2 py-1 text-xs rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                        />
                      </td>
                      <td className="px-3 py-2 border-b border-line text-right font-mono">{used}</td>
                      <td className="px-3 py-2 border-b border-line text-right">
                        <div className="flex gap-1 justify-end items-center">
                          {draft.trim() !== l.name && (
                            <Button size="sm" variant="secondary" onClick={() => {
                              const r = renameLabel(session, l.id, draft);
                              if (r.ok) { setLabelNotice(r.message ?? null); setLabelError(null); setLabelDrafts({ ...labelDrafts, [l.id]: r.data?.name ?? draft }); }
                              else { setLabelError(r.error ?? 'The label could not be renamed.'); }
                            }}>{t('common.save', 'Save')}</Button>
                          )}
                          {confirmDeleteLabel === l.id ? (
                            <span className="inline-flex items-center gap-2 text-xs text-grey-700">
                              {t('settings.labels.confirm_delete', 'Remove “{name}” from {count} assets?', { name: l.name, count: used })}
                              <Button size="sm" variant="danger" onClick={() => {
                                const r = deleteLabel(session, l.id);
                                setConfirmDeleteLabel(null);
                                if (r.ok) { setLabelNotice(r.message ?? null); setLabelError(null); }
                                else setLabelError(r.error ?? 'The label could not be deleted.');
                              }}>{t('common.delete', 'Delete')}</Button>
                              <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteLabel(null)}>{t('common.cancel', 'Cancel')}</Button>
                            </span>
                          ) : (
                            <Button variant="danger" size="sm" onClick={() => setConfirmDeleteLabel(l.id)}>{t('common.delete', 'Delete')}</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {labelsVisibleTo(session).length === 0 && (
                  <tr className="bg-paper">
                    <td colSpan={3} className="px-3 py-8 text-center text-sm text-grey-500">
                      {t('settings.labels.empty', 'No labels yet. Add one from an asset’s page.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

function Field({ id, label, value, onChange, placeholder, type = 'text' }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs text-grey-500 font-medium">{label}</label>
      <input id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
      />
    </div>
  );
}

function SelectField({ id, label, value, onChange, options }: {
  id: string; label: string; value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[];
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs text-grey-500 font-medium">{label}</label>
      <select id={id} value={value} onChange={e => onChange(e.target.value)}
        className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
        {options.map(o => typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
