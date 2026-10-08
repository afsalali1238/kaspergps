import { test, expect } from '@playwright/test';
import { signInAsEmirates } from '../fixtures/helpers';

test.describe('Downloads page — Download again + Delete', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsEmirates(page);
  });

  test('downloads page shows download history', async ({ page }) => {
    await page.goto('/app/downloads');
    await page.waitForSelector('h1', { timeout: 5000 });
    await expect(page.locator('h1')).toContainText('Downloads');
    // Download entries should be visible
    await expect(page.locator('text=Trip & Mileage').first()).toBeVisible();
    await expect(page.locator('text=Location history').first()).toBeVisible();
  });

  test('Download again triggers an Excel download', async ({ page }) => {
    await page.goto('/app/downloads');
    await page.waitForSelector('h1', { timeout: 5000 });
    // Click Download again on the Trip & Mileage entry (Excel format)
    await page.click('button:has-text("Download again").locator("..").locator("..").filter({ hasText: "Trip & Mileage" })');
    await page.waitForTimeout(200);
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    const download = await downloadPromise;
    const filename = await download.path();
    expect(filename).toContain('.xlsx');
    expect(filename).toContain('Kasper_trip_mileage');
  });

  test('Download again triggers a PDF download', async ({ page }) => {
    await page.goto('/app/downloads');
    await page.waitForSelector('h1', { timeout: 5000 });
    // Click Download again on the Location history entry (PDF format)
    const locationRow = page.locator('[class*="bg-surface"][class*="border-line"]').filter({ hasText: 'Location history' });
    await locationRow.locator('button:has-text("Download again")').click();
    await page.waitForTimeout(200);
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    const download = await downloadPromise;
    const filename = await download.path();
    expect(filename).toContain('.pdf');
    expect(filename).toContain('Kasper_location_history');
  });

  test('Delete removes the download from the list', async ({ page }) => {
    await page.goto('/app/downloads');
    await page.waitForSelector('h1', { timeout: 5000 });
    // Count entries before
    const countBefore = await page.locator('[class*="bg-surface"][class*="border-line"]').count();
    // Click Delete on the first entry
    const firstRow = page.locator('[class*="bg-surface"][class*="border-line"]').first();
    await firstRow.locator('button:has-text("Delete")').click();
    await page.waitForTimeout(300);
    const countAfter = await page.locator('[class*="bg-surface"][class*="border-line"]').count();
    expect(countAfter).toBe(countBefore - 1);
  });
});
