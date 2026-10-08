// Shared e2e helpers. Sign in by email — every account accepts any password.
//
// Every spec starts by pinning the demo context (who you are, what the clock
// says, which phase) so the assertions below are about the product, not about
// whatever the previous test left behind.

import { expect, type Page } from '@playwright/test';

export const USERS = {
  sara: 'sara@kasper.ae',        // Kasper Admin
  ravi: 'ravi@kasper.ae',        // Kasper Ops
  omar: 'omar@alnoor.ae',        // Al Noor Transport Admin (Tier 1 fleet)
  khalid: 'khalid@emiratesearth.ae', // Emirates Earthmovers Admin (Tier 3 fleet)
  priya: 'priya@gulflift.ae',    // Gulf Lift Rentals Admin
  lina: 'lina@marina.ae',        // Marina Builders Admin (renter)
  fatima: 'fatima@palmcontracting.ae', // Palm Contracting Admin (renter)
  mark: 'mark@gulflift.ae',      // Gulf Lift Site User
} as const;

/** Names as they appear in the demo bar's View as dropdown. */
export const NAMES = {
  sara: 'Sara Haddad',
  ravi: 'Ravi Menon',
  omar: 'Omar Saleh',
  khalid: 'Khalid Rahman',
  priya: 'Priya Nair',
  lina: 'Lina Aziz',
  fatima: 'Fatima Noor',
} as const;

/** Sign in and wait for the user's home screen. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/(app|console)(\/|$)/);
}

/** The demo bar survives in-app navigation, so tests can hop between screens. */
export async function goTo(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('.demo-bar')).toBeVisible();
}

/** Switch demo user through the View as dropdown (keeps in-memory demo state). */
export async function viewAs(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'View as' }).click();
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click();
  await page.waitForURL(/\/(app|console)(\/|$)/);
  await expect(page.locator('.demo-bar')).toBeVisible();
}

/** Jump the simulated clock using one of the Clock menu's presets. */
export async function jumpTo(page: Page, preset: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Clock' }).click();
  await page.getByRole('button', { name: preset }).first().click();
  await expect(page.getByText('Jump to')).toHaveCount(0);
}

/** Phase switch in the demo bar. */
export async function setPhase(page: Page, phase: 'Day 1' | 'Phase 2' | 'Later'): Promise<void> {
  await page.locator('.demo-bar').getByRole('button', { name: phase, exact: true }).click();
}

/** Sales view toggle (separate from Show hidden). */
export async function setSalesView(page: Page, on: boolean): Promise<void> {
  const label = `Sales view: ${on ? 'ON' : 'OFF'}`;
  await page.locator('.demo-bar').getByRole('button', { name: label, exact: true }).click();
  await expect(page.locator('.demo-bar').getByRole('button', { name: `Sales view: ${on ? 'ON' : 'OFF'}`, exact: true })).toBeVisible();
}

/** Start one of the S1–S50 guided walkthroughs from the Scenarios menu. */
export async function startScenario(page: Page, id: number): Promise<void> {
  await page.getByRole('button', { name: 'Scenarios' }).click();
  await expect(page.getByText('Guided walkthroughs')).toBeVisible();
  await page.locator('.demo-bar button').filter({ hasText: new RegExp(`^S${id}(?![0-9])`) }).first().click();
  await expect(page.getByText('Guided walkthroughs')).toHaveCount(0);
  // Starting a scenario also opens its guided walkthrough card — dismiss it so
  // scenario assertions run against the product UI only.
  const endTour = page.getByRole('button', { name: 'End tour' });
  if (await endTour.count()) await endTour.first().click();
  await expect(page.getByTestId('walkthrough-card')).toHaveCount(0);
}

/** Open the demo bar's Tools dropdown. */
export async function openTools(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Tools$/ }).click();
  await expect(page.getByText('Developer tools')).toBeVisible();
}

/** Tools → booking simulator. */
export async function openBookingSimulator(page: Page): Promise<void> {
  await openTools(page);
  await page.locator('.demo-bar button').filter({ hasText: '/dev/bookings' }).first().click();
  await expect(page.getByRole('heading', { name: 'Booking simulator' })).toBeVisible();
}

/** Tools → tamper with a stored certificate (then land on its verify page). */
export async function tamperWithCertificate(page: Page): Promise<void> {
  page.once('dialog', dialog => dialog.accept());
  await openTools(page);
  await page.locator('.demo-bar button').filter({ hasText: 'Tamper with a stored certificate' }).first().click();
  await page.waitForURL(/\/verify\//);
}

/** Tools → Reset demo data (two clicks: arm, then confirm). */
export async function resetDemoData(page: Page): Promise<void> {
  await openTools(page);
  const reset = page.locator('.demo-bar button').filter({ hasText: 'Reset demo data' }).first();
  await reset.click();
  await page.locator('.demo-bar button').filter({ hasText: 'Click again' }).first().click();
}

/** Sign in as a user and land on a screen, with the demo context pinned. */
export async function demo(
  page: Page,
  options: {
    email?: string;
    user?: string;
    on?: string;
    phase?: 'Day 1' | 'Phase 2' | 'Later';
    scenario?: number;
  } = {}
): Promise<void> {
  if (options.email) await signIn(page, options.email);
  else await goTo(page, options.on ?? '/app');
  if (options.phase) await setPhase(page, options.phase);
  if (options.user) await viewAs(page, options.user);
  if (options.on) await goTo(page, options.on);
  if (options.scenario) await startScenario(page, options.scenario);
}

/** Assert the page shows this copy, wherever it sits in the tree. */
export async function expectText(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByText(text).first()).toBeVisible();
}

/** Assert the page does not show this copy at all. */
export async function expectNoText(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByText(text)).toHaveCount(0);
}
