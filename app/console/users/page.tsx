'use client';

import React, { useState, useMemo } from 'react';
import {
  Button, Badge, EmptyState,
} from '@/components/ui';
import { useDb } from '@/server/db';
import { useStore } from '@/store';

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    kasper_admin: 'Kasper Admin',
    kasper_ops: 'Kasper Ops',
    tenant_admin: 'Tenant Admin',
    site_user: 'Site User',
  };
  return labels[role] ?? role;
}

export default function UsersPage() {
  const seed = useDb(s => s);
  const store = useStore;
  const session = store.getState().session;

  const [tenantFilter, setTenantFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const filteredUsers = useMemo(() => {
    return seed.users.filter(u => {
      if (!session?.isKasper) {
        return u.tenantId === session?.tenantId;
      }
      if (tenantFilter && u.tenantId !== tenantFilter) return false;
      if (statusFilter && u.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [session, tenantFilter, statusFilter, searchQuery]);

  const tenantOptions = seed.tenants;
  const statusOptions = ['active', 'invited', 'deactivated'];

  if (!session) {
    return (
      <div className="text-center py-8">
        <EmptyState
          title="Not available"
          description="Please sign in."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Users</h1>
          <p className="text-sm text-grey-500 mt-1">
            {session.isKasper ? 'Manage all users across tenants.' : 'Manage users in your tenant.'}
          </p>
        </div>
        {session.isKasper && (
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>Invite user</Button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-ink text-paper px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* Filters */}
      {session.isKasper && (
        <div className="flex flex-wrap gap-3">
          <select
            value={tenantFilter ?? ''}
            onChange={e => setTenantFilter(e.target.value || null)}
            className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          >
            <option value="">All tenants</option>
            {tenantOptions.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            value={statusFilter ?? ''}
            onChange={e => setStatusFilter(e.target.value || null)}
            className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          >
            <option value="">All statuses</option>
            {statusOptions.map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search name or email..."
            className="px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
          />
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-3">Invite user</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-grey-500 font-medium">Name</label>
              <input
                type="text"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Email</label>
              <input
                type="email"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink"
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
              <label className="text-xs text-grey-500 font-medium">Sites (for Site User)</label>
              <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                {seed.sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowCreateForm(false)}>Cancel</Button>
              <Button onClick={() => { setShowCreateForm(false); showToast('User invited'); }}>Invite</Button>
            </div>
          </div>
        </div>
      )}

      {/* Users list */}
      <div className="space-y-2">
        {filteredUsers.map(user => (
          <div
            key={user.id}
            className="bg-surface border border-line rounded-lg p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-ink/10 text-ink text-[10px] font-semibold flex items-center justify-center">
                    {user.name.charAt(0)}
                  </span>
                  <span className="font-medium text-ink">{user.name}</span>
                  <Badge variant="grey">{roleLabel(user.role)}</Badge>
                  {user.status === 'deactivated' && <Badge variant="red">Deactivated</Badge>}
                  {user.status === 'invited' && <Badge variant="ink">Invited</Badge>}
                </div>
                <div className="text-sm text-grey-700 mt-1">{user.email}</div>
                <div className="text-xs text-grey-500 mt-1">
                  {user.tenantId ? seed.tenants.find(t => t.id === user.tenantId)?.name : 'No tenant'}
                  {user.siteIds.length > 0 && ` · ${user.siteIds.map(s => seed.sites.find(site => site.id === s)?.name).join(', ')}`}
                </div>
              </div>
              <div className="flex gap-1">
                {user.status === 'active' && (
                  <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                    Edit
                  </button>
                )}
                {user.status === 'active' && (
                  <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                    Deactivate
                  </button>
                )}
                {user.status === 'deactivated' && (
                  <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                    Reactivate
                  </button>
                )}
                {user.status === 'invited' && (
                  <>
                    <button className="text-xs px-2 py-1 rounded bg-paper border border-line text-grey-700 hover:border-ink">
                      Resend invite
                    </button>
                    <button className="text-xs px-2 py-1 rounded bg-red/10 border border-red/30 text-red hover:bg-red/20">
                      Decline
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {filteredUsers.length === 0 && (
          <EmptyState
            title="No users"
            description="No users match the current filters."
          />
        )}
      </div>
    </div>
  );
}
