'use client';

// Sign-in picker (prototype only): choose who to be from a dropdown instead of
// typing an email. The list is built from live data, grouped by company and
// narrowed by role, the same as View as. Signing in runs the same checks as
// the email form (api.signInAs), so a deactivated user still gets the sign-in
// error and an invited user is welcomed and activated.

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { useDb, viewAsGroups, signInAs, fb12PublicPath } from '@/server/api';
import type { ViewAsRoleFilter } from '@/domain/types';
import { storeActions } from '@/hooks';
import { useT } from '@/i18n';

/** How long the welcome notice stays before the redirect. */
const NOTICE_MS = 1500;

const SELECT_CLASS =
  'w-full px-3 py-2.5 text-sm bg-surface border border-line rounded-lg focus:outline-none focus:border-ink transition-colors';

export function UserPicker() {
  const t = useT();
  const router = useRouter();
  const users = useDb(s => s.users);
  const tenants = useDb(s => s.tenants);
  const sites = useDb(s => s.sites);
  const assets = useDb(s => s.assets);
  const bookings = useDb(s => s.bookings);

  const [role, setRole] = useState<ViewAsRoleFilter>('all');
  const [picked, setPicked] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const groups = useMemo(
    () => viewAsGroups({ users, tenants, sites, assets, bookings }, '', role),
    [users, tenants, sites, assets, bookings, role]
  );
  const rows = groups.flatMap(g => g.rows);
  // Keep the pick while it is still in the list; otherwise fall back to the first user shown.
  const selected = rows.find(r => r.user.id === picked) ?? rows[0] ?? null;

  const roleOptions: { value: ViewAsRoleFilter; label: string }[] = [
    { value: 'all', label: t('sign_in.picker.role_all', 'All roles') },
    { value: 'kasper_admin', label: t('sign_in.picker.role_kasper_admin', 'Kasper Admin') },
    { value: 'kasper_ops', label: t('sign_in.picker.role_kasper_ops', 'Kasper Ops') },
    { value: 'tenant_admin', label: t('sign_in.picker.role_tenant_admin', 'Tenant Admin') },
    { value: 'site_user', label: t('sign_in.picker.role_site_user', 'Site User') },
  ];

  const statusWord = (status: string): string =>
    status === 'deactivated'
      ? ` (${t('sign_in.picker.status_deactivated', 'deactivated')})`
      : status === 'invited'
        ? ` (${t('sign_in.picker.status_invited', 'invited')})`
        : '';

  const handleSignIn = async () => {
    if (!selected) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    const result = signInAs(selected.user.id);
    if (!result.success || !result.data) {
      setError(result.error ?? t('sign_in.errors.failed', 'Sign in failed.'));
      setLoading(false);
      return;
    }
    storeActions.setSession(result.data.session);
    if (result.data.notice) {
      // First sign-in of an invited user: greet them, then go on.
      setNotice(result.data.notice);
      await new Promise(resolve => setTimeout(resolve, NOTICE_MS));
    }
    router.replace(result.data.session.isKasper ? '/console' : '/app');
  };

  const openOutsideHirer = () => {
    const path = fb12PublicPath();
    if (path) router.push(path);
  };

  const details = selected ? [selected.subtitle, ...selected.badges.map(b => b.label)].join(' · ') : '';

  return (
    <section aria-labelledby="signin-picker-title" className="space-y-4">
      <h2 id="signin-picker-title" className="text-sm font-medium text-ink">
        {t('sign_in.picker.title', 'Choose who to sign in as')}
      </h2>

      <div>
        <label htmlFor="signin-role" className="block text-sm font-medium text-ink mb-1.5">
          {t('sign_in.picker.role_label', 'Role')}
        </label>
        <select
          id="signin-role"
          value={role}
          onChange={e => {
            setRole(e.target.value as ViewAsRoleFilter);
            setError(null);
          }}
          className={SELECT_CLASS}
          disabled={loading}
        >
          {roleOptions.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="signin-user" className="block text-sm font-medium text-ink mb-1.5">
          {t('sign_in.picker.user_label', 'User')}
        </label>
        <select
          id="signin-user"
          value={selected?.user.id ?? ''}
          onChange={e => {
            setPicked(e.target.value);
            setError(null);
          }}
          className={SELECT_CLASS}
          disabled={loading || rows.length === 0}
        >
          {groups.map(group => (
            <optgroup key={group.key} label={group.name}>
              {group.rows.map(row => (
                <option key={row.user.id} value={row.user.id}>
                  {row.user.name} — {row.subtitle}
                  {statusWord(row.user.status)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {details && <p className="mt-1.5 text-xs text-grey-500 font-mono">{details}</p>}
        {rows.length === 0 && (
          <p className="mt-1.5 text-xs text-grey-500">{t('sign_in.picker.no_users', 'No users have this role yet.')}</p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red bg-red/5 border border-red/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-ink bg-yellow/10 border border-yellow-dark/40 rounded-lg px-3 py-2">
          {notice}
        </p>
      )}

      <Button type="button" fullWidth size="md" loading={loading} disabled={!selected} onClick={handleSignIn}>
        {selected
          ? t('sign_in.picker.sign_in_as', 'Sign in as {name}', { name: selected.user.name })
          : t('sign_in.picker.sign_in_disabled', 'Choose a user')}
      </Button>

      <button
        type="button"
        onClick={openOutsideHirer}
        className="w-full text-sm text-grey-500 hover:text-ink transition-colors"
      >
        {t('sign_in.picker.outside_hirer', "Open the outside hirer's tracking link")}
      </button>
    </section>
  );
}
