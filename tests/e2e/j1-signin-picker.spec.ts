import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { stubTiles } from './helpers';

// J1 proof: the sign-in dropdown, and that the demo menus are not clipped.
// Screenshots go to reviews/screenshots/J1/<project>-<name>.png.

const OUT = path.join(process.cwd(), 'reviews', 'screenshots', 'J1');
fs.mkdirSync(OUT, { recursive: true });

/** True when the element at the centre of `locator` is the element itself or inside it. */
async function isHitTestable(page: Page, locator: ReturnType<Page['locator']>): Promise<boolean> {
  const box = await locator.boundingBox();
  if (!box) return false;
  return page.evaluate(
    ({ x, y, sel }) => {
      const top = document.elementFromPoint(x, y);
      const target = document.querySelector(sel);
      return !!top && !!target && (top === target || target.contains(top));
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2, sel: await locator.evaluate(el => {
        el.setAttribute('data-j1-probe', '1');
        return '[data-j1-probe="1"]';
      }) }
  );
}

test.describe('J1 — sign-in dropdown', () => {
  test('choosing Deepa signs her in', async ({ page }) => {
    await stubTiles(page);
    await page.goto('/sign-in');
    await page.locator('#signin-user').selectOption('u-deepa');
    await page.getByRole('button', { name: 'Sign in as Deepa Shah' }).click();
    await page.waitForURL(/\/app(\/|$)/);
    await expect(page.getByRole('button', { name: 'View as' })).toContainText('Deepa Shah');
  });

  test('choosing Karim is refused with the account message', async ({ page }) => {
    await stubTiles(page);
    await page.goto('/sign-in');
    await page.locator('#signin-user').selectOption('u-karim');
    await page.getByRole('button', { name: 'Sign in as Karim Old' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'no longer active' })).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('choosing Sam, who is invited, welcomes him and lands in the app', async ({ page }) => {
    await stubTiles(page);
    await page.goto('/sign-in');
    await page.locator('#signin-user').selectOption('u-sam');
    await page.getByRole('button', { name: 'Sign in as Sam Invite' }).click();
    await expect(page.getByRole('status')).toBeVisible();
    await page.waitForURL(/\/app(\/|$)/, { timeout: 15_000 });
  });
});

test.describe('J1 — demo menus are not clipped', () => {
  test('sign-in picker, View as and Scenarios open as full dropdowns', async ({ page }, testInfo) => {
    const tag = testInfo.project.name;
    await stubTiles(page);
    await page.goto('/sign-in');
    await expect(page.locator('#signin-user')).toBeVisible();
    await page.screenshot({ path: path.join(OUT, `${tag}-signin-picker.png`), fullPage: true, animations: 'disabled' });


    // Sign in as Omar, then open View as and Scenarios from the demo bar.
    await page.locator('#signin-user').selectOption('u-omar');
    await page.getByRole('button', { name: 'Sign in as Omar Saleh' }).click();
    await page.waitForURL(/\/app(\/|$)/);

    await page.getByRole('button', { name: 'View as' }).click();
    const search = page.getByPlaceholder('Search users…');
    await expect(search).toBeVisible();
    expect(await isHitTestable(page, search)).toBe(true);
    await page.screenshot({ path: path.join(OUT, `${tag}-view-as-open.png`), animations: 'disabled' });
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Scenarios' }).click();
    const s1 = page.getByRole('button', { name: /^S1\b/ }).first();
    await expect(s1).toBeVisible();
    expect(await isHitTestable(page, s1)).toBe(true);
    await page.screenshot({ path: path.join(OUT, `${tag}-scenarios-open.png`), animations: 'disabled' });
  });
});
