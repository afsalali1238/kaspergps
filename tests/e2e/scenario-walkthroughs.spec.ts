// Every scenario S1–S50 runs start to finish from the Scenarios menu: start it,
// step through every walkthrough step with Next, then Finish. Each run must end
// with the card closed and no error boundary on screen.
// Desktop only: the walkthrough card and the Scenarios menu are laid out for wide screens.

import { expect, test } from '@playwright/test';
import { demo, expectNoText, USERS } from './helpers';

test.beforeEach(async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 900, 'the walkthrough card is laid out for desktop');
});

for (let id = 1; id <= 50; id++) {
  test(`S${id} runs from the Scenarios menu to Finish`, async ({ page }) => {
    await demo(page, { email: USERS.sara });
    await page.getByRole('button', { name: 'Scenarios' }).click();
    await page.locator('.demo-bar button').filter({ hasText: new RegExp(`^S${id}(?![0-9])`) }).first().click();

    const card = page.getByTestId('walkthrough-card');
    await expect(card).toBeVisible();
    // Step forward until the last step, where Next becomes Finish. The card re-renders
    // as steps change, so each Next is a DOM click, and the loop waits on Finish.
    for (let i = 0; i < 40; i++) {
      if (await card.getByRole('button', { name: 'Finish' }).count()) break;
      await page.evaluate(() => {
        const next = [...document.querySelectorAll('[data-testid="walkthrough-card"] button')]
          .find(b => b.textContent?.trim() === 'Next →');
        (next as HTMLButtonElement | undefined)?.click();
      });
      await page.waitForTimeout(50);
    }
    await expect(card.getByRole('button', { name: 'Finish' })).toBeVisible();
    await expect(card.getByText(/^What you should see:/)).toBeVisible();
    await card.getByRole('button', { name: 'Finish' }).click();
    await expect(card).toHaveCount(0);
    await expectNoText(page, "This page couldn't load");
  });
}
