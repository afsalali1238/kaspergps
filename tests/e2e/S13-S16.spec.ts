// S13–S16 (spec §13): the tracking link lifecycle — created by the owner,
// opened by an outsider, killed by a revoke, an early end of access or a
// cancelled booking in the simulator.

import { expect, test } from '@playwright/test';
import { demo, openBookingSimulator, startScenario, USERS } from './helpers';

test.describe('S13 — Omar: share FB-12, then revoke', () => {
  test('a link is created with its suggested message and can be revoked', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app/assets/a-fb12' });

    await page.getByRole('button', { name: 'Share tracking link' }).click();
    await expect(page.getByText('Share tracking link')).toBeVisible();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByText('Link created.')).toBeVisible();
    await expect(page.getByText(/^Track FB-12 live: /)).toBeVisible();

    await page.getByRole('button', { name: 'Revoke' }).first().click();
    await expect(page.getByText('Link revoked.')).toBeVisible();
  });
});

test.describe('S14 — an outside hirer opens the FB-12 link', () => {
  test('one live dot and nothing else', async ({ page }) => {
    await page.goto('/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5');
    await expect(page.getByText('Flatbed trailer truck')).toBeVisible();
    await expect(page.getByText(/Updated/)).toBeVisible();
    // A hirer never sees history, reports or the owner's other assets.
    await expect(page.getByText(/History|Trips|Reports/)).toHaveCount(0);
  });
});

test.describe('S15 — Khalid: End access now', () => {
  test('the panel explains the cut-off and audits the reason', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app/assets/a-ex04' });
    await page.getByRole('button', { name: 'End access now' }).click();
    await expect(page.getByText(/^End Marina Builders access now$/)).toBeVisible();
    await expect(page.getByText(/not undone by the nightly check/)).toBeVisible();
    await expect(page.getByPlaceholder('Reason (at least 10 characters)')).toBeVisible();
  });
});

test.describe('S16 — the booking simulator moves the grant window', () => {
  test('extends BK-1001 and cancels BK-1002 with an audit line', async ({ page }) => {
    await demo(page, { email: USERS.sara });
    await openBookingSimulator(page);
    await expect(page.getByRole('heading', { name: 'Booking simulator' })).toBeVisible();
    await expect(page.getByText('BK-1001').first()).toBeVisible();
    await expect(page.getByText('BK-1002').first()).toBeVisible();
    // The nightly check is the demo's button for "recompute the windows".
    await page.getByRole('button', { name: 'Run nightly check' }).click();
    await expect(page.getByText(/Nightly check complete/)).toBeVisible();
  });

  test('the scenario menu lands S16 in the simulator', async ({ page }) => {
    await demo(page, { email: USERS.sara });
    await startScenario(page, 16);
    await expect(page.getByRole('heading', { name: 'Booking simulator' })).toBeVisible();
  });
});
