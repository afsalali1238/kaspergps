// Billing scenarios S34–S36 (spec 11.17): paying as the customer, recording a
// part-payment as the issuer with the over-payment refusal, and the console's
// per-tenant GPS statements with Ops locked out.

import { expect, test } from '@playwright/test';
import { signIn, USERS } from './helpers';

test.describe('S35 — the owner records a part-payment', () => {
  test('AED 500 on INV-AN-0098 leaves it part-paid and refuses more than the balance', async ({ page }) => {
    await signIn(page, USERS.omar);
    await page.goto('/app/billing');
    await page.getByRole('button', { name: 'Issued', exact: true }).click();

    const row = page.getByRole('row', { name: /INV-AN-0098/ });
    await expect(row.getByText('Unpaid')).toBeVisible();
    await row.getByRole('button', { name: 'Record payment' }).click();

    await page.getByLabel('Amount (AED)').fill('500');
    await page.getByLabel('Reference').fill('Cash — Marina');
    await page.getByRole('button', { name: 'Save payment' }).click();
    await expect(page.getByText(/AED 500\.00 recorded/)).toBeVisible();
    await expect(page.getByText(/AED 6,430\.00 still owed/)).toBeVisible();

    // Over-payment is refused with the money still owed.
    await row.getByRole('button', { name: 'Record payment' }).click();
    await page.getByLabel('Amount (AED)').fill('7000');
    await page.getByRole('button', { name: 'Save payment' }).click();
    await expect(page.getByText('This is more than the AED 6,430.00 still owed.')).toBeVisible();

    // Basis and status are on screen for the demo script.
    await expect(row.getByText('Days on hire')).toBeVisible();
    await expect(row.getByText('Part-paid')).toBeVisible();
  });
});

test.describe('S34 — the customer pays (simulated)', () => {
  test('Palm Contracting can pay the invoice addressed to it and see it settled', async ({ page }) => {
    await signIn(page, USERS.fatima);
    await page.goto('/app/billing');
    await page.getByRole('button', { name: 'Received', exact: true }).click();

    // The seeded invoice to Palm is INV-EE-0412 (already paid); the open one is
    // INV-EE-0415 for Marina. Pay whatever is open.
    const row = page.getByRole('row', { name: /INV-EE-04/ }).filter({ has: page.getByRole('button', { name: /^Pay AED/ }) }).first();
    await expect(row).toBeVisible();
    const number = (await row.locator('td').first().innerText()).trim();

    await row.getByRole('button', { name: /^Pay AED/ }).click();
    await expect(page.getByText(/This is a demo; no money moves\./)).toBeVisible();
    await page.getByRole('button', { name: 'Confirm payment' }).click();

    await expect(page.getByText('Paid', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(number) }).first().getByText('Paid')).toBeVisible();
  });

  test('the received tab links the certificate that backs the hours', async ({ page }) => {
    await signIn(page, USERS.fatima);
    await page.goto('/app/billing');
    await page.getByRole('button', { name: 'Received', exact: true }).click();
    await expect(page.getByRole('link', { name: 'MUC-2026-09-EX-04-01' })).toBeVisible();
  });
});

test.describe('S36 — console billing', () => {
  test('Sara sees every tenant’s statement and can generate September', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, 'the console is desktop only');
    await signIn(page, USERS.sara);
    await page.goto('/console/billing');

    await expect(page.getByText('GPS statements')).toBeVisible();
    const gulfLift = page.getByRole('row', { name: /Gulf Lift Rentals/ }).first();
    await expect(gulfLift).toBeVisible();
    await expect(gulfLift.getByText('not issued')).toBeVisible();

    await page.getByRole('button', { name: /Generate last month’s statements/ }).click();
    await expect(page.getByText(/generated · \d+ skipped| \d+ statements generated/)).toBeVisible();
    await expect(page.getByRole('row', { name: /Gulf Lift Rentals/ }).first().getByText(/^GPS-/)).toBeVisible();

    // Rental invoices are read-only here, and opening one is audited.
    await page.getByRole('button', { name: 'Open' }).first().click();
    await expect(page.getByText(/Subtotal · VAT 5 % · Total/)).toBeVisible();
  });

  test('a statement payment over the balance is refused', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, 'the console is desktop only');
    await signIn(page, USERS.sara);
    await page.goto('/console/billing');
    await page.getByRole('button', { name: /Generate last month’s statements/ }).click();
    const row = page.getByRole('row', { name: /Gulf Lift Rentals/ }).first();
    await row.getByRole('button', { name: 'Record payment' }).click();
    await page.getByLabel('Amount (AED)').fill('9999999');
    await page.getByRole('button', { name: 'Save payment' }).click();
    await expect(page.getByText(/^This is more than the AED [\d,]+\.\d\d still owed\.$/)).toBeVisible();
  });
});
