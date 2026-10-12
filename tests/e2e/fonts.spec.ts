// B1: the brand fonts load in production (they used to fall back to system fonts,
// because the build dropped the Google Fonts @import).
import { expect, test } from '@playwright/test';
import { demo, USERS } from './helpers';

test('brand fonts load on /app', async ({ page }) => {
  await demo(page, { email: USERS.khalid, on: '/app' });
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => ({
    mono: document.fonts.check('12px "Space Mono"'),
    body: document.fonts.check('14px "Hanken Grotesk"'),
    heading: document.fonts.check('600 20px "Space Grotesk"'),
    bodyFamily: getComputedStyle(document.body).fontFamily,
  }));
  expect(loaded.bodyFamily).toContain('Hanken Grotesk');
  expect(loaded.mono, 'Space Mono').toBe(true);
  expect(loaded.body, 'Hanken Grotesk').toBe(true);
  expect(loaded.heading, 'Space Grotesk').toBe(true);
});
