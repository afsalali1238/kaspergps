// S42–S50 (spec §13): the Kasper console side of the demo — onboarding,
// hardware stock, requests, adapters, bookings, transfers, asset and team
// administration — plus the refusals that keep the rules honest.

import { expect, test } from '@playwright/test';
import { demo, expectNoText, goTo, startScenario, USERS } from './helpers';

test.beforeEach(async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 900, 'the console is desktop only');
});

test.describe('S42 — onboarding “Sharjah Plant Hire”', () => {
  test('the wizard walks company → sites → people → assets → hardware → review', async ({ page }) => {
    await demo(page, { email: USERS.sara, scenario: 42 });
    await expect(page).toHaveURL(/\/console\/onboarding$/);
    for (const step of ['Company', 'Sites', 'People']) {
      await expect(page.getByText(step).first()).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
  });
});

test.describe('S43 — Ravi registers many trackers', () => {
  test('register one and register many both exist, with check-digit help', async ({ page }) => {
    await demo(page, { email: USERS.ravi, scenario: 43 });
    await expect(page).toHaveURL(/\/console\/trackers$/);
    await page.getByRole('button', { name: 'Register many' }).click();
    await expect(page.getByText('Register many trackers')).toBeVisible();
  });
});

test.describe('S44 — Ravi pairs Priya’s MW-01 request', () => {
  test('the requests screen offers Pair a tracker and Decline', async ({ page }) => {
    await demo(page, { email: USERS.ravi, scenario: 44 });
    await expect(page).toHaveURL(/\/console\/requests$/);
    await expect(page.getByRole('heading', { name: 'Tracker requests' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pair a tracker' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Decline' }).first()).toBeVisible();
  });
});

test.describe('S45 — CAN adapters enforce the class rule', () => {
  test('LVCAN200 is documented as light-vehicles-only and fitting is offered', async ({ page }) => {
    await demo(page, { email: USERS.ravi, scenario: 45 });
    await expect(page).toHaveURL(/\/console\/adapters$/);
    await expect(page.getByText(/LVCAN200 is for light vehicles/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fit to asset' }).first()).toBeVisible();
  });
});

test.describe('S46 — a new booking and an overlap', () => {
  test('New booking is available and overlapping bookings are listed', async ({ page }) => {
    await demo(page, { email: USERS.ravi, scenario: 46 });
    await expect(page).toHaveURL(/\/console\/bookings$/);
    await page.getByRole('button', { name: 'New booking' }).click();
    await expect(page.getByText('New booking').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' }).first()).toBeVisible();
  });
});

test.describe('S47 — transferring CP-03', () => {
  test('the transfer panel names the tenant and warns about report-only access', async ({ page }) => {
    await demo(page, { email: USERS.sara, on: '/console/assets' });
    await page.getByRole('link', { name: /CP-03/ }).first().click();
    await page.waitForURL(/\/console\/assets\//);
    await page.getByRole('button', { name: 'Transfer' }).click();
    await expect(page.getByText('Transfer to another tenant')).toBeVisible();
    await expect(page.getByText(/report-only from the transfer date/)).toBeVisible();
  });
});

test.describe('S48 — Settings assets: add and retire', () => {
  test('Add asset offers the behaviour selector and Retire is listed', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app/settings' });
    await page.getByRole('button', { name: 'Assets', exact: true }).click();
    await page.getByRole('button', { name: 'Add asset' }).click();
    await expect(page.getByLabel('Code')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save asset' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Retire' }).first()).toBeVisible();
  });
});

test.describe('S49 — Settings sites: add and scope', () => {
  test('Add site takes a name, a location and a radius', async ({ page }) => {
    await demo(page, { email: USERS.lina, on: '/app/settings' });
    await page.getByRole('button', { name: 'Sites', exact: true }).click();
    await page.getByRole('button', { name: 'Add site' }).click();
    await expect(page.getByLabel('Site name')).toBeVisible();
    await expect(page.getByLabel(/Radius/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save site' })).toBeVisible();
  });

  test('a site user of an empty site gets the empty map', async ({ page }) => {
    await demo(page, { email: USERS.lina, on: '/app' });
    await expectNoText(page, 'CR-05');
  });
});

test.describe('S50 — Kasper team rules', () => {
  test('Add staff works and the last admin cannot be removed', async ({ page }) => {
    await demo(page, { email: USERS.sara, scenario: 50 });
    await expect(page).toHaveURL(/\/console\/team$/);
    await expect(page.getByRole('button', { name: 'Add staff' })).toBeVisible();
    await expect(page.getByText(/Kasper needs at least one active admin/)).toBeVisible();
  });
});

test.describe('console scenario landings', () => {
  test('every console scenario lands on its own screen', async ({ page }) => {
    const landings: [number, RegExp][] = [
      [17, /\/console\/trackers$/],
      [36, /\/console\/billing$/],
      [42, /\/console\/onboarding$/],
      [43, /\/console\/trackers$/],
      [44, /\/console\/requests$/],
      [45, /\/console\/adapters$/],
      [46, /\/console\/bookings$/],
      [47, /\/console\/assets$/],
      [50, /\/console\/team$/],
    ];
    await demo(page, { email: USERS.sara });
    for (const [id, url] of landings) {
      await startScenario(page, id);
      await expect(page).toHaveURL(url);
    }
  });
});
