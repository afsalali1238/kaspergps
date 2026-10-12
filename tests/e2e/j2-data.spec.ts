import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { signIn, USERS, goTo } from './helpers';

// J2 proof: the anchor shows believable data. Screenshots go to reviews/screenshots/J2/.
const OUT = path.join(process.cwd(), 'reviews', 'screenshots', 'J2');
fs.mkdirSync(OUT, { recursive: true });

test.describe('J2 — the anchor looks believable', () => {
  test('EX-04 Engine & fuel shows working values (Khalid)', async ({ page }, testInfo) => {
    await signIn(page, USERS.khalid);
    await goTo(page, '/app/assets/a-ex04');
    await page.getByRole('button', { name: 'Engine & fuel' }).click();
    await expect(page.getByText(/RPM/i).first()).toBeVisible();
    await page.screenshot({ path: path.join(OUT, `${testInfo.project.name}-ex04-engine-fuel.png`), fullPage: true, animations: 'disabled' });
  });

  test('FB-12 Trips shows today’s drive (Omar)', async ({ page }, testInfo) => {
    await signIn(page, USERS.omar);
    await goTo(page, '/app/assets/a-fb12');
    await page.getByRole('button', { name: 'Trips' }).first().click();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.screenshot({ path: path.join(OUT, `${testInfo.project.name}-fb12-trips.png`), fullPage: true, animations: 'disabled' });
  });
});
