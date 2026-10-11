// H7: screenshots of the screens the prototype is reviewed on, at 1440 px and
// 390 px, written to reviews/screenshots/P14/ as <user>-<screen>-<width>.png
// (BUILD_PROMPT.md §1 and §16). Runs once, in the desktop project only: it sets
// both widths itself, so running it in the phone project would only repeat it.
//
// These are captures for review, not pass/fail checks on layout. Layout limits
// are enforced by phone-layout.spec.ts and the console specs.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { demo, USERS } from './helpers';

const OUT = path.resolve('reviews/screenshots/P14');
const WIDTHS = [1440, 390] as const;

type Shot = { user: string; email: string; on: string; screen: string };

const SHOTS: Shot[] = [
  { user: 'omar', email: USERS.omar, on: '/app', screen: 'map' },
  { user: 'omar', email: USERS.omar, on: '/app/alerts', screen: 'alerts' },
  { user: 'omar', email: USERS.omar, on: '/app/reports', screen: 'reports' },
  { user: 'omar', email: USERS.omar, on: '/app/geofences', screen: 'geofences' },
  { user: 'omar', email: USERS.omar, on: '/app/settings', screen: 'settings' },
  { user: 'khalid', email: USERS.khalid, on: '/app/maintenance', screen: 'maintenance' },
  { user: 'khalid', email: USERS.khalid, on: '/app/billing', screen: 'billing' },
  { user: 'priya', email: USERS.priya, on: '/app/assets/a-bd02', screen: 'asset-detail' },
  { user: 'lina', email: USERS.lina, on: '/app/downloads', screen: 'downloads' },
  { user: 'fatima', email: USERS.fatima, on: '/app', screen: 'map' },
  { user: 'sara', email: USERS.sara, on: '/console/assets', screen: 'console-assets' },
  { user: 'sara', email: USERS.sara, on: '/console/billing', screen: 'console-billing' },
  { user: 'ravi', email: USERS.ravi, on: '/console/requests', screen: 'console-requests' },
];

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

for (const shot of SHOTS) {
  for (const width of WIDTHS) {
    test(`${shot.user} ${shot.screen} at ${width} px`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'screenshots are taken once, in the desktop project');
      const height = width === 1440 ? 900 : 844;
      await page.setViewportSize({ width, height });
      await demo(page, { email: shot.email, on: shot.on });
      // The page is settled when its content has rendered; a missing one fails the
      // capture rather than saving a blank screen. The console is desktop-only, so
      // at phone width its settled state is the "use a computer" message.
      const settled = shot.on.startsWith('/console') && width < 900
        ? page.getByText('Open the console on a computer.')
        : page.locator('main, [data-testid="today-tiles"], .leaflet-container').first();
      await expect(settled).toBeVisible();
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.screenshot({
        path: path.join(OUT, `${shot.user}-${shot.screen}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
}
