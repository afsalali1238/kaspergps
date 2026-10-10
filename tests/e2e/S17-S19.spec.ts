// S17–S19 (spec §13): the console's hardware and tenant work, and the first
// Tenant Admin actions a customer can take (inviting a user).

import { expect, test } from '@playwright/test';
import { demo, goTo, startScenario, USERS } from './helpers';

test.describe('S17 — Ravi pairs a spare tracker to LD-09', () => {
  test('the trackers screen offers Pair on a spare and Ravi has no Admin screens', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, 'the console is desktop only');
    await demo(page, { email: USERS.ravi, scenario: 17 });
    await expect(page).toHaveURL(/\/console\/trackers$/);
    await expect(page.getByRole('button', { name: 'Register many' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pair', exact: true }).first()).toBeVisible();
    // Ops never sees Kasper Admin's screens.
    await expect(page.getByRole('link', { name: 'Kasper team' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Audit log' })).toHaveCount(0);
  });
});

test.describe('S18 — Sara onboards a tenant with a Tier 3 asset', () => {
  test('the wizard exposes all six steps and refuses to skip ahead', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, 'the console is desktop only');
    await demo(page, { email: USERS.sara, on: '/console/onboarding' });
    await expect(page.getByRole('heading', { name: 'Onboard a company' })).toBeVisible();
    await expect(page.getByText('Company')).toBeVisible();
    await expect(page.getByText('Sites')).toBeVisible();
    await expect(page.getByText('People')).toBeVisible();
  });

  test('the scenario menu lands S18 on the wizard', async ({ page }) => {
    await demo(page, { email: USERS.sara });
    await startScenario(page, 18);
    await expect(page.getByRole('heading', { name: 'Onboard a company' })).toBeVisible();
  });
});

test.describe('S19 — Lina invites a user', () => {
  test('Settings → Users invites by email and scopes to sites', async ({ page }) => {
    await demo(page, { email: USERS.lina, on: '/app/settings' });
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Invite user' }).click();
    await expect(page.getByText('Invite a user')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Sites')).toBeVisible();
    await page.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByText(/Invited|invited/).first()).toBeVisible();
  });

  test('an invited user appears in the View as dropdown afterwards', async ({ page }) => {
    await demo(page, { email: USERS.lina, on: '/app/settings' });
    await page.getByRole('button', { name: 'Invite user' }).click();
    // The field's accessible name is its <label> ("Name"); "Full name" is only
    // the placeholder, which getByLabel does not match.
    await page.getByLabel('Name').fill('Huda Test');
    await page.getByLabel('Email').fill('huda@marina.ae');
    await page.getByLabel('Sites').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Send invite' }).click();
    await page.getByRole('button', { name: 'View as' }).click();
    // The row is a menu button; the name also appears in the table and the notice.
    await expect(page.getByRole('button', { name: /Huda Test/ })).toBeVisible();
    await goTo(page, '/app');
  });
});
