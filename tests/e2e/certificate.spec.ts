// Certificate verification (spec 11.16) and the tamper walkthrough (S31).
// The verify page is public: number, asset, period, billable hours and a seal
// line — nothing else, noindex.

import { expect, test } from '@playwright/test';

const SEALED = 'MUC-2026-09-EX-04-01';
const VOIDED = 'MUC-2026-09-WL-03-01';
const REPLACEMENT = 'MUC-2026-09-WL-03-02';

test.describe('certificate verification', () => {
  test('a sealed certificate reports valid', async ({ page }) => {
    await page.goto(`/verify/${SEALED}`);
    await expect(page.getByText(SEALED)).toBeVisible();
    await expect(page.getByText(/Valid — sealed/)).toBeVisible();
    await expect(page.getByText('Billable hours')).toBeVisible();
    await expect(page.getByText('EX-04')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('a voided certificate points at its replacement', async ({ page }) => {
    await page.goto(`/verify/${VOIDED}`);
    await expect(page.getByText(/Voided on .*replaced by/)).toBeVisible();
    await expect(page.getByText(REPLACEMENT)).toBeVisible();
  });

  test('an unknown number says not found', async ({ page }) => {
    await page.goto('/verify/MUC-2026-09-EX-04-99');
    await expect(page.getByText('Not found')).toBeVisible();
  });

  test('tampering in the demo bar makes the next verify red', async ({ page }) => {
    await page.goto('/app');
    const dialogMessages: string[] = [];
    page.on('dialog', async dialog => {
      dialogMessages.push(dialog.message());
      await dialog.accept();
    });

    await page.getByRole('button', { name: 'Tools' }).click();
    await page.getByRole('button', { name: /Tamper with a stored certificate/ }).click();

    // The tool navigates client-side so the tampered payload survives.
    await expect(page).toHaveURL(new RegExp(`/verify/${SEALED}`));
    await expect(page.getByText('Does not match its seal — contact Kasper.')).toBeVisible();
    expect(dialogMessages.join(' ')).toContain('tampered');
  });
});
