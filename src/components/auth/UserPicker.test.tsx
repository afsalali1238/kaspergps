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

const userSelect = () => screen.getByLabelText('User') as HTMLSelectElement;
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

  it('lists every user, grouped by company with Kasper first', () => {
    renderPicker();
    const options = within(userSelect()).getAllByRole('option');
    expect(options).toHaveLength(db.getState().users.length);
    const groups = [...userSelect().querySelectorAll('optgroup')].map(g => g.label);
    expect(groups[0]).toBe('Kasper');
    expect(groups).toContain('Al Noor Transport');
    expect(groups).toContain('Palm Contracting');
    // The first user is preselected, so one click signs in.
    expect((screen.getByRole('button', { name: 'Sign in as Sara Haddad' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('narrows the list to the chosen role', () => {
    renderPicker();
    fireEvent.change(roleSelect(), { target: { value: 'site_user' } });
    const options = within(userSelect()).getAllByRole('option');
    const siteUsers = db.getState().users.filter(u => ['site_user'].includes(u.role));
    expect(options).toHaveLength(siteUsers.length);
    for (const option of options) expect(option.textContent).toContain('Site User');
    // Sites are shown with the role, so a reviewer can pick the right person.
    expect(options.map(o => o.textContent).join('|')).toContain('Deepa Shah — Site User · Dubai South Hub, Palm Crescent Works');
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
    fireEvent.click(screen.getByRole('button', { name: 'Sign in as Sara Haddad' }));
    expect(nav.replace).toHaveBeenCalledWith('/console');
  });

  it('refuses a deactivated user with the sign-in message', () => {
    renderPicker();
    fireEvent.change(userSelect(), { target: { value: 'u-karim' } });
    expect(within(userSelect()).getByRole('option', { name: /Karim Old.*\(deactivated\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in as Karim Old' }));
    expect(screen.getByRole('alert').textContent).toContain('Your account is no longer active. Contact your company admin.');
    expect(setSession).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('welcomes and activates an invited user', async () => {
    renderPicker();
    fireEvent.change(userSelect(), { target: { value: 'u-sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in as Sam Invite' }));
    expect((await screen.findByRole('status')).textContent).toContain('Welcome to Kasper, Sam.');
    expect(db.getState().users.find(u => u.id === 'u-sam')?.status).toBe('active');
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/app'), { timeout: 3000 });
  });

  it('opens the outside hirer tracking link', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: "Open the outside hirer's tracking link" }));
    expect(nav.push).toHaveBeenCalledWith(expect.stringMatching(/^\/t\/k7Qm2Xc9TpLw4ZaN8rVb3Ye5$/));
  });
});
