# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: maintenance-cost.spec.ts >> maintenance board >> the asset detail page carries the plan and its history
- Location: tests/e2e/maintenance-cost.spec.ts:55:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('250 h service')
Expected: visible
Error: strict mode violation: getByText('250 h service') resolved to 2 elements:
    1) <td class="px-3 py-2 border-b border-line text-grey-700">250 h service</td> aka getByRole('cell', { name: '250 h service', exact: true })
    2) <td class="px-3 py-2 border-b border-line text-grey-700">250 h service — oil, filters, coolant top-up</td> aka getByRole('cell', { name: '250 h service — oil, filters' })

Call log:
  - Expect "toBeVisible" getByText('250 h service') with timeout 5000ms
  - waiting for getByText('250 h service')

```

# Page snapshot

```yaml
- generic [ref=f1e1]:
  - button "Open Next.js Dev Tools" [ref=f1e7] [cursor=pointer]
  - alert [ref=f1e11]
  - generic [ref=f1e12]:
    - generic [ref=f1e13]: DEMO
    - button "Khalid Rahman · Tenant" [ref=f1e15]
    - button "10:00 · 6 Oct" [ref=f1e20]
    - generic [ref=f1e21]:
      - button "Day 1" [ref=f1e22]
      - button "Phase 2" [ref=f1e23]
      - button "Later" [ref=f1e24]
    - 'button "Show hidden: OFF" [ref=f1e25]'
    - 'button "Sales view: OFF" [ref=f1e26]'
    - button "Features" [ref=f1e27]
    - button "Scenarios" [ref=f1e31]
    - button "Tools" [ref=f1e35]
    - generic [ref=f1e38]: Prototype · dummy data
  - generic [ref=f1e39]:
    - banner [ref=f1e40]:
      - generic [ref=f1e41]:
        - link "Kasper" [ref=f1e42] [cursor=pointer]:
          - /url: /app
          - img [ref=f1e43]:
            - generic [ref=f1e45]: K
        - generic [ref=f1e47]: Emirates Earthmovers
      - generic [ref=f1e48]:
        - generic [ref=f1e49]: Type to search assets…
        - button "Notifications" [ref=f1e54]:
          - generic [ref=f1e57]: "1"
        - button "K Khalid Rahman · Tenant Admin" [ref=f1e59]:
          - generic [ref=f1e60]: K
          - generic [ref=f1e61]: Khalid Rahman
          - generic [ref=f1e62]: ·
          - generic [ref=f1e63]: Tenant Admin
    - generic [ref=f1e66]:
      - navigation [ref=f1e67]:
        - generic [ref=f1e68]:
          - link "Map" [ref=f1e69] [cursor=pointer]:
            - /url: /app
          - link "Alerts" [ref=f1e72] [cursor=pointer]:
            - /url: /app/alerts
          - link "Reports" [ref=f1e75] [cursor=pointer]:
            - /url: /app/reports
          - link "Downloads" [ref=f1e78] [cursor=pointer]:
            - /url: /app/downloads
          - link "Geofences" [ref=f1e81] [cursor=pointer]:
            - /url: /app/geofences
          - link "Certificates" [ref=f1e85] [cursor=pointer]:
            - /url: /app/certificates
          - link "Billing" [ref=f1e89] [cursor=pointer]:
            - /url: /app/billing
          - link "Maintenance" [ref=f1e93] [cursor=pointer]:
            - /url: /app/maintenance
          - link "Cost & ROI" [ref=f1e96] [cursor=pointer]:
            - /url: /app/cost
        - link "Settings" [ref=f1e100] [cursor=pointer]:
          - /url: /app/settings
      - main [ref=f1e104]:
        - generic [ref=f1e105]:
          - generic [ref=f1e106]:
            - generic [ref=f1e107]:
              - generic [ref=f1e108]:
                - generic [ref=f1e109]: BD-02
                - generic [ref=f1e110]: — Bulldozer
              - generic [ref=f1e111]: CAT D6 · 2017 · EM-006
              - generic [ref=f1e112]: Al Quoz Yard · Emirates Earthmovers
            - generic [ref=f1e113]:
              - generic [ref=f1e114]: Live
              - generic [ref=f1e117]: T3
          - generic [ref=f1e118]: Last updated 09:59 · 0 min ago(hover for details)
          - generic [ref=f1e121]:
            - generic [ref=f1e122]: Current rental
            - generic [ref=f1e123]: Rented to Gulf Lift Rentals ·No destination · until 10 Oct 18:00
          - generic [ref=f1e125]:
            - button "Edit asset" [ref=f1e126] [cursor=pointer]
            - button "Share tracking link" [ref=f1e127] [cursor=pointer]
            - button "End access now" [ref=f1e128] [cursor=pointer]
            - link "Run report" [ref=f1e129] [cursor=pointer]:
              - /url: /app/reports
          - generic [ref=f1e131]:
            - button "Overview" [ref=f1e132]
            - button "History" [ref=f1e133]
            - button "Trips" [ref=f1e134]
            - button "Engine & fuel" [ref=f1e135]
            - button "Driving" [ref=f1e136]
            - button "Utilisation" [ref=f1e137]
            - button "Certificates" [ref=f1e138]
            - button "Maintenance" [active] [ref=f1e139]
            - button "Alerts" [ref=f1e140]
          - generic [ref=f1e141]:
            - generic [ref=f1e142]:
              - generic [ref=f1e143]:
                - generic [ref=f1e144]: Service plans
                - link "Open the maintenance board" [ref=f1e145] [cursor=pointer]:
                  - /url: /app/maintenance
              - table [ref=f1e146]:
                - rowgroup [ref=f1e147]:
                  - row [ref=f1e148]:
                    - columnheader "Plan" [ref=f1e149]
                    - columnheader "Due" [ref=f1e150]
                    - columnheader "Status" [ref=f1e151]
                - rowgroup [ref=f1e152]:
                  - row [ref=f1e153]:
                    - cell "250 h service" [ref=f1e154]
                    - cell "Overdue — due at 14,950 h · ECU (110 h over) · On hire to Gulf Lift Rentals until 10 Oct" [ref=f1e155]:
                      - text: Overdue — due at 14,950 h · ECU (110 h over)
                      - generic [ref=f1e156]: · On hire to Gulf Lift Rentals until 10 Oct
                    - cell "Overdue" [ref=f1e157]
            - generic [ref=f1e159]:
              - generic [ref=f1e160]: Service history
              - table [ref=f1e161]:
                - rowgroup [ref=f1e162]:
                  - row [ref=f1e163]:
                    - columnheader "Date" [ref=f1e164]
                    - columnheader "Reading" [ref=f1e165]
                    - columnheader "Notes" [ref=f1e166]
                    - columnheader "Cost" [ref=f1e167]
                - rowgroup [ref=f1e168]:
                  - row [ref=f1e169]:
                    - cell "27 Aug" [ref=f1e170]
                    - cell "14,700" [ref=f1e171]
                    - cell "250 h service — oil, filters, coolant top-up" [ref=f1e172]
                    - cell "AED 4,500" [ref=f1e173]
```

# Test source

```ts
  1   | // Maintenance scheduling and Cost & ROI (spec 11.18 / 11.19).
  2   | // Covers: the board's three columns and alert lines, the asset-detail
  3   | // Maintenance tab, logging a service, the fleet view's labelled bases and
  4   | // totals row, the asset ROI panel, and who is allowed to see the cost screen.
  5   | 
  6   | import { expect, test } from '@playwright/test';
  7   | import { signIn, USERS } from './helpers';
  8   | 
  9   | test.describe('maintenance board', () => {
  10  |   test('sorts the fleet into overdue, due soon and ok with alert lines', async ({ page }) => {
  11  |     await signIn(page, USERS.khalid);
  12  |     await page.goto('/app/maintenance');
  13  | 
  14  |     await expect(page.getByRole('heading', { name: 'Maintenance' })).toBeVisible();
  15  |     await expect(page.getByText(/^Overdue \(/)).toBeVisible();
  16  |     await expect(page.getByText(/^Due soon \(/)).toBeVisible();
  17  |     await expect(page.getByText(/^Ok \(/)).toBeVisible();
  18  |     // BD-02's plan is past its interval, EX-04's is inside the due-soon band.
  19  |     await expect(page.getByText(/Overdue — due at 14,950 h · ECU \(.+ over\)/)).toBeVisible();
  20  |     await expect(page.getByText(/Due at 8,500 h · ECU — \d+ h left/)).toBeVisible();
  21  |     // Tier 1/2 assets say how their hours were worked out.
  22  |     await expect(page.getByText(/Estimated \(ignition hours\)/).first()).toBeVisible();
  23  |     await expect(page.getByText('Maintenance overdue: BD-02 — 250 h service')).toBeVisible();
  24  |     // A Tier 3 fault code offers a one-off task.
  25  |     await expect(page.getByText('Fault codes needing a service task')).toBeVisible();
  26  |     await expect(page.getByRole('button', { name: 'Create service task' })).toBeVisible();
  27  |   });
  28  | 
  29  |   test('logs a service and resets the plan', async ({ page }) => {
  30  |     await signIn(page, USERS.khalid);
  31  |     await page.goto('/app/maintenance');
  32  | 
  33  |     await page.getByRole('button', { name: 'Log service' }).first().click();
  34  |     await expect(page.getByText(/^Log service — /)).toBeVisible();
  35  |     await expect(page.getByText(/Prefilled from the current reading/)).toBeVisible();
  36  |     await page.getByLabel(/^Meter reading/).fill('15100');
  37  |     await page.getByLabel('Cost (AED)').fill('5400');
  38  |     await page.getByLabel('Notes').fill('Coolant sensor and hoses checked');
  39  |     await page.getByRole('button', { name: 'Log service', exact: true }).last().click();
  40  | 
  41  |     await expect(page.getByText('logged — the plan is reset.')).toBeVisible();
  42  |     await expect(page.getByText('Coolant sensor and hoses checked')).toBeVisible();
  43  |   });
  44  | 
  45  |   test('a Site User sees their own company read-only', async ({ page }) => {
  46  |     await signIn(page, USERS.mark);
  47  |     await page.goto('/app/maintenance');
  48  |     await expect(page.getByRole('heading', { name: 'Maintenance' })).toBeVisible();
  49  |     // Gulf Lift's plans only — no New plan / Log service buttons for a Site User.
  50  |     await expect(page.getByText('Annual crane inspection').first()).toBeVisible();
  51  |     await expect(page.getByRole('button', { name: 'New plan' })).toHaveCount(0);
  52  |     await expect(page.getByRole('button', { name: 'Log service' })).toHaveCount(0);
  53  |   });
  54  | 
  55  |   test('the asset detail page carries the plan and its history', async ({ page }) => {
  56  |     await signIn(page, USERS.khalid);
  57  |     await page.goto('/app/assets/a-bd02');
  58  |     await page.getByRole('button', { name: 'Maintenance' }).click();
  59  |     await expect(page.getByText('Service plans')).toBeVisible();
> 60  |     await expect(page.getByText('250 h service')).toBeVisible();
      |                                                   ^ Error: expect(locator).toBeVisible() failed
  61  |     await expect(page.getByText('Service history')).toBeVisible();
  62  |     await expect(page.getByText('250 h service — oil, filters, coolant top-up')).toBeVisible();
  63  |   });
  64  | 
  65  |   test('before the Later phase the screen is locked', async ({ page }) => {
  66  |     await signIn(page, USERS.khalid);
  67  |     await page.goto('/');
  68  |     await page.getByRole('button', { name: /Day 1/ }).click();
  69  |     await page.goto('/app/maintenance');
  70  |     await expect(page.getByText('Not available')).toBeVisible();
  71  |     await expect(page.getByText(/arrives in the Later phase/)).toBeVisible();
  72  |   });
  73  | });
  74  | 
  75  | test.describe('cost & ROI', () => {
  76  |   test('shows the fleet view with a basis on every line and a totals row', async ({ page }) => {
  77  |     await signIn(page, USERS.khalid);
  78  |     await page.goto('/app/cost');
  79  | 
  80  |     await expect(page.getByRole('heading', { name: 'Cost & ROI' })).toBeVisible();
  81  |     await expect(page.getByText('Draft')).toBeVisible();
  82  |     await expect(page.getByRole('button', { name: 'Last month' })).toBeVisible();
  83  |     await expect(page.getByText(/diesel AED 3\.05\/L \(dummy\)/)).toBeVisible();
  84  |     // Emirates runs Tier 3 kit, so fuel and idle come off the ECU.
  85  |     await expect(page.getByText('ECU (ALL-CAN300)').first()).toBeVisible();
  86  |     await expect(page.getByText('From invoices').first()).toBeVisible();
  87  |     await expect(page.getByText('From service log').first()).toBeVisible();
  88  |     await expect(page.getByText('Dummy rate').first()).toBeVisible();
  89  |     await expect(page.getByText(/^Totals \(\d+ assets\)$/)).toBeVisible();
  90  |   });
  91  | 
  92  |   test('opens an asset for its chart, ROI and payback', async ({ page }) => {
  93  |     await signIn(page, USERS.khalid);
  94  |     await page.goto('/app/cost');
  95  |     await page.getByText('EX-04', { exact: true }).first().click();
  96  | 
  97  |     await expect(page.getByText('Revenue vs cost — last 6 months')).toBeVisible();
  98  |     await expect(page.getByText('ROI to date')).toBeVisible();
  99  |     await expect(page.getByText('Payback estimate')).toBeVisible();
  100 |     await expect(page.getByText(/At the current rate/)).toBeVisible();
  101 |     await expect(page.getByText('Cost lines')).toBeVisible();
  102 |     await expect(page.getByRole('button', { name: 'Save cost profile' })).toBeVisible();
  103 |     await expect(page.getByText(/Diesel price \(AED\/L, company setting\)/)).toBeVisible();
  104 |   });
  105 | 
  106 |   test('is Kasper Admin and Tenant Admin only', async ({ page }) => {
  107 |     await signIn(page, USERS.ravi);
  108 |     await page.goto('/app/cost');
  109 |     await expect(page.getByText('Page not found')).toBeVisible();
  110 |     await expect(page.getByText("This page isn't available for your role.")).toBeVisible();
  111 | 
  112 |     await signIn(page, USERS.mark);
  113 |     await page.goto('/app/cost');
  114 |     await expect(page.getByText('Page not found')).toBeVisible();
  115 |     await expect(page.getByRole('link', { name: 'Cost & ROI' })).toHaveCount(0);
  116 |   });
  117 | 
  118 |   test('Kasper Admin can switch period and see another company’s assets', async ({ page }) => {
  119 |     await signIn(page, USERS.sara);
  120 |     await page.goto('/app/cost');
  121 |     await page.getByRole('button', { name: 'Last 3 months' }).click();
  122 |     await expect(page.getByText('Last 3 months').first()).toBeVisible();
  123 |     await expect(page.getByText('CR-08', { exact: true }).first()).toBeVisible();
  124 |   });
  125 | });
  126 | 
```