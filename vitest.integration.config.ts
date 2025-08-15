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
    
    // Include only integration test files
    include: ['**/*.integration.test.{js,ts}'],
    
    // Exclude regular unit tests  
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
    
    // Environment setup
    environment: 'node',
    
    // Reporters
    reporters: ['verbose'],
    
    // Globals
    globals: true,
  },
})