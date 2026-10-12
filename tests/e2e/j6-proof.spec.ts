// J6 proof: the playback player with every event pin, captured at the two review widths
// into reviews/screenshots/J6/ (spec §11.15; HANDOFF J6 = the missing pin kinds).
//
//   lb05-24h       the towing pin, trip pins and the legend over a day (desktop + phone)
//   wt07-trip      one trip played from the Trips tab, with its over-speed pin
//   ex04-7day      a machine that works on one site: refuels and drops, no pin clutter
//
// Each capture is also a smoke test: a page that throws or loses its pins fails the shot.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { demo, USERS } from './helpers';

const OUT = path.resolve('reviews/screenshots/J6');

type Shot = {
  name: string;
  email: string;
  asset: string;
  /** History period to pick before pressing Play this period. */
  period?: '24 h' | '7 days';
  /** Play a trip from the Trips tab instead of the History period. */
  fromTrips?: boolean;
};

const SHOTS: Shot[] = [
  { name: 'lb05-24h', email: USERS.omar, asset: 'a-lb05' },
  { name: 'wt07-trip', email: USERS.omar, asset: 'a-wt07', fromTrips: true },
  { name: 'ex04-7day', email: USERS.khalid, asset: 'a-ex04', period: '7 days' },
];

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

for (const shot of SHOTS) {
  for (const width of [1440, 390] as const) {
    test(`${shot.name} at ${width} px`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'screenshots are taken once, in the desktop project');
      // The player is laid out for desktop; the phone captures are the same screen at 390 px.
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await demo(page, { email: shot.email, on: `/app/assets/${shot.asset}` });
      await expect(page.getByText("This page couldn't load")).toHaveCount(0);

      if (shot.fromTrips) {
        await page.getByRole('button', { name: 'Trips' }).click();
        await page.getByRole('button', { name: 'Play', exact: true }).first().click();
      } else {
        await page.getByRole('button', { name: 'History', exact: true }).click();
        if (shot.period) await page.getByRole('button', { name: shot.period, exact: true }).click();
        await page.getByRole('button', { name: 'Play this period' }).click();
      }
      await expect(page.getByTestId('trip-player')).toBeVisible();
      await expect(page.getByTestId('event-pins').getByRole('button').first()).toBeVisible();
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.screenshot({
        path: path.join(OUT, `${shot.name}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
}
