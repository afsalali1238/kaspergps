// Agent D: visual regression on 16 key screens × 2 widths (UI-UPGRADE §11.4).
//
// OFF by default: Wave 2 redesigns every screen, so baselines recorded now would
// only churn. It runs when VISUAL=1 (the CI "Visual regression" job sets it and
// is allowed to fail). Agent J records the baselines in tests/e2e/__screenshots__
// (see snapshotPathTemplate in playwright.config.ts) and makes the job required.
// Any intended change then updates its baseline in the same PR.
//
// Determinism: map tiles are stubbed (helpers), CSS animations and transitions
// are off (toHaveScreenshot's `animations: 'disabled'`), the caret is hidden,
// and the demo clock stays at the seed anchor (a fresh browser context starts
// there, and nothing here moves it).
import { expect, test } from '@playwright/test';
import { goTo, settle, signIn, stubTiles, USERS } from './helpers';

const WIDTHS = [1440, 390] as const;

const SCREENS: { name: string; email: string; path: string }[] = [
  { name: 'sign-in', email: '', path: '/sign-in' },
  { name: 'owner-map', email: USERS.khalid, path: '/app' },
  { name: 'owner-asset-ex04', email: USERS.khalid, path: '/app/assets/a-ex04' },
  { name: 'owner-alerts', email: USERS.khalid, path: '/app/alerts' },
  { name: 'owner-maintenance', email: USERS.khalid, path: '/app/maintenance' },
  { name: 'owner-reports', email: USERS.khalid, path: '/app/reports' },
  { name: 'owner-cost', email: USERS.khalid, path: '/app/cost' },
  { name: 'owner-billing', email: USERS.khalid, path: '/app/billing' },
  { name: 'owner-certificates', email: USERS.khalid, path: '/app/certificates' },
  { name: 'owner-settings', email: USERS.khalid, path: '/app/settings' },
  { name: 'renter-map', email: USERS.lina, path: '/app' },
  { name: 'truck-asset-fb12', email: USERS.omar, path: '/app/assets/a-fb12' },
  { name: 'console-overview', email: USERS.sara, path: '/console' },
  { name: 'console-trackers', email: USERS.ravi, path: '/console/trackers' },
  { name: 'tracking-link', email: '', path: '/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5' },
  { name: 'verify', email: '', path: '/verify/MUC-2026-09-EX-04-01' },
];

test.describe('visual regression', () => {
  test.skip(!process.env.VISUAL, 'visual regression runs only with VISUAL=1 (agent J switches it on)');

  for (const screen of SCREENS) {
    for (const width of WIDTHS) {
      test(`${screen.name} at ${width} px`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'sets both widths itself; runs once, in the desktop project');
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
        if (screen.email) {
          await signIn(page, screen.email);
          await goTo(page, screen.path);
        } else {
          await stubTiles(page);
          await page.goto(screen.path);
        }
        await settle(page, 1000);
        await expect(page).toHaveScreenshot(`${screen.name}-${width}.png`, {
          animations: 'disabled',
          caret: 'hide',
          maxDiffPixelRatio: 0.01,
        });
      });
    }
  }
});
