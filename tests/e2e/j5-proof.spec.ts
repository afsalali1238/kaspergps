// J5 proof: the screens the J5 self-check names, captured at the two review widths
// (1440 px and 390 px) into reviews/screenshots/J5/ as <name>-<width>.png
// (BUILD_PROMPT.md §10.2, §11.3, §11.5; HANDOFF J5 items 1–4).
//
//   features-panel-<user>    J5.2 — who you are, what you can do, the hardware in view
//   engine-fuel-<asset>      J5.3 — engine hours with their source, the 7-day fuel chart, faults
//   map-<user>               J5.4 — desktop list beside the map; phone Map | List tabs
//   hirer-tracking           J5.1 — the public link: one marker, the ETA line
//
// It runs in the desktop project only: it sets both widths itself, and the console
// screens are desktop-only anyway. Every shot is also a smoke test — a page that
// throws or shows the error boundary fails the capture instead of saving a blank.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { demo, USERS } from './helpers';

const OUT = path.resolve('reviews/screenshots/J5');
const WIDTHS = [1440, 390] as const;
const TILE_HOST = /tile\.openstreetmap\.org/;

type Shot = {
  name: string;
  email: string;
  /** Tab to open on an asset detail page (exact button name). */
  tab?: string;
  /** Open the demo bar's Features panel after the page settles. */
  features?: boolean;
  /** Phone-width map: which of the Map | List tabs to select (at 390 px only). */
  phoneTab?: 'Map' | 'List';
};

const SHOTS: Shot[] = [
  // J5.2 — the Features panel for three different kinds of viewer (spec §10.2).
  { name: 'features-panel-omar', email: USERS.omar, features: true },
  { name: 'features-panel-lina', email: USERS.lina, features: true },
  { name: 'features-panel-mark', email: USERS.mark, features: true },
  // J5.3 — the Engine & fuel tab: ECU hours, the refuel/drop chart, fault codes in words.
  { name: 'engine-fuel-ex04', email: USERS.khalid, tab: 'Engine & fuel' },
  { name: 'engine-fuel-gn01', email: USERS.khalid, tab: 'Engine & fuel' },
  { name: 'engine-fuel-bd02', email: USERS.priya, tab: 'Engine & fuel' },
  { name: 'engine-fuel-gr01', email: USERS.khalid, tab: 'Engine & fuel' },
  // J5.4 — the map at the two review widths (phone: Map | List tabs).
  { name: 'map-omar', email: USERS.omar, phoneTab: 'Map' },
  { name: 'map-omar-list', email: USERS.omar, phoneTab: 'List' },
];

/** Asset detail pages of the engine shots, mapped by shot name. */
const ASSETS: Record<string, string> = {
  'engine-fuel-ex04': '/app/assets/a-ex04',
  'engine-fuel-gn01': '/app/assets/a-gn01',
  'engine-fuel-bd02': '/app/assets/a-bd02',
  'engine-fuel-gr01': '/app/assets/a-gr01',
};

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    if (TILE_HOST.test(msg.location().url)) return;
    if (/Failed to load resource/.test(msg.text())) return;
    errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
  return errors;
}

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

for (const shot of SHOTS) {
  for (const width of WIDTHS) {
    // The Map | List tabs are a phone idea: one shot at 390 px is enough.
    if (shot.phoneTab && width !== 390) continue;
    test(`${shot.name} at ${width} px`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'screenshots are taken once, in the desktop project');
      const errors = collectErrors(page);
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await demo(page, { email: shot.email, on: ASSETS[shot.name] ?? '/app' });
      await expect(page.getByText("This page couldn't load")).toHaveCount(0);

      if (shot.tab) {
        await page.getByRole('button', { name: shot.tab, exact: true }).first().click();
        await expect(page.getByTestId('engine-tiles')).toBeVisible();
      }
      if (shot.features) {
        await page.getByRole('button', { name: 'Features', exact: true }).click();
        await expect(page.getByTestId('features-panel')).toBeVisible();
        await expect(page.getByTestId('features-hardware')).toBeVisible();
      }
      if (shot.phoneTab) {
        // List is the default at phone width; the Map shot has to ask for the map.
        await page.getByRole('tab', { name: shot.phoneTab }).click();
        await page.getByRole('tab', { name: shot.phoneTab }).and(page.locator('[aria-selected="true"]')).waitFor();
        if (shot.phoneTab === 'List') await expect(page.getByTestId('asset-list')).toBeVisible();
      }
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.screenshot({
        path: path.join(OUT, `${shot.name}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      expect(errors, errors.join('\n')).toEqual([]);
    });
  }
}

// J5.1 — the public link the hirer opens: the marker, the arrival line and the update time.
for (const width of WIDTHS) {
  test(`hirer-tracking at ${width} px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'screenshots are taken once, in the desktop project');
    const errors = collectErrors(page);
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await demo(page, { on: '/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5' });
    await expect(page.getByText('Arrival')).toBeVisible();
    await expect(page.getByText(/Arriving about|Arrived/)).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.screenshot({
      path: path.join(OUT, `hirer-tracking-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
