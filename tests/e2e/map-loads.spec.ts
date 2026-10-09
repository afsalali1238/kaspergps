// H1 proof: the landing map loads for each customer user with no crash and no
// console errors. Failed OpenStreetMap tile requests are expected offline and
// are ignored; anything else is a failure. (main crashed here for every user.)
import { test, expect } from '@playwright/test';
import { USERS, signIn } from './helpers';

const IGNORED = [/tile\.openstreetmap\.org/, /Failed to load resource.*(tile|openstreetmap)/i];

for (const key of ['omar', 'lina', 'khalid', 'fatima', 'sara'] as const) {
  test(`/app loads for ${key} with no error boundary and no console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (IGNORED.some(re => re.test(text))) return;
      errors.push(text);
    });
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));

    await signIn(page, USERS[key]);
    await page.goto('/app');
    await expect(page.getByText("This page couldn't load")).toHaveCount(0);
    await expect(page.locator('.leaflet-container, [data-testid="today-tiles"], main')).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
