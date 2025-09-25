import { defineConfig, devices } from '@playwright/test'

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './ui/test/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : 4,
  /* Timeout for each test - increased for CI environments */
  timeout: process.env.CI ? 120 * 1000 : 30 * 1000, // 120s for CI, 30s local
  /* Global timeout for entire test run */
  globalTimeout: process.env.CI ? 30 * 60 * 1000 : 5 * 60 * 1000, // 30min for CI, 5min local
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html', { outputFolder: 'target/playwright-report' }]],
  /* Output directory for test results */
  outputDir: 'target/test-results',
  /* Shared settings for all the tests below. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: process.env.CI
      ? 'cd ui && pnpm dev'  // Start dev server in CI
      : 'echo "Using existing dev environment"',  // Use existing server locally
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,  // Don't reuse in CI, always start fresh
    timeout: process.env.CI ? 60 * 1000 : 5 * 1000,  // Longer timeout in CI for server startup
  },
})