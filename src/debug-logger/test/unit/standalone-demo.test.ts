/**
 * Standalone demonstration test for debug logger
 * Tests the debug logger without requiring full backend integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createDebugLogger } from '../../src/debug-logger.js'
import { createConfigWatcher } from '../../src/config-watcher.js'
import { createTraceFormatter } from '../../src/trace-formatter.js'
import { otelDemoGetRecommendations } from '../fixtures/test-traces.js'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'

describe('Debug Logger Standalone Demo', () => {
  const testConfigPath = join(process.cwd(), 'config', 'debug-test.yaml')

  beforeAll(async () => {
    // Create a test config file
    const testConfig = `debug:
  level: trace
  traces:
    enabled: true
    console: server
    maxDepth: 10
    showTimings: true
    showAttributes: true
    colorOutput: false
  hotReload:
    enabled: false
    debounceMs: 500
`
    await writeFile(testConfigPath, testConfig, 'utf-8')
  })

  afterAll(async () => {
    // Clean up test config
    try {
      await unlink(testConfigPath)
    } catch {
      // Ignore errors
    }
  })

  it('should demonstrate ASCII trace visualization', async () => {
    // Create services
    const configWatcher = createConfigWatcher(testConfigPath)
    const traceFormatter = createTraceFormatter()

    // Wait a bit for config to load
    await new Promise((resolve) => setTimeout(resolve, 100))

    const debugLogger = createDebugLogger(configWatcher, traceFormatter)

    // Capture console output
    const originalLog = console.log
    const logs: string[] = []
    console.log = (...args) => {
      logs.push(args.join(' '))
    }

    try {
      // Log a complex trace with fan-out pattern
      debugLogger.logTrace('trace-otel-recommendations-001', otelDemoGetRecommendations)

      // Verify output
      const output = logs.join('\n')

      // Check for trace header (ID is truncated to 16 chars)
      expect(output).toContain('[TRACE] Trace trace-otel-recom')
      expect(output).toContain('1200ms total')
      expect(output).toContain('18 spans')

      // Check for hierarchical structure with colon notation
      expect(output).toContain('load-generator:user_get_recommendations')
      expect(output).toContain('frontend:GET /api/recommendations')
      expect(output).toContain('recommendation:get_product_list')
      expect(output).toContain('product-catalog:oteldemo.ProductCatalogService/GetProduct')

      // Check for timing information (new format)
      expect(output).toMatch(/\d+\.\d+ms \[depth=\d+\]/)

      // Check for services summary
      expect(output).toContain('Services:')
      expect(output).toContain('load-generator')
      expect(output).toContain('frontend')
      expect(output).toContain('recommendation')
      expect(output).toContain('product-catalog')

      // Print the output for visual verification
      console.log = originalLog
      console.log('\n=== DEBUG LOGGER OUTPUT - RECOMMENDATIONS TRACE ===')
      console.log(output)
      console.log('=== END OUTPUT ===\n')
    } finally {
      console.log = originalLog
    }
  })

  it('should respect log level filtering', async () => {
    const configWatcher = createConfigWatcher(testConfigPath)
    const traceFormatter = createTraceFormatter()

    await new Promise((resolve) => setTimeout(resolve, 100))

    const debugLogger = createDebugLogger(configWatcher, traceFormatter)

    // Change log level to INFO (higher than TRACE)
    debugLogger.setLevel('info')

    const originalLog = console.log
    const logs: string[] = []
    console.log = (...args) => {
      logs.push(args.join(' '))
    }

    try {
      // Try to log at TRACE level
      debugLogger.trace('This should not appear')

      // Log at INFO level
      debugLogger.info('This should appear')

      const output = logs.join('\n')

      // TRACE message should not appear
      expect(output).not.toContain('This should not appear')

      // INFO message should appear
      expect(output).toContain('This should appear')
    } finally {
      console.log = originalLog
    }
  })

  it('should handle empty traces gracefully', async () => {
    const configWatcher = createConfigWatcher(testConfigPath)
    const traceFormatter = createTraceFormatter()

    await new Promise((resolve) => setTimeout(resolve, 100))

    const debugLogger = createDebugLogger(configWatcher, traceFormatter)

    const originalLog = console.log
    const logs: string[] = []
    console.log = (...args) => {
      logs.push(args.join(' '))
    }

    try {
      // Log empty trace
      debugLogger.logTrace('empty-trace', [])

      const output = logs.join('\n')

      // Should show "No spans found" message
      expect(output).toContain('No spans found')
    } finally {
      console.log = originalLog
    }
  })
})
