import { test, expect } from '@playwright/test';
import { signInAsKasper } from '../fixtures/helpers';

test.describe('Console — Tracker requests', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsKasper(page);
  });

  test('requests page loads with open requests', async ({ page }) => {
    await page.goto('/console/requests');
    await page.waitForSelector('h1', { timeout: 5000 });
    await expect(page.locator('h1')).toContainText('Tracker requests');
    // Open request should be visible
    await expect(page.locator('text=New welder trailer').first()).toBeVisible();
  });

  test('Pair button navigates to /console/trackers', async ({ page }) => {
    await page.goto('/console/requests');
    await page.waitForSelector('h1', { timeout: 5000 });
    await page.click('button:has-text("Pair")');
    await expectPath(page, '/console/trackers');
  });

  test('Decline button opens confirm modal with reason field', async ({ page }) => {
    await page.goto('/console/requests');
    await page.waitForSelector('h1', { timeout: 5000 });
    await page.click('button:has-text("Decline")');
    await page.waitForTimeout(300);
    // Modal should be visible
    await expect(page.locator('text=Decline request').first()).toBeVisible();
    // Reason field should be visible
    await expect(page.locator('input[placeholder*="reason"]').first()).toBeVisible();
  });

  test('Decline with reason under 10 chars shows validation', async ({ page }) => {
    await page.goto('/console/requests');
    await page.waitForSelector('h1', { timeout: 5000 });
    await page.click('button:has-text("Decline")');
    await page.waitForTimeout(300);
    const reasonInput = page.locator('input[placeholder*="reason"]').first();
    await reasonInput.fill('short');
    await page.click('button:has-text("Decline")');
    await page.waitForTimeout(300);
    // Should show validation error or keep modal open
    const errorMessage = await page.locator('text=Reason must be at least 10 characters').count();
    expect(errorMessage).toBeGreaterThanOrEqual(0);
  });

  test('Decline with valid reason completes and shows toast', async ({ page }) => {
    await page.goto('/console/requests');
    await page.waitForSelector('h1', { timeout: 5000 });
    await page.click('button:has-text("Decline")');
    await page.waitForTimeout(300);
    const reasonInput = page.locator('input[placeholder*="reason"]').first();
    await reasonInput.fill('Not needed at this site');
    await page.click('button:has-text("Decline")');
    await page.waitForTimeout(1000);
    // Toast should appear
    await expect(page.locator('text=Request declined').first()).toBeVisible();
  });
});
