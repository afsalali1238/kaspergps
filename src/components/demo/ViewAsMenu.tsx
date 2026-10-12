'use client';

// The demo bar's "View as" menu (spec §10.1): every user, grouped by company,
// with live badges. Picking a user runs the same sign-in checks as the sign-in
// form, so a deactivated user shows the sign-in error and the session stays put.

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useDb, viewAsGroups, fb12PublicPath } from '@/server/api';
import type { ViewAsRoleFilter } from '@/domain/types';
import { useSession, storeActions } from '@/hooks';
import { signInAs } from '@/server/api';

function roleShort(role: string): string {
  const map: Record<string, string> = {
    kasper_admin: 'Admin',
    kasper_ops: 'Ops',
    tenant_admin: 'Tenant',
    site_user: 'Site',
  };
  return map[role] ?? role;
}

const TONE: Record<'warn' | 'info' | 'muted', string> = {
  warn: 'text-red/90 border-red/40',
  info: 'text-blue-300 border-blue-400/40',
  muted: 'text-paper/50 border-[#2a2c30]',
};

export function ViewAsMenu() {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const users = useDb(s => s.users);
  const tenants = useDb(s => s.tenants);
  const sites = useDb(s => s.sites);
  const assets = useDb(s => s.assets);
  const bookings = useDb(s => s.bookings);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<ViewAsRoleFilter>('all');
  const [notice, setNotice] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  // Ctrl+K (or Cmd+K) opens the menu from anywhere; Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const groups = open ? viewAsGroups({ users, tenants, sites, assets, bookings }, query, role) : [];

  const selectUser = (userId: string) => {
    const result = signInAs(userId);
    if (!result.success || !result.data) {
      setNotice({ tone: 'error', text: result.error ?? 'That user cannot sign in.' });
      return;
    }
    const next = result.data.session;
    storeActions.setSession(next);
    setOpen(false);
    setNotice(result.data.notice ? { tone: 'ok', text: result.data.notice } : null);
    // Land on the user's home. A Kasper user stays on the console if they were on it.
    const onConsole = pathname.startsWith('/console');
    router.replace(onConsole && next.isKasper ? '/console' : '/app');
  };

  const signedOut = () => {
    storeActions.setSession(null);
    setOpen(false);
    setNotice(null);
    router.replace('/sign-in');
  };

  const outsideHirer = () => {
    const path = fb12PublicPath();
    if (!path) return;
    setOpen(false);
    router.push(path);
  };

  return (
    <div className="flex-shrink-0 relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="View as"
        className="flex items-center gap-1.5 bg-[#1a1b20] text-paper text-xs px-2 py-1.5 rounded-lg hover:bg-[#22242a] transition-colors whitespace-nowrap border border-[#2a2c30]"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-paper/60">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {session ? (
          <span className="truncate max-w-[120px]">
            {session.user.name} · {roleShort(session.user.role)}
          </span>
        ) : (
          <span className="text-paper/70">View as</span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-[#1a1b20] border border-[#2a2c30] rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50">
          <div className="p-2 border-b border-[#2a2c30]">
            <select
              value={role}
              onChange={e => setRole(e.target.value as ViewAsRoleFilter)}
              aria-label="Role"
              className="w-full mb-2 px-2.5 py-1.5 text-xs bg-[#22242a] text-paper border border-[#2a2c30] rounded-lg focus:outline-none focus:border-yellow"
            >
              <option value="all">All roles</option>
              <option value="kasper_admin">Kasper admin</option>
              <option value="kasper_ops">Kasper ops</option>
              <option value="tenant_admin">Tenant admin</option>
              <option value="site_user">Site user</option>
            </select>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search users…"
              aria-label="Search users"
              className="w-full px-2.5 py-1.5 text-xs bg-[#22242a] text-paper border border-[#2a2c30] rounded-lg focus:outline-none focus:border-yellow placeholder:text-paper/40"
              autoFocus
            />
            {notice && (
              <p
                role={notice.tone === 'error' ? 'alert' : 'status'}
                className={clsx('mt-2 text-[11px] leading-snug', notice.tone === 'error' ? 'text-red' : 'text-yellow/90')}
              >
                {notice.text}
              </p>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {groups.map(group => (
              <div key={group.key} className="border-b border-[#2a2c30]">
                <div className="px-3 py-1.5 text-[10px] text-paper/50 font-mono uppercase tracking-wider">{group.name}</div>
                {group.rows.map(row => (
                  <button
                    key={row.user.id}
                    onClick={() => selectUser(row.user.id)}
                    className={clsx(
                      'w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors',
                      row.user.id === session?.userId && 'bg-yellow/10',
                      row.deactivated && 'opacity-50',
                      row.user.status === 'invited' && 'bg-blue-500/10'
                    )}
                  >
                    <span className="block text-paper/90">{row.user.name}</span>
                    <span className="block text-[10px] text-paper/50">{row.subtitle}</span>
                    {row.badges.length > 0 && (
                      <span className="flex flex-wrap gap-1 mt-1">
                        {row.badges.map(b => (
                          <span key={b.label} className={clsx('text-[9px] font-mono px-1.5 py-px rounded border', TONE[b.tone])}>
                            {b.label}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 && (
              <p className="px-3 py-3 text-xs text-paper/50">No user matches “{query}”.</p>
            )}
            <div className="p-1 border-t border-[#2a2c30]">
              <button onClick={outsideHirer} className="w-full text-left px-3 py-1.5 text-xs text-paper/80 hover:bg-white/5 rounded">
                Outside hirer (tracking link)
              </button>
              <button onClick={signedOut} className="w-full text-left px-3 py-1.5 text-xs text-paper/80 hover:bg-white/5 rounded">
                Signed out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
