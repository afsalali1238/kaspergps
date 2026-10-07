'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Button, Badge, EmptyState, Tabs,
} from '@/components/ui';
import { seed } from '@/server/seed/data';
import { useStore } from '@/store';
import type { User } from '@/domain/types';

function formatTs(ts: string | number): string {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  return new Date(t).toLocaleString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Dubai',
  });
}

function roleBadge(role: string): React.ReactNode {
  return <Badge variant={role === 'tenant_admin' ? 'default' : 'grey'}>
    {role === 'tenant_admin' ? 'Tenant Admin' : 'Site User'}
  </Badge>;
}

function userStatusBadge(status: string): React.ReactNode {
  return <Badge variant={
    status === 'active' ? 'green'
    : status === 'invited' ? 'yellow'
    : 'grey'
  }>{status}</Badge>;
}

export default function SettingsPage() {
  const store = useStore;
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
        <h1 className="text-lg font-semibold text-ink mb-4">Settings</h1>
        <EmptyState
          title="Not available"
          description="Settings are available in Phase 2."
        />
      </div>
    );
  }

  const myTenantId = session.tenantId;
  const myTenant = seed.tenants.find(t => t.id === myTenantId);
  const myUsers = seed.users.filter(u => u.tenantId === myTenantId);
  const mySites = seed.sites.filter(s => s.tenantId === myTenantId);
  const myAssets = seed.assets.filter(a => a.ownerTenantId === myTenantId);
  const otherTenants = seed.tenants.filter(t => t.id !== myTenantId);

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
        <h1 className="text-lg font-semibold text-ink">Settings</h1>
        <p className="text-sm text-grey-500 mt-1">
          Manage your company's users, sites, and assets.
        </p>
      </div>

      <Tabs
        tabs={[
          { id: 'users', label: 'Users' },
          { id: 'sites', label: 'Sites' },
          { id: 'assets', label: 'Assets' },
        ]}
        activeId={activeTab}
        onChange={setActiveTab}
      />

      {/* Users tab */}
      {activeTab === 'users' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-ink">Users</h2>
            <Button size="sm" onClick={() => setShowInvite(!showInvite)}>
              {showInvite ? 'Cancel' : 'Invite user'}
            </Button>
          </div>

          {showInvite && (
            <div className="bg-paper-2 rounded-lg p-4 border border-line space-y-3 mb-4">
              <h3 className="text-xs font-medium text-grey-500">Invite a user</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-grey-500 font-medium">Name</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">Email</label>
                  <input
                    type="email"
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="user@company.com"
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">Role</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option value="tenant_admin">Tenant Admin</option>
                    <option value="site_user">Site User</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">Sites</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option value="">Pick at least one site (Site User only)</option>
                    {mySites.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {existingEmails.has('') && (
                <p className="text-xs text-red">This email already has an account.</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleInvite}>Send invite</Button>
                <Button variant="secondary" size="sm" onClick={() => setShowInvite(false)}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Role</th>
                  <th className="px-3 py-2 text-left font-medium">Sites</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {myUsers.map(u => (
                  <tr key={u.id} className="bg-paper hover:bg-paper-2">
                    <td className="px-3 py-2 border-b border-line text-grey-700 font-medium">{u.name}</td>
                    <td className="px-3 py-2 border-b border-line font-mono text-grey-500">{u.email}</td>
                    <td className="px-3 py-2 border-b border-line">{roleBadge(u.role)}</td>
                    <td className="px-3 py-2 border-b border-line text-grey-700 text-xs">
                      {u.siteIds.map(sid => {
                        const s = seed.sites.find(si => si.id === sid);
                        return s?.name ?? sid;
                      }).join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2 border-b border-line">{userStatusBadge(u.status)}</td>
                    <td className="px-3 py-2 text-right border-b border-line">
                      <div className="flex gap-1 justify-end">
                        <Button variant="secondary" size="sm">Edit</Button>
                        {u.status === 'active' ? (
                          <Button variant="danger" size="sm">Deactivate</Button>
                        ) : (
                          <Button variant="secondary" size="sm">Reactivate</Button>
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

          {myUsers.filter(u => u.role === 'tenant_admin' && u.status === 'active').length < 1 && myUsers.length > 0 && (
            <div className="bg-yellow/10 border border-yellow/30 text-yellow-dark text-sm px-4 py-3 rounded-lg mt-4">
              Every company needs at least one Tenant Admin.
            </div>
          )}
        </div>
      )}

      {/* Sites tab */}
      {activeTab === 'sites' && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-ink">Sites</h2>
            <Button size="sm" onClick={() => setShowAddSite(!showAddSite)}>
              {showAddSite ? 'Cancel' : 'Add site'}
            </Button>
          </div>

          {showAddSite && (
            <div className="bg-paper-2 rounded-lg p-4 border border-line space-y-3 mb-4">
              <h3 className="text-xs font-medium text-grey-500">Add a site</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-grey-500 font-medium">Site name</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="e.g. Business Bay Tower"
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">Location</label>
                  <div className="bg-paper-2 rounded-lg p-3 border border-line text-xs text-grey-500">
                    Click on the map to pick a location, or search a Dubai area.
                  </div>
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">Radius (100–2,000 m)</label>
                  <input
                    type="number"
                    min={100}
                    max={2000}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="300"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm">Save site</Button>
                  <Button variant="secondary" size="sm" onClick={() => setShowAddSite(false)}>Cancel</Button>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Location</th>
                  <th className="px-3 py-2 text-right font-medium">Radius</th>
                  <th className="px-3 py-2 text-right font-medium">Assets</th>
                  <th className="px-3 py-2 text-left font-medium">Users</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
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
                        <Button variant="secondary" size="sm">Edit</Button>
                        {s.assetCount === 0 && s.userCount === 0 ? (
                          <Button variant="danger" size="sm">Delete</Button>
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
                      No sites yet. Add your first site.
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
            <h2 className="text-sm font-medium text-ink">Assets</h2>
            <Button size="sm" onClick={() => setShowAddAsset(!showAddAsset)}>
              {showAddAsset ? 'Cancel' : 'Add asset'}
            </Button>
          </div>

          {showAddAsset && (
            <div className="bg-paper-2 rounded-lg p-4 border border-line space-y-3 mb-4">
              <h3 className="text-xs font-medium text-grey-500">Add an asset</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-grey-500 font-medium">Code</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="EX-15"
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">Name</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="Excavator 15"
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">Type</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option>excavator</option>
                    <option>wheel_loader</option>
                    <option>dozer</option>
                    <option>crane</option>
                    <option>pickup</option>
                    <option>tipper</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">Class</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option>plant</option>
                    <option>lifting</option>
                    <option>truck</option>
                    <option>light_vehicle</option>
                    <option>power</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">Make</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="CAT"
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">Model</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
                    placeholder="320"
                  />
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">Home site</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option value="">Select a site</option>
                    {mySites.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-grey-500 font-medium">Behaviour</label>
                  <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                    <option value="parked">Parked</option>
                    <option value="works_at_site">Works at site</option>
                    <option value="drives_between_sites">Drives between sites</option>
                    <option value="light_vehicle_day">Light vehicle (day trips)</option>
                  </select>
                </div>
              </div>
              <div className="text-xs text-grey-500 italic mt-1">
                The asset starts as No tracker, Tier 1. Contact Kasper to fit hardware.
              </div>
              <div className="flex gap-2">
                <Button size="sm">Save asset</Button>
                <Button variant="secondary" size="sm" onClick={() => setShowAddAsset(false)}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-paper-2 text-grey-500">
                  <th className="px-3 py-2 text-left font-medium">Code</th>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Class</th>
                  <th className="px-3 py-2 text-left font-medium">Home site</th>
                  <th className="px-3 py-2 text-left font-medium">Tracker</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
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
                          <span className="text-grey-400 text-xs">No tracker</span>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-line">
                        <Badge variant={
                          a.status === 'live' ? 'green'
                          : a.status === 'offline' ? 'red'
                          : a.status === 'unknown' ? 'yellow'
                          : a.status === 'no_tracker' ? 'grey'
                          : 'grey'
                        }>{a.status}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right border-b border-line">
                        <div className="flex gap-1 justify-end">
                          <Link href={`/app/assets/${a.id}`} className="text-xs text-yellow-600 hover:text-yellow font-medium">
                            View
                          </Link>
                          {!a.retiredAt && (
                            <Button variant="danger" size="sm">Retire</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {myAssets.length === 0 && (
                  <tr className="bg-paper">
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-grey-500">
                      No assets yet. Add your first asset.
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
