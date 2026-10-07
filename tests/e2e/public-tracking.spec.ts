// The public tracking page (spec 11.6). No other tests cover it in a browser,
// and this is the one page hirers see — so it gets the strictest checks:
// noindex/no-referrer, a readable status line and the dead-link message.

import { expect, test } from '@playwright/test';

const LIVE_FB12 = 'k7Qm2Xc9TpLw4ZaN8rVb3Ye5';        // FB-12 on BK-1011, ETA on
const LIVE_TP22 = 'dB8rXp2kN9wQ4mY7hT6vZ1AaCs';        // TP-22, ETA off
const REVOKED = 'fH3jKp7wR9xT2nY4qM6vZ1AbCs';          // revoked when BK-1012 closed
const REVOKED_MANUAL = 'rT4kWp8nN3yU7mZ2hF5vX1AcDe';   // revoked by hand

test.describe('public tracking page', () => {
  test('is not indexed and never leaks a referrer', async ({ page }) => {
    await page.goto(`/t/${LIVE_FB12}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    await expect(page).toHaveTitle(/Track your asset/);
  });

  test('shows the asset, its status and the arrival line', async ({ page }) => {
    await page.goto(`/t/${LIVE_FB12}`);
    await expect(page.getByText('Flatbed trailer truck')).toBeVisible();
    await expect(page.getByText('Updated', { exact: false })).toBeVisible();
    await expect(page.getByText('Arrival')).toBeVisible();
    // "Arriving about 14:28 (in 28 min)" or the arrived variant.
    await expect(page.getByText(/Arriving about \d{2}:\d{2}|Arrived \d{2}:\d{2}|ETA unavailable/)).toBeVisible();
    await expect(page.getByText(/Destination:/)).toBeVisible();
  });

  test('leaves the ETA out when the owner switched it off', async ({ page }) => {
    await page.goto(`/t/${LIVE_TP22}`);
    await expect(page.getByText('Tipper')).toBeVisible();
    await expect(page.getByText('Arrival')).toHaveCount(0);
    expect(await page.content()).not.toContain('Destination:');
  });

  test('tells the hirer a revoked link is dead', async ({ page }) => {
    for (const token of [REVOKED, REVOKED_MANUAL]) {
      await page.goto(`/t/${token}`);
      await expect(page.getByText('This tracking link is no longer active.')).toBeVisible();
      // No asset name, no map, no position.
      await expect(page.getByText(/Arriving|Arrived/)).toHaveCount(0);
    }
  });

  test('treats an unknown token the same way', async ({ page }) => {
    await page.goto('/t/not-a-real-token');
    await expect(page.getByText('This tracking link is no longer active.')).toBeVisible();
  });

  test('works on a phone-width viewport without sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto(`/t/${LIVE_FB12}`);
    await expect(page.getByText('Flatbed trailer truck')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
