// Agent D: /app reaches interactive within 2.5 s (UI-UPGRADE §11.6). REPORT-ONLY.
//
// Measured from the browser's own navigation timing on a signed-in reload of
// /app: domInteractive and domContentLoaded from the PerformanceNavigationTiming
// entry, plus the time until the fleet map's first marker or list row is on
// screen (what a user would call "the page is ready"). The numbers are logged
// as a `PERF {...}` line and attached; a run over budget is annotated, not
// failed. Agent J decides whether it becomes a gate.
import { expect, test } from '@playwright/test';
import { signIn, USERS } from './helpers';

const BUDGET_MS = 2500;

test('/app is interactive within 2.5 s (report-only)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'measured once, in the desktop project');
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, USERS.khalid);

  // A reload measures /app itself, not the sign-in redirect that led to it.
  const t0 = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  const firstContent = page.locator('.leaflet-marker-icon, a[href^="/app/assets/"]').first();
  await expect(firstContent).toBeVisible({ timeout: 15_000 });
  const contentMs = Date.now() - t0;

  const nav = await page.evaluate(() => {
    const e = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return e ? { domInteractive: Math.round(e.domInteractive), domContentLoaded: Math.round(e.domContentLoadedEventEnd), load: Math.round(e.loadEventEnd) } : null;
  });

  const result = { path: '/app', budgetMs: BUDGET_MS, ...nav, firstContentMs: contentMs };
  const over = (nav?.domInteractive ?? Infinity) > BUDGET_MS || contentMs > BUDGET_MS;
  console.log(`PERF ${JSON.stringify({ ...result, withinBudget: !over })}`);
  await testInfo.attach('perf-app.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  if (over) testInfo.annotations.push({ type: 'perf-over-budget', description: JSON.stringify(result) });
});
