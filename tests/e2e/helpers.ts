// Shared e2e helpers. Sign in by email on /dev/sign-in (prototype only) or pick a role
// on the home page (chunk R). Every account accepts any password.
//
// Every spec starts by pinning the demo context (who you are, what the clock
// says, which phase) so the assertions below are about the product, not about
// whatever the previous test left behind.

import { expect, type Locator, type Page } from '@playwright/test';

export const USERS = {
  sara: 'sara@kasper.ae',        // Kasper Admin
  ravi: 'ravi@kasper.ae',        // Kasper Ops
  omar: 'omar@alnoor.ae',        // Al Noor Transport Admin (Tier 1 fleet)
  khalid: 'khalid@emiratesearth.ae', // Emirates Earthmovers Admin (Tier 3 fleet)
  priya: 'priya@gulflift.ae',    // Gulf Lift Rentals Admin
  lina: 'lina@marina.ae',        // Marina Builders Admin (renter)
  fatima: 'fatima@palmcontracting.ae', // Palm Contracting Admin (renter)
  mark: 'mark@gulflift.ae',      // Gulf Lift Site User
} as const;

/** Full names of the seeded users (the demo bar shows the role chip, not the person). */
export const NAMES = {
  sara: 'Sara Haddad',
  ravi: 'Ravi Menon',
  omar: 'Omar Saleh',
  khalid: 'Khalid Rahman',
  priya: 'Priya Nair',
  lina: 'Lina Aziz',
  fatima: 'Fatima Noor',
} as const;

// Map tiles come from OpenStreetMap. Tests answer them locally with a blank tile,
// so the suite never depends on the network; setTilesDown makes them fail on purpose.
const TILE_HOST = /tile\.openstreetmap\.org|basemaps\.cartocdn\.com/;
const BLANK_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const stubbedPages = new WeakSet<Page>();
const tilesDownFor = new WeakMap<Page, boolean>();

/** Answer map tile requests locally (once per page). */
export async function stubTiles(page: Page): Promise<void> {
  if (stubbedPages.has(page)) return;
  stubbedPages.add(page);
  await page.route(TILE_HOST, route =>
    tilesDownFor.get(page) ? route.abort() : route.fulfill({ contentType: 'image/png', body: BLANK_TILE }),
  );
}

/** Make map tiles fail (true) or load again (false). */
export function setTilesDown(page: Page, down: boolean): void {
  tilesDownFor.set(page, down);
}

/** Sign in by email on the developer sign-in page and wait for the user's home screen. */
export async function signIn(page: Page, email: string): Promise<void> {
  await stubTiles(page);
  await page.goto('/dev/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/(app|console)(\/|$)/);
}

/** The demo bar survives in-app navigation, so tests can hop between screens. */
export async function goTo(page: Page, path: string): Promise<void> {
  await stubTiles(page);
  await page.goto(path);
  await expect(page.locator('.demo-bar')).toBeVisible();
}

/**
 * Switch to another seeded user by name (chunk R: View as is gone). Signs in again
 * through /dev/sign-in; the demo data survives, because it lives in local storage.
 */
export async function viewAs(page: Page, name: string): Promise<void> {
  const key = (Object.keys(NAMES) as (keyof typeof NAMES)[]).find(k => NAMES[k] === name || NAMES[k].startsWith(name));
  if (!key) throw new Error(`viewAs: no seeded user named ${name}`);
  await signIn(page, USERS[key]);
  await expect(page.locator('.demo-bar')).toBeVisible();
}

/** Open the demo bar's More menu (Scenarios and Tools live under it, chunk R). */
export async function openDemoMore(page: Page): Promise<void> {
  const more = page.locator('.demo-bar').getByRole('button', { name: 'More', exact: true });
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
}

/** Pick a role on the home page (chunk R): the card's data-persona id from src/config/personas.ts. */
export async function pickRole(page: Page, personaId: string): Promise<void> {
  await stubTiles(page);
  await page.goto('/');
  await page.locator(`[data-persona="${personaId}"]`).click();
  await page.waitForURL(/\/(app|console)(\/|$)/);
}

/** Log out from the demo bar (Switch role) and land on the role picker. */
export async function switchRole(page: Page): Promise<void> {
  await page.locator('.demo-bar').getByRole('button', { name: 'Switch role', exact: true }).click();
  await page.waitForURL(/\/$/);
}

/** Jump the simulated clock using one of the Clock menu's presets. */
export async function jumpTo(page: Page, preset: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Clock' }).click();
  await page.getByRole('button', { name: preset }).first().click();
  await expect(page.getByText('Jump to')).toHaveCount(0);
}

/** Sales view toggle. */
export async function setSalesView(page: Page, on: boolean): Promise<void> {
  // The button shows the CURRENT state, so to reach `on` we click the button
  // labelled with the opposite state.
  const bar = page.locator('.demo-bar');
  const current = on ? 'OFF' : 'ON';
  await bar.getByRole('button', { name: `Sales view: ${current}`, exact: true }).click();
  await expect(bar.getByRole('button', { name: `Sales view: ${on ? 'ON' : 'OFF'}`, exact: true })).toBeVisible();
}

/** Start one of the S1–S50 guided walkthroughs from the Scenarios menu. */
export async function startScenario(page: Page, id: number): Promise<void> {
  await openDemoMore(page);
  await page.locator('.demo-bar').getByRole('button', { name: 'Scenarios', exact: true }).click();
  await expect(page.getByText('Guided walkthroughs')).toBeVisible();
  await page.locator('.demo-bar button').filter({ hasText: new RegExp(`^S${id}(?![0-9])`) }).first().click();
  await expect(page.getByText('Guided walkthroughs')).toHaveCount(0);
  // Starting a scenario also opens its guided walkthrough card — dismiss it so
  // scenario assertions run against the product UI only.
  const endTour = page.getByRole('button', { name: 'End tour' });
  if (await endTour.count()) await endTour.first().click();
  await expect(page.getByTestId('walkthrough-card')).toHaveCount(0);
}

/** Open the demo bar's Tools dropdown. */
export async function openTools(page: Page): Promise<void> {
  await openDemoMore(page);
  await page.locator('.demo-bar').getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.getByText('Developer tools')).toBeVisible();
}

/** Tools → booking simulator. */
export async function openBookingSimulator(page: Page): Promise<void> {
  await openTools(page);
  await page.locator('.demo-bar button').filter({ hasText: '/dev/bookings' }).first().click();
  await expect(page.getByRole('heading', { name: 'Booking simulator' })).toBeVisible();
}

/** Tools → tamper with a stored certificate (then land on its verify page). */
export async function tamperWithCertificate(page: Page): Promise<void> {
  page.once('dialog', dialog => dialog.accept());
  await openTools(page);
  await page.locator('.demo-bar button').filter({ hasText: 'Tamper with a stored certificate' }).first().click();
  await page.waitForURL(/\/verify\//);
}

/** Tools → Reset demo data (two clicks: arm, then confirm). */
export async function resetDemoData(page: Page): Promise<void> {
  await openTools(page);
  const reset = page.locator('.demo-bar button').filter({ hasText: 'Reset demo data' }).first();
  await reset.click();
  await page.locator('.demo-bar button').filter({ hasText: 'Click again' }).first().click();
}

/** Sign in as a user and land on a screen, with the demo context pinned. */
export async function demo(
  page: Page,
  options: {
    email?: string;
    user?: string;
    on?: string;
    scenario?: number;
  } = {}
): Promise<void> {
  if (options.email) await signIn(page, options.email);
  else await goTo(page, options.on ?? '/app');
  if (options.user) await viewAs(page, options.user);
  if (options.on) await goTo(page, options.on);
  if (options.scenario) await startScenario(page, options.scenario);
}

/** Assert the page shows this copy, wherever it sits in the tree. */
export async function expectText(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByText(text).first()).toBeVisible();
}

/** Assert the page does not show this copy at all. */
export async function expectNoText(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByText(text)).toHaveCount(0);
}

/**
 * A page link in the top navigation (owner decision, 13 Oct: top tabs, no sidebar).
 * Narrow desktops keep later tabs under "More"; this opens it when the tab is there.
 */
export async function navLink(page: Page, label: string): Promise<Locator> {
  const nav = page.getByTestId('top-nav');
  const inBar = nav.getByRole('link', { name: label, exact: true }).first();
  if (await inBar.isVisible()) return inBar;
  const more = nav.getByRole('button', { name: 'More' });
  if ((await more.count()) && (await more.isVisible()) && (await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  return nav.getByRole('group', { name: 'More' }).getByRole('link', { name: label, exact: true });
}

/** Open the top navigation's "More" menu if this width has one, so every allowed tab is on screen. */
export async function openMore(page: Page): Promise<void> {
  const more = page.getByTestId('top-nav').getByRole('button', { name: 'More' });
  if ((await more.count()) && (await more.isVisible()) && (await more.getAttribute('aria-expanded')) !== 'true') await more.click();
}

/** Opens a table row's RowMenu ("Actions for …") and picks one item. */
export async function rowAction(row: Locator, name: string | RegExp): Promise<void> {
  await row.getByRole('button', { name: /^Actions for / }).click();
  await row.page().getByRole('menuitem', { name }).click();
}

/**
 * The five test roles of the usability kit (UI-UPGRADE §11), plus Kasper Admin.
 * Each maps to one seeded account; sign-in is by email, so this never depends
 * on the role picker's layout.
 */
export const ROLE_USERS = {
  owner: USERS.khalid,      // Owner — Emirates Earthmovers (Tier 3 fleet)
  renter: USERS.lina,       // Renter — Marina Builders
  siteUser: USERS.mark,     // Site User — Gulf Lift, Al Quoz site
  kasperOps: USERS.ravi,    // Kasper Ops
  kasperAdmin: USERS.sara,  // Kasper Admin
} as const;

export type TestRole = keyof typeof ROLE_USERS;

/** Sign in as one of the test roles and wait for its home screen. */
export async function signInAsRole(page: Page, role: TestRole): Promise<void> {
  await signIn(page, ROLE_USERS[role]);
}

/** 'a-ex04' → 'EX-04': the seed's asset ids are the lower-cased code with an `a-` prefix. */
export function assetCode(id: string): string {
  return id.replace(/^a-/, '').replace(/^([a-z]+)(\d+)$/, '$1-$2').toUpperCase();
}

/** Open an asset's page by id (e.g. 'a-ex04') and wait until its code is on screen. */
export async function openAsset(page: Page, id: string): Promise<void> {
  await goTo(page, `/app/assets/${id}`);
  await expect(page.getByText(assetCode(id), { exact: true }).first()).toBeVisible();
}

/**
 * Let a client-rendered screen finish painting before reading it. `networkidle`
 * never settles on screens that poll, so this waits for the load event, then
 * for two animation frames and a short pause for effects that fetch on mount.
 */
export async function settle(page: Page, ms = 600): Promise<void> {
  await page.waitForLoadState('load');
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.waitForTimeout(ms);
}
