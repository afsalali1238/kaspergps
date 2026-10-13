// F2 proofs: screens follow the store and the db without a reload, and sign-in
// runs the same checks for every way in. Chunk R removed the View as dropdown:
// people now sign in from the role picker (/) or the developer sign-in (/dev/sign-in).
//
// Item-based acceptance (no proof list was written down for F2; these are the
// items the F2 plan names):
//  1. Day 1 hides the Maintenance nav at once, with no reload.
//  2. An invite made in Settings shows at once, with an "invited" badge.
//  3. Signing in as a deactivated user shows the sign-in error and stays on the sign-in page.
//  4. A keyboard shortcut no longer opens a people search (the demo bar has no user menu).
//  5. Switching to another role on /app shows that role, not the previous one.

import { expect, test } from '@playwright/test';
import { goTo, pickRole, signIn, USERS } from './helpers';

test.describe('F2: screens follow the store', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop nav and demo bar layout');

  test('an invited user shows at once in Settings, with the invited badge', async ({ page }) => {
    await signIn(page, USERS.lina);
    await goTo(page, '/app/settings');
    await page.getByRole('button', { name: 'Invite user' }).click();
    await page.getByLabel('Full name', { exact: true }).fill('Nadia Test');
    await page.getByLabel('Email', { exact: true }).fill('nadia.test@marina.ae');
    await page.getByLabel('Role', { exact: true }).selectOption('site_user');
    await page.getByRole('group', { name: 'Sites' }).getByRole('checkbox').first().check();
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByText('Nadia Test invited')).toBeVisible();
    await expect(page.getByText('invited', { exact: true }).first()).toBeVisible();
  });

  test('an invited user who signs in sees the welcome notice, then lands in the app', async ({ page }) => {
    await signIn(page, USERS.lina);
    await goTo(page, '/app/settings');
    await page.getByRole('button', { name: 'Invite user' }).click();
    await page.getByLabel('Full name', { exact: true }).fill('Yusuf Test');
    await page.getByLabel('Email', { exact: true }).fill('yusuf.test@marina.ae');
    await page.getByRole('group', { name: 'Sites' }).getByRole('checkbox').first().check();
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByText('Yusuf Test invited')).toBeVisible();

    await page.goto('/dev/sign-in');
    await page.getByLabel('Email').fill('yusuf.test@marina.ae');
    await page.getByLabel('Password').fill('demo');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Welcome to Kasper, Yusuf.');
    await page.waitForURL(/\/app$/);
  });

  test('signing in as a deactivated user shows the sign-in error and stays on the sign-in page', async ({ page }) => {
    await page.goto('/dev/sign-in');
    await page.getByLabel('Email').fill('karim@marina.ae');
    await page.getByLabel('Password').fill('demo');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('p[role="alert"]')).toHaveText('Your account is no longer active. Contact your company admin.');
    await expect(page).toHaveURL(/\/dev\/sign-in$/);
  });

  test('Ctrl+K no longer opens a people search', async ({ page }) => {
    await signIn(page, USERS.omar);
    await goTo(page, '/app');
    await page.keyboard.press('Control+k');
    await expect(page.getByPlaceholder('Search users…')).toHaveCount(0);
  });

  test('switching to Omar from the role picker shows Omar, not the previous role', async ({ page }) => {
    await signIn(page, USERS.lina);
    await goTo(page, '/app');
    await pickRole(page, 'owner-tier1');
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator('.demo-bar [data-testid="role-chip"]')).toHaveText('Fleet owner · Tier 1');
    await expect(page.getByText('Al Noor Transport').first()).toBeVisible();
    await expect(page.getByText('Lina Aziz')).toHaveCount(0);
  });
});
