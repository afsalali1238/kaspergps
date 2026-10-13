// J5 (HANDOFF.md §2, P4 gap): a tenant's navigation must keep every item it is allowed
// reachable at every width. Below 1024 px the items sit in the "Open menu" sheet; from
// 1024 px they are in the top nav (in the bar or under "More"), and must not be clipped by the viewport.
// Desktop project only: the widths are set here, so the phone project would repeat them.
import { expect, test } from '@playwright/test';
import { demo, openMore, USERS } from './helpers';

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
        // Top navigation (owner decision, 13 Oct): a tab is either in the bar or under "More".
        const topNav = page.getByTestId('top-nav');
        for (const label of LATE_ITEMS[key]) {
          let link = topNav.getByRole('link', { name: label, exact: true }).first();
          if (!(await link.isVisible())) {
            const more = topNav.getByRole('button', { name: 'More' });
            if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
            link = topNav.getByRole('group', { name: 'More' }).getByRole('link', { name: label, exact: true });
          }
          await expect(link, `${label} in the top nav`).toBeVisible();
          const box = await link.boundingBox();
          expect(box, `${label} has a box`).not.toBeNull();
          expect(box!.x + box!.width, `${label} is inside the ${width} px viewport`).toBeLessThanOrEqual(width);
        }
      }
      if (key === 'omar') {
        // No Tier 3 asset, so no certificate item at any width.
        if (width >= 1024) await openMore(page);
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

// B3: the top bar fits at every desktop width — no tab is clipped and the bar never scrolls.
for (const key of ['khalid', 'sara'] as const) {
  for (const width of [1024, 1280, 1440, 1536, 1600, 1760, 1920]) {
    test(`${key} at ${width} px: the top bar fits`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'widths are set in this spec, run once on desktop');
      await page.setViewportSize({ width, height: 800 });
      await demo(page, { email: USERS[key], on: key === 'sara' ? '/console' : '/app' });
      const header = page.locator('header').filter({ has: page.getByTestId('top-nav') }).first();
      await expect(header).toBeVisible();
      const fit = await header.evaluate(h => ({ scroll: h.scrollWidth, client: h.clientWidth }));
      expect(fit.scroll, 'header does not overflow').toBeLessThanOrEqual(fit.client);
      // The tabs column clips silently, so check it too: no tab may hide under the tools.
      const tabs = await page.getByTestId('top-nav').evaluate(n => ({ scroll: n.scrollWidth, client: n.parentElement!.clientWidth }));
      expect(tabs.scroll, 'tabs fit their column').toBeLessThanOrEqual(tabs.client);
      for (const tab of await page.getByTestId('top-nav').locator(':scope > a, :scope > div > button').all()) {
        if (!(await tab.isVisible())) continue;
        const box = (await tab.boundingBox())!;
        expect(box.x + box.width, `${await tab.innerText()} inside ${width} px`).toBeLessThanOrEqual(width);
      }
    });
  }
}

// B3: in Arabic a hidden mono element stays hidden. The RTL mono rule used to override
// `hidden` (it sat outside the CSS layers), which put the LIVE pill on narrow screens.
test('Arabic at 1440 px: hidden mono text stays hidden', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'width is set in this spec');
  await page.setViewportSize({ width: 1440, height: 800 });
  await demo(page, { email: USERS.khalid, on: '/ar/app/alerts' });
  await expect(page.getByTestId('top-nav')).toBeVisible();
  await expect(page.getByTestId('live-pill')).toBeHidden();
});

// B3 part 2: the LIVE pill (from 1760 px) opens the demo clock.
for (const key of ['khalid', 'sara'] as const) {
  test(`${key} at 1760 px: the LIVE pill opens the demo clock`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'width is set in this spec');
    await page.setViewportSize({ width: 1760, height: 900 });
    await demo(page, { email: USERS[key], on: key === 'sara' ? '/console' : '/app' });
    const pill = page.getByTestId('live-pill');
    await expect(pill).toBeVisible();
    await expect(page.getByText('Simulated clock · Dubai')).toHaveCount(0);
    await pill.click();
    await expect(page.getByText('Simulated clock · Dubai')).toBeVisible();
  });
}
