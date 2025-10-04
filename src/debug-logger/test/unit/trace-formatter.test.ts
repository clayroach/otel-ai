/**
 * Unit tests for trace formatter
 */

import { describe, it, expect } from 'vitest'
import { formatTrace } from '../../src/trace-formatter.js'
import {
  flatTrace,
  hierarchicalTrace,
  deepTrace,
  errorTrace,
  traceWithAttributes,
  zeroDurationTrace,
  otelDemoAddToCart
} from '../fixtures/test-traces.js'
import type { FormatOptions } from '../../src/types.js'

describe('TraceFormatter', () => {
  const defaultOptions: FormatOptions = {
    maxDepth: 10,
    showTimings: true,
    showAttributes: false,
    colorOutput: false // Disable colors for easier testing
  }

  describe('formatTrace', () => {
    it('should format a flat trace with no hierarchy', () => {
      const result = formatTrace('trace-flat-001', flatTrace, defaultOptions)

      expect(result).toContain('[TRACE] Trace trace-flat-001')
      expect(result).toContain('frontend:render')
      expect(result).toContain('backend:process')
      expect(result).toContain('database:query')
      expect(result).toContain('Services: frontend, backend, database')

      // Check for timeline bars (█ character)
      expect(result).toMatch(/█+/)

      // Check for line numbering
      expect(result).toMatch(/^0\. /m)
      expect(result).toMatch(/^1\. /m)
      expect(result).toMatch(/^2\. /m)
    })

    it('should format a hierarchical trace with proper indentation', () => {
      const result = formatTrace('trace-hier-001', hierarchicalTrace, defaultOptions)

      // Check for hierarchical structure with colon notation
      expect(result).toContain('frontend:handleRequest')
      expect(result).toMatch(/├─.*frontend:fetchData/)
      expect(result).toMatch(/│.*└─.*database:query/)
      expect(result).toMatch(/└─.*frontend:compileTemplate/)

      // Check for depth indicators
      expect(result).toContain('[depth=0]')
      expect(result).toContain('[depth=1]')
      expect(result).toContain('[depth=2]')
    })

    it('should display timing information when showTimings is true', () => {
      const result = formatTrace('trace-hier-001', hierarchicalTrace, defaultOptions)

      // Check for new timing format: startMs on separate line before timeline
      expect(result).toMatch(/\d+\.\d+ms/)

      // Check for duration and depth format: durationMs [depth=X]
      expect(result).toMatch(/\d+\.\d+ms \[depth=\d+\]/)

      // Check for timeline bars
      expect(result).toMatch(/█+/)
    })

    it('should hide timing information when showTimings is false', () => {
      const options: FormatOptions = { ...defaultOptions, showTimings: false }
      const result = formatTrace('trace-hier-001', hierarchicalTrace, options)

      // Should not contain start time on separate line
      // But should still have duration and depth info
      expect(result).toMatch(/\d+\.\d+ms \[depth=\d+\]/)
    })

    it('should handle deep nested traces', () => {
      const result = formatTrace('trace-deep-001', deepTrace, defaultOptions)

      // Check for 4 levels of nesting with colon notation
      expect(result).toContain('api-gateway:handleRequest')
      expect(result).toContain('backend-service:processRequest')
      expect(result).toContain('data-service:fetchData')
      expect(result).toContain('cache:lookup')
      expect(result).toContain('database:query')

      // Verify hierarchical structure (with box drawing chars)
      expect(result).toMatch(/└─.*data-service:fetchData/)

      // Check for depth levels
      expect(result).toContain('[depth=0]')
      expect(result).toContain('[depth=1]')
      expect(result).toContain('[depth=2]')
      expect(result).toContain('[depth=3]')
    })

    it('should respect maxDepth limit', () => {
      const options: FormatOptions = { ...defaultOptions, maxDepth: 2 }
      const result = formatTrace('trace-deep-001', deepTrace, options)

      // Should show "max depth reached" message
      expect(result).toContain('max depth reached')
    })

    it('should show span attributes when enabled', () => {
      const options: FormatOptions = { ...defaultOptions, showAttributes: true }
      const result = formatTrace('trace-attr-001', traceWithAttributes, options)

      // Check for attributes
      expect(result).toContain('http.method')
      expect(result).toContain('GET')
      expect(result).toContain('http.url')
      expect(result).toContain('/api/users')
    })

    it('should limit attributes display to 5 per span', () => {
      const options: FormatOptions = { ...defaultOptions, showAttributes: true }
      const result = formatTrace('trace-attr-001', traceWithAttributes, options)

      // Should show "... more" message since we have 7 attributes
      expect(result).toMatch(/\.\.\. \(\d+ more\)/)
    })

    it('should handle traces with errors', () => {
      const result = formatTrace('trace-error-001', errorTrace, defaultOptions)

      // Should contain error span with colon notation
      expect(result).toContain('backend:failedOperation')
      expect(result).toContain('frontend:render')
    })

    it('should handle zero-duration spans', () => {
      const result = formatTrace('trace-zero-001', zeroDurationTrace, defaultOptions)

      // Should show 0.00ms duration
      expect(result).toMatch(/0\.00ms \[depth=0\]/)
    })

    it('should handle empty span arrays', () => {
      const result = formatTrace('trace-empty-001', [], defaultOptions)

      expect(result).toContain('[TRACE] trace-empty-001 - No spans found')
    })

    it('should calculate correct trace duration', () => {
      const result = formatTrace('trace-hier-001', hierarchicalTrace, defaultOptions)

      // Total duration should be from earliest start to latest end
      // hierarchicalTrace: 2000000000000000 to 2000000450000000 = 450ms
      expect(result).toMatch(/\(450ms total/)
    })

    it('should list all unique services', () => {
      const result = formatTrace('trace-hier-001', hierarchicalTrace, defaultOptions)

      expect(result).toContain('Services: frontend, database')
    })

    it('should show correct span count', () => {
      const result = formatTrace('trace-hier-001', hierarchicalTrace, defaultOptions)

      expect(result).toContain('4 spans')
    })

    it('should truncate long trace IDs in header', () => {
      const longTraceId = 'a'.repeat(50)
      const result = formatTrace(longTraceId, flatTrace, defaultOptions)

      // Should show only first 16 characters followed by ...
      expect(result).toContain('aaaaaaaaaaaaaaaa...')
    })

    it('should format complex OTel demo trace with multiple services', () => {
      const result = formatTrace('trace-otel-demo-001', otelDemoAddToCart, defaultOptions)

      // Print for visual inspection
      console.log('\n=== COMPLEX OTEL DEMO TRACE ===')
      console.log(result)
      console.log('=== END ===\n')

      // Check for main services
      expect(result).toContain('load-generator')
      expect(result).toContain('frontend')
      expect(result).toContain('product-catalog')
      expect(result).toContain('cart')

      // Check for hierarchical structure
      expect(result).toContain('user_add_to_cart')
      expect(result).toMatch(/grpc\.oteldemo\.ProductCatalogService\/GetProduct/)
      expect(result).toMatch(/grpc\.oteldemo\.CartService\/AddItem/)

      // Check for Redis operations
      expect(result).toContain('HGET')
      expect(result).toContain('HMSET')
      expect(result).toContain('EXPIRE')

      // Check span count
      expect(result).toContain('19 spans')

      // Check services list
      expect(result).toMatch(/Services:.*load-generator.*frontend.*product-catalog.*cart/)
    })
  })
})
