import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // Retries exist so `trace: 'on-first-retry'` produces something to read when
  // a run goes red on a runner; locally the first attempt is still the verdict.
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // The HTML report gives the CI artifact something to show; the list keeps the
  // live log readable.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    // CI runs the production build: `next dev` compiles each route on first hit,
    // and a cold runner can blow the per-test timeout doing that. Building first
    // also means the suite proves the app actually compiles.
    command: process.env.CI ? 'next build && next start' : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 420_000 : 120_000,
  },
});
