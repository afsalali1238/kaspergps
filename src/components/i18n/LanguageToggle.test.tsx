// Toggle behaviour — the demo-bar and user-menu switches write kasper_lang,
// navigate to the /ar prefix on customer routes, and leave the console English.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocaleProvider } from '@/i18n';
import { LANG_COOKIE } from '@/i18n/locale';
import { LanguageToggle } from './LanguageToggle';

const nav = {
  pathname: '/app',
  push: vi.fn(),
  refresh: vi.fn(),
};

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, refresh: nav.refresh, replace: vi.fn() }),
}));

function cookieValue(): string | undefined {
  const match = document.cookie.split(';').map(p => p.trim()).find(p => p.startsWith(`${LANG_COOKIE}=`));
  return match?.split('=')[1];
}

function clearLangCookie() {
  document.cookie = `${LANG_COOKIE}=; Path=/; Max-Age=0`;
}

describe('LanguageToggle', () => {
  beforeEach(() => {
    nav.pathname = '/app';
    nav.push.mockReset();
    nav.refresh.mockReset();
    clearLangCookie();
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  });

  afterEach(() => {
    clearLangCookie();
  });

  it('flips a customer screen to Arabic: cookie, /ar URL, RTL', async () => {
    render(
      <LocaleProvider locale="en">
        <LanguageToggle variant="demo" />
      </LocaleProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Language' }));

    expect(cookieValue()).toBe('ar');
    expect(nav.push).toHaveBeenCalledWith('/ar/app');
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('ar');
      expect(document.documentElement.dir).toBe('rtl');
    });
  });

  it('flips Arabic back to English: cookie, unprefixed URL, LTR', async () => {
    nav.pathname = '/ar/app';
    render(
      <LocaleProvider locale="ar">
        <LanguageToggle variant="demo" />
      </LocaleProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Language' }));

    expect(cookieValue()).toBe('en');
    expect(nav.push).toHaveBeenCalledWith('/app');
    await waitFor(() => {
      expect(document.documentElement.dir).toBe('ltr');
    });
  });

  it('writes the cookie on the console but does not localise it', async () => {
    nav.pathname = '/console/billing';
    render(
      <LocaleProvider locale="en">
        <LanguageToggle variant="demo" />
      </LocaleProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Language' }));

    expect(cookieValue()).toBe('ar');
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.refresh).toHaveBeenCalled();
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en');
      expect(document.documentElement.dir).toBe('ltr');
    });
  });

  it('lets the public tracking page flip without signing in', () => {
    nav.pathname = '/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5';
    render(
      <LocaleProvider locale="en">
        <LanguageToggle variant="demo" />
      </LocaleProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Language' }));

    expect(cookieValue()).toBe('ar');
    expect(nav.push).toHaveBeenCalledWith('/ar/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5');
  });

  it('renders the user-menu row with the Language label', () => {
    render(
      <LocaleProvider locale="en">
        <LanguageToggle variant="menu" />
      </LocaleProvider>
    );
    expect(screen.getByRole('button', { name: 'Language' })).toBeTruthy();
    expect(screen.getByText('EN / عربي')).toBeTruthy();
  });
});
