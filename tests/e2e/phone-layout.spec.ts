// H4.7 proof: no screen scrolls sideways at phone width (390 px). The demo bar
// and the app shell must fit; a wide table scrolls inside its own box instead.
import { expect, test } from '@playwright/test';
import { demo, stubTiles, USERS } from './helpers';

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

// H4.7: the demo bar wraps on a phone instead of hiding its right-hand controls
// in a box that scrolls. Every control must sit inside the screen.
test('the demo bar fits a 390 px phone: every control is on screen', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 500, 'phone layout only');
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page, { email: USERS.omar, on: '/app' });
  for (const name of ['Day 1', 'Later', 'Features', 'Scenarios', 'Tools']) {
    const control = page.locator('.demo-bar').getByText(name, { exact: true }).first();
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
