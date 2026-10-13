// H4.7 proof: no screen scrolls sideways at phone width (390 px). The demo bar
// and the app shell must fit; a wide table scrolls inside its own box instead.
import { expect, test } from '@playwright/test';
import { demo, openDemoMore, stubTiles, USERS } from './helpers';

const SCREENS: { email: string; path: string }[] = [
  { email: USERS.omar, path: '/app' },
  { email: USERS.omar, path: '/app/alerts' },
  { email: USERS.omar, path: '/app/reports' },
  { email: USERS.omar, path: '/app/assets/a-ex04' },
  { email: USERS.omar, path: '/app/assets/a-fb12' },
  { email: USERS.omar, path: '/app/settings' },
  { email: USERS.omar, path: '/app/geofences' },
  { email: USERS.khalid, path: '/app/billing' },
  { email: USERS.khalid, path: '/app/maintenance' },
  { email: USERS.khalid, path: '/app/cost' },
  { email: USERS.khalid, path: '/app/certificates' },
  { email: USERS.lina, path: '/app/downloads' },
  { email: USERS.lina, path: '/app/schedules' },
  { email: USERS.lina, path: '/app/assets/a-ex04' },
  { email: USERS.priya, path: '/app/assets/a-bd02' },
  { email: USERS.sara, path: '/console/assets' },
  { email: USERS.sara, path: '/console/billing' },
];

for (const { email, path } of SCREENS) {
  test(`${path} for ${email} fits a 390 px phone without sideways scroll`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) > 500, 'phone layout only');
    await page.setViewportSize({ width: 390, height: 844 });
    await demo(page, { email, on: path });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `page is ${overflow}px wider than the screen`).toBeLessThanOrEqual(1);
  });
}

// H4.7 / J5.5: the demo bar is one row on a phone (Features, Scenarios and Tools
// show as icons), and every control sits inside the screen.
test('the demo bar fits a 390 px phone in one row: every control is on screen', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 500, 'phone layout only');
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page, { email: USERS.omar, on: '/app' });
  const barHeight = await page.locator('.demo-bar').first().evaluate(el => (el as HTMLElement).offsetHeight);
  expect(barHeight, 'the demo bar is a single row').toBeLessThanOrEqual(44);
  for (const name of ['Clock', 'Features', 'More']) {
    const control = page.locator('.demo-bar').getByRole('button', { name, exact: true }).first();
    await expect(control, `${name} is in the demo bar`).toBeVisible();
    const box = await control.boundingBox();
    expect(box, `${name} has a box`).not.toBeNull();
    expect(box!.x + box!.width, `${name} is cut off at the right edge`).toBeLessThanOrEqual(390);
    expect(box!.x, `${name} is cut off at the left edge`).toBeGreaterThanOrEqual(0);
  }
});

// The public pages a hirer or an auditor sees with no account (spec §11.6, §11.16).
const PUBLIC_PAGES = [
  '/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5',
  '/t/fH3jKp7wR9xT2nY4qM6vZ1AbCs',
  '/verify/MUC-2026-09-EX-04-01',
];

for (const path of PUBLIC_PAGES) {
  test(`${path} fits a 390 px phone without sideways scroll`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) > 500, 'phone layout only');
    await page.setViewportSize({ width: 390, height: 844 });
    await stubTiles(page);
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `page is ${overflow}px wider than the screen`).toBeLessThanOrEqual(1);
  });
}

// J5.5: a demo-bar menu opened on a phone stays on screen.
test('the Scenarios menu opens inside a 390 px screen and shows at least 10 scenarios', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 500, 'phone layout only');
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page, { email: USERS.omar, on: '/app' });
  await openDemoMore(page);
  await page.locator('.demo-bar').getByRole('button', { name: 'Scenarios', exact: true }).click();
  const menu = page.getByText('Guided walkthroughs').locator('xpath=../..');
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  const rows = menu.locator('button');
  let shown = 0;
  for (let i = 0; i < Math.min(await rows.count(), 20); i++) {
    const r = await rows.nth(i).boundingBox();
    if (r && r.y + r.height <= box.y + box.height) shown++;
  }
  expect(shown, 'scenarios visible without scrolling').toBeGreaterThanOrEqual(10);
});

// The hirer's tracking page shows its map on a phone (it once collapsed to 0 px tall there).
test('the tracking page map has real height at 390 px, with the marker on it', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 500, 'phone layout only');
  await page.setViewportSize({ width: 390, height: 844 });
  await stubTiles(page);
  await page.goto('/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5');
  const map = page.locator('.leaflet-container').first();
  await expect(map).toBeVisible();
  const box = (await map.boundingBox())!;
  expect(box.height, 'map height').toBeGreaterThan(300);
  const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
  expect(title.y, 'the asset name sits below the map, not under the Live pill').toBeGreaterThanOrEqual(box.y + box.height);
});
