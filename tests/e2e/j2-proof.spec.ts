// J2 proof: the two screens named in the J2 self-check, captured at the
// simulated anchor time and checked for console errors. Desktop only.
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { demo, USERS } from './helpers';

const OUT = path.resolve('reviews/screenshots/J2');
const TILE_HOST = /tile\.openstreetmap\.org/;

for (const shot of [
  { name: 'ex04-engine-fuel', email: USERS.khalid, on: '/app/assets/a-ex04', tab: 'Engine & fuel' },
  { name: 'fb12-trips', email: USERS.omar, on: '/app/assets/a-fb12', tab: 'Trips' },
] as const) {
  test(`${shot.name} renders with no console errors`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'screenshots are taken once, in the desktop project');
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() !== 'error') return;
      if (TILE_HOST.test(msg.location().url)) return;
      if (/Failed to load resource/.test(msg.text())) return;
      errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));

    await demo(page, { email: shot.email, on: shot.on });
    await page.getByRole('tab', { name: shot.tab, exact: true }).first().click();
    await expect(page.getByText("This page couldn't load")).toHaveCount(0);
    await expect(page.getByText(shot.tab, { exact: true }).first()).toBeVisible();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.screenshot({ path: path.join(OUT, `${shot.name}-1440.png`), fullPage: true, animations: 'disabled' });
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
