// H4.4 and H4.5 (spec §11.8, §11.12): the asset's “Inside” line, the geofence report,
// a site's own geofence, and the add-asset form's read-only hardware and tracker request.
// Desktop only: the settings tables and the geofence map are laid out for wide screens.

import { expect, test } from '@playwright/test';
import { demo, USERS } from './helpers';

test.beforeEach(async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 900, 'these screens are laid out for desktop');
});

test.describe('H4.4 — geofences on assets and reports', () => {
  test('an owned asset says which geofences it is inside, or that it is outside all of them', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app/assets/a-fb12' });
    await expect(page.getByText(/^(Inside: .+|Outside all geofences)$/).first()).toBeVisible();
  });

  test('a renter sees no geofence line on the asset it rents', async ({ page }) => {
    await demo(page, { email: USERS.lina, on: '/app/assets/a-ex04' });
    await expect(page.getByText(/^(Inside: .+|Outside all geofences)$/)).toHaveCount(0);
  });

  test('the geofence report is offered in Phase 2 to a company with a geofence', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app/reports', phase: 'Phase 2' });
    const geofenceType = page.getByRole('button', { name: /^Geofence\b/ }).first();
    await geofenceType.click();
    await expect(geofenceType).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('H4.5 — site geofences and the asset form', () => {
  test('Khalid makes a site geofence once; a second attempt says so', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app/settings' });
    await page.getByRole('button', { name: 'Sites', exact: true }).click();
    const make = page.getByRole('button', { name: 'Create site geofence' }).first();
    await make.click();
    await expect(page.getByRole('status').getByText('Site geofence created.')).toBeVisible();
    await page.getByRole('button', { name: 'Create site geofence' }).first().click();
    await expect(page.getByText(/already has a site geofence\.$/)).toBeVisible();
  });

  test('a new asset shows its hardware as read-only and links to a tracker request', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app/settings' });
    await page.getByRole('button', { name: 'Assets', exact: true }).click();
    await page.getByRole('button', { name: 'Add asset' }).click();
    await expect(page.getByText('Contact Kasper to change hardware.')).toBeVisible();

    await page.getByLabel('Code').fill('EX-91');
    await page.getByLabel('Name').fill('Test excavator');
    await page.getByLabel('Home site').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Save asset' }).click();
    await expect(page.getByRole('status').getByRole('link', { name: 'Request a tracker' })).toBeVisible();
  });
});

test.describe('H4.4 — editing a geofence', () => {
  test('Omar renames a geofence from its row; the new name replaces the old one in the list', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app/geofences' });
    const row = page.locator('div.p-4', { has: page.getByText('Jebel Ali Port gate 4', { exact: true }) }).first();
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit Jebel Ali Port gate 4' })).toBeVisible();
    await page.locator('#gf-name').fill('Port gate north');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Geofence saved')).toBeVisible();
    await expect(page.getByText('Port gate north', { exact: true })).toBeVisible();
    await expect(page.getByText('Jebel Ali Port gate 4', { exact: true })).toHaveCount(0);
  });
});
