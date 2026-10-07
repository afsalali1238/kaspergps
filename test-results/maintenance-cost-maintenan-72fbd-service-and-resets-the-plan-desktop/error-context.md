# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: maintenance-cost.spec.ts >> maintenance board >> logs a service and resets the plan
- Location: tests/e2e/maintenance-cost.spec.ts:29:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('logged — the plan is reset.')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('logged — the plan is reset.') with timeout 5000ms
  - waiting for getByText('logged — the plan is reset.')

```

```yaml
- alert
- text: DEMO
- button "Khalid Rahman · Tenant":
  - img
  - text: Khalid Rahman · Tenant
- button "10:00 · 6 Oct"
- button "Day 1"
- button "Phase 2"
- button "Later"
- 'button "Show hidden: OFF"'
- 'button "Sales view: OFF"'
- button "Features":
  - img
  - text: Features
- button "Scenarios":
  - img
  - text: Scenarios
- button "Tools":
  - img
  - text: Tools
- text: Prototype · dummy data
- banner:
  - link "Kasper":
    - /url: /app
    - img: K
    - text: Kasper
  - text: Emirates Earthmovers
  - img
  - text: Type to search assets…
  - button "Notifications":
    - img
    - text: "1"
  - button "K Khalid Rahman · Tenant Admin":
    - text: K Khalid Rahman · Tenant Admin
    - img
- navigation:
  - link "Map":
    - /url: /app
    - img
    - text: Map
  - link "Alerts":
    - /url: /app/alerts
    - img
    - text: Alerts
  - link "Reports":
    - /url: /app/reports
    - img
    - text: Reports
  - link "Downloads":
    - /url: /app/downloads
    - img
    - text: Downloads
  - link "Geofences":
    - /url: /app/geofences
    - img
    - text: Geofences
  - link "Certificates":
    - /url: /app/certificates
    - img
    - text: Certificates
  - link "Billing":
    - /url: /app/billing
    - img
    - text: Billing
  - link "Maintenance":
    - /url: /app/maintenance
    - img
    - text: Maintenance
  - link "Cost & ROI":
    - /url: /app/cost
    - img
    - text: Cost & ROI
  - link "Settings":
    - /url: /app/settings
    - img
    - text: Settings
- main:
  - heading "Maintenance" [level=1]
  - paragraph: Service plans by engine hours, distance or date — with the service history behind them.
  - button "Excel"
  - button "PDF"
  - button "New plan"
  - text: The service date can’t be in the future.
  - heading "Alerts" [level=2]
  - text: "Overdue Maintenance overdue: BD-02 — 250 h service Due soon Maintenance due soon: EX-04 500 h service (95 h left)"
  - heading "Fault codes needing a service task" [level=2]
  - text: BD-02 · Fault code SPN 110 FMI 0 — Engine coolant temperature high
  - button "Create service task"
  - button "Board"
  - button "Table"
  - text: 3 plans
  - heading "Overdue (1)" [level=2]
  - link "BD-02":
    - /url: /app/assets/a-bd02
  - text: · Bulldozer 250 h service Overdue Overdue — due at 14,950 h · ECU (110 h over) ECU On hire to Gulf Lift Rentals until 10 Oct
  - button "Log service"
  - button "Edit plan"
  - heading "Due soon (1)" [level=2]
  - link "EX-04":
    - /url: /app/assets/a-ex04
  - text: · Excavator 500 h service Due soon Due at 8,500 h · ECU — 95 h left ECU On hire to Marina Builders until 11 Oct
  - button "Log service"
  - button "Edit plan"
  - heading "Ok (1)" [level=2]
  - link "GN-01":
    - /url: /app/assets/a-gn01
  - text: · Generator 250 kVA Oil change 250 h Ok Due at 2,250 h · ECU — 250 h left ECU On hire to Palm Contracting until 15 Oct
  - button "Log service"
  - button "Edit plan"
  - heading "Service history" [level=2]
  - table:
    - rowgroup:
      - row "Date Asset Reading Notes Cost":
        - columnheader "Date"
        - columnheader "Asset"
        - columnheader "Reading"
        - columnheader "Notes"
        - columnheader "Cost"
    - rowgroup:
      - row "1 Oct GN-01 2,000 Oil and filter change on site AED 950":
        - cell "1 Oct"
        - cell "GN-01"
        - cell "2,000"
        - cell "Oil and filter change on site"
        - cell "AED 950"
      - row "27 Aug BD-02 14,700 250 h service — oil, filters, coolant top-up AED 4,500":
        - cell "27 Aug"
        - cell "BD-02"
        - cell "14,700"
        - cell "250 h service — oil, filters, coolant top-up"
        - cell "AED 4,500"
      - row "22 Aug EX-04 8,000 Scheduled 500 h service at Al Quoz Yard AED 6,800":
        - cell "22 Aug"
        - cell "EX-04"
        - cell "8,000"
        - cell "Scheduled 500 h service at Al Quoz Yard"
        - cell "AED 6,800"
  - paragraph: PDF and Excel exports include the plans and this history.
  - heading "Log service — BD-02" [level=2]
  - button "Close":
    - img
  - text: 250 h service · ECU
  - paragraph: "Logging a service resets the plan: the reading you enter here becomes the new starting point."
  - text: Date
  - textbox "Date": 2026-10-06
  - text: Meter reading (hours) — ECU
  - textbox "Meter reading (hours) — ECU Prefilled from the current reading — edit it if the hour meter reads differently.": "15100"
  - text: Prefilled from the current reading — edit it if the hour meter reads differently. Notes
  - textbox "Notes":
    - /placeholder: What was done?
    - text: Coolant sensor and hoses checked
  - text: Cost (AED)
  - textbox "Cost (AED)":
    - /placeholder: "0"
    - text: "5400"
  - button "Log service"
  - button "Cancel"
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
> 41  |     await expect(page.getByText('logged — the plan is reset.')).toBeVisible();
      |                                                                 ^ Error: expect(locator).toBeVisible() failed
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
  60  |     await expect(page.getByText('250 h service')).toBeVisible();
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