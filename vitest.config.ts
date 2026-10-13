import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Resolved from this file, never from a checkout path — the repo has to
    // work in CI, in a container and on a laptop alike.
    '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./tests/setup.ts'],
    // Several tests simulate days of telemetry for every seeded asset. Under v8
    // coverage on the CI runner they pass the 5 s default (trips, consistency), so
    // the suite allows 30 s per test. Assertions are unaffected.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      // Screens under app/** are covered by the Playwright suite, not by unit
      // tests. Leaving them out of the denominator lets Wave 2 render a screen in
      // a unit test without the whole of app/ counting against the 85% floor.
      exclude: ['app/**'],
      thresholds: { lines: 85 },
    },
  },
});
