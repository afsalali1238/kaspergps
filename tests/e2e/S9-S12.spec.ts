// S9–S12 (spec §13): alerts for a two-site user, access that ended early, a
// rented-in asset with a fault code, and forbidden == missing.

import { expect, test } from '@playwright/test';
import { demo, expectNoText, goTo, NAMES, startScenario, USERS, viewAs } from './helpers';

test.describe('S9 — Deepa: two sites, a fuel-drop alert', () => {
  test('the alert is visible and Site Users cannot acknowledge', async ({ page }) => {
    await demo(page, { email: USERS.omar, scenario: 9 });
    await expect(page).toHaveURL(/\/app\/alerts$/);
    await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible();
    await expect(page.getByText(/Fuel dropped/).first()).toBeVisible();
    // A Site User is read-only: no Acknowledge button anywhere.
    await expect(page.getByRole('button', { name: 'Acknowledge' })).toHaveCount(0);
    // The site name travels with the alert line.
    await expect(page.getByText(/^Since /).first()).toBeVisible();
  });
});

test.describe('S10 — Fatima: access that ended early', () => {
  test('EX-11 is gone from the map', async ({ page }) => {
    await demo(page, { email: USERS.fatima, on: '/app' });
    await expect(page.getByText('WL-06', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('TH-01', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('GN-01', { exact: true }).first()).toBeVisible();
    await expectNoText(page, 'EX-11');
  });

  test('the scenario menu lands S10 on her map', async ({ page }) => {
    await demo(page, { email: USERS.fatima });
    await startScenario(page, 10);
    await expect(page.getByText('Fatima Noor · Tenant')).toBeVisible();
  });
});

test.describe('S11 — Priya: a rented-in asset with a fault code', () => {
  test('BD-02 shows the fault, FL-09 is Unknown and the Tier filter is there', async ({ page }) => {
    await demo(page, { email: USERS.priya, on: '/app' });
    await expect(page.getByText('Tier:')).toBeVisible();       // mixed fleet

    await goTo(page, '/app/assets/a-bd02');
    await expect(page.getByText('BD-02').first()).toBeVisible();
    await expect(page.getByText('Fault code').first()).toBeVisible();
    await expect(page.getByText('Rented')).toBeVisible();

    await goTo(page, '/app');
    await expect(page.getByText('FL-09').first()).toBeVisible();
    await expect(page.getByText('Unknown').first()).toBeVisible();
  });
});

test.describe('S12 — Priya: an owner’s asset is not found', () => {
  test('EX-04 is “Asset not found”, not a permission error', async ({ page }) => {
    await demo(page, { email: USERS.omar, scenario: 12 });
    await expect(page).toHaveURL(/\/app\/assets\/a-ex04$/);
    await expect(page.getByText('Asset not found')).toBeVisible();
    await expectNoText(page, 'EX-04');
  });
});

test.describe('alert permissions', () => {
  test('Khalid (Tenant Admin) can acknowledge, and a View as switch keeps it', async ({ page }) => {
    // Spec §5: the owner's Tenant Admin may acknowledge (open alerts show the button).
    await demo(page, { email: USERS.khalid, on: '/app/alerts' });
    await expect(page.getByRole('button', { name: 'Acknowledge' }).first()).toBeVisible();

    // Switching to the other Emirates Tenant Admin keeps the ability.
    await viewAs(page, NAMES.omar);
    await goTo(page, '/app/alerts');
    await expect(page.getByRole('button', { name: 'Acknowledge' }).first()).toBeVisible();
  });
});
