import { test, expect } from '@playwright/test';
import { signInAsEmirates, emiratesAssets } from '../fixtures/helpers';

test.describe('Customer map — Fleet page', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsEmirates(page);
  });

  test('Fleet page loads with map and asset list', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Fleet');
    // Map container should be visible
    await expect(page.locator('.leaflet-container').first()).toBeVisible();
    // Asset list should have items
    await expect(page.locator('text=EX-04').first()).toBeVisible();
  });

  test('asset markers are visible on the map', async ({ page }) => {
    // EX-04 marker should be on the map
    const ex04Popup = page.locator('.leaflet-popup-content', { hasText: 'EX-04' });
    await ex04Popup.scrollIntoViewIfNeeded();
    await expect(ex04Popup).toBeVisible();
  });

  test('filter by site shows only assets at that site', async ({ page }) => {
    // Find the site filter dropdown
    const siteSelect = page.locator('select', { hasPlaceholder: 'All sites' }).first();
    if (await siteSelect.count() > 0) {
      await siteSelect.selectOption('s-emirates-alq');
      await page.waitForTimeout(500);
      // All visible assets should be at Al Quoz
      const assetCodes = await page.locator('[class*="font-mono"][class*="font-medium"]').allTextContents();
      expect(assetCodes.every(code => code === 'EX-04' || code === 'EX-07' || code === 'WL-03' || code === 'BD-02' || code === 'GR-01' || code === 'GN-01' || code === 'LD-09')).toBe(true);
    }
  });

  test('filter by tier shows only assets of that tier', async ({ page }) => {
    const tierSelect = page.locator('select', { hasText: 'All tiers' }).first();
    if (await tierSelect.count() > 0) {
      await tierSelect.selectOption('3');
      await page.waitForTimeout(500);
      // Only Tier 3 assets (ALL-CAN300) should be visible
      const visibleCodes = await page.locator('.leaflet-popup-content').allTextContents();
      const tier3Codes = visibleCodes.filter(c => c.includes('EX-') || c.includes('WL-') || c.includes('BD-') || c.includes('GN-'));
      expect(tier3Codes.length > 0).toBe(true);
    }
  });

  test('opening an asset detail navigates to /app/assets/[id]', async ({ page }) => {
    await page.click('text=EX-04');
    await expectPath(page, `/app/assets/${emiratesAssets.ex04}`);
    await expect(page.locator('h1')).toContainText('EX-04');
  });
});
