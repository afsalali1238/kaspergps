// S23–S30 (spec §13): multiple sites, labels, geofences, trip playback,
// arrival time and the schedules/downloads loop.

import { expect, test } from '@playwright/test';
import { demo, expectNoText, goTo, jumpTo, startScenario, USERS } from './helpers';

test.describe('S23 — John: two sites in one login', () => {
  test('the Site filter lists both sites and excludes other companies', async ({ page }) => {
    await demo(page, { email: USERS.omar, scenario: 23 });
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText('Site:')).toBeVisible();
    await page.getByText('Site:').click();                    // open the site filter
    await expect(page.getByRole('option', { name: /Business Bay/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /JVC Villas/ })).toBeVisible();
    await expect(page.getByText('CR-02', { exact: true }).first()).toBeVisible();
    await expectNoText(page, 'EX-04');
  });
});

test.describe('S24 — Khalid labels two assets “Project Alpha”', () => {
  test('the label filter is owner-side and invisible to the renter', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app' });
    await expect(page.getByText('Project Alpha').first()).toBeVisible();
    await page.getByRole('button', { name: 'Project Alpha' }).first().click();
    await expect(page.getByText('EX-04', { exact: true }).first()).toBeVisible();

    await startScenario(page, 4);                              // Lina
    await expect(page.getByText('Project Alpha')).toHaveCount(0);
  });
});

test.describe('S25–S26 — geofences', () => {
  test('Palm Crescent is on Fatima’s screen and off Khalid’s', async ({ page }) => {
    await demo(page, { email: USERS.fatima, scenario: 25 });
    await expect(page).toHaveURL(/\/app\/geofences$/);
    await expect(page.getByText('Palm Crescent')).toBeVisible();
    await expect(page.getByText(/Events \(7d\): \d+/).first()).toBeVisible();

    await startScenario(page, 26);
    await expect(page).toHaveURL(/\/app\/geofences$/);
    await expect(page.getByText('Palm Crescent')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create geofence' })).toBeVisible();
  });

  test('a geofence can be created with a name and a shape', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app/geofences' });
    await page.getByRole('button', { name: 'Create geofence' }).click();
    await page.getByLabel('Name').fill('Hatta Quarry — gate');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByText('Geofence created')).toBeVisible();
    await expect(page.getByText('Hatta Quarry — gate')).toBeVisible();
  });
});

test.describe('S27–S28 — playback', () => {
  test('WT-07 opens its Trips tab with the no-trips fallback', async ({ page }) => {
    await demo(page, { email: USERS.omar, scenario: 27 });
    await expect(page).toHaveURL(/\/app\/assets\/a-wt07$/);
    await page.getByRole('button', { name: 'Trips' }).click();
    await expect(page.getByText('Trips', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Trips start when ignition is on/)).toBeVisible();
  });

  test('a renter’s playback is clipped to the rental window', async ({ page }) => {
    await demo(page, { email: USERS.lina, on: '/app/assets/a-ex04' });
    await expect(page.getByText(/^History starts /)).toBeVisible();
  });
});

test.describe('S29 — the public arrival time', () => {
  test('shows the arrival line and stays without history', async ({ page }) => {
    await page.goto('/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5');
    await expect(page.getByText(/Arriving about \d{2}:\d{2}|Arrived \d{2}:\d{2}|ETA unavailable/)).toBeVisible();
    await expect(page.getByText(/Destination:/)).toBeVisible();
    await expect(page.getByText(/Route|History/)).toHaveCount(0);
  });
});

test.describe('S30 — schedules and downloads', () => {
  test('Lina can open Schedules and see her downloads', async ({ page }) => {
    await demo(page, { email: USERS.lina, scenario: 30 });
    await expect(page).toHaveURL(/\/app\/schedules$/);
    await expect(page.getByRole('heading', { name: 'Schedules' })).toBeVisible();

    await goTo(page, '/app/downloads');
    await expect(page.getByRole('heading', { name: 'Downloads' })).toBeVisible();
    await expect(page.getByText(/Download again|No downloads/).first()).toBeVisible();
  });

  test('the clock preset for the end of EX-04’s rental exists', async ({ page }) => {
    await demo(page, { email: USERS.lina, on: '/app' });
    await jumpTo(page, 'EX-04 rental ends');
    await expect(page.getByRole('button', { name: 'Clock' })).toBeVisible();
  });
});
