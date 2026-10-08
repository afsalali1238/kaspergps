import { Page, expect } from '@playwright/test';

// ── Seed user accounts ──────────────────────────────────────────────────────
export const users = {
  kasperAdmin: { email: 'sara@kasper.ae', name: 'Sara Haddad' },
  emiratesAdmin: { email: 'khalid@emiratesearth.ae', name: 'Khalid Rahman' },
  alnoorAdmin: { email: 'omar@alnoor.ae', name: 'Omar Saleh' },
  gulfliftAdmin: { email: 'priya@gulflift.ae', name: 'Priya Nair' },
  marinaAdmin: { email: 'lina@marina.ae', name: 'Lina Aziz' },
  palmAdmin: { email: 'fatima@palmcontracting.ae', name: 'Fatima Noor' },
} as const;

export const anyPassword = 'anypassword';

// ── Seed asset IDs (Emirates Earthmovers) ──────────────────────────────────
export const emiratesAssets = {
  ex04: 'a-ex04',
  ex07: 'a-ex07',
  bd02: 'a-bd02',
  gn01: 'a-gn01',
  wl03: 'a-wl03',
} as const;

// ── Navigation helpers ──────────────────────────────────────────────────────

/** Sign in as a given user and return the page after redirect. */
export async function signInAs(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', anyPassword);
  await page.click('button:has-text("Sign in")');
  // Wait for redirect — either /app or /console
  await page.waitForURL(/\/(app|console)/, { timeout: 10000 });
  await page.waitForLoadState('networkidle');
}

/** Convenience: sign in as Emirates tenant admin. */
export async function signInAsEmirates(page: Page) {
  await signInAs(page, users.emiratesAdmin.email);
}

/** Convenience: sign in as Kasper admin. */
export async function signInAsKasper(page: Page) {
  await signInAs(page, users.kasperAdmin.email);
}

/** Go to a path and wait for content to render. */
export async function goto(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('h1', { timeout: 5000 });
}

/** Wait for a toast message to appear. */
export async function waitForToast(page: Page, text?: string, timeout = 3000) {
  const toast = page.locator(
    `div[class*="bottom-4"][class*="right-4"]`
  );
  await toast.waitFor({ state: 'visible', timeout });
  if (text) {
    await expect(toast).toContainText(text);
  }
}

/** Set the demo phase via the demo bar. */
export async function setPhase(page: Page, phase: 'day_one' | 'phase2' | 'later') {
  // The demo bar is in the AppShell — look for phase toggle buttons
  const phaseButton = page.locator('button', { hasText: phase === 'day_one' ? 'Day one' : phase === 'phase2' ? 'Phase 2' : 'Later' });
  if (await phaseButton.count() > 0) {
    await phaseButton.click();
  }
}

/** Verify the current page is the expected path. */
export async function expectPath(page: Page, path: string) {
  await expect(page).toHaveURL(path);
}

/** Extract download filename from a download event. */
export async function getDownloadFilename(download: { path: () => string | Promise<string> }) {
  const path = await download.path();
  return path ? path.split('/').pop() ?? '' : '';
}
