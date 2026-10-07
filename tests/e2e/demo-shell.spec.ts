// Sign-in, the demo bar and the console shell (spec 10, 11.9).
// Covers: each role lands on its own home, customers get "Page not found" on
// console routes, the console is desktop-only, and the Tools menu keeps the
// two demo-runner views (audit log Demo view, simulated email outbox).

import { expect, test } from '@playwright/test';
import { openTools, signIn, USERS } from './helpers';

test.describe('sign-in and role homes', () => {
  test('Kasper staff land in the console, customers in the app', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, 'the console is desktop only');
    await signIn(page, USERS.sara);
    await expect(page).toHaveURL(/\/console$/);
    await expect(page.getByText('Kasper Console')).toBeVisible();

    await signIn(page, USERS.khalid);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText('Emirates Earthmovers').first()).toBeVisible();
  });

  test('a customer never sees the console', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await page.goto('/console');
    await expect(page.getByText('Page not found')).toBeVisible();
    await expect(page.getByText('The console is only for Kasper staff.')).toBeVisible();
    // No console chrome leaks through.
    await expect(page.getByText('Kasper Console')).toHaveCount(0);
  });

  test('the console tells narrow screens to come back on a computer', async ({ page }) => {
    await signIn(page, USERS.sara);
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto('/console');
    await expect(page.getByText('Open the console on a computer.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tenants' })).toHaveCount(0);
  });

  test('the console nav only lists what the role can open', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, 'the console is desktop only');
    await signIn(page, USERS.sara);
    for (const label of ['Tenants', 'Assets', 'Trackers', 'CAN adapters', 'Bookings', 'Requests', 'Billing', 'Kasper team', 'Import', 'Audit log']) {
      await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
    }

    // Ops: no billing, no Kasper team, no audit log (spec 5.1).
    await signIn(page, USERS.ravi);
    await expect(page.getByRole('link', { name: 'Trackers', exact: true })).toBeVisible();
    for (const label of ['Billing', 'Kasper team', 'Audit log']) {
      await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0);
    }
    await page.goto('/console/billing');
    await expect(page.getByText("Billing is for Kasper Admin — Ops can't see it.")).toBeVisible();
  });
});

test.describe('demo bar tools', () => {
  test('carries the booking simulator, access explorer, audit view and outbox', async ({ page }) => {
    await signIn(page, USERS.sara);
    await openTools(page);
    await expect(page.getByRole('button', { name: /\/dev\/bookings/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /\/dev\/access/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Audit log \(Demo view\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Email outbox \(simulated\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Tamper with a stored certificate/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Reset demo data/ })).toBeVisible();
  });

  test('the audit view is read-only and labelled as such', async ({ page }) => {
    await signIn(page, USERS.khalid); // not Kasper: the normal audit page is closed to them
    await page.goto('/dev/audit');
    await expect(page.getByText('Demo view')).toBeVisible();
    await expect(page.getByText(/Read-only/)).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'When' })).toBeVisible();
  });

  test('the email outbox lists what Kasper would have sent', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await page.goto('/dev/outbox');
    await expect(page.getByText('Simulated')).toBeVisible();
    await expect(page.getByText(/scheduled report and alert email/)).toBeVisible();
    await expect(page.getByText(/Report|Alert/).first()).toBeVisible();
  });

  test('reset asks twice, clears the switches and keeps the user signed in', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, 'the console is desktop only');
    await signIn(page, USERS.sara);
    await page.getByRole('button', { name: /^Day 1$/ }).click();
    await openTools(page);
    await page.getByRole('button', { name: 'Reset demo data' }).click();
    await expect(page.getByRole('button', { name: /Click again — this clears every demo change/ })).toBeVisible();
    await page.getByRole('button', { name: /Click again/ }).click();
    await page.waitForLoadState('load');
    // Back to the default phase and still in the console.
    await expect(page.getByRole('button', { name: /^Later$/ })).toBeVisible();
    await expect(page.getByText('Kasper Console')).toBeVisible();
  });
});
