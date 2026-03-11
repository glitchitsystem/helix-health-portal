/**
 * playwright.config.ts
 *
 * Playwright configuration for Helix Health Portal E2E tests.
 *
 * Run all E2E tests:        npx playwright test
 * Run Chromium only:        npx playwright test --project=chromium
 * Run with UI:              npx playwright test --ui
 * Show report:              npx playwright show-report
 */

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env['BASE_URL'] ?? 'http://localhost:3000';
const IS_CI    = Boolean(process.env['CI']);

export default defineConfig({
  // ── Test location ────────────────────────────────────────────────────────────
  testDir: './tests/e2e',

  // Glob for test files
  testMatch: '**/*.spec.ts',

  // ── Timeouts ─────────────────────────────────────────────────────────────────
  timeout:              30_000,   // per-test timeout
  expect: {
    timeout:            5_000,    // assertion timeout
  },

  // ── Parallelism ───────────────────────────────────────────────────────────────
  fullyParallel: true,
  workers:       IS_CI ? 4 : 1,

  // ── Retry ────────────────────────────────────────────────────────────────────
  retries: IS_CI ? 2 : 0,

  // ── Reporter ─────────────────────────────────────────────────────────────────
  reporter: IS_CI
    ? [
        ['github'],
        ['html',   { outputFolder: 'playwright-report', open: 'never' }],
        ['junit',  { outputFile: 'test-results/e2e/results.xml' }],
      ]
    : [
        ['list'],
        ['html',   { outputFolder: 'playwright-report', open: 'on-failure' }],
      ],

  // ── Shared settings ───────────────────────────────────────────────────────────
  use: {
    baseURL:              BASE_URL,
    screenshot:           'only-on-failure',
    video:                'retain-on-failure',
    trace:                'on-first-retry',
    actionTimeout:        10_000,
    navigationTimeout:    15_000,
    // Ignore self-signed certs in local dev
    ignoreHTTPSErrors:    true,
  },

  // ── Projects (browsers) ───────────────────────────────────────────────────────
  projects: [
    // Chromium — always run (CI + local)
    {
      name:  'chromium',
      use:   { ...devices['Desktop Chrome'] },
    },

    // Firefox — nightly only (skip in CI unless NIGHTLY=true)
    {
      name:  'firefox',
      use:   { ...devices['Desktop Firefox'] },
    },

    // WebKit (Safari) — nightly only
    {
      name:  'webkit',
      use:   { ...devices['Desktop Safari'] },
    },

    // Mobile Chrome — smoke tests only
    {
      name:  'mobile-chrome',
      use:   { ...devices['Pixel 5'] },
    },
  ],

  // ── Output folder for traces/screenshots ─────────────────────────────────────
  outputDir: 'test-results/e2e',
});
