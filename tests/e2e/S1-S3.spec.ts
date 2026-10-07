// S1–S3 (spec §13): the tier story. Omar's fleet has no CAN bus, so every
// Tier 2/3 surface must be absent rather than empty; Khalid's Tier 3 kit shows
// ECU hours, and GR-01 shows fuel used while its missing sensors read
// "Not measured".

import { expect, test } from '@playwright/test';
import { demo, goTo, startScenario, USERS } from './helpers';

test.describe('S1 — Omar: a no-CAN fleet stays Tier 1', () => {
  test('the map offers no tier filter and no CAN columns', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app' });

    await expect(page.getByText(/\d+ assets/).first()).toBeVisible();
    // Every Al Noor asset is Tier 1, so the Tier filter is not offered at all.
    await expect(page.getByText('Tier:')).toHaveCount(0);
    await expect(page.getByText('No tracker').first()).toBeVisible();
  });

  test('FB-12 has no Engine & fuel tab and reports offer no Fuel', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app/assets/a-fb12' });

    await expect(page.getByText('FB-12').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Engine & fuel' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Certificates' })).toBeDisabled();

    await goTo(page, '/app/reports');
    await expect(page.getByText('Fuel', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Trip & Mileage')).toBeVisible();
  });

  test('the scenario menu lands S1 on Omar’s map', async ({ page }) => {
    await demo(page, { email: USERS.omar });
    await startScenario(page, 1);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText('Omar Saleh · Tenant')).toBeVisible();
  });
});

test.describe('S2 — Khalid: EX-04, a Tier 3 asset', () => {
  test('shows ECU hours, the meter reading and its active rental', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app/assets/a-ex04' });

    await expect(page.getByText('EX-04').first()).toBeVisible();
    // Overview tiles: Tier 2+ assets get the CAN tiles.
    await expect(page.getByText('Engine hours')).toBeVisible();
    await expect(page.getByText('ECU · today')).toBeVisible();
    await expect(page.getByText('Fuel level')).toBeVisible();
    // The asset is on hire to Marina Builders.
    await expect(page.getByText(/^Rented to /)).toBeVisible();

    await page.getByRole('button', { name: 'Utilisation' }).click();
    await expect(page.getByText('ECU engine hours')).toBeVisible();
    await expect(page.getByText(/Meter reading from the ECU/)).toBeVisible();
    await expect(page.getByText('Engine (h)')).toBeVisible();
    await expect(page.getByText('Gap (min)')).toBeVisible();
  });

  test('the Engine & fuel tab is enabled for a Tier 3 asset', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app/assets/a-ex04' });
    const tab = page.getByRole('button', { name: 'Engine & fuel' });
    await expect(tab).toBeEnabled();
    await tab.click();
    await expect(page.getByText('Engine & fuel', { exact: true }).first()).toBeVisible();
  });
});

test.describe('S3 — Khalid: GR-01 shows fuel used but no fuel level', () => {
  test('the missing sensors read "Not measured"', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app/assets/a-gr01' });

    await expect(page.getByText('GR-01').first()).toBeVisible();
    await expect(page.getByText('Fuel level')).toBeVisible();
    await expect(page.getByText('Not measured').first()).toBeVisible();
    await expect(page.getByText('Not available')).toBeVisible();
  });
});
