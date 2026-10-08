import { test, expect } from '@playwright/test';
import { signInAsEmirates } from '../fixtures/helpers';

test.describe('Cost & Maintenance pages', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsEmirates(page);
  });

  test('cost page shows summary cards and invoice table', async ({ page }) => {
    await page.goto('/app/cost');
    await page.waitForSelector('h1', { timeout: 5000 });
    await expect(page.locator('h1')).toContainText('Cost & ROI');
    // Summary cards should be visible
    await expect(page.locator('text=Total asset value').first()).toBeVisible();
    await expect(page.locator('text=Finance / month').first()).toBeVisible();
    await expect(page.locator('text=Insurance / month').first()).toBeVisible();
    await expect(page.locator('text=Maintenance spend').first()).toBeVisible();
    // Invoice table should be visible
    await expect(page.locator('text=Rental invoices').first()).toBeVisible();
  });

  test('cost page shows AED-formatted amounts', async ({ page }) => {
    await page.goto('/app/cost');
    await page.waitForSelector('h1', { timeout: 5000 });
    // Total asset value card should show AED amount
    const assetValueCard = page.locator('text=Total asset value').locator('xpath/../..');
    await expect(page.locator('text=AED').first()).toBeVisible();
  });

  test('maintenance page shows service plans with status badges', async ({ page }) => {
    await page.goto('/app/maintenance');
    await page.waitForSelector('h1', { timeout: 5000 });
    await expect(page.locator('h1')).toContainText('Maintenance');
    // Service plans section should be visible
    await expect(page.locator('text=Service plans').first()).toBeVisible();
    // Status badges should be visible
    await expect(page.locator('text=On track').first()).toBeVisible();
  });

  test('maintenance page shows maintenance alerts', async ({ page }) => {
    await page.goto('/app/maintenance');
    await page.waitForSelector('h1', { timeout: 5000 });
    // Maintenance alerts (due/overdue) should be visible
    await expect(page.locator('text=Due soon').first()).toBeVisible();
  });

  test('maintenance page shows service history table', async ({ page }) => {
    await page.goto('/app/maintenance');
    await page.waitForSelector('h1', { timeout: 5000 });
    await expect(page.locator('text=Service history').first()).toBeVisible();
  });
});
