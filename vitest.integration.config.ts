import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Longer timeouts for integration tests with TestContainers
    testTimeout: 300000, // 5 minutes
    hookTimeout: 120000, // 2 minutes for setup/teardown
    
    // Run integration tests serially to avoid resource conflicts
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
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