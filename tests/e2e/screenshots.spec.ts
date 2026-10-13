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
  // Customer dashboard, owner (Al Noor, Tier 1)
  { user: 'omar', email: USERS.omar, on: '/app', screen: 'map' },
  { user: 'omar', email: USERS.omar, on: '/app/assets/a-fb12', screen: 'asset-detail' },
  { user: 'omar', email: USERS.omar, on: '/app/alerts', screen: 'alerts' },
  { user: 'omar', email: USERS.omar, on: '/app/reports', screen: 'reports' },
  { user: 'omar', email: USERS.omar, on: '/app/geofences', screen: 'geofences' },
  { user: 'omar', email: USERS.omar, on: '/app/settings', screen: 'settings' },
  // Owner with Tier 3 fleet (Emirates Earthmovers)
  { user: 'khalid', email: USERS.khalid, on: '/app/maintenance', screen: 'maintenance' },
  { user: 'khalid', email: USERS.khalid, on: '/app/billing', screen: 'billing' },
  { user: 'khalid', email: USERS.khalid, on: '/app/cost', screen: 'cost' },
  { user: 'khalid', email: USERS.khalid, on: '/app/certificates', screen: 'certificates' },
  // Renters
  { user: 'priya', email: USERS.priya, on: '/app/assets/a-bd02', screen: 'asset-detail-rented' },
  { user: 'lina', email: USERS.lina, on: '/app/downloads', screen: 'downloads' },
  { user: 'lina', email: USERS.lina, on: '/app/schedules', screen: 'schedules' },
  { user: 'fatima', email: USERS.fatima, on: '/app', screen: 'map' },
  // Kasper console
  { user: 'sara', email: USERS.sara, on: '/console/assets', screen: 'console-assets' },
  { user: 'sara', email: USERS.sara, on: '/console/billing', screen: 'console-billing' },
  { user: 'sara', email: USERS.sara, on: '/console/team', screen: 'console-team' },
  { user: 'ravi', email: USERS.ravi, on: '/console/requests', screen: 'console-requests' },
  { user: 'ravi', email: USERS.ravi, on: '/console/trackers', screen: 'console-trackers' },
  // Public pages, no account: the hirer's live link and the MUC verify page
  { user: 'hirer', email: '', on: '/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5', screen: 'tracking' },
  { user: 'auditor', email: '', on: '/verify/MUC-2026-09-EX-04-01', screen: 'verify' },
  // Sign-in (no account) and the Arabic map: RTL chrome, Latin digits for codes and times
  { user: 'anon', email: '', on: '/dev/sign-in', screen: 'sign-in' },
  { user: 'omar', email: USERS.omar, on: '/ar/app', screen: 'ar-map' },
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
      // Public pages have no account; the demo helper goes straight to them.
      await demo(page, shot.email ? { email: shot.email, on: shot.on } : { on: shot.on });
      // The page is settled when its content has rendered; a missing one fails the
      // capture rather than saving a blank screen. The console is desktop-only, so
      // at phone width its settled state is the "use a computer" message.
      const settled = shot.on.startsWith('/console') && width < 900
        ? page.getByText('Open the console on a computer.')
        : !shot.email
          ? page.getByRole('heading').first()
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
