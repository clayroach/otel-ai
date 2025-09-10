import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 30000, // 30 seconds for integration tests
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules', 
      'dist',
      '**/node_modules/**',
      '**/integration/**', // Exclude integration tests from unit test runs
      '**/*.integration.test.ts', // Exclude integration test files
      '**/test/integration/**', // Exclude integration test directories
    ],
    watch: false, // Disable watch mode by default - run once and exit
    reporters: ['default'], // Default reporter for normal runs
    outputFile: {
      json: './target/test-results/results.json',
      junit: './target/test-results/junit.xml',
      html: './target/test-results/index.html'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'json-summary', 'lcov'],
      reportsDirectory: 'target/coverage',
      exclude: [
        'node_modules/',
        'dist/',
        'build/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/test-setup.ts',
        'scripts/',
        'notes/',
        '.claude/',
        'ui/',
        'demo/',
        'src/opentelemetry/'
      ],
      include: ['src/**/*.ts'],
      thresholds: {
        global: {
          statements: 5,
          branches: 5,
          functions: 5,
          lines: 5
        },
        'src/llm-manager/**': {
          statements: 5,
          branches: 5,
          functions: 5,
          lines: 5
        }
      },
      all: true,
      skipFull: false
    }
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@/storage': new URL('./src/storage', import.meta.url).pathname
    }
  }
})
