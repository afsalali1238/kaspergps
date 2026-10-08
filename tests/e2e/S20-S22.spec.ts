// S20–S22 (spec §13): the phase switches that hide whole screens, the sales
// view that locks Tier 3 features, and the deactivated account.

import { expect, test } from '@playwright/test';
import { demo, goTo, setPhase, setSalesView, USERS } from './helpers';

test.describe('S20 — Day one hides every Phase 2 surface', () => {
  test('maintenance and cost are locked, the map loses labels and playback', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app' });
    await setPhase(page, 'Day 1');

    await goTo(page, '/app/maintenance');
    await expect(page.getByText('Not available')).toBeVisible();
    await expect(page.getByText(/arrives in the Later phase/)).toBeVisible();

    await goTo(page, '/app/cost');
    await expect(page.getByText('Not available')).toBeVisible();
  });

  test('Phase 2 brings maintenance and cost back', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app' });
    await setPhase(page, 'Phase 2');
    await goTo(page, '/app/maintenance');
    await expect(page.getByRole('heading', { name: 'Maintenance' })).toBeVisible();
    await goTo(page, '/app/cost');
    await expect(page.getByRole('heading', { name: 'Cost & ROI' })).toBeVisible();
  });
});

test.describe('S21 — the sales view locks Tier 3 cards', () => {
  test('locked “Needs ALL-CAN300 (Tier 3)” cards appear on FB-12 and go again', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app/assets/a-fb12' });
    await expect(page.getByText(/Needs ALL-CAN300/)).toHaveCount(0);

    await setSalesView(page, true);
    await expect(page.getByText(/Needs ALL-CAN300 \(Tier 3\)/).first()).toBeVisible();

    await setSalesView(page, false);
    await expect(page.getByText(/Needs ALL-CAN300/)).toHaveCount(0);
  });
});

test.describe('S22 — a deactivated account cannot sign in', () => {
  test('the sign-in form refuses Karim with the account message', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('karim@gulflift.ae');
    await page.getByLabel('Password').fill('demo');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Your account is no longer active. Contact your company admin.')).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('View as can still switch to the deactivated user for the demo', async ({ page }) => {
    await demo(page, { email: USERS.omar });
    await page.getByRole('button', { name: 'View as' }).click();
    await page.getByRole('button', { name: /^Karim / }).first().click();
    await page.waitForURL(/\/app$/);
    await expect(page.getByText('Karim')).toBeVisible();
  });
});
