// Agent D: no raw floats on the main screens (UI-UPGRADE §2 A13, BUILDER U0b #6).
//
// A number with four or more decimals on screen ("12.3456789 h") is an unformatted
// float. Values go through src/lib/format.ts. This checks the visible text
// (innerText skips hidden nodes) of each main screen for Khalid, Omar and Lina.
// A screen that fails is not fixed here: it is marked test.fixme with the text
// found and the Wave 2 agent that owns it, who removes the fixme with the fix.
import { expect, test } from '@playwright/test';
import { goTo, settle, signIn, USERS } from './helpers';

const RAW_FLOAT = /\d+\.\d{4,}/g;

const SCREENS: Record<'khalid' | 'omar' | 'lina', string[]> = {
  khalid: [
    '/app', '/app/assets/a-ex04', '/app/assets/a-ex11', '/app/alerts', '/app/maintenance',
    '/app/reports', '/app/downloads', '/app/cost', '/app/billing', '/app/certificates', '/app/settings',
  ],
  omar: ['/app', '/app/assets/a-fb12', '/app/alerts', '/app/maintenance', '/app/reports', '/app/settings'],
  lina: ['/app', '/app/assets/a-ex04', '/app/assets/a-pu51', '/app/alerts', '/app/reports', '/app/downloads'],
};

for (const [user, paths] of Object.entries(SCREENS) as [keyof typeof SCREENS, string[]][]) {
  test.describe(`no raw floats: ${user}`, () => {
    for (const path of paths) {
      test(`${user} ${path}`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'text is the same at both widths; checked once');
        await signIn(page, USERS[user]);
        await goTo(page, path);
        await settle(page);
        const text = await page.locator('body').innerText();
        const floats = [...new Set(text.match(RAW_FLOAT) ?? [])];
        expect(floats, `raw floats on ${path} for ${user}`).toEqual([]);
      });
    }
  });
}
