// H4.3, H4.4 and H4.6 (spec §11.2, §11.10, §11.12): the map's own features, which
// the S-scenario specs only touch in passing — clustering, filters in the URL that
// survive Back, bulk label add and remove, and the geofence overlay switch.
// Desktop only: the bulk bar and the row checkboxes are laid out for wide screens.

import { expect, test } from '@playwright/test';
import { demo, goTo, USERS } from './helpers';

test.beforeEach(async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 900, 'the bulk bar is laid out for desktop');
});

test.describe('H4.6 — map clustering and URL filters', () => {
  test('nearby markers cluster into a count on the map', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app' });
    // Omar's ten assets sit close together at the default zoom, so they group.
    await expect(page.locator('.marker-cluster').first()).toBeVisible();
  });

  test('a status in the address bar filters the list on arrival', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app?status=offline' });
    // Omar has one offline asset (see the KPI strip), so one row with a checkbox.
    await expect(page.locator('input[type="checkbox"][aria-label^="Select "]')).toHaveCount(1);
  });

  test('Back to the map brings the same filter back', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app' });
    await page.getByRole('button', { name: /^Live/ }).first().click();
    await expect(page).toHaveURL(/status=live/);
    const liveRows = await page.locator('input[type="checkbox"][aria-label^="Select "]').count();
    expect(liveRows).toBeGreaterThan(1);

    await goTo(page, '/app/alerts');
    await page.goBack();
    await expect(page).toHaveURL(/status=live/);
    await expect(page.locator('input[type="checkbox"][aria-label^="Select "]')).toHaveCount(liveRows);
  });
});

test.describe('H4.3 — bulk labels', () => {
  test('add a new label to two selected assets, then remove it', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app' });

    await page.getByRole('checkbox', { name: 'Select FB-12' }).check();
    await page.getByRole('checkbox', { name: 'Select FB-14' }).check();
    const bulk = page.getByRole('region', { name: 'Bulk actions' });
    await expect(bulk).toBeVisible();
    await expect(bulk.getByText(/2 selected/)).toBeVisible();

    // Type a name the company does not have yet; the combobox offers to create it.
    await bulk.getByRole('combobox', { name: 'Add label' }).fill('Yard checks');
    await page.getByRole('option', { name: /^Create “Yard checks”/ }).click();
    await expect(page.getByText('Yard checks').first()).toBeVisible();

    // The label now sits on both rows; removing it from the selection clears it.
    await bulk.getByRole('combobox', { name: 'Remove label' }).selectOption({ label: 'Yard checks' });
    await bulk.getByRole('button', { name: 'Remove label', exact: true }).click();
    await expect(page.getByRole('status').getByText(/“Yard checks” removed from 2 assets/)).toBeVisible();
    // Gone from the label filter, since no visible asset carries it now. The label
    // itself stays in the company's list (the add combobox still offers it) until
    // it is deleted in Settings.
    await expect(page.getByRole('group', { name: 'Labels' }).getByRole('button', { name: 'Yard checks' })).toHaveCount(0);
  });

  test('the geofence overlay switch turns on and off', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app' });
    const toggle = page.getByRole('button', { name: 'Geofences', exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
});
