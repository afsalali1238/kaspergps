// H1 proof: the landing map loads for each customer user with no crash and no
// console errors. Failed OpenStreetMap tile requests are expected offline and
// are ignored; anything else is a failure. (main crashed here for every user.)
import { test, expect } from '@playwright/test';
import { USERS, signIn } from './helpers';

const TILE_HOST = /tile\.openstreetmap\.org/;

for (const key of ['omar', 'lina', 'khalid', 'fatima', 'sara'] as const) {
  test(`/app loads for ${key} with no error boundary and no console errors`, async ({ page }) => {
    const errors: string[] = [];
    // Chromium reports a refused tile request as "Failed to load resource" with no URL
    // in the text, so the request's own URL decides: tile failures are expected offline.
    const failedTiles = new Set<string>();
    page.on('requestfailed', req => {
      if (TILE_HOST.test(req.url())) failedTiles.add(req.url());
    });
    page.on('console', msg => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      const at = msg.location().url;
      if (TILE_HOST.test(at)) return;
      if (/Failed to load resource/.test(text) && failedTiles.size > 0) return;
      errors.push(text);
    });
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));

    await signIn(page, USERS[key]);
    await page.goto('/app');
    await expect(page.getByText("This page couldn't load")).toHaveCount(0);
    // .first(): any one of the map, the tiles or <main> being visible is the check.
    await expect(page.locator('.leaflet-container, [data-testid="today-tiles"], main').first()).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
