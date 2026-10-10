// AppShell render test (H2.6): a page the user may not see reads "Page not found".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('AppShell route guard (H2.6)', () => {
  beforeEach(() => {
    nav.pathname = '/app';
  });
  afterEach(() => {
    session.current = null;
  });

  it('a Site User gets "Page not found" on /app/certificates', () => {
    session.current = sessionFor('u-mark');
    nav.pathname = '/app/certificates';
    renderShell();
    expect(screen.queryByText('page body')).toBeNull();
    expect(screen.getByText('Page not found')).not.toBeNull();
  });
});
