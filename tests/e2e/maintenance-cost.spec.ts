// Maintenance scheduling and Cost & ROI (spec 11.18 / 11.19).
// Covers: the board's three columns and alert lines, the asset-detail
// Maintenance tab, logging a service, the fleet view's labelled bases and
// totals row, the asset ROI panel, and who is allowed to see the cost screen.

import { expect, test } from '@playwright/test';
import { signIn, USERS } from './helpers';

test.describe('maintenance board', () => {
  test('sorts the fleet into overdue, due soon and ok with alert lines', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await page.goto('/app/maintenance');

    await expect(page.getByRole('heading', { name: 'Maintenance' })).toBeVisible();
    await expect(page.getByText(/^Overdue \(/)).toBeVisible();
    await expect(page.getByText(/^Due soon \(/)).toBeVisible();
    await expect(page.getByText(/^Ok \(/)).toBeVisible();
    // BD-02's plan is past its interval, EX-04's is inside the due-soon band.
    await expect(page.getByText(/Overdue — due at 14,950 h · ECU \(.+ over\)/)).toBeVisible();
    await expect(page.getByText(/Due at 8,500 h · ECU — \d+ h left/)).toBeVisible();
    // Tier 1/2 assets say how their hours were worked out.
    await expect(page.getByText(/Estimated \(ignition hours\)/).first()).toBeVisible();
    await expect(page.getByText('Maintenance overdue: BD-02 — 250 h service')).toBeVisible();
    // A Tier 3 fault code offers a one-off task.
    await expect(page.getByText('Fault codes needing a service task')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create service task' })).toBeVisible();
  });

  test('logs a service and resets the plan', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await page.goto('/app/maintenance');

    await page.getByRole('button', { name: 'Log service' }).first().click();
    await expect(page.getByText(/^Log service — /)).toBeVisible();
    await expect(page.getByText(/Prefilled from the current reading/)).toBeVisible();
    await page.getByLabel(/^Meter reading/).fill('15100');
    await page.getByLabel('Cost (AED)').fill('5400');
    await page.getByLabel('Notes').fill('Coolant sensor and hoses checked');
    await page.getByRole('button', { name: 'Log service', exact: true }).last().click();

    await expect(page.getByText('logged — the plan is reset.')).toBeVisible();
    await expect(page.getByText('Coolant sensor and hoses checked')).toBeVisible();
  });

  test('a Site User sees their own company read-only', async ({ page }) => {
    await signIn(page, USERS.mark);
    await page.goto('/app/maintenance');
    await expect(page.getByRole('heading', { name: 'Maintenance' })).toBeVisible();
    // Gulf Lift's plans only — no New plan / Log service buttons for a Site User.
    await expect(page.getByText('Annual crane inspection').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'New plan' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Log service' })).toHaveCount(0);
  });

  test('the asset detail page carries the plan and its history', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await page.goto('/app/assets/a-bd02');
    await page.getByRole('button', { name: 'Maintenance' }).click();
    await expect(page.getByText('Service plans')).toBeVisible();
    await expect(page.getByText('250 h service')).toBeVisible();
    await expect(page.getByText('Service history')).toBeVisible();
    await expect(page.getByText('250 h service — oil, filters, coolant top-up')).toBeVisible();
  });

  test('before the Later phase the screen is locked', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await page.goto('/');
    await page.getByRole('button', { name: /Day 1/ }).click();
    await page.goto('/app/maintenance');
    await expect(page.getByText('Not available')).toBeVisible();
    await expect(page.getByText(/arrives in the Later phase/)).toBeVisible();
  });
});

test.describe('cost & ROI', () => {
  test('shows the fleet view with a basis on every line and a totals row', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await page.goto('/app/cost');

    await expect(page.getByRole('heading', { name: 'Cost & ROI' })).toBeVisible();
    await expect(page.getByText('Draft')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Last month' })).toBeVisible();
    await expect(page.getByText(/diesel AED 3\.05\/L \(dummy\)/)).toBeVisible();
    // Emirates runs Tier 3 kit, so fuel and idle come off the ECU.
    await expect(page.getByText('ECU (ALL-CAN300)').first()).toBeVisible();
    await expect(page.getByText('From invoices').first()).toBeVisible();
    await expect(page.getByText('From service log').first()).toBeVisible();
    await expect(page.getByText('Dummy rate').first()).toBeVisible();
    await expect(page.getByText(/^Totals \(\d+ assets\)$/)).toBeVisible();
  });

  test('opens an asset for its chart, ROI and payback', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await page.goto('/app/cost');
    await page.getByText('EX-04', { exact: true }).first().click();

    await expect(page.getByText('Revenue vs cost — last 6 months')).toBeVisible();
    await expect(page.getByText('ROI to date')).toBeVisible();
    await expect(page.getByText('Payback estimate')).toBeVisible();
    await expect(page.getByText(/At the current rate/)).toBeVisible();
    await expect(page.getByText('Cost lines')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save cost profile' })).toBeVisible();
    await expect(page.getByText(/Diesel price \(AED\/L, company setting\)/)).toBeVisible();
  });

  test('is Kasper Admin and Tenant Admin only', async ({ page }) => {
    await signIn(page, USERS.ravi);
    await page.goto('/app/cost');
    await expect(page.getByText('Page not found')).toBeVisible();
    await expect(page.getByText("This page isn't available for your role.")).toBeVisible();

    await signIn(page, USERS.mark);
    await page.goto('/app/cost');
    await expect(page.getByText('Page not found')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cost & ROI' })).toHaveCount(0);
  });

  test('Kasper Admin can switch period and see another company’s assets', async ({ page }) => {
    await signIn(page, USERS.sara);
    await page.goto('/app/cost');
    await page.getByRole('button', { name: 'Last 3 months' }).click();
    await expect(page.getByText('Last 3 months').first()).toBeVisible();
    await expect(page.getByText('CR-08', { exact: true }).first()).toBeVisible();
  });
});
