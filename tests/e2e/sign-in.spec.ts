import { test, expect } from '@playwright/test';
import { users, signInAs, signInAsEmirates, signInAsKasper, expectPath } from '../fixtures/helpers';

test.describe('Sign in', () => {
  test('ancient sign-in page renders', async ({ page }) => {
    await page.goto('/sign-in');
    await page.waitForSelector('input[type="email"]');
    await expect(page.locator('h1')).toContainText('Sign in');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Sign in")')).toBeVisible();
  });

  test('sign in as tenant admin redirects to /app', async ({ page }) => {
    await signInAs(page, users.emiratesAdmin.email);
    await expectPath(page, '/app');
    await expect(page.locator('h1')).toContainText('Fleet');
  });

  test('sign in as Kasper admin redirects to /console', async ({ page }) => {
    await signInAs(page, users.kasperAdmin.email);
    await expectPath(page, '/console');
    await expect(page.locator('h1')).toContainText('Kasper console');
  });

  test('sign in as different tenant shows that tenant\'s assets', async ({ page }) => {
    await signInAs(page, users.gulfliftAdmin.email);
    await expectPath(page, '/app');
    // Gulf Lift's crane should be visible
    await expect(page.locator('.marker-popup', { hasText: 'CR-02' })).toBeVisible();
  });

  test('invalid email shows error', async ({ page }) => {
    await page.goto('/sign-in');
    await page.fill('input[type="email"]', 'nonexistent@example.com');
    await page.fill('input[type="password"]', 'anypassword');
    await page.click('button:has-text("Sign in")');
    await expect(page.locator('text=You don\'t have an account')).toBeVisible();
  });
});
