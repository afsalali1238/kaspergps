// F2 proofs: screens follow the store and the db without a reload, View as is
// built from live data, and it runs the same sign-in checks as the sign-in page.
//
// Item-based acceptance (no proof list was written down for F2; these are the
// items the F2 plan names):
//  1. Day 1 hides the Maintenance nav at once, with no reload.
//  2. An invite made in Settings shows up in View as with an "invited" badge.
//  3. View as on a deactivated user shows the sign-in error and keeps the session.
//  4. Ctrl+K opens View as.
//  5. Switching to another user on /app shows that user, not the previous one.

import { expect, test } from '@playwright/test';
import { goTo, setPhase, signIn, USERS, viewAs } from './helpers';

test.describe('F2: screens follow the store', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop nav and demo bar layout');

  test('Day 1 hides the Maintenance nav without a reload', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await goTo(page, '/app');
    const nav = page.getByRole('navigation').getByRole('link', { name: 'Maintenance', exact: true });
    await expect(nav.first()).toBeVisible();

    // A marker on the window: it survives only if the page was not reloaded.
    await page.evaluate(() => { (window as unknown as { __noReload: number }).__noReload = 1; });
    await setPhase(page, 'Day 1');
    await expect(nav).toHaveCount(0);
    const marker = await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload);
    expect(marker).toBe(1);
  });

  test('an invited user appears in View as with the invited badge at once', async ({ page }) => {
    await signIn(page, USERS.lina);
    await goTo(page, '/app/settings');
    await page.getByRole('button', { name: 'Invite user' }).click();
    await page.getByLabel('Full name', { exact: true }).fill('Nadia Test');
    await page.getByLabel('Email', { exact: true }).fill('nadia.test@marina.ae');
    await page.getByLabel('Role', { exact: true }).selectOption('site_user');
    await page.getByLabel('Sites', { exact: true }).selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByText('Nadia Test invited')).toBeVisible();

    await page.getByRole('button', { name: 'View as' }).click();
    await page.getByPlaceholder('Search users…').fill('Nadia');
    const row = page.getByRole('button', { name: /Nadia Test/ });
    await expect(row).toBeVisible();
    await expect(row.getByText('invited', { exact: true })).toBeVisible();
  });

  test('an invited user who signs in sees the welcome notice, then lands in the app', async ({ page }) => {
    await signIn(page, USERS.lina);
    await goTo(page, '/app/settings');
    await page.getByRole('button', { name: 'Invite user' }).click();
    await page.getByLabel('Full name', { exact: true }).fill('Yusuf Test');
    await page.getByLabel('Email', { exact: true }).fill('yusuf.test@marina.ae');
    await page.getByLabel('Sites', { exact: true }).selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByText('Yusuf Test invited')).toBeVisible();

    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('yusuf.test@marina.ae');
    await page.getByLabel('Password').fill('demo');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Welcome to Kasper, Yusuf.');
    await page.waitForURL(/\/app$/);
  });

  test('View as on a deactivated user shows the sign-in error and keeps the session', async ({ page }) => {
    await signIn(page, USERS.lina);
    await goTo(page, '/app');
    await page.getByRole('button', { name: 'View as' }).click();
    await page.getByPlaceholder('Search users…').fill('Karim');
    await page.getByRole('button', { name: /Karim Old/ }).click();
    await expect(page.getByText('Your account is no longer active. Contact your company admin.')).toBeVisible();
    // Still Lina: the demo bar's View as label is unchanged.
    await expect(page.getByRole('button', { name: 'View as' })).toContainText('Lina Aziz');
    await expect(page).toHaveURL(/\/app$/);
  });

  test('Ctrl+K opens View as', async ({ page }) => {
    await signIn(page, USERS.omar);
    await goTo(page, '/app');
    await expect(page.getByPlaceholder('Search users…')).toHaveCount(0);
    await page.keyboard.press('Control+k');
    await expect(page.getByPlaceholder('Search users…')).toBeVisible();
  });

  test('switching to Omar on /app shows Omar, not the previous user', async ({ page }) => {
    await signIn(page, USERS.lina);
    await goTo(page, '/app');
    await expect(page.getByRole('button', { name: 'View as' })).toContainText('Lina Aziz');

    await viewAs(page, 'Omar Saleh');
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('button', { name: 'View as' })).toContainText('Omar Saleh');
    await expect(page.getByText('Al Noor Transport').first()).toBeVisible();
    await expect(page.getByText('Lina Aziz')).toHaveCount(0);
  });
});
