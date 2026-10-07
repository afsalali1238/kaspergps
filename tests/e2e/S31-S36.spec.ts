// S31–S36 (spec §13): certificates and money. Issue and reissue a MUC, prove
// the seal detects tampering, and walk the three billing faces (customer pays,
// owner records a part-payment, Kasper issues statements).

import { expect, test } from '@playwright/test';
import { demo, goTo, startScenario, tamperWithCertificate, USERS } from './helpers';

test.describe('S31 — Khalid issues and reissues a MUC', () => {
  test('the certificates screen lists the seeded September certificate', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app/certificates' });
    await expect(page.getByRole('heading', { name: 'Certificates' })).toBeVisible();
    await expect(page.getByText('MUC-2026-09-EX-04-01')).toBeVisible();
    await expect(page.getByText('Sealed').first()).toBeVisible();
    // A Tier 3 fleet can issue (BD-02 is on hire to Gulf Lift).
    await expect(page.getByRole('button', { name: 'Issue certificate' })).toBeVisible();
  });

  test('the public verify page says Valid and prints the seal', async ({ page }) => {
    await page.goto('/verify/MUC-2026-09-EX-04-01');
    await expect(page.getByText('MUC-2026-09-EX-04-01')).toBeVisible();
    await expect(page.getByText(/Valid|Seal/).first()).toBeVisible();
  });
});

test.describe('S32 — tampering with a stored certificate', () => {
  test('the verify page turns red after the tamper tool', async ({ page }) => {
    await demo(page, { email: USERS.khalid });
    await tamperWithCertificate(page);
    await expect(page.getByText(/Does not match its seal/)).toBeVisible();
  });
});

test.describe('S33 — Omar (Tier 1) has no certificates', () => {
  test('the screen is gated, not empty', async ({ page }) => {
    await demo(page, { email: USERS.omar, scenario: 33 });
    await expect(page).toHaveURL(/\/app\/certificates$/);
    await expect(page.getByText(/Tier 3 assets with ECU engine hours only/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Issue certificate' })).toHaveCount(0);
  });
});

test.describe('S34 — Fatima pays an invoice', () => {
  test('the received tab carries the MUC link and the pay flow', async ({ page }) => {
    await demo(page, { email: USERS.fatima, on: '/app/billing' });
    await page.getByRole('button', { name: 'Received', exact: true }).click();
    await expect(page.getByRole('link', { name: 'MUC-2026-09-EX-04-01' })).toBeVisible();
    await expect(page.getByText(/Customer: Palm Contracting/).first()).toBeVisible();
  });
});

test.describe('S35 — Omar records a part-payment', () => {
  test('INV-AN-0098 is on hire days and refuses an over-payment', async ({ page }) => {
    await demo(page, { email: USERS.omar, on: '/app/billing' });
    await page.getByRole('button', { name: 'Issued', exact: true }).click();
    const row = page.getByRole('row', { name: /INV-AN-0098/ });
    await expect(row.getByText('Days on hire')).toBeVisible();
    await row.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByText(/^Record a payment on INV-AN-0098$/)).toBeVisible();
    await expect(page.getByText(/A payment over the balance is refused/)).toBeVisible();
  });
});

test.describe('S36 — Kasper issues GPS statements', () => {
  test('Sara sees the statements table and Ops is locked out', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 900, 'the console is desktop only');
    await demo(page, { email: USERS.sara, scenario: 36 });
    await expect(page).toHaveURL(/\/console\/billing$/);
    await expect(page.getByText('GPS statements')).toBeVisible();
    await expect(page.getByRole('row', { name: /Gulf Lift Rentals/ }).first()).toBeVisible();

    await demo(page, { email: USERS.ravi });
    await goTo(page, '/console/billing');
    await expect(page.getByText(/Billing is for Kasper Admin/)).toBeVisible();
  });
});
