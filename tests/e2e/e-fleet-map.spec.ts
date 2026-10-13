// Agent E: the fleet map's three panes (UI-UPGRADE §6 tests, scorecard A3).
import { expect, test, type Page } from '@playwright/test';
import { demo, expectNoText, USERS } from './helpers';

const SHOTS = 'reviews/screenshots/E';

async function rowFor(page: Page, code: string) {
  return page.getByTestId('asset-list').locator('button[data-asset-id]').filter({ hasText: code }).first();
}

test.describe('E — desktop three panes', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'widths are set in this spec');
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('a fleet row opens the panel with the right asset, the URL follows, Esc closes it', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app' });
    await (await rowFor(page, 'EX-04')).click();
    const pane = page.getByTestId('asset-pane');
    await expect(pane).toBeVisible();
    await expect(pane.getByRole('heading', { name: /EX-04/ })).toBeVisible();
    await expect(page).toHaveURL(/[?&]asset=a-ex04/);
    // T3: engine hours with a source, and the fuel tank.
    await expect(pane.getByText('Engine hours', { exact: true })).toBeVisible();
    await expect(pane.getByText('Source: ECU').first()).toBeVisible();
    await expect(pane.getByText('Fuel tank')).toBeVisible();
    // Actions: the asset page is primary; End access never lives here.
    await expect(pane.getByRole('link', { name: 'Open asset page' })).toHaveAttribute('href', /\/app\/assets\/a-ex04$/);
    await expect(pane.getByRole('button', { name: /End access/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(pane).toHaveCount(0);
    await expect(page).not.toHaveURL(/asset=/);
  });

  test('?asset= opens the panel on arrival; an asset the user cannot see opens nothing', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app?asset=a-ex04' });
    await expect(page.getByTestId('asset-pane').getByRole('heading', { name: /EX-04/ })).toBeVisible();
    await demo(page, { email: USERS.lina, on: '/app?asset=a-ex07' });
    await expect(page.getByTestId('fleet-rail')).toBeVisible();
    await expect(page.getByTestId('asset-pane')).toHaveCount(0);
    await expectNoText(page, 'EX-07');
  });

  test('at 1440 × 900 the first fleet row and the map are on screen without scrolling', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app' });
    const first = page.getByTestId('asset-list').locator('li').first();
    await expect(first).toBeInViewport();
    await expect(page.locator('.leaflet-container')).toBeInViewport();
    await expect(page.getByTestId('today-tiles')).toBeInViewport();
  });

  test('a KPI cell filters the map', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app' });
    const total = await page.getByTestId('asset-list').locator('li').count();
    await page.getByTestId('today-tiles').getByRole('button', { name: /Idle/ }).click();
    await expect(page).toHaveURL(/status=idle/);
    const idle = await page.getByTestId('asset-list').locator('li').count();
    expect(idle).toBeLessThan(total);
    await page.getByRole('button', { name: /Remove filter Idle/ }).click();
    await expect(page.getByTestId('asset-list').locator('li')).toHaveCount(total);
  });

  test('a marker click opens the same panel', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app?status=offline' });
    const marker = page.locator('.leaflet-marker-icon.marker-custom').first();
    await expect(marker).toBeVisible();
    await marker.click();
    await expect(page.getByTestId('asset-pane')).toBeVisible();
    await expect(page).toHaveURL(/asset=a-/);
  });

  test('Omar (Tier 1) gets no fuel UI', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app' });
    await expect(page.getByTestId('today-tiles').getByText('Fuel used today')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Fuel events/ })).toHaveCount(0);
    await (await rowFor(page, 'FB-12')).click();
    const pane = page.getByTestId('asset-pane');
    await expect(pane.getByText("Today's distance")).toBeVisible();
    await expect(pane.getByText('Fuel tank')).toHaveCount(0);
  });

  test("Lina's rail shows her own and rented assets only; a rental names the owner", async ({ page }) => {
    await demo(page, { email: USERS.lina, on: '/app' });
    const list = page.getByTestId('asset-list');
    for (const code of ['PU-51', 'PU-52', 'VN-01', 'EX-04']) await expect(list.getByText(code, { exact: true })).toBeVisible();
    await expect(list.getByText('EX-07', { exact: true })).toHaveCount(0);
    await (await rowFor(page, 'EX-04')).click();
    await expect(page.getByTestId('asset-pane').getByText(/Rented from Emirates Earthmovers until/)).toBeVisible();
    // Maintenance is the owner's.
    await expect(page.getByTestId('asset-pane').getByText('Next service')).toHaveCount(0);
  });

  test("Mark's rail shows his site only", async ({ page }) => {
    await demo(page, { email: USERS.mark, on: '/app' });
    const rows = page.getByTestId('asset-list').locator('li');
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) await expect(rows.nth(i)).toContainText('Al Qusais Yard');
  });

  test('screenshots: Khalid, Lina and Omar at 1440, 1280 and 1024 px', async ({ page }) => {
    test.setTimeout(120_000);
    for (const [who, asset] of [['khalid', 'a-ex04'], ['lina', 'a-ex04'], ['omar', 'a-fb12']] as const) {
      for (const width of [1440, 1280, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        await demo(page, { email: USERS[who], on: `/app?asset=${asset}` });
        await expect(page.getByTestId('asset-pane')).toBeVisible();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${SHOTS}/${who}-${width}.png` });
      }
    }
  });
});

test.describe('E — phone', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone layout');
  });

  test('390 px: no sideways scroll, and a tap opens the bottom sheet', async ({ page }) => {
    for (const who of ['khalid', 'lina', 'omar'] as const) {
      await demo(page, { email: USERS[who], on: '/app' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, who).toBeLessThanOrEqual(0);
      await page.getByTestId('asset-list').locator('button[data-asset-id]').first().click();
      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole('link', { name: 'Open asset page' })).toBeVisible();
      const overflowOpen = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflowOpen, `${who} with the sheet open`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${SHOTS}/${who}-390.png` });
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
    }
  });
});
