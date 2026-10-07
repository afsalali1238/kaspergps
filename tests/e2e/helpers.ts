// Shared e2e helpers. Sign in by email — every account accepts any password.

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

/** Sign in and wait for the user's home screen. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/(app|console)(\/|$)/);
}

/** Open the demo bar's Tools dropdown. */
export async function openTools(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Tools$/ }).click();
  await expect(page.getByText('Developer tools')).toBeVisible();
}

/** The demo bar survives navigation, so tests can hop between screens. */
export async function goTo(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('.demo-bar')).toBeVisible();
}
