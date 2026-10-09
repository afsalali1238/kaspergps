'use client';

import React, { useState, useMemo } from 'react';
import { Button, Badge, EmptyState } from '@/components/ui';
import { useDb } from '@/server/db';
import { hasCapability } from '@/server/access';
import { hasRole, isKasperStaff } from '@/server/capabilities';
import { useSession } from '@/hooks';

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    kasper_admin: 'Kasper Admin',
    kasper_ops: 'Kasper Ops',
  };
  return labels[role] ?? role;
}

export default function KasperTeamPage() {
  const seed = useDb(s => s);
  const session = useSession();

  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const staff = useMemo(() =>
    seed.users.filter(u => isKasperStaff(u.role)),
    []
  );

  const activeAdmins = staff.filter(u => hasRole(u, 'kasper_admin') && u.status === 'active');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  if (!session || !hasCapability(session, 'console.staff.manage')) {
    return (
      <div className="text-center py-8">
        <EmptyState title="Not available" description="Only Kasper Admin can manage Kasper staff accounts." />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Kasper team</h1>
          <p className="text-sm text-grey-500 mt-1">
            Add, edit, and deactivate Kasper Admin and Kasper Ops accounts.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>Add staff</Button>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 bg-ink text-paper px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* Create / edit form */}
      {showForm && (
        <div className="bg-surface border border-line rounded-lg p-4">
          <h2 className="text-sm font-medium text-ink mb-3">Add Kasper staff</h2>
          <div className="space-y-3">
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
                placeholder="staff@kaspergps.com"
              />
            </div>
            <div>
              <label className="text-xs text-grey-500 font-medium">Role</label>
              <select className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-line bg-paper text-grey-700 focus:outline-none focus:border-ink">
                <option value="kasper_admin">Kasper Admin</option>
                <option value="kasper_ops">Kasper Ops</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={() => { setShowForm(false); showToast('Staff added.'); }}>
                Save
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Staff list */}
      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        {staff.length === 0 ? (
          <div className="p-8 text-center text-sm text-grey-500">No Kasper staff yet.</div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-paper-2 text-grey-500">
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(u => (
                <tr key={u.id} className="bg-paper hover:bg-paper-2">
                  <td className="px-3 py-2 border-b border-line text-grey-700 font-medium">{u.name}</td>
                  <td className="px-3 py-2 border-b border-line font-mono text-grey-500">{u.email}</td>
                  <td className="px-3 py-2 border-b border-line"><Badge variant={hasRole(u, 'kasper_admin') ? 'default' : 'grey'}>{roleLabel(u.role)}</Badge></td>
                  <td className="px-3 py-2 border-b border-line">
                    <Badge variant={u.status === 'active' ? 'green' : 'yellow'}>{u.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right border-b border-line">
                    {u.status === 'active' ? (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setDeleting(u.id)}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => showToast(`${u.name} reactivated.`)}>
                        Reactivate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Deactivate confirm */}
      {deleting && (
        <div className="fixed inset-0 flex items-center justify-center bg-ink/50 z-50">
          <div className="bg-surface border border-line rounded-lg p-4 max-w-sm w-full mx-4">
            <h3 className="text-sm font-medium text-ink mb-2">Deactivate staff?</h3>
            <p className="text-xs text-grey-500 mb-4">
              This staff member will be signed out on their next action. They can be reactivated later.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={() => {
                const u = staff.find(s => s.id === deleting);
                setDeleting(null);
                if (u) showToast(`${u.name} deactivated.`);
              }}>Deactivate</Button>
            </div>
          </div>
        </div>
      )}

      {activeAdmins.length <= 1 && (
        <div className="bg-yellow/10 border border-yellow/30 text-yellow-dark text-sm px-4 py-3 rounded-lg">
          Kasper needs at least one active admin. The last active Kasper Admin cannot be removed.
        </div>
      )}

      <div className="text-xs text-grey-500 p-4 bg-paper-2 border border-line rounded-lg">
        New staff appear in the demo bar's <strong>View as</strong> list immediately.
      </div>
    </div>
  );
}
