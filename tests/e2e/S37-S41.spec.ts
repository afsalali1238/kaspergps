// S37–S41 (spec §13): the Phase 14 screens. The maintenance board with its
// basis labels, the Cost & ROI draft, the Site User’s read-only view and the
// phase switches that take both screens away again.

import { expect, test } from '@playwright/test';
import { demo, expectNoText, goTo, setPhase, startScenario, USERS } from './helpers';

test.describe('S37 — Khalid’s maintenance board', () => {
  test('overdue, due soon and ok, with a service task per fault code', async ({ page }) => {
    await demo(page, { email: USERS.khalid, scenario: 37 });
    await expect(page).toHaveURL(/\/app\/maintenance$/);
    await expect(page.getByText(/^Overdue \(\d+\)/)).toBeVisible();
    await expect(page.getByText(/^Due soon \(\d+\)/)).toBeVisible();
    await expect(page.getByText(/^Ok \(\d+\)/)).toBeVisible();
    await expect(page.getByText(/ECU — \d+ h left/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Log service' }).first().click();
    await expect(page.getByText(/^Log service — /)).toBeVisible();
  });

  test('a renter never sees the owner’s plan', async ({ page }) => {
    await demo(page, { email: USERS.priya, on: '/app/assets/a-bd02' });
    await expect(page.getByText('Service plans')).toHaveCount(0);
  });
});

test.describe('S38 — Omar’s Tier 1 plans', () => {
  test('GPS distance and estimated ignition hours, never a fault code', async ({ page }) => {
    await demo(page, { email: USERS.omar, scenario: 38 });
    await expect(page.getByText(/Estimated \(ignition hours\)/).first()).toBeVisible();
    await expectNoText(page, 'Fault code');
  });
});

test.describe('S39 — Khalid’s Cost & ROI', () => {
  test('every line carries a basis and Tier 1 is never 0', async ({ page }) => {
    await demo(page, { email: USERS.khalid, scenario: 39 });
    await expect(page).toHaveURL(/\/app\/cost$/);
    await expect(page.getByRole('heading', { name: 'Cost & ROI' })).toBeVisible();
    await expect(page.getByText('Draft')).toBeVisible();
    await expect(page.getByText('ECU (ALL-CAN300)').first()).toBeVisible();
    await expect(page.getByText('Not measured').first()).toBeVisible();
  });
});

test.describe('S40 — Mark, a Site User, sees maintenance but no money', () => {
  test('maintenance is read-only and Billing/Cost/Certificates are absent', async ({ page }) => {
    await demo(page, { email: USERS.mark, scenario: 40 });
    await expect(page).toHaveURL(/\/app\/maintenance$/);
    await expect(page.getByRole('button', { name: 'Log service' })).toHaveCount(0);

    for (const path of ['/app/cost', '/app/certificates']) {
      await goTo(page, path);
      await expect(page.getByText('Page not found')).toBeVisible();
    }
    await goTo(page, '/app/billing');
    await expect(page.getByText(/doesn’t include billing/)).toBeVisible();
  });
});

test.describe('S41 — the phase ladder', () => {
  test('Phase 2 hides maintenance and cost, Day one hides more', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app' });
    await setPhase(page, 'Phase 2');
    for (const label of ['Maintenance', 'Cost & ROI']) {
      await expect(page.getByRole('link', { name: label })).toHaveCount(0);
    }
    await goTo(page, '/app/geofences');
    await expect(page.getByRole('heading', { name: 'Geofences' })).toBeVisible();

    await setPhase(page, 'Day 1');
    await goTo(page, '/app/geofences');
    await expect(page.getByText('Not available')).toBeVisible();
    await goTo(page, '/app/downloads');
    await expect(page.getByRole('heading', { name: 'Downloads' })).toBeVisible();
  });
});
