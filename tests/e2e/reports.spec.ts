import { test, expect } from '@playwright/test';
import { signInAsEmirates } from '../fixtures/helpers';

test.describe('Reports page — Excel and PDF export', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsEmirates(page);
  });

  test('reports page loads with report type selection', async ({ page }) => {
    await page.goto('/app/reports');
    await page.waitForSelector('h1', { timeout: 5000 });
    await expect(page.locator('h1')).toContainText('Reports');
    await expect(page.locator('button:has-text("Trip & Mileage")')).toBeVisible();
    await expect(page.locator('button:has-text("Location history")')).toBeVisible();
  });

  test('selecting a report type shows scope and date options', async ({ page }) => {
    await page.goto('/app/reports');
    await page.waitForSelector('h1', { timeout: 5000 });
    await page.click('button:has-text("Trip & Mileage")');
    await page.waitForTimeout(300);
    await expect(page.locator('button:has-text("Single asset")')).toBeVisible();
    await expect(page.locator('button:has-text("Multiple assets")')).toBeVisible();
    await expect(page.locator('button:has-text("Last 24 hours")')).toBeVisible();
  });

  test('Excel download triggers a file download', async ({ page }) => {
    await page.goto('/app/reports');
    await page.waitForSelector('h1', { timeout: 5000 });
    await page.click('button:has-text("Trip & Mileage")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Multiple assets")');
    await page.click('button:has-text("Last 7 days")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Excel (.xlsx)")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Run report")');
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    const download = await downloadPromise;
    const filename = await download.path();
    expect(filename).toContain('.xlsx');
    expect(filename).toContain('Kasper_trip_mileage');
  });

  test('PDF download triggers a file download', async ({ page }) => {
    await page.goto('/app/reports');
    await page.waitForSelector('h1', { timeout: 5000 });
    await page.click('button:has-text("Trip & Mileage")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Multiple assets")');
    await page.click('button:has-text("Last 7 days")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("PDF")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Run report")');
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    const download = await downloadPromise;
    const filename = await download.path();
    expect(filename).toContain('.pdf');
    expect(filename).toContain('Kasper_trip_mileage');
  });
});
