// Sign-in picker: every user is in the dropdown, grouped by company; the role
// filter narrows it; signing in runs the same checks as the email form.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { LocaleProvider } from '@/i18n';
import { db, resetDb } from '@/server/db';

const nav = { replace: vi.fn(), push: vi.fn() };
const setSession = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/sign-in',
  useRouter: () => ({ push: nav.push, refresh: vi.fn(), replace: nav.replace }),
}));

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return { ...actual, storeActions: { ...actual.storeActions, setSession: (s: unknown) => setSession(s) } };
});

import { UserPicker } from './UserPicker';

function renderPicker() {
  return render(
    <LocaleProvider locale="en">
      <UserPicker />
    </LocaleProvider>
  );
}

const userSelect = () => screen.getByLabelText('Person') as HTMLSelectElement;
const roleSelect = () => screen.getByLabelText('Role') as HTMLSelectElement;

describe('UserPicker', () => {
  beforeEach(() => {
    resetDb();
    nav.replace.mockReset();
    nav.push.mockReset();
    setSession.mockReset();
  });

  afterEach(() => {
    resetDb();
  });

  it('starts on Tenant Admin with Khalid preselected, and offers five roles', () => {
    renderPicker();
    const roles = within(roleSelect()).getAllByRole('option').map(o => o.textContent);
    expect(roles).toEqual(['Kasper Admin', 'Kasper Ops', 'Tenant Admin', 'Site User', 'Link viewer (no account)']);
    expect(roleSelect().value).toBe('tenant_admin');
    expect(userSelect().value).toBe('u-khalid');
    const options = within(userSelect()).getAllByRole('option');
    for (const option of options) expect(option.textContent).toContain('Tenant Admin');
  });

  it('switching role lands on that role\'s default person', () => {
    renderPicker();
    fireEvent.change(roleSelect(), { target: { value: 'site_user' } });
    expect(userSelect().value).toBe('u-deepa');
    const options = within(userSelect()).getAllByRole('option');
    const siteUsers = db.getState().users.filter(u => ['site_user'].includes(u.role));
    expect(options).toHaveLength(siteUsers.length);
    expect(options.map(o => o.textContent).join('|')).toContain('Deepa Shah — Site User · Dubai South Hub, Palm Crescent Works');
    fireEvent.change(roleSelect(), { target: { value: 'kasper_ops' } });
    expect(userSelect().value).toBe('u-ravi');
  });

  it('signs a tenant admin into the app', () => {
    renderPicker();
    fireEvent.change(userSelect(), { target: { value: 'u-omar' } });
    expect(screen.getByText(/No CAN/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in as Omar Saleh' }));
    expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-omar' }));
    expect(nav.replace).toHaveBeenCalledWith('/app');
  });

  it('signs Kasper staff into the console', () => {
    renderPicker();
    fireEvent.change(roleSelect(), { target: { value: 'kasper_admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in as Sara Haddad' }));
    expect(nav.replace).toHaveBeenCalledWith('/console');
  });

  it('refuses a deactivated user with the sign-in message', () => {
    renderPicker();
    fireEvent.change(roleSelect(), { target: { value: 'site_user' } });
    fireEvent.change(userSelect(), { target: { value: 'u-karim' } });
    expect(within(userSelect()).getByRole('option', { name: /Karim Old.*\(deactivated\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in as Karim Old' }));
    expect(screen.getByRole('alert').textContent).toContain('Your account is no longer active. Contact your company admin.');
    expect(setSession).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('welcomes and activates an invited user', async () => {
    renderPicker();
    fireEvent.change(roleSelect(), { target: { value: 'site_user' } });
    fireEvent.change(userSelect(), { target: { value: 'u-sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in as Sam Invite' }));
    expect((await screen.findByRole('status')).textContent).toContain('Welcome to Kasper, Sam.');
    expect(db.getState().users.find(u => u.id === 'u-sam')?.status).toBe('active');
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/app'), { timeout: 3000 });
  });

  it('the Link viewer opens the outside hirer tracking link, with no person to pick', () => {
    renderPicker();
    fireEvent.change(roleSelect(), { target: { value: 'link_viewer' } });
    expect(screen.queryByLabelText('Person')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "Open the hirer's tracking link" }));
    expect(nav.push).toHaveBeenCalledWith(expect.stringMatching(/^\/t\/k7Qm2Xc9TpLw4ZaN8rVb3Ye5$/));
  });
});
