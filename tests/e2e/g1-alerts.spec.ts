// G1 (UI-UPGRADE §8): Alerts grouped by severity, KPI strip, Acknowledge all,
// the bell matching the page, and the prototype rules panel (Tenant Admins only).

import { expect, test, type Page } from '@playwright/test';
import { demo, USERS } from './helpers';

async function bellCount(page: Page): Promise<number> {
  const text = (await page.getByRole('button', { name: 'Notifications' }).first().innerText()).trim();
  return text === '' ? 0 : Number(text);
}

async function kpiValue(page: Page, label: string): Promise<string> {
  const cell = page.getByTestId('kpi-strip').locator('> *').filter({ hasText: label }).first();
  return (await cell.locator('[data-kpi-value]').innerText()).trim();
}

test.describe('G1 — Alerts for Khalid (Tenant Admin, owner)', () => {
  test('KPI strip, severity groups in order, asset link and the rules panel', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app/alerts' });
    await expect(page.getByRole('heading', { name: 'Alerts', exact: true })).toBeVisible();

    const strip = page.getByRole('group', { name: 'Alerts summary' });
    for (const label of ['New today', 'Critical', 'Warning', 'Acknowledged today']) {
      await expect(strip.getByText(label, { exact: true })).toBeVisible();
    }

    // Critical first, then Warning (Info only when present), and nothing else in between.
    const groups = await page.locator('[data-testid^="alert-group-"]').evaluateAll(
      els => els.map(e => e.getAttribute('data-testid'))
    );
    expect(groups[0]).toBe('alert-group-critical');
    const order = ['alert-group-critical', 'alert-group-warning', 'alert-group-info'];
    expect(groups.map(g => order.indexOf(g ?? ''))).toEqual([...groups.map(g => order.indexOf(g ?? ''))].sort());
    // Every row inside a group carries that group's severity.
    for (const sev of ['critical', 'warning', 'info']) {
      const rows = page.getByTestId(`alert-group-${sev}`).getByTestId('alert-row');
      const count = await rows.count();
      for (let i = 0; i < count; i++) await expect(rows.nth(i)).toHaveAttribute('data-severity', sev);
    }
    // The critical count in the strip equals the rows in the Critical group (Open filter).
    const criticalRows = await page.getByTestId('alert-group-critical').getByTestId('alert-row').count();
    expect(await kpiValue(page, 'Critical')).toBe(String(criticalRows));

    // Exact time on hover.
    await expect(page.getByTestId('alert-row').first().locator('time')).toHaveAttribute('title', /\d/);

    // Rules panel: Tenant Admin, labelled as a prototype.
    const rules = page.getByTestId('alert-rules-panel');
    await expect(page.getByText('Prototype — no messages are sent')).toBeVisible();
    await expect(rules.getByRole('combobox', { name: 'Offline' })).toHaveValue('instant');

    // The asset code is a link to the asset page.
    await page.getByTestId('alert-group-critical').getByRole('link', { name: 'EX-07' }).click();
    await expect(page).toHaveURL(/\/app\/assets\/a-ex07$/);
  });

  test('Acknowledge all (n) asks first, then clears the open list and the bell', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app/alerts' });
    const button = page.getByRole('button', { name: /^Acknowledge all \(\d+\)$/ });
    await expect(button).toBeVisible();
    const n = Number((await button.innerText()).match(/\((\d+)\)/)?.[1]);
    expect(n).toBeGreaterThan(1);
    const openRows = await page.getByTestId('alert-row').count();
    expect(openRows).toBe(n); // Khalid owns every open alert he sees.
    const before = await bellCount(page);

    await button.click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText(`Acknowledge ${n} alerts?`)).toBeVisible();
    // Cancel first: nothing changes.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('alert-row')).toHaveCount(n);

    await button.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Acknowledge all' }).click();
    await expect(page.getByRole('status').filter({ hasText: `Acknowledged ${n} alerts` })).toBeVisible();
    await expect(page.getByTestId('alert-row')).toHaveCount(0);
    await expect(page.getByTestId('alerts-open-count')).toHaveText(/^0 open alerts/);
    expect(await kpiValue(page, 'Acknowledged today')).toBe(String(n));
    expect(await bellCount(page)).toBe(before - n);
    await expect(page.getByRole('button', { name: /^Acknowledge all/ })).toHaveCount(0);

    // They now sit under Acknowledged, with who and when.
    await page.getByRole('tab', { name: /Acknowledged/ }).click();
    await expect(page.getByTestId('alert-row')).toHaveCount(n);
    await expect(page.getByText(/^Acknowledged by Khalid Rahman at /).first()).toBeVisible();
  });

  test('a rule change is saved for the company and survives a reload', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app/alerts' });
    const offline = page.getByTestId('alert-rules-panel').getByRole('combobox', { name: 'Offline' });
    await offline.selectOption('digest');
    await expect(page.getByText('Saved. Prototype: no messages are sent.')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('alert-rules-panel').getByRole('combobox', { name: 'Offline' })).toHaveValue('digest');
  });
});

test.describe('G1 — who gets what', () => {
  test('Mark (Site User): no Acknowledge, no Acknowledge all, no rules panel', async ({ page }) => {
    await demo(page, { email: USERS.mark, on: '/app/alerts' });
    await expect(page.getByTestId('alert-row').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Acknowledge', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Acknowledge all/ })).toHaveCount(0);
    await expect(page.getByTestId('alert-rules-panel')).toHaveCount(0);
    await expect(page.getByText('Prototype — no messages are sent')).toHaveCount(0);
  });

  test('Fatima (renter): sees the rented GN-01 drop but can’t acknowledge it', async ({ page }) => {
    await demo(page, { email: USERS.fatima, on: '/app/alerts' });
    const critical = page.getByTestId('alert-group-critical');
    await expect(critical.getByRole('link', { name: 'GN-01' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Acknowledge', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Acknowledge all/ })).toHaveCount(0);
    // She is her company's Tenant Admin, so she sets her own company's rules.
    await expect(page.getByTestId('alert-rules-panel')).toBeVisible();
  });

  test('the selects have accessible names', async ({ page }) => {
    await demo(page, { email: USERS.khalid, on: '/app/alerts' });
    await expect(page.getByRole('combobox', { name: 'Alert type' })).toBeVisible();
  });
});
