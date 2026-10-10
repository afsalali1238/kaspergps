// F1 proofs: the browser db is the one place demo data lives. What a screen
// creates survives a reload, Reset puts the seed back, and Export → Reset →
// Import restores the same demo.

import { expect, test } from '@playwright/test';
import { openTools, resetDemoData, signIn, USERS } from './helpers';

// Page-header buttons sit under the fixed demo bar (problem 10: its
// --demo-bar-h layout fix is F4), so they are clicked with a dispatched click.
// The forms behind them are clicked normally.

// A valid Luhn IMEI and a valid SIM for the register form.
const IMEI = '352093100007771';
const ICCID = '89971000000000000001';
const TENANT = 'Proof Logistics LLC';

test.describe('F1: one persisted db', () => {
  test.skip(({ isMobile }) => isMobile, 'the console is desktop only');

  test('Ravi registers a tracker and it is still there after a reload', async ({ page }) => {
    await signIn(page, USERS.ravi);
    await page.goto('/console/trackers');
    await page.getByRole('button', { name: 'Register one' }).dispatchEvent('click');
    await page.getByPlaceholder('352093001234567').fill(IMEI);
    await page.getByPlaceholder('89012345678901234567').fill(ICCID);
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.getByText(IMEI).first()).toBeVisible();

    await page.reload();
    await expect(page.getByText(IMEI).first()).toBeVisible();
  });

  test('Sara creates a tenant, and Reset removes it', async ({ page }) => {
    await signIn(page, USERS.sara);
    await page.goto('/console/tenants');
    await page.getByRole('button', { name: 'Create tenant' }).dispatchEvent('click');
    await page.getByPlaceholder('Company name').fill(TENANT);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByText(TENANT).first()).toBeVisible();

    await resetDemoData(page);
    await expect(page).toHaveURL(/\/sign-in/);

    await signIn(page, USERS.sara);
    await page.goto('/console/tenants');
    await expect(page.getByText('Kasper Console')).toBeVisible();
    await expect(page.getByText(TENANT)).toHaveCount(0);
  });

  test('Export, Reset, then Import restores the demo', async ({ page }) => {
    await signIn(page, USERS.sara);
    await page.goto('/console/tenants');
    await page.getByRole('button', { name: 'Create tenant' }).dispatchEvent('click');
    await page.getByPlaceholder('Company name').fill(TENANT);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByText(TENANT).first()).toBeVisible();

    await openTools(page);
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export demo state (JSON)' }).click();
    const file = await downloaded;
    const exportPath = await file.path();

    await resetDemoData(page);
    await expect(page).toHaveURL(/\/sign-in/);
    await signIn(page, USERS.sara);
    await page.goto('/console/tenants');
    await expect(page.getByText(TENANT)).toHaveCount(0);

    await openTools(page);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import demo state (JSON)' }).click();
    await (await chooser).setFiles(exportPath);
    await expect(page.getByText(TENANT).first()).toBeVisible();
  });
});
