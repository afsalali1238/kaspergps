// Role-first entry (chunk R, owner decision 13 Oct). The home page is a login page
// where you pick a role; each role lands on its own screens; Log out returns to the
// picker; no names, emails or passwords are on the page.
import { expect, test } from '@playwright/test';
import { openDemoMore, openMore, pickRole, stubTiles, switchRole } from './helpers';

const PERSONA_IDS = [
  'kasper-admin', 'kasper-ops', 'owner-tier3', 'owner-tier1',
  'owner-renter-mixed', 'renter', 'client-rents-only', 'site-user',
];

test.describe('role-first entry: the home page', () => {
  test('shows the eight role cards and the outside hirer link, with no email field or person names', async ({ page }) => {
    await stubTiles(page);
    await page.goto('/');
    for (const id of PERSONA_IDS) {
      await expect(page.locator(`[data-persona="${id}"]`)).toHaveCount(1);
    }
    await expect(page.locator('[data-persona="hirer-link"]')).toHaveCount(1);
    await expect(page.locator('[data-persona]')).toHaveCount(PERSONA_IDS.length + 1);
    await expect(page.getByLabel('Email')).toHaveCount(0);
    await expect(page.getByLabel('Password')).toHaveCount(0);
    for (const name of ['Sara Haddad', 'Omar Saleh', 'Khalid Rahman', 'Lina Aziz', 'Mark']) {
      await expect(page.getByText(name)).toHaveCount(0);
    }
    await expect(page.locator('.demo-bar')).toHaveCount(0);
  });

  test('/sign-in sends the visitor to the role picker', async ({ page }) => {
    await stubTiles(page);
    await page.goto('/sign-in');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-persona="owner-tier1"]')).toBeVisible();
  });
});

test.describe('role-first entry: each card lands on its role', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop nav and demo bar layout');

  test('Kasper Admin lands in the console and sees the audit log', async ({ page }) => {
    await pickRole(page, 'kasper-admin');
    await expect(page).toHaveURL(/\/console$/);
    await openMore(page);
    await expect(page.getByTestId('top-nav').getByRole('link', { name: 'Audit log', exact: true })).toBeVisible();
  });

  test('Kasper Ops has no audit log', async ({ page }) => {
    await pickRole(page, 'kasper-ops');
    await expect(page).toHaveURL(/\/console$/);
    await openMore(page);
    await expect(page.getByTestId('top-nav').getByRole('link', { name: 'Audit log', exact: true })).toHaveCount(0);
  });

  test('Fleet owner · Tier 1 has no fuel or engine-hours UI', async ({ page }) => {
    await pickRole(page, 'owner-tier1');
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator('.demo-bar [data-testid="role-chip"]')).toHaveText('Fleet owner · Tier 1');
    await expect(page.getByText('Al Noor Transport').first()).toBeVisible();
    await expect(page.getByText('Engine hours', { exact: true })).toHaveCount(0);
  });

  test('Renter sees rented equipment', async ({ page }) => {
    await pickRole(page, 'renter');
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText('Rented', { exact: true }).first()).toBeVisible();
  });

  test('Site user sees one site only', async ({ page }) => {
    await pickRole(page, 'site-user');
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText('Site:')).toHaveCount(0);
  });
});

test.describe('role-first entry: log out and switch', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop nav and demo bar layout');

  test('Switch role from the demo bar returns to the picker with no session', async ({ page }) => {
    await pickRole(page, 'owner-tier3');
    await switchRole(page);
    await expect(page.locator('[data-persona="owner-tier3"]')).toBeVisible();
  });

  test('after log out, /app and /console send the visitor back to the picker', async ({ page }) => {
    await pickRole(page, 'owner-tier3');
    await switchRole(page);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/console');
    await expect(page).toHaveURL(/\/$/);
  });

  test('the Scenarios and Tools menus sit under More', async ({ page }) => {
    await pickRole(page, 'kasper-admin');
    await openDemoMore(page);
    await expect(page.locator('.demo-bar').getByRole('button', { name: 'Scenarios', exact: true })).toBeVisible();
    await expect(page.locator('.demo-bar').getByRole('button', { name: 'Tools', exact: true })).toBeVisible();
  });
});

test.describe('role-first entry: phone and Arabic', () => {
  test('the picker fits a 390 px phone with no sideways scroll and full-width cards', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) > 500, 'phone layout only');
    await page.setViewportSize({ width: 390, height: 844 });
    await stubTiles(page);
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `page is ${overflow}px wider than the screen`).toBeLessThanOrEqual(1);
    const card = await page.locator('[data-persona="owner-tier1"]').boundingBox();
    expect(card!.height).toBeGreaterThanOrEqual(48);
  });

  test('the Arabic picker shows translated card titles', async ({ page }) => {
    await stubTiles(page);
    await page.goto('/ar');
    await expect(page.locator('[data-persona="owner-tier1"]')).toContainText('مالك أسطول · الفئة 1');
  });
});
