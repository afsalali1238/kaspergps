// F1 (UI-UPGRADE §7.1–7.2, scorecard A4): the asset page header, the Overview
// 2×2 metric grid with one Power tile, SegmentedTabs, and End access now
// behind a confirm dialog that keeps the reason rule. Role checks for Khalid
// (owner), Lina (renter), Mark (Site User) and Fatima (owns nothing).

import { expect, test, type Page } from '@playwright/test';
import { goTo, signIn, USERS } from './helpers';

const RAW_FLOAT = /\d+\.\d{4,}/;

async function openAsset(page: Page, email: string, id: string): Promise<void> {
  await signIn(page, email);
  await goTo(page, `/app/assets/${id}`);
}

test.describe('F1: asset header', () => {
  test('Khalid sees the four summary lines and Share as the one primary action', async ({ page }) => {
    await openAsset(page, USERS.khalid, 'a-ex04');
    const header = page.getByTestId('asset-header');
    await expect(header.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(header.getByText('EX-04', { exact: true })).toBeVisible();
    await expect(header.getByText('T3', { exact: true })).toBeVisible();
    await expect(header.getByText('On hire', { exact: true })).toBeVisible();
    await expect(header.getByText(/ · \d{4} · /)).toBeVisible();
    await expect(header.getByTestId('asset-place')).toContainText('Emirates Earthmovers');
    await expect(header.getByTestId('asset-place')).toContainText(/Inside: |Outside all geofences/);
    await expect(header.getByText(/^Last updated \d{2}:\d{2}/)).toHaveAttribute('title', /Device time: .*\nReceived: /);

    const actions = page.getByTestId('asset-actions');
    await expect(actions.getByRole('button', { name: 'Share tracking link' })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Edit asset' })).toBeVisible();
    await expect(actions.getByRole('link', { name: 'Run report' })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'End access now' })).toBeVisible();
  });

  test('Lina (renter) gets Run report as the primary action, and no Share, Edit or End access', async ({ page }) => {
    await openAsset(page, USERS.lina, 'a-ex04');
    const header = page.getByTestId('asset-header');
    await expect(header.getByText('Rented', { exact: true })).toBeVisible();
    await expect(header.getByText('On hire', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Run report' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Share tracking link' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit asset' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'End access now' })).toHaveCount(0);
  });

  test('Mark (Site User) sees the header but no owner actions', async ({ page }) => {
    await openAsset(page, USERS.mark, 'a-cr02');
    await expect(page.getByTestId('asset-header').getByText('CR-02', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Run report' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Share tracking link' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit asset' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'End access now' })).toHaveCount(0);
  });

  test('Fatima (owns nothing) gets no owner actions on her rental and cannot open EX-04', async ({ page }) => {
    await openAsset(page, USERS.fatima, 'a-wl06');
    await expect(page.getByTestId('asset-header').getByText('WL-06', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Share tracking link' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'End access now' })).toHaveCount(0);

    await goTo(page, '/app/assets/a-ex04');
    await expect(page.getByText('Asset not found')).toBeVisible();
    await expect(page.getByTestId('asset-header')).toHaveCount(0);
  });
});

test.describe('F1: End access now asks first', () => {
  test('Cancel changes nothing; a short reason is refused in the dialog; a real reason ends access', async ({ page }) => {
    await openAsset(page, USERS.khalid, 'a-ex04');
    await page.getByRole('button', { name: 'End access now' }).click();

    const dialog = page.getByRole('alertdialog', { name: 'End Marina Builders access now' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/not undone by the nightly check/)).toBeVisible();
    // Focus starts on the safe choice.
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('On hire', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'End access now' }).click();
    await dialog.getByPlaceholder('Reason (at least 10 characters)').fill('too short');
    await dialog.getByRole('button', { name: 'End Marina Builders access now' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Give a reason of at least 10 characters.');
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder('Reason (at least 10 characters)').fill('Payment overdue for two weeks');
    await dialog.getByRole('button', { name: 'End Marina Builders access now' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /Marina Builders/ })).toBeVisible();
    // The rental is over, so the action and the On hire chip go away.
    await expect(page.getByRole('button', { name: 'End access now' })).toHaveCount(0);
    await expect(page.getByText('On hire', { exact: true })).toHaveCount(0);
  });
});

test.describe('F1: Overview', () => {
  test('a 2×2 metric grid beside the map, one Power tile, no raw floats', async ({ page }) => {
    await openAsset(page, USERS.khalid, 'a-ex04');
    const grid = page.getByTestId('metric-grid');
    await expect(grid.locator('[data-testid^="tile-"]')).toHaveCount(4);
    await expect(grid.getByTestId('tile-power')).toContainText(/\d+\.\d V/);
    await expect(grid.getByTestId('tile-power')).toContainText(/Tracker battery \d+\.\d V/);
    // One Power tile: no separate Tracker battery tile anywhere on the page.
    await expect(page.locator('[data-testid^="tile-"]').filter({ hasText: /^Power/ })).toHaveCount(1);
    await expect(page.getByText('Tracker battery', { exact: true })).toHaveCount(0);
    // Numbers carry a source.
    await expect(grid.getByTestId('tile-speed')).toContainText('Source: GPS');
    await expect(page.getByTestId('tile-today-ignition')).toContainText('Estimated');
    await expect(page.getByTestId('tile-today-distance')).toContainText('Source: GPS distance');

    const text = await page.locator('main').innerText();
    expect(text.match(RAW_FLOAT), 'no raw floats on the asset Overview').toBeNull();
  });

  test('a Tier 1 truck keeps one Power tile: vehicle voltage, with the tracker battery under it', async ({ page }) => {
    await openAsset(page, USERS.omar, 'a-fb12');
    const power = page.getByTestId('tile-power');
    await expect(power).toContainText(/^Power\d+\.\dV/);
    await expect(power).toContainText(/Tracker battery \d+\.\d V/);
    await expect(page.getByText('Tracker battery', { exact: true })).toHaveCount(0);
    await expect(page.locator('[data-testid^="tile-"]').filter({ hasText: /^Power/ })).toHaveCount(1);
  });

  test('tabs are a tab list; on a phone they scroll inside themselves, not the page', async ({ page }) => {
    await openAsset(page, USERS.khalid, 'a-ex04');
    const tablist = page.getByRole('tablist', { name: 'Asset sections' });
    await expect(tablist.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    await tablist.getByRole('tab', { name: 'Alerts' }).click();
    await expect(tablist.getByRole('tab', { name: 'Alerts' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await tablist.getByRole('tab', { name: 'Overview' }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'no sideways page scroll at 390 px').toBeLessThanOrEqual(0);
  });
});
