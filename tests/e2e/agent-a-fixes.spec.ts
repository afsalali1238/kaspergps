// Agent A / U0 bug fixes (PR #29).
//
//   1. Billing opens on the first tab that has content, not a hard-coded tab.
//   2. Settings → Users hides Deactivate on your own row (team.ts refuses it too;
//      src/server/team.test.ts covers the API).
//   3. Reports carries no "Day one" / "Phase 2" labels under the report types.
//   4. Certificates keeps every action in one Actions cell: one <tr> per
//      certificate, and "Voided" only in the Status column.
//
// The tab assertion reads aria-current rather than a colour class, so a later
// restyle of the tab bar doesn't break it.

import { expect, test } from '@playwright/test';
import { signIn, USERS } from './helpers';

const VOIDED_CERT = 'MUC-2026-09-WL-03-01';

test.describe('U0.1 — Billing opens on a tab that has something in it', () => {
  test('Khalid (issues, receives nothing) lands on Issued', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await page.goto('/app/billing');

    await expect(page.locator('button[aria-current="true"]')).toHaveText('Issued');
    // The empty Received state is not what greets him.
    await expect(page.getByText('Nothing received')).toHaveCount(0);
    // ...and the Issued table is: its first row offers Record payment.
    await page.getByRole('button', { name: /^Actions for INV-/ }).first().click();
    await expect(page.getByRole('menuitem', { name: 'Record payment' })).toBeVisible();
  });

  test('Lina (renter with received invoices) lands on Received', async ({ page }) => {
    await signIn(page, USERS.lina);
    await page.goto('/app/billing');

    await expect(page.locator('button[aria-current="true"]')).toHaveText('Received');
    await expect(page.getByText('Nothing received')).toHaveCount(0);
  });

  test('Sara (Kasper) lands on Issued', async ({ page }) => {
    await signIn(page, USERS.sara);
    await page.goto('/app/billing');

    await expect(page.locator('button[aria-current="true"]')).toHaveText('Issued');
  });

  test('picking an empty tab keeps it open', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await page.goto('/app/billing');

    await page.getByRole('button', { name: 'Received', exact: true }).click();
    await expect(page.locator('button[aria-current="true"]')).toHaveText('Received');
    await expect(page.getByText('Nothing received')).toBeVisible();
  });
});

test.describe('U0.2 — you can’t deactivate yourself', () => {
  test('your own row in Settings → Users has no Deactivate button', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await page.goto('/app/settings');

    const myRow = page.locator('tr[data-user-id="u-khalid"]');
    await expect(myRow).toBeVisible();
    await expect(myRow.getByRole('button', { name: 'Deactivate' })).toHaveCount(0);
  });

  test('another admin’s row still offers Deactivate, your own still does not', async ({ page }) => {
    await signIn(page, USERS.omar);
    await page.goto('/app/settings');

    await expect(page.locator('tr[data-user-id="u-hessa"]').getByRole('button', { name: 'Deactivate' })).toBeVisible();
    await expect(page.locator('tr[data-user-id="u-omar"]').getByRole('button', { name: 'Deactivate' })).toHaveCount(0);
  });

  test('deactivating somebody else works and says so', async ({ page }) => {
    await signIn(page, USERS.omar);
    await page.goto('/app/settings');

    const row = page.locator('tr[data-user-id="u-hessa"]');
    await row.getByRole('button', { name: 'Deactivate' }).click();
    // Deactivate asks first (H2: ConfirmDialog).
    await page.getByRole('alertdialog').getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByRole('status').filter({ hasText: /deactivated/ })).toBeVisible();
    // The row flips to Reactivate, and your own row is untouched.
    await expect(page.locator('tr[data-user-id="u-hessa"]').getByRole('button', { name: 'Reactivate' })).toBeVisible();
    await expect(page.locator('tr[data-user-id="u-omar"]').getByRole('button', { name: 'Deactivate' })).toHaveCount(0);
  });
});

test.describe('U0.3 — no phase labels under the report types', () => {
  test('the report types are listed without "Day one" or "Phase 2"', async ({ page }) => {
    await signIn(page, USERS.omar);
    await page.goto('/app/reports');

    // The types themselves are still there.
    await expect(page.getByText('Trip & Mileage')).toBeVisible();
    await expect(page.getByText('Location history')).toBeVisible();

    // The phase ladder is gone from the copy.
    await expect(page.getByText('Day one', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Phase 2', { exact: true })).toHaveCount(0);
  });
});

test.describe('U0.4 — one Actions cell per certificate', () => {
  test('every certificate is exactly one table row', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await page.goto('/app/certificates');

    const certificates = page.locator('tr[data-muc-number]');
    const total = await certificates.count();
    expect(total).toBeGreaterThan(0);
    // No action row underneath: the body holds nothing but certificates.
    await expect(page.locator('table tbody tr')).toHaveCount(total);
    // And no cell spans the table any more.
    await expect(page.locator('table td[colspan]')).toHaveCount(0);
  });

  test('View sits in the row; Void and the Verify link are in its row menu', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await page.goto('/app/certificates');

    const row = page.locator('tr[data-muc-number="MUC-2026-09-EX-04-01"]');
    await expect(row.getByRole('button', { name: 'View' })).toBeVisible();
    await row.getByRole('button', { name: /^Actions for MUC-2026-09-EX-04-01/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Void' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Verify link' })).toBeVisible();
  });

  test('a voided certificate says Voided once, and offers Reissue', async ({ page }) => {
    await signIn(page, USERS.khalid);
    await page.goto('/app/certificates');

    const row = page.locator(`tr[data-muc-number="${VOIDED_CERT}"]`);
    await expect(row).toBeVisible();
    // Status only — the Actions cell used to repeat it.
    await expect(row.getByText('Voided', { exact: true })).toHaveCount(1);
    await expect(row.getByRole('button', { name: 'View' })).toHaveCount(0);
    await row.getByRole('button', { name: /^Actions for / }).click();
    await expect(page.getByRole('menuitem', { name: 'Reissue' })).toBeVisible();
  });
});
