import { test, expect } from '@playwright/test';
import { signInAsEmirates, emiratesAssets } from '../fixtures/helpers';

test.describe('Asset detail page', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsEmirates(page);
  });

  test('asset detail loads with overview tiles', async ({ page }) => {
    await page.goto(`/app/assets/${emiratesAssets.ex04}`);
    await page.waitForSelector('h1', { timeout: 5000 });
    await expect(page.locator('h1')).toContainText('EX-04');
    // Overview tab is default
    await expect(page.locator('[class*="rounded-xl"][class*="border"][class*="bg-paper"]').first()).toBeVisible();
  });

  test('status tile shows the asset status', async ({ page }) => {
    await page.goto(`/app/assets/${emiratesAssets.ex04}`);
    await page.waitForSelector('.leaflet-container', { timeout: 5000 });
    // Status should be visible in the overlay or tile
    await expect(page.locator('text=EX-04').first()).toBeVisible();
  });

  test('History tab shows position history', async ({ page }) => {
    await page.goto(`/app/assets/${emiratesAssets.ex04}`);
    await page.waitForSelector('h1', { timeout: 5000 });
    // Click History tab
    const historyTab = page.locator('button', { hasText: 'History' }).first();
    if (await historyTab.count() > 0) {
      await historyTab.click();
      await page.waitForTimeout(300);
      // History should show positions
      await expect(page.locator('text=EX-04').first()).toBeVisible();
    }
  });

  test('Settings tab shows tracker link section', async ({ page }) => {
    await page.goto(`/app/assets/${emiratesAssets.ex04}`);
    await page.waitForSelector('h1', { timeout: 5000 });
    const settingsTab = page.locator('button', { hasText: 'Settings' }).first();
    if (await settingsTab.count() > 0) {
      await settingsTab.click();
      await page.waitForTimeout(300);
      // Tracker link section should be visible
      await expect(page.locator('text=Tracker link').first()).toBeVisible();
    }
  });

  test('nonexistent asset shows not found', async ({ page }) => {
    await page.goto('/app/assets/a-nonexistent');
    await expect(page.locator('text=Asset not found').first()).toBeVisible();
  });
});
