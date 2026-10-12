// Trip playback (spec §11.15): normal motion plays on its own; reduced motion
// starts paused and steps instead, and never runs by itself.
import { expect, test } from '@playwright/test';
import { demo, USERS } from './helpers';

test.beforeEach(async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 900, 'the player is laid out for desktop');
});

test.describe('playback with normal motion', () => {
  test('Play runs the trip and the button becomes Pause', async ({ page }) => {
    await demo(page, { email: USERS.omar, scenario: 27 });
    await page.getByRole('button', { name: 'Trips' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    // The row's Play opens the player; its own toggle is the first Play on the page.
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  });
});

test.describe('playback with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the player starts stepped, never runs by itself, and offers Step 5 min', async ({ page }) => {
    await demo(page, { email: USERS.omar, scenario: 27 });
    await page.getByRole('button', { name: 'Trips' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Step 5 min' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);
  });
});

test.describe('event pins and Play this period (spec 11.3, 11.15)', () => {
  test('S27: a 7-day History period opens playback; the over-speed pin jumps to 104 km/h', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app/assets/a-wt07' });
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page.getByRole('button', { name: '7 days', exact: true }).click();
    await page.getByRole('button', { name: 'Play this period' }).click();
    const pin = page.getByRole('button', { name: /^Over speed 104 km\/h at / });
    await expect(pin).toBeVisible();
    await pin.click();
    await expect(page.getByTestId('playback-readout')).toContainText('104 km/h');
  });

  test('S28: Lina plays EX-04 inside her rental; AdBlue reads Not measured and RPM is shown', async ({ page }) => {
    await demo(page, { email: USERS.lina, on: '/app/assets/a-ex04' });
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page.getByRole('button', { name: 'Play this period' }).click();
    const readout = page.getByTestId('playback-readout');
    await expect(readout.locator('dt', { hasText: 'RPM' })).toBeVisible();
    await expect(readout.locator('dt', { hasText: 'AdBlue' }).locator('xpath=following-sibling::dd')).toHaveText('Not measured');
  });
});
