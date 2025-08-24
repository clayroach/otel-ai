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
    ],
    watch: false, // Disable watch mode by default - run once and exit
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      reportsDirectory: 'coverage',
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
          statements: 80,
          branches: 70,
          functions: 80,
          lines: 80
        },
        'src/llm-manager/**': {
          statements: 40,
          branches: 58,
          functions: 35,
          lines: 40
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
