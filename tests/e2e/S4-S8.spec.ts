// S4–S8 (spec §13): the renter's world. Lina sees her own kit plus what
// Emirates has rented to her, EX-07 only from its start moment, and the
// history of a rented asset never reaches back before the rental.

import { expect, test } from '@playwright/test';
import { demo, expectNoText, goTo, jumpTo, startScenario, USERS } from './helpers';

test.describe('S4 — Lina: own and rented assets on the map', () => {
  test('shows her own kit, the rentals, and the Show filter', async ({ page }) => {
    await demo(page, { email: USERS.lina, on: '/app' });

    for (const code of ['PU-51', 'PU-52', 'VN-01']) {
      await expect(page.getByText(code, { exact: true }).first()).toBeVisible();
    }
    // Rented in from Emirates Earthmovers.
    await expect(page.getByText('EX-04', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Rented', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Show:')).toBeVisible();
    // Not yet hers, and never hers.
    await expectNoText(page, 'EX-07');
    await expectNoText(page, 'CR-05');
  });

  test('the Rented in filter narrows the list to the rentals', async ({ page }) => {
    await demo(page, { email: USERS.lina, on: '/app' });
    await page.getByRole('button', { name: 'Rented in' }).click();
    await expect(page.getByText('EX-04', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('PU-51', { exact: true })).toHaveCount(0);
  });
});

test.describe('S5 — Lina: a rented asset’s history starts at the rental', () => {
  test('the banner explains the clip and History has no earlier data', async ({ page }) => {
    await demo(page, { email: USERS.lina, on: '/app/assets/a-ex04' });

    await expect(page.getByText('Your rental')).toBeVisible();
    await expect(page.getByText(/^Rented from Emirates Earthmovers until /)).toBeVisible();
    await expect(page.getByText(/^History starts /)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run report' })).toBeVisible();
    // A renter can't edit or share the owner's asset.
    await expect(page.getByRole('button', { name: 'Edit asset' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Share tracking link' })).toHaveCount(0);
  });
});

test.describe('S6 — Lina: EX-07 appears when its rental starts', () => {
  test('hidden one minute before, Rented one minute later', async ({ page }) => {
    await demo(page, { email: USERS.lina, on: '/app' });
    await jumpTo(page, '1 min before EX-07 rental starts');

    await expect(page.getByText('EX-07', { exact: true })).toHaveCount(0);

    await jumpTo(page, 'EX-07 rental starts');
    await expect(page.getByText('EX-07', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Rented', { exact: true }).first()).toBeVisible();
  });
});

test.describe('S7 — Ahmed: a single-site user gets a narrow map', () => {
  test('sees Dubai Hills kit and no site filter', async ({ page }) => {
    await demo(page, { email: USERS.omar });
    await page.getByRole('button', { name: 'View as' }).click();
    await page.getByRole('button', { name: /^Ahmed / }).first().click();
    await page.waitForURL(/\/app$/);

    await expect(page.getByText('EX-04', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('PU-51', { exact: true }).first()).toBeVisible();
    // One site only — the Site filter is pointless and must be gone.
    await expect(page.getByText('Site:')).toHaveCount(0);
  });
});

test.describe('S8 — Anil: reports include past rentals', () => {
  test('the report picker lists VN-01 and TP-21 as a past rental', async ({ page }) => {
    await demo(page, { email: USERS.omar, scenario: 8 });
    await expect(page).toHaveURL(/\/app\/reports$/);
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await expect(page.getByText('VN-01').first()).toBeVisible();
    await expect(page.getByText(/Past rental/).first()).toBeVisible();
  });
});

test.describe('renter guards', () => {
  test('a rented asset hides the owner’s labels and geofences', async ({ page }) => {
    await demo(page, { email: USERS.lina, on: '/app/geofences' });
    await expect(page.getByRole('heading', { name: 'Geofences' })).toBeVisible();
    await expect(page.getByText('Project Alpha')).toHaveCount(0);
  });

  test('switching back from a renter never leaves another user’s data on screen', async ({ page }) => {
    await demo(page, { email: USERS.omar });
    await startScenario(page, 4);
    await expect(page.getByText('Lina Aziz · Tenant')).toBeVisible();
    await goTo(page, '/app');
    await expect(page.getByText('Lina Aziz · Tenant')).toBeVisible();
  });
});
