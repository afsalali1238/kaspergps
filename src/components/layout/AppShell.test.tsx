// AppShell render tests (H4.7 / H2.6): the nav shows what the §11 rule allows,
// the phone sheet lists every item, and a page the user may not see reads
// "Page not found".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/i18n';
import { db } from '@/server/db';
import type { Session } from '@/domain/types';

const nav = { pathname: '/app' };
const session: { current: Session | null } = { current: null };

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useSession: () => session.current,
    useSwitches: () => ({ phase: 'later', showHidden: false, salesView: false }),
  };
});

import { AppShell } from './AppShell';

function sessionFor(userId: string): Session {
  const user = db.getState().users.find(u => u.id === userId)!;
  return {
    userId: user.id,
    user,
    tenantId: user.tenantId,
    siteIds: user.siteIds,
    role: user.role,
    isKasper: false,
  } as Session;
}

function renderShell() {
  return render(
    <LocaleProvider locale="en">
      <AppShell><div>page body</div></AppShell>
    </LocaleProvider>
  );
}

describe('AppShell nav (H4.7)', () => {
  beforeEach(() => {
    nav.pathname = '/app';
  });
  afterEach(() => {
    session.current = null;
  });

  it('a Tier 1 tenant admin sees Billing, Maintenance and Cost, but not Certificates', () => {
    session.current = sessionFor('u-omar');
    renderShell();
    expect(screen.getAllByRole('link', { name: 'Billing' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Maintenance' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Cost & ROI' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Certificates' })).toBeNull();
  });

  it('the phone menu opens a sheet with every allowed item', () => {
    session.current = sessionFor('u-omar');
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Open menu' });
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('Cost & ROI');
    expect(dialog.textContent).toContain('Billing');
  });

  it('a Site User gets "Page not found" on /app/certificates', () => {
    session.current = sessionFor('u-mark');
    nav.pathname = '/app/certificates';
    renderShell();
    expect(screen.queryByText('page body')).toBeNull();
    expect(screen.getByText('Page not found')).not.toBeNull();
  });
});
