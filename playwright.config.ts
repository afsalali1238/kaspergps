import { defineConfig, devices } from '@playwright/test';

// KASPER_CHROMIUM_PATH lets a machine without Playwright's browser download
// (e.g. a sandbox with a pre-installed Chromium) point at its own binary.
// Unset in CI and on dev machines, so the default bundled browser is used.
const chromiumPath = process.env.KASPER_CHROMIUM_PATH;
const launchOptions = chromiumPath
  ? {
      executablePath: chromiumPath,
      args: ['--no-sandbox', '--no-zygote', '--disable-dev-shm-usage', '--disable-gpu'],
    }
  : {};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
