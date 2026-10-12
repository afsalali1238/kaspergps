// J5 (HANDOFF.md §2, P4 gap): a tenant's navigation must keep every item it is allowed
// reachable at every width. Below 1024 px the items sit in the "Open menu" sheet; from
// 1024 px they are in the left nav, and must not be clipped by the viewport.
// Desktop project only: the widths are set here, so the phone project would repeat them.
import { expect, test } from '@playwright/test';
import { demo, USERS } from './helpers';

const WIDTHS = [390, 768, 1024, 1280, 1440] as const;
// Certificates (MUC) need a Tier 3 asset with ECU hours (spec §5, §11.16). Omar's fleet is Tier 1,
// so Certificates must be absent for him, not merely unreachable.
const LATE_ITEMS: Record<'omar' | 'khalid', string[]> = {
  omar: ['Billing', 'Maintenance', 'Cost & ROI'],
  khalid: ['Certificates', 'Billing', 'Maintenance', 'Cost & ROI'],
};

for (const key of ['omar', 'khalid'] as const) {
  for (const width of WIDTHS) {
    test(`${key} at ${width} px: the late-phase items are reachable`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'widths are set in this spec, run once on desktop');
      await page.setViewportSize({ width, height: 800 });
      await demo(page, { email: USERS[key], on: '/app' });

      if (width >= 1024) {
        const leftNav = page.locator('nav', { has: page.getByRole('link', { name: 'Map', exact: true }) }).first();
        for (const label of LATE_ITEMS[key]) {
          const link = leftNav.getByRole('link', { name: label, exact: true });
          await link.scrollIntoViewIfNeeded();
          await expect(link, `${label} in the left nav`).toBeVisible();
          const box = await link.boundingBox();
          expect(box, `${label} has a box`).not.toBeNull();
          expect(box!.x + box!.width, `${label} is inside the ${width} px viewport`).toBeLessThanOrEqual(width);
        }
      }
      if (key === 'omar') {
        // No Tier 3 asset, so no certificate item at any width.
        await expect(page.getByRole('link', { name: 'Certificates', exact: true })).toHaveCount(0);
      }
      if (width < 1024) {
        await page.getByRole('button', { name: 'Open menu' }).click();
        const sheet = page.getByRole('dialog', { name: 'Open menu' });
        for (const label of LATE_ITEMS[key]) {
          await expect(sheet.getByRole('link', { name: label, exact: true }), `${label} in the menu sheet`).toBeVisible();
        }
      }
    });
  }
}
