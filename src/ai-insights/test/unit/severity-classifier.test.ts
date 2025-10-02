/**
 * Unit tests for severity classification
 */

import { describe, it, expect } from 'vitest'
import { classifySeverity, classifyPriority } from '../../src/critical-path-analyzer/severity-classifier.js'

describe('Severity Classifier', () => {
  describe('classifySeverity', () => {
    it('should return base severity for critical priority', () => {
      const metrics = {
        requestCount: 1000,
        avgLatency: 100,
        errorRate: 0.01,
        p99Latency: 500
      }

      const severity = classifySeverity(metrics, 'critical')

      expect(severity).toBe(0.9)
    })

    it('should return base severity for high priority', () => {
      const metrics = {
        requestCount: 1000,
        avgLatency: 100,
        errorRate: 0.01,
        p99Latency: 500
      }

      const severity = classifySeverity(metrics, 'high')

      expect(severity).toBe(0.7)
    })

    it('should increase severity for high error rate', () => {
      const metrics = {
        requestCount: 1000,
        avgLatency: 100,
        errorRate: 0.15, // >10%
        p99Latency: 500
      }

      const severity = classifySeverity(metrics, 'medium')

      expect(severity).toBeGreaterThan(0.5) // Base medium + error adjustment
    })

    it('should increase severity for high latency', () => {
      const metrics = {
        requestCount: 1000,
        avgLatency: 100,
        errorRate: 0.01,
        p99Latency: 6000 // >5s
      }

      const severity = classifySeverity(metrics, 'medium')

      expect(severity).toBeGreaterThan(0.5) // Base medium + latency adjustment
    })

    it('should increase severity for high volume', () => {
      const metrics = {
        requestCount: 50000, // >10k
        avgLatency: 100,
        errorRate: 0.01,
        p99Latency: 500
      }

      const severity = classifySeverity(metrics, 'medium')

      expect(severity).toBeGreaterThan(0.5) // Base medium + volume adjustment
    })

    it('should cap severity at 1.0', () => {
      const metrics = {
        requestCount: 100000,
        avgLatency: 1000,
        errorRate: 0.5, // 50% errors
        p99Latency: 10000
      }

      const severity = classifySeverity(metrics, 'critical')

      expect(severity).toBeLessThanOrEqual(1.0)
      expect(severity).toBeGreaterThan(0.9)
    })

    it('should not go below 0', () => {
      const metrics = {
        requestCount: 0,
        avgLatency: 0,
        errorRate: 0,
        p99Latency: 0
      }

      const severity = classifySeverity(metrics, 'low')

      expect(severity).toBeGreaterThanOrEqual(0)
    })

    it('should combine multiple factors correctly', () => {
      const metrics = {
        requestCount: 20000, // +0.05
        avgLatency: 300,
        errorRate: 0.08, // +0.05
        p99Latency: 3000 // +0.05
      }

      const severity = classifySeverity(metrics, 'medium') // 0.5 base

      // 0.5 + 0.05 + 0.05 + 0.05 = 0.65
      expect(severity).toBeCloseTo(0.65, 2)
    })
  })

  describe('classifyPriority', () => {
    it('should classify as critical for high volume + errors', () => {
      const metrics = {
        requestCount: 50000,
        avgLatency: 200,
        errorRate: 0.1, // >5%
        p99Latency: 1000
      }

      const priority = classifyPriority(metrics)

      expect(priority).toBe('critical')
    })

    it('should classify as critical for very high latency', () => {
      const metrics = {
        requestCount: 1000,
        avgLatency: 500,
        errorRate: 0.01,
        p99Latency: 6000 // >5s
      }

      const priority = classifyPriority(metrics)

      expect(priority).toBe('critical')
    })

    it('should classify as high for moderate volume', () => {
      const metrics = {
        requestCount: 7000,
        avgLatency: 200,
        errorRate: 0.02,
        p99Latency: 1000
      }

      const priority = classifyPriority(metrics)

      expect(priority).toBe('high')
    })

    it('should classify as high for elevated error rate', () => {
      const metrics = {
        requestCount: 2000,
        avgLatency: 200,
        errorRate: 0.08, // >5%
        p99Latency: 800
      }

      const priority = classifyPriority(metrics)

      expect(priority).toBe('high')
    })

    it('should classify as medium for moderate traffic', () => {
      const metrics = {
        requestCount: 3000,
        avgLatency: 300,
        errorRate: 0.01,
        p99Latency: 800
      }

      const priority = classifyPriority(metrics)

      expect(priority).toBe('medium')
    })

    it('should classify as low for light traffic', () => {
      const metrics = {
        requestCount: 100,
        avgLatency: 50,
        errorRate: 0.001,
        p99Latency: 200
      }

      const priority = classifyPriority(metrics)

      expect(priority).toBe('low')
    })

    it('should handle zero metrics', () => {
      const metrics = {
        requestCount: 0,
        avgLatency: 0,
        errorRate: 0,
        p99Latency: 0
      }

      const priority = classifyPriority(metrics)

      expect(priority).toBe('low')
    })
  })
})
