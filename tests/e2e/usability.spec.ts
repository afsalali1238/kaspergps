// Agent D: the usability kit's happy paths (UI-UPGRADE §11.1, reviews/usability/).
//
// REPORT-ONLY. Each task runs its happy path from its start state, counts the
// clicks it took (keyboard shortcuts and typing are not clicks) and the time,
// and checks its success criterion. The outcome is logged as one
// `USABILITY {...}` JSON line and attached to the test; the test itself never
// fails on a missed target or a broken path. Wave 2 redesigns these screens,
// so a path that breaks shows up as "completed": false with the reason.
// Agent J turns the click and time targets into assertions (scorecard A14).
//
// The task list mirrors the five scripts in reviews/usability/<role>.md; the
// ids (O1 … C4) match. Runs once, in the desktop project; the customer tasks
// set a phone viewport themselves.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { goTo, settle, signIn, signInAsRole, stubTiles, USERS } from './helpers';

const TRACKING_TOKEN = 'k7Qm2Xc9TpLw4ZaN8rVb3Ye5';

/** Counts the clicks a task takes. */
class Clicks {
  n = 0;
  async click(target: Locator): Promise<void> {
    await target.click();
    this.n += 1;
  }
}

type Task = {
  id: string;
  role: string;
  title: string;
  targetClicks: number;
  targetSeconds: number;
  /** Puts the browser in the task's start state. Not counted. */
  start: (page: Page) => Promise<void>;
  /** The happy path. Its expect() calls are the success criterion. */
  run: (page: Page, c: Clicks) => Promise<void>;
};

/** Opens the top nav's "More" menu when this width has one, counted as a click. */
async function more(page: Page, c: Clicks): Promise<void> {
  const btn = page.getByTestId('top-nav').getByRole('button', { name: 'More' });
  if ((await btn.count()) && (await btn.isVisible()) && (await btn.getAttribute('aria-expanded')) !== 'true') await c.click(btn);
}

const nav = (page: Page, name: string) => page.getByTestId('top-nav').getByRole('link', { name, exact: true }).first();
const banner = (page: Page) => page.getByRole('banner');
const userMenu = (page: Page) => banner(page).getByRole('button', { name: /Tenant Admin|Site User|مسؤول|مستخدم/ }).first();

const TASKS: Task[] = [
  // ── Owner (Khalid; FB-12 belongs to Al Noor, so O2 runs as its owner, Omar) ──
  {
    id: 'O1', role: 'Owner', title: 'Find which machine had a fuel drop and when', targetClicks: 3, targetSeconds: 30,
    start: page => signInAsRole(page, 'owner'),
    run: async (page, c) => {
      await c.click(nav(page, 'Alerts'));
      await c.click(page.getByRole('button', { name: 'All', exact: true }).first());
      await expect(page.getByText(/GN-01/).first()).toBeVisible();
      await expect(page.getByText(/Fuel dropped 18% at 02:10/).first()).toBeVisible();
    },
  },
  {
    id: 'O2', role: 'Owner', title: "Share FB-12's tracking link", targetClicks: 4, targetSeconds: 45,
    start: page => signIn(page, USERS.omar),
    run: async (page, c) => {
      await c.click(page.getByRole('link', { name: /^FB-12/ }).first());
      await c.click(page.getByRole('button', { name: 'Share tracking link' }));
      await c.click(page.getByRole('button', { name: 'Create', exact: true }));
      await expect(page.getByText(/\/t\/[A-Za-z0-9]{8,}/).first()).toBeVisible();
    },
  },
  {
    id: 'O3', role: 'Owner', title: "End Palm's access to EX-11 with a reason", targetClicks: 5, targetSeconds: 60,
    start: page => signInAsRole(page, 'owner'),
    run: async (page, c) => {
      await c.click(page.getByRole('link', { name: /^EX-11/ }).first());
      await c.click(page.getByRole('button', { name: 'End access now' }));
      await page.getByRole('textbox', { name: /Reason/ }).fill('Usability run: hire ended early on site request');
      await c.click(page.getByRole('button', { name: 'End Palm Contracting access now' }));
      await expect(page.getByText(/Rented to Palm Contracting/)).toHaveCount(0);
    },
  },
  {
    id: 'O4', role: 'Owner', title: "See what's overdue in maintenance", targetClicks: 2, targetSeconds: 20,
    start: page => signInAsRole(page, 'owner'),
    run: async (page, c) => {
      await c.click(nav(page, 'Maintenance'));
      await expect(page.getByText(/overdue/i).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'BD-02' }).first()).toBeVisible();
    },
  },
  {
    id: 'O5', role: 'Owner', title: "Issue September's certificate for EX-04", targetClicks: 4, targetSeconds: 60,
    start: page => signInAsRole(page, 'owner'),
    run: async (page, c) => {
      await more(page, c);
      await c.click(nav(page, 'Certificates'));
      await c.click(page.getByRole('button', { name: 'Issue certificate' }));
      // EX-04 is the default asset. September is the BK-0981 booking period
      // (1–20 Sep); choosing it is one selection, counted as a click.
      const period = page.locator('select').filter({ has: page.locator('option', { hasText: /Sep 2026/ }) }).first();
      const sep = (await period.locator('option', { hasText: /Sep 2026/ }).first().innerText()).trim();
      await period.selectOption({ label: sep });
      c.n += 1;
      await c.click(page.getByRole('button', { name: 'Issue and seal' }));
      await expect(page.getByText(/MUC-2026-09-EX-04-0[2-9]/).first()).toBeVisible();
    },
  },

  // ── Renter (Lina, Marina Builders) ──
  {
    id: 'R1', role: 'Renter', title: 'See only what she rents and owns', targetClicks: 0, targetSeconds: 15,
    start: page => signInAsRole(page, 'renter'),
    run: async page => {
      await expect(page.getByRole('link', { name: /^EX-04/ }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /^PU-51/ }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /^EX-11/ })).toHaveCount(0);
      await expect(page.getByRole('link', { name: /^FB-12/ })).toHaveCount(0);
    },
  },
  {
    id: 'R2', role: 'Renter', title: "Open EX-04's history and confirm it starts at the rental", targetClicks: 3, targetSeconds: 30,
    start: page => signInAsRole(page, 'renter'),
    run: async (page, c) => {
      // BK-1001 started 4 Oct 08:00 (anchor −2 days): a 7-day window must clamp to it.
      await c.click(page.getByRole('link', { name: /^EX-04/ }).first());
      await c.click(page.getByRole('button', { name: 'History', exact: true }));
      await c.click(page.getByRole('button', { name: '7 days', exact: true }));
      await expect(page.getByText(/^4 Oct 08:00 – /).first()).toBeVisible();
    },
  },
  {
    id: 'R3', role: 'Renter', title: "Run and download last week's trip report", targetClicks: 5, targetSeconds: 60,
    start: page => signInAsRole(page, 'renter'),
    run: async (page, c) => {
      await c.click(nav(page, 'Reports'));
      // Excel is the default format; pick the type, the asset and "last week".
      await c.click(page.getByRole('button', { name: /^Trip & Mileage/ }));
      await c.click(page.getByRole('button', { name: /^EX-04 Excavator/ }));
      await c.click(page.getByRole('button', { name: 'Last 7 days' }));
      const download = page.waitForEvent('download', { timeout: 15_000 });
      await c.click(page.getByRole('button', { name: 'Run report' }));
      const more = page.getByRole('button', { name: /^Download/ }).first();
      if (!(await Promise.race([download.then(() => true), page.waitForTimeout(3000).then(() => false)])) && (await more.count())) await c.click(more);
      expect((await download).suggestedFilename()).toMatch(/\.(xlsx|csv|pdf)$/);
    },
  },
  {
    id: 'R4', role: 'Renter', title: "Find the arrival time of nothing she doesn't own (FB-12 is not findable)", targetClicks: 1, targetSeconds: 20,
    start: page => signInAsRole(page, 'renter'),
    run: async (page, c) => {
      await c.click(banner(page).getByRole('button', { name: 'Search' }));
      await page.keyboard.type('FB-12');
      await expect(page.getByRole('dialog').getByText(/FB-12 —|Flatbed/)).toHaveCount(0);
      await page.keyboard.press('Escape');
      await goTo(page, '/app/assets/a-fb12');
      await expect(page.getByText(/Arriv|ETA/)).toHaveCount(0);
    },
  },
  {
    id: 'R5', role: 'Renter', title: 'Switch to Arabic and back', targetClicks: 4, targetSeconds: 30,
    start: page => signInAsRole(page, 'renter'),
    run: async (page, c) => {
      await c.click(userMenu(page));
      await c.click(banner(page).getByRole('button', { name: 'Language' }).first());
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await c.click(userMenu(page));
      await c.click(banner(page).getByRole('button', { name: /اللغة|Language/ }).first());
      await expect(page.locator('html')).not.toHaveAttribute('dir', 'rtl');
    },
  },

  // ── Site User (Mark, Gulf Lift, Al Quoz) ──
  {
    id: 'M1', role: 'Site User', title: "Find his site's alerts", targetClicks: 1, targetSeconds: 15,
    start: page => signInAsRole(page, 'siteUser'),
    run: async (page, c) => {
      await c.click(nav(page, 'Alerts'));
      await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible();
    },
  },
  {
    id: 'M2', role: 'Site User', title: "Confirm he can't edit or deactivate anything", targetClicks: 1, targetSeconds: 30,
    start: page => signInAsRole(page, 'siteUser'),
    run: async (page, c) => {
      await more(page, c);
      await expect(page.getByTestId('top-nav').getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
      await c.click(page.getByRole('link', { name: /^CR-02/ }).first());
      await expect(page.getByRole('button', { name: 'Edit asset' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /End access|Deactivate/ })).toHaveCount(0);
    },
  },
  {
    id: 'M3', role: 'Site User', title: "Open a machine's engine data", targetClicks: 2, targetSeconds: 20,
    start: page => signInAsRole(page, 'siteUser'),
    run: async (page, c) => {
      await c.click(page.getByRole('link', { name: /^CR-02/ }).first());
      await c.click(page.getByRole('button', { name: 'Engine & fuel', exact: true }));
      await expect(page.getByText(/Engine hours|Coolant|RPM/i).first()).toBeVisible();
    },
  },
  {
    id: 'M4', role: 'Site User', title: 'Run a report for his site', targetClicks: 3, targetSeconds: 45,
    start: page => signInAsRole(page, 'siteUser'),
    run: async (page, c) => {
      await c.click(nav(page, 'Reports'));
      await c.click(page.getByRole('button', { name: /^Trip & Mileage/ }));
      await c.click(page.getByRole('button', { name: /^(Run|Generate)/ }).first());
      await expect(page.getByText(/CR-02|Al Qusais/).first()).toBeVisible();
    },
  },
  {
    // ⌘K/Ctrl+K is still undecided (owner finding §7.2), so the product search
    // opens from its button: one click instead of zero.
    id: 'M5', role: 'Site User', title: 'Use search (⌘K) to jump to an asset', targetClicks: 0, targetSeconds: 15,
    start: page => signInAsRole(page, 'siteUser'),
    run: async (page, c) => {
      await c.click(banner(page).getByRole('button', { name: 'Search' }));
      await page.keyboard.type('CR-02');
      await c.click(banner(page).getByRole('button', { name: /^CR-02 — / }));
      await page.waitForURL(/\/app\/assets\/a-cr02/);
    },
  },

  // ── Kasper Ops (Ravi) ──
  {
    id: 'K1', role: 'Kasper Ops', title: 'Pair a tracker to MW-01', targetClicks: 4, targetSeconds: 60,
    start: page => signInAsRole(page, 'kasperOps'),
    run: async (page, c) => {
      await c.click(nav(page, 'Trackers'));
      await c.click(page.getByRole('button', { name: 'Pair', exact: true }).first());
      await c.click(page.getByRole('button', { name: /^MW-01 Mobile welder/ }));
      await c.click(page.getByRole('button', { name: 'Confirm', exact: true }));
      await expect(page.getByText(/Asset: MW-01/).first()).toBeVisible();
    },
  },
  {
    id: 'K2', role: 'Kasper Ops', title: 'Find the faulty CAN adapter', targetClicks: 1, targetSeconds: 20,
    start: page => signInAsRole(page, 'kasperOps'),
    run: async (page, c) => {
      await c.click(nav(page, 'CAN adapters'));
      const status = page.locator('select').filter({ has: page.locator('option', { hasText: 'Faulty' }) }).first();
      await status.selectOption({ label: 'Faulty' });
      c.n += 1;
      await expect(page.getByText(/AC3-005501/).first()).toBeVisible();
    },
  },
  {
    id: 'K3', role: 'Kasper Ops', title: 'Move a tracker between tenants', targetClicks: 4, targetSeconds: 60,
    start: page => signInAsRole(page, 'kasperOps'),
    run: async (page, c) => {
      await c.click(nav(page, 'Trackers'));
      // FB-12's tracker (Al Noor) moves to MW-01 (Gulf Lift).
      await c.click(page.getByRole('button', { name: 'Move', exact: true }).first());
      await c.click(page.getByRole('button', { name: /^MW-01 Mobile welder/ }));
      await c.click(page.getByRole('button', { name: 'Confirm', exact: true }));
      await expect(page.getByText(/Asset: MW-01.*Tenant: Gulf Lift Rentals/).first()).toBeVisible();
    },
  },
  {
    id: 'K4', role: 'Kasper Ops', title: "Open a tenant's assets", targetClicks: 2, targetSeconds: 30,
    start: page => signInAsRole(page, 'kasperOps'),
    run: async (page, c) => {
      await c.click(nav(page, 'Assets'));
      const tenant = page.locator('select').filter({ has: page.locator('option', { hasText: 'Emirates Earthmovers' }) }).first();
      await tenant.selectOption({ label: 'Emirates Earthmovers' });
      c.n += 1;
      await expect(page.getByText(/EX-04/).first()).toBeVisible();
      await expect(page.getByText(/FB-12/)).toHaveCount(0);
    },
  },
  {
    id: 'K5', role: 'Kasper Ops', title: 'Confirm Billing is hidden', targetClicks: 1, targetSeconds: 15,
    start: page => signInAsRole(page, 'kasperOps'),
    run: async (page, c) => {
      await more(page, c);
      await expect(page.getByTestId('top-nav').getByRole('link', { name: 'Billing', exact: true })).toHaveCount(0);
    },
  },

  // ── Customer (tracking link, no account, phone) ──
  {
    id: 'C1', role: 'Customer', title: 'Open the link on a phone', targetClicks: 0, targetSeconds: 10,
    start: async page => { await page.setViewportSize({ width: 390, height: 844 }); await stubTiles(page); },
    run: async page => {
      await page.goto(`/t/${TRACKING_TOKEN}`);
      await expect(page.getByText(/FB-12|Flatbed/).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    },
  },
  {
    id: 'C2', role: 'Customer', title: 'Read the arrival time', targetClicks: 0, targetSeconds: 10,
    start: async page => { await page.setViewportSize({ width: 390, height: 844 }); await stubTiles(page); await page.goto(`/t/${TRACKING_TOKEN}`); },
    run: async page => {
      await expect(page.getByText(/Arriv|ETA/i).first()).toBeVisible();
      await expect(page.getByText(/\b\d{1,2}:\d{2}\b/).first()).toBeVisible();
    },
  },
  {
    id: 'C3', role: 'Customer', title: 'Confirm nothing else is visible', targetClicks: 0, targetSeconds: 10,
    start: async page => { await page.setViewportSize({ width: 390, height: 844 }); await stubTiles(page); await page.goto(`/t/${TRACKING_TOKEN}`); },
    run: async page => {
      await expect(page.getByTestId('top-nav')).toHaveCount(0);
      await expect(page.getByText(/EX-04|EX-11|FB-14|Al Noor Transport/)).toHaveCount(0);
    },
  },
  {
    id: 'C4', role: 'Customer', title: 'See "no longer active" after the link is revoked', targetClicks: 0, targetSeconds: 15,
    // The owner revokes the link first (not counted); the customer then reopens it.
    start: async page => {
      await signIn(page, USERS.omar);
      await goTo(page, '/app/assets/a-fb12');
      await page.getByRole('button', { name: 'Share tracking link' }).click();
      await page.getByRole('button', { name: /^Revoke/ }).first().click();
      const confirm = page.getByRole('button', { name: /^(Revoke|Confirm)/ }).last();
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
    },
    run: async page => {
      await page.goto(`/t/${TRACKING_TOKEN}`);
      await expect(page.getByText('This tracking link is no longer active.')).toBeVisible({ timeout: 35_000 });
    },
  },
];

for (const task of TASKS) {
  test(`usability ${task.id} (${task.role}): ${task.title}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'usability paths run once, in the desktop project');
    test.setTimeout(90_000);
    if (task.role !== 'Customer') await page.setViewportSize({ width: 1440, height: 900 });
    // A broken path should report quickly, not hang until the test timeout.
    page.setDefaultTimeout(10_000);
    const clicks = new Clicks();
    let completed = false;
    let note = '';
    let ms = 0;
    try {
      await task.start(page);
      await settle(page, 300);
      const t0 = Date.now();
      await task.run(page, clicks);
      ms = Date.now() - t0;
      completed = true;
    } catch (err) {
      // First two lines of the error (what failed, and on which locator), no colour codes.
      note = String((err as Error).message ?? err)
        .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')
        .split('\n').map(l => l.trim()).filter(Boolean).slice(0, 2).join(' — ').slice(0, 240);
    }
    const result = {
      id: task.id, role: task.role, title: task.title, completed,
      clicks: clicks.n, targetClicks: task.targetClicks,
      seconds: completed ? Math.round(ms / 100) / 10 : null, targetSeconds: task.targetSeconds,
      withinTarget: completed && clicks.n <= task.targetClicks && ms / 1000 <= task.targetSeconds,
      note,
    };
    console.log(`USABILITY ${JSON.stringify(result)}`);
    await testInfo.attach(`usability-${task.id}.json`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    testInfo.annotations.push({ type: 'usability', description: JSON.stringify(result) });
  });
}
