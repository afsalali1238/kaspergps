// S20–S22 (spec §13): the phase switches that hide whole screens, the sales
// view that locks Tier 3 features, and the deactivated account.

import { expect, test } from '@playwright/test';
import { demo, setSalesView, USERS } from './helpers';

// S20 (phase switch) was removed with the Phase control: the demo always shows every phase.

test.describe('S21 — the sales view locks Tier 3 cards', () => {
  test('locked “Needs ALL-CAN300 (Tier 3)” cards appear on FB-12 and go again', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app/assets/a-fb12' });
    await expect(page.getByText(/Needs ALL-CAN300/)).toHaveCount(0);

    await setSalesView(page, true);
    await expect(page.getByText(/Needs ALL-CAN300 \(Tier 3\)/).first()).toBeVisible();
    // J5.7: the locked cards sit below the asset's real content, not above the map.
    const locked = (await page.getByTestId('locked-features').boundingBox())!;
    const map = (await page.locator('.leaflet-container').first().boundingBox())!;
    expect(locked.y).toBeGreaterThan(map.y + map.height);

    await setSalesView(page, false);
    await expect(page.getByText(/Needs ALL-CAN300/)).toHaveCount(0);
  });
});

test.describe('S22 — a deactivated account cannot sign in', () => {
  test('the sign-in form refuses Karim with the account message', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('karim@marina.ae');
    await page.getByLabel('Password').fill('demo');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Your account is no longer active. Contact your company admin.')).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('View as on Karim shows the same message and keeps the current user', async ({ page }) => {
    await demo(page, { email: USERS.omar });
    await page.getByRole('button', { name: 'View as' }).click();
    await page.getByRole('button', { name: /^Karim / }).first().click();
    await expect(page.getByText('Your account is no longer active. Contact your company admin.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'View as' })).toContainText('Omar Saleh');
  });
});
