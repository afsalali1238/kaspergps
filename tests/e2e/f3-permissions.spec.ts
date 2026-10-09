// F3 proofs: what a user can do on an asset follows the spec §5 matrix, and the
// same answer shows on screen (the screens ask can(), through the API).
//
// Item-based acceptance (F3 items):
//  1. The asset owner (Tenant Admin) sees Edit, Share and End access on her asset.
//  2. A renter (Tenant Admin of the renting company) sees none of those on the
//     rented asset, but still sees Run report (spec §5: renters report on rentals).
//  3. A Site User on their own company's asset sees none of the owner actions.
//  4. The console nav follows the console capabilities: Kasper Admin sees the
//     Audit log, Kasper Ops does not (console.audit.view is Kasper Admin only).

import { expect, test } from '@playwright/test';
import { goTo, signIn, USERS } from './helpers';

test.describe('F3: asset actions follow the permission matrix', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop asset page layout');

  test('the owner sees Edit, Share and End access on her asset', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await goTo(page, '/app/assets/a-ex04');
    await expect(page.getByRole('button', { name: 'Edit asset' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Share tracking link' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'End access now' })).toBeVisible();
  });

  test('a renter sees Run report, and none of the owner actions, on the rented asset', async ({ page }) => {
    await signIn(page, USERS.lina);
    await goTo(page, '/app/assets/a-ex04');
    await expect(page.getByRole('link', { name: 'Run report' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit asset' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Share tracking link' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'End access now' })).toHaveCount(0);
  });

  test('a Site User sees no owner actions on their own company\u2019s asset', async ({ page }) => {
    await signIn(page, 'mark@gulflift.ae');
    await goTo(page, '/app/assets/a-cr02');
    await expect(page.getByRole('link', { name: 'Run report' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit asset' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Share tracking link' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'End access now' })).toHaveCount(0);
  });
});

test.describe('F3: console nav follows the console capabilities', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop console nav');

  test('Kasper Admin sees the Audit log in the console nav', async ({ page }) => {
    await signIn(page, USERS.sara);
    await expect(page.getByRole('link', { name: 'Tenants' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Audit log' }).first()).toBeVisible();
  });

  test('Kasper Ops does not see the Audit log', async ({ page }) => {
    await signIn(page, USERS.ravi);
    await expect(page.getByRole('link', { name: 'Tenants' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Audit log' })).toHaveCount(0);
  });
});
