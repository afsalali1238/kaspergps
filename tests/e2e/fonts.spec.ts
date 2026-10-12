// B1: the brand fonts load in production (they used to fall back to system fonts,
// because the build dropped the Google Fonts @import). Each face must be served by
// the app itself and load; the body must use Hanken Grotesk.
import { expect, test } from '@playwright/test';
import { demo, USERS } from './helpers';

test('brand fonts load on /app', async ({ page }) => {
  await demo(page, { email: USERS.khalid, on: '/app' });
  const loaded = await page.evaluate(async () => {
    const faces = async (spec: string) => (await document.fonts.load(spec)).map(f => f.family.replace(/"/g, ''));
    return {
      mono: await faces('12px "Space Mono"'),
      body: await faces('14px "Hanken Grotesk"'),
      heading: await faces('600 20px "Space Grotesk"'),
      bodyFamily: getComputedStyle(document.body).fontFamily,
    };
  });
  expect(loaded.bodyFamily).toContain('Hanken Grotesk');
  expect(loaded.mono, 'Space Mono').toContain('Space Mono');
  expect(loaded.body, 'Hanken Grotesk').toContain('Hanken Grotesk');
  expect(loaded.heading, 'Space Grotesk').toContain('Space Grotesk');
});
