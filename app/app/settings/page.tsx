'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Button, Badge, EmptyState, Tabs,
} from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';
import { useT } from '@/lib/useT';
import type { TFunction } from '@/lib/i18n';

function roleBadge(userRole: string, t: TFunction): React.ReactNode {
  return <Badge variant={userRole === 'tenant_admin' ? 'default' : 'grey'}>
    {userRole === 'tenant_admin'
      ? t('settings.users.roles.tenantAdmin', 'Tenant Admin')
      : t('settings.users.roles.siteUser', 'Site User')}
  </Badge>;
}

const USER_STATUS_KEYS: Record<string, string> = {
  active: 'settings.users.statuses.active',
  invited: 'settings.users.statuses.invited',
  deactivated: 'settings.users.statuses.deactivated',
};

function userStatusBadge(status: string, t: TFunction): React.ReactNode {
  return <Badge variant={
    status === 'active' ? 'green'
    : status === 'invited' ? 'yellow'
    : 'grey'
  }>{t(USER_STATUS_KEYS[status] ?? `settings.users.statuses.${status}`, status)}</Badge>;
}

/** Catalogue keys for the pick-lists on the add-asset form. */
const ASSET_TYPE_KEYS: Record<string, string> = {
  excavator: 'settings.assets.types.excavator',
  wheel_loader: 'settings.assets.types.wheelLoader',
  dozer: 'settings.assets.types.dozer',
  crane: 'settings.assets.types.crane',
  pickup: 'settings.assets.types.pickup',
  tipper: 'settings.assets.types.tipper',
};

const ASSET_CLASS_KEYS: Record<string, string> = {
  plant: 'settings.assets.classes.plant',
  lifting: 'settings.assets.classes.lifting',
  truck: 'settings.assets.classes.truck',
  light_vehicle: 'settings.assets.classes.lightVehicle',
  power: 'settings.assets.classes.power',
};

const ASSET_BEHAVIOUR_KEYS: Record<string, string> = {
  parked: 'settings.assets.behaviours.parked',
  works_at_site: 'settings.assets.behaviours.worksAtSite',
  drives_between_sites: 'settings.assets.behaviours.drivesBetweenSites',
  light_vehicle_day: 'settings.assets.behaviours.lightVehicleDay',
};

const ASSET_STATUS_KEYS: Record<string, string> = {
  live: 'settings.assets.statuses.live',
  offline: 'settings.assets.statuses.offline',
  unknown: 'settings.assets.statuses.unknown',
  no_tracker: 'settings.assets.statuses.noTracker',
};

export default function SettingsPage() {
  const store = useStore;
  const { t } = useT();
  const session = store.getState().session;
  const phase = store.getState().demoSwitches.phase;

  const [activeTab, setActiveTab] = useState('users');
  const [showInvite, setShowInvite] = useState(false);
  const [showAddSite, setShowAddSite] = useState(false);
  const [showAddAsset, setShowAddAsset] = useState(false);

  if (!session) return null;

  if (phase === 'day_one') {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold text-ink mb-4">{t('settings.title', 'Settings')}</h1>
        <EmptyState
          title={t('settings.notAvailable', 'Not available')}
          description={t('settings.phase2', 'Settings are available in Phase 2.')}
        />
      </div>
    );
  }

  const myTenantId = session.tenantId;
  const myUsers = seed.users.filter(u => u.tenantId === myTenantId);
  const mySites = seed.sites.filter(s => s.tenantId === myTenantId);
  const myAssets = seed.assets.filter(a => a.ownerTenantId === myTenantId);

  // Sites with asset counts
  const sitesWithCounts = mySites.map(s => ({
    ...s,
    assetCount: myAssets.filter(a => a.homeSiteId === s.id).length,
    userCount: myUsers.filter(u => u.siteIds.includes(s.id)).length,
  }));

  // Existing emails for duplicate check
  const existingEmails = new Set(seed.users.map(u => u.email.toLowerCase()));

  const handleInvite = () => {
    setShowInvite(false);
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">{t('settings.title', 'Settings')}</h1>
        <p className="text-sm text-grey-500 mt-1">
          {t('settings.subtitle', "Manage your company's users, sites, and assets.")}
        </p>
      </div>

      <Tabs
        tabs={[
          { id: 'users', label: t('settings.tabs.users', 'Users') },
          { id: 'sites', label: t('settings.tabs.sites', 'Sites') },
          { id: 'assets', label: t('settings.tabs.assets', 'Assets') },
        ]}
        activeId={activeTab}
        onChange={setActiveTab}
      />

      {/* Users tab */}
      {activeTab === 'users' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-ink">{t('settings.tabs.users', 'Users')}</h2>
            <Button size="sm" onClick={() => setShowInvite(!showInvite)}>
              {showInvite ? t('common.cancel', 'Cancel') : t('settings.users.invite', 'Invite user')}
            </Button>
          </div>

          {showInvite && (
            <div className="bg-paper-2 rounded-lg p-4 border border-line space-y-3 mb-4">
              <h3 className="text-xs font-medium text-grey-500">{t('settings.users.inviteTitle', 'Invite a user')}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('settings.users.columns.name', 'Name')}</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder={t('settings.users.namePlaceholder', 'Full name')}
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('settings.users.columns.email', 'Email')}</label>
                  <input
                    type="email"
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="user@company.com"
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('settings.users.columns.role', 'Role')}</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option value="tenant_admin">{t('settings.users.roles.tenantAdmin', 'Tenant Admin')}</option>
                    <option value="site_user">{t('settings.users.roles.siteUser', 'Site User')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('settings.users.columns.site', 'Sites')}</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option value="">{t('settings.users.sitesPlaceholder', 'Pick at least one site (Site User only)')}</option>
                    {mySites.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {existingEmails.has('') && (
                <p className="text-xs text-red">{t('settings.users.duplicateEmail', 'This email already has an account.')}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleInvite}>{t('settings.users.sendInvite', 'Send invite')}</Button>
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
                  <th className="px-3 py-2 text-left font-medium">{t('settings.users.columns.site', 'Sites')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.users.columns.status', 'Status')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('settings.users.columns.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {myUsers.map(u => (
                  <tr key={u.id} className="bg-paper hover:bg-paper-2">
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
                        <Button variant="secondary" size="sm">{t('common.edit', 'Edit')}</Button>
                        {u.status === 'active' ? (
                          <Button variant="danger" size="sm">{t('settings.users.deactivate', 'Deactivate')}</Button>
                        ) : (
                          <Button variant="secondary" size="sm">{t('settings.users.reactivate', 'Reactivate')}</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {myUsers.length === 0 && (
                  <tr className="bg-paper">
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-grey-500">
                      {t('settings.users.empty', 'No users yet. Invite the first admin.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {myUsers.filter(u => u.role === 'tenant_admin' && u.status === 'active').length < 1 && myUsers.length > 0 && (
            <div className="bg-yellow/10 border border-yellow/30 text-yellow-dark text-sm px-4 py-3 rounded-lg mt-4">
              {t('settings.users.needsAdmin', 'Every company needs at least one Tenant Admin.')}
            </div>
          )}
        </div>
      )}

      {/* Sites tab */}
      {activeTab === 'sites' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-ink">{t('settings.tabs.sites', 'Sites')}</h2>
            <Button size="sm" onClick={() => setShowAddSite(!showAddSite)}>
              {showAddSite ? t('common.cancel', 'Cancel') : t('settings.sites.add', 'Add site')}
            </Button>
          </div>

          {showAddSite && (
            <div className="bg-paper-2 rounded-lg p-4 border border-line space-y-3 mb-4">
              <h3 className="text-xs font-medium text-grey-500">{t('settings.sites.addTitle', 'Add a site')}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('settings.sites.siteName', 'Site name')}</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder={t('settings.sites.namePlaceholder', 'e.g. Business Bay Tower')}
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('settings.sites.columns.location', 'Location')}</label>
                  <div className="bg-paper-2 rounded-lg p-3 border border-line text-xs text-grey-500">
                    {t('settings.sites.mapHint', 'Click on the map to pick a location, or search a Dubai area.')}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('settings.sites.radiusLabel', 'Radius (100–2,000 m)')}</label>
                  <input
                    type="number"
                    min={100}
                    max={2000}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="300"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm">{t('settings.sites.save', 'Save site')}</Button>
                  <Button variant="secondary" size="sm" onClick={() => setShowAddSite(false)}>{t('common.cancel', 'Cancel')}</Button>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">{t('settings.sites.columns.name', 'Name')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.sites.columns.location', 'Location')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('settings.sites.columns.radius', 'Radius')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('settings.sites.columns.assets', 'Assets')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.sites.usersColumn', 'Users')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('settings.sites.columns.actions', 'Actions')}</th>
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
                        <Button variant="secondary" size="sm">{t('common.edit', 'Edit')}</Button>
                        {s.assetCount === 0 && s.userCount === 0 ? (
                          <Button variant="danger" size="sm">{t('common.delete', 'Delete')}</Button>
                        ) : (
                          <span className="text-xs text-grey-400">—</span>
                        )}
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

      {/* Assets tab */}
      {activeTab === 'assets' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-ink">{t('settings.tabs.assets', 'Assets')}</h2>
            <Button size="sm" onClick={() => setShowAddAsset(!showAddAsset)}>
              {showAddAsset ? t('common.cancel', 'Cancel') : t('settings.assets.add', 'Add asset')}
            </Button>
          </div>

          {showAddAsset && (
            <div className="bg-paper-2 rounded-lg p-4 border border-line space-y-3 mb-4">
              <h3 className="text-xs font-medium text-grey-500">{t('settings.assets.addTitle', 'Add an asset')}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('settings.assets.columns.code', 'Code')}</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="EX-15"
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('settings.assets.columns.name', 'Name')}</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder={t('settings.assets.namePlaceholder', 'Excavator 15')}
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('settings.assets.typeLabel', 'Type')}</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    {Object.keys(ASSET_TYPE_KEYS).map(type => (
                      <option key={type} value={type}>{t(ASSET_TYPE_KEYS[type], type)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('settings.assets.columns.class', 'Class')}</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    {Object.keys(ASSET_CLASS_KEYS).map(cls => (
                      <option key={cls} value={cls}>{t(ASSET_CLASS_KEYS[cls], cls)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('settings.assets.columns.make', 'Make')}</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="CAT"
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('settings.assets.columns.model', 'Model')}</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="320"
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('settings.assets.columns.homeSite', 'Home site')}</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option value="">{t('settings.sites.selectSite', 'Select a site')}</option>
                    {mySites.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">{t('settings.assets.behaviour', 'Behaviour')}</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    {Object.keys(ASSET_BEHAVIOUR_KEYS).map(b => (
                      <option key={b} value={b}>{t(ASSET_BEHAVIOUR_KEYS[b], b)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="text-xs text-grey-500 italic mt-1">
                {t('settings.assets.newAssetNote', 'The asset starts as No tracker, Tier 1. Contact Kasper to fit hardware.')}
              </div>
              <div className="flex gap-2">
                <Button size="sm">{t('settings.assets.save', 'Save asset')}</Button>
                <Button variant="secondary" size="sm" onClick={() => setShowAddAsset(false)}>{t('common.cancel', 'Cancel')}</Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">{t('settings.assets.columns.code', 'Code')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.assets.columns.name', 'Name')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.assets.columns.class', 'Class')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.assets.columns.homeSite', 'Home site')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.assets.trackerColumn', 'Tracker')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('settings.assets.columns.status', 'Status')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('settings.assets.columns.actions', 'Actions')}</th>
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
                        {tracker ? (
                          <span className="font-mono text-xs text-grey-700">{tracker.imei}</span>
                        ) : (
                          <span className="text-grey-400 text-xs">{t('settings.assets.noTracker', 'No tracker')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-line">
                        <Badge variant={
                          a.status === 'live' ? 'green'
                          : a.status === 'offline' ? 'red'
                          : a.status === 'unknown' ? 'yellow'
                          : a.status === 'no_tracker' ? 'grey'
                          : 'grey'
                        }>{t(ASSET_STATUS_KEYS[a.status] ?? `settings.assets.statuses.${a.status}`, a.status)}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right border-b border-line">
                        <div className="flex gap-1 justify-end">
                          <Link href={`/app/assets/${a.id}`} className="text-xs text-yellow-600 hover:text-yellow font-medium">
                            {t('common.view', 'View')}
                          </Link>
                          {!a.retiredAt && (
                            <Button variant="danger" size="sm">{t('settings.assets.retire', 'Retire')}</Button>
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
    </div>
  );
}
