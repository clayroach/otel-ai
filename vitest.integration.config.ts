import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Increased timeouts to handle client-side retry logic
    // With 5 retry attempts and potential retry-after headers up to 300s,
    // tests need sufficient time to complete
    testTimeout: 120000, // 2 minutes for individual tests (handles most retry scenarios)
    hookTimeout: 180000, // 3 minutes for setup/teardown

    // Enable parallel execution for 429 retry testing
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 2,
        maxThreads: 12, // Allow multiple threads for concurrent testing
      },
    },

    // Include integration test files and directories
    include: [
      '**/*.integration.test.{js,ts}',
      '**/test/integration/**/*.test.{js,ts}'
    ],

    // Exclude regular unit tests
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],

    watch: false, // Disable watch mode by default - run once and exit

    // Environment setup
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],

    // Reporters
    reporters: ['verbose'],

    // Globals
    globals: true,
  },
})