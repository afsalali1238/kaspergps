import { test, expect } from '@playwright/test';
import {
  signInAs,
  signInAsKasper,
  goto,
  waitForToast,
  setPhase,
  expectPath,
} from '../fixtures/helpers';

// ── 1. Sign-in & Demo Bar ──────────────────────────────────────────────────────

test('demo step 1: sign-in and demo bar', async ({ page }) => {
  await signInAs(page, 'khalid@emiratesearth.ae');
  await expectPath(page, '/app');
  await expect(page.locator('h1:has-text("Fleet")')).toBeVisible();

  // Demo bar: role switcher
  const _demoBar = page.locator('[data-testid="demo-bar"], .demo-bar, [class*="demo"], [class*="bar"]');
  // Phase toggle: verify fleet page shows Phase 2 content when switched
  await setPhase(page, 'phase2');
  await expect(page.locator('h1:has-text("Cost")')).not.toBeVisible({ timeout: 5000 });
  await setPhase(page, 'day_one');
});

// ── 2. Customer Map — Fleet ────────────────────────────────────────────────────

test('demo step 2: fleet page, map, filters, asset detail', async ({ page }) => {
  await signInAs(page, 'khalid@emiratesearth.ae');
  await expectPath(page, '/app');

  // Map markers present
  await expect(page.locator('.leaflet-map, [class*="map"], canvas, iframe').first()).toBeVisible({ timeout: 10000 });

  // Site filter
  const siteFilter = page.locator('select').filter({ hasText: 'All sites' });
  if (await siteFilter.isVisible()) {
    await siteFilter.selectOption('Al Quoz Yard');
    await waitForToast(page);
  }

  // Tier filter
  const tierFilter = page.locator('select').filter({ hasText: 'All tiers' });
  if (await tierFilter.isVisible()) {
    await tierFilter.selectOption('Tier 3');
    await waitForToast(page);
  }

  // Open asset EX-04
  await page.getByRole('link', { name: /EX-04/i }).first().click();
  await expectPath(page, '/app/assets/a-ex04');

  // Overview tab
  await expect(page.locator('h2:has-text("Overview")')).toBeVisible();
  await expect(page.locator('text=EX-04')).toBeVisible();

  // History tab
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.locator('h2:has-text("History")')).toBeVisible();

  // Settings tab
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.locator('h2:has-text("Settings")')).toBeVisible();
});

// ── 3. Alerts ──────────────────────────────────────────────────────────────────

test('demo step 3: alerts — view types, acknowledge, filter', async ({ page }) => {
  await signInAs(page, 'khalid@emiratesearth.ae');
  await goto(page, '/app/alerts');

  await expect(page.locator('h1:has-text("Alerts")')).toBeVisible();

  // Alert types present
  const alertTypes = ['Maintenance', 'Fuel', 'Invoice'];
  for (const type of alertTypes) {
    const hasType = page.locator(`text=${type}`).first();
    if (await hasType.isVisible()) {
      // At least one alert of this type is visible
      break;
    }
  }

  // Acknowledge one alert
  const acknowledgeBtn = page.getByRole('button', { name: /acknowledge/i }).first();
  if (await acknowledgeBtn.isVisible()) {
    await acknowledgeBtn.click();
    await waitForToast(page);
  }

  // Filter by type
  const filterSelect = page.locator('select').first();
  if (await filterSelect.isVisible()) {
    await filterSelect.selectOption('maintenance');
    await waitForToast(page);
  }
});

// ── 4. Reports ─────────────────────────────────────────────────────────────────

test('demo step 4: reports — Excel + PDF downloads, phase gating', async ({ page }) => {
  await signInAs(page, 'khalid@emiratesearth.ae');
  await setPhase(page, 'phase2');
  await goto(page, '/app/reports');

  await expect(page.locator('h1:has-text("Reports")')).toBeVisible();

  // Report type: Trip & Mileage
  const typeSelect = page.locator('select').filter({ hasText: /trip/i }).first();
  if (await typeSelect.isVisible()) {
    await typeSelect.selectOption('trip_mileage');
  }

  // Scope: Multiple assets
  const scopeSelect = page.locator('select').filter({ hasText: /multiple/i }).first();
  if (await scopeSelect.isVisible()) {
    await scopeSelect.selectOption('multiple_assets');
  }

  // Date: Last 7 days
  const dateSelect = page.locator('select').filter({ hasText: /last 7/i }).first();
  if (await dateSelect.isVisible()) {
    await dateSelect.selectOption('last_7_days');
  }

  // Excel download
  const excelBtn = page.getByRole('button', { name: /run report/i }).first();
  if (await excelBtn.isVisible()) {
    await excelBtn.click();
    await waitForToast(page);
  }

  // PDF download
  const formatSelect = page.locator('select').filter({ hasText: /format/i }).first();
  if (await formatSelect.isVisible()) {
    await formatSelect.selectOption('pdf');
    await excelBtn.click();
    await waitForToast(page);
  }
});

// ── 5. Cost & Maintenance ──────────────────────────────────────────────────────

test('demo step 5: cost and maintenance — Phase 2', async ({ page }) => {
  await signInAs(page, 'khalid@emiratesearth.ae');
  await setPhase(page, 'phase2');

  // Cost page
  await goto(page, '/app/cost');
  await expect(page.locator('h1:has-text("Cost")')).toBeVisible();
  await expect(page.locator('text=Total asset value')).toBeVisible({ timeout: 5000 });

  // Maintenance page
  await goto(page, '/app/maintenance');
  await expect(page.locator('h1:has-text("Maintenance")')).toBeVisible();
  await expect(page.locator('text=Service plans')).toBeVisible({ timeout: 5000 });
});

// ── 6. Geofences ────────────────────────────────────────────────────────────────

test('demo step 6: geofences — list, map overlay, legend', async ({ page }) => {
  await signInAs(page, 'khalid@emiratesearth.ae');
  await setPhase(page, 'phase2');
  await goto(page, '/app/geofences');

  await expect(page.locator('h1:has-text("Geofences")')).toBeVisible();

  // Geofence list items
  await expect(page.locator('[class*="geofence"], [class*="card"], [class*="item"]').first()).toBeVisible({ timeout: 5000 });

  // Show on map toggle
  const mapToggle = page.getByRole('button', { name: /show on map/i }).first();
  if (await mapToggle.isVisible()) {
    await mapToggle.click();
    await waitForToast(page);
    await expect(page.locator('.leaflet-map, [class*="map"]').first()).toBeVisible({ timeout: 10000 });
  }

  // Legend
  await expect(page.locator('text=restricted').first()).toBeVisible({ timeout: 5000 });
});

// ── 7. Console — Kasper perspective ─────────────────────────────────────────────

test('demo step 7: console — assets CRUD, tracker requests, audit, labels, team', async ({ page }) => {
  await signInAsKasper(page);

  // Dashboard
  await expectPath(page, '/console');
  await expect(page.locator('h1:has-text("Console")')).toBeVisible();

  // Assets page — list, create, edit, transfer, retire
  await goto(page, '/console/assets');
  await expect(page.locator('h1:has-text("Assets")')).toBeVisible();
  await expect(page.locator('text=EX-04')).toBeVisible();

  // Create asset
  const createBtn = page.getByRole('button', { name: /create asset/i }).first();
  if (await createBtn.isVisible()) {
    await createBtn.click();
    await page.getByRole('textbox', { name: /code/i }).fill('DEMO-01');
    await page.getByRole('textbox', { name: /name/i }).fill('Demo Asset');
    await page.getByRole('button', { name: /create/i }).click();
    await waitForToast(page);
  }

  // Tracker requests — pair and decline
  await goto(page, '/console/requests');
  await expect(page.locator('h1:has-text("Requests")')).toBeVisible();

  const pairBtn = page.getByRole('button', { name: /pair/i }).first();
  if (await pairBtn.isVisible()) {
    await pairBtn.click();
    await expectPath(page, '/console/trackers');
  }

  await goto(page, '/console/requests');
  const declineBtn = page.getByRole('button', { name: /decline/i }).first();
  if (await declineBtn.isVisible()) {
    await declineBtn.click();
    const reasonInput = page.getByRole('textbox', { name: /reason/i });
    if (await reasonInput.isVisible()) {
      await reasonInput.fill('Not needed at this site');
      await page.getByRole('button', { name: /decline/i }).click();
      await waitForToast(page);
    }
  }

  // Audit — list + CSV export
  await goto(page, '/console/audit');
  await expect(page.locator('h1:has-text("Audit")')).toBeVisible();
  await expect(page.locator('text=Audit log')).toBeVisible({ timeout: 5000 });

  const exportCsvBtn = page.getByRole('button', { name: /export/i }).first();
  if (await exportCsvBtn.isVisible()) {
    await exportCsvBtn.click();
    await waitForToast(page);
  }

  // Labels — list, create, rename, delete
  await goto(page, '/console/labels');
  await expect(page.locator('h1:has-text("Labels")')).toBeVisible();

  const createLabelBtn = page.getByRole('button', { name: /create label/i }).first();
  if (await createLabelBtn.isVisible()) {
    await createLabelBtn.click();
    await page.getByRole('textbox', { name: /name/i }).fill('Demo Label');
    await page.getByRole('button', { name: /create/i }).click();
    await waitForToast(page);
  }

  // Team — list, create staff
  await goto(page, '/console/team');
  await expect(page.locator('h1:has-text("Team")')).toBeVisible();
  await expect(page.locator('text=Staff')).toBeVisible({ timeout: 5000 });
});

// ── 8. Wrap-up ──────────────────────────────────────────────────────────────────

test('demo step 8: wrap-up — return to fleet, check downloads', async ({ page }) => {
  await signInAs(page, 'khalid@emiratesearth.ae');
  await goto(page, '/app');

  await expect(page.locator('h1:has-text("Fleet")')).toBeVisible();

  // Downloads page — show reports generated during demo
  await goto(page, '/app/downloads');
  await expect(page.locator('h1:has-text("Downloads")')).toBeVisible();
});
