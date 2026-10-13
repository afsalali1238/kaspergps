// Agent D: axe accessibility checks on the 10 main screens (UI-UPGRADE §11.5).
//
// Report mode for now. Every run attaches what axe found on each screen; the test
// fails only on a CRITICAL violation that the baseline doesn't already list for
// that screen (a new rule, or more nodes than recorded). The baseline lives in
// reviews/a11y-baseline.md, in the fenced json block between the BASELINE
// markers. Wave 3 (agent J) turns this strict: no serious or critical at all.
//
// Runs once, in the desktop project: the rules axe checks don't change with the
// viewport width, and the phone layouts get their own pass in J.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { goTo, settle, signIn, stubTiles, USERS } from './helpers';

type Counts = Record<string, { impact: string; nodes: number }>;

const A11Y_SCREENS: { name: string; email: string; path: string }[] = [
  { name: 'sign-in', email: '', path: '/dev/sign-in' },
  { name: 'map', email: USERS.khalid, path: '/app' },
  { name: 'alerts', email: USERS.khalid, path: '/app/alerts' },
  { name: 'reports', email: USERS.khalid, path: '/app/reports' },
  { name: 'maintenance', email: USERS.khalid, path: '/app/maintenance' },
  { name: 'asset-ex04', email: USERS.khalid, path: '/app/assets/a-ex04' },
  { name: 'settings', email: USERS.khalid, path: '/app/settings' },
  { name: 'console', email: USERS.sara, path: '/console' },
  { name: 'tracking-link', email: '', path: '/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5' },
  { name: 'verify', email: '', path: '/verify/MUC-2026-09-EX-04-01' },
];

function readBaseline(): Record<string, Counts> {
  const md = readFileSync(path.resolve('reviews/a11y-baseline.md'), 'utf8');
  const m = md.match(/<!-- BASELINE START -->\s*```json\s*([\s\S]*?)```\s*<!-- BASELINE END -->/);
  if (!m) throw new Error('reviews/a11y-baseline.md has no BASELINE json block');
  return JSON.parse(m[1]);
}

for (const screen of A11Y_SCREENS) {
  test(`axe: ${screen.name} (${screen.path}) has no new critical violations`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'axe runs once, in the desktop project');
    await page.setViewportSize({ width: 1440, height: 900 });
    if (screen.email) {
      await signIn(page, screen.email);
      await goTo(page, screen.path);
    } else {
      await stubTiles(page);
      await page.goto(screen.path);
    }
    await settle(page);

    const result = await new AxeBuilder({ page }).analyze();
    const found: Counts = {};
    for (const v of result.violations) found[v.id] = { impact: v.impact ?? 'unknown', nodes: v.nodes.length };
    await testInfo.attach(`axe-${screen.name}.json`, {
      body: JSON.stringify({ screen: screen.name, path: screen.path, violations: found }, null, 2),
      contentType: 'application/json',
    });
    // One line per screen in the log, so a CI run doubles as the report.
    console.log(`A11Y ${screen.name} ${JSON.stringify(found)}`);

    const known = readBaseline()[screen.name] ?? {};
    const newCritical = Object.entries(found)
      .filter(([, v]) => v.impact === 'critical')
      .filter(([id, v]) => !known[id] || v.nodes > known[id].nodes)
      .map(([id, v]) => `${id} (${v.nodes} nodes, baseline ${known[id]?.nodes ?? 0})`);
    expect(newCritical, `new critical axe violations on ${screen.path}`).toEqual([]);
  });
}
