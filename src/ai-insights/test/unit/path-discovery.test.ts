/**
 * Unit tests for path discovery utilities
 */

import { describe, it, expect } from 'vitest'
import {
  statisticalPathDiscovery,
  calculatePathMetrics
} from '../../src/critical-path-analyzer/path-discovery.js'
import { mockServiceMetrics } from '../fixtures/test-data.js'

describe('Path Discovery Utilities', () => {
  describe('statisticalPathDiscovery', () => {
    it('should discover paths from topology without LLM', () => {
      const paths = statisticalPathDiscovery(mockServiceMetrics)

      expect(paths).toBeDefined()
      expect(Array.isArray(paths)).toBe(true)
      expect(paths.length).toBeGreaterThan(0)
    })

    it('should return paths with required fields', () => {
      const paths = statisticalPathDiscovery(mockServiceMetrics)

      paths.forEach((path) => {
        expect(path).toHaveProperty('name')
        expect(path).toHaveProperty('description')
        expect(path).toHaveProperty('services')
        expect(path).toHaveProperty('priority')
        expect(path).toHaveProperty('severity')
        expect(Array.isArray(path.services)).toBe(true)
        expect(path.services.length).toBeGreaterThan(0)
      })
    })

    it('should identify entry points correctly', () => {
      const paths = statisticalPathDiscovery(mockServiceMetrics)

      // Frontend should be identified as entry point
      const frontendPath = paths.find((p) => p.services[0] === 'frontend')
      expect(frontendPath).toBeDefined()
    })

    it('should follow dependency chains', () => {
      const paths = statisticalPathDiscovery(mockServiceMetrics)

      // Paths should have multiple services in chain
      const multiServicePaths = paths.filter((p) => p.services.length > 1)
      expect(multiServicePaths.length).toBeGreaterThan(0)
    })

    it('should assign priority based on metrics', () => {
      const paths = statisticalPathDiscovery(mockServiceMetrics)

      // Should assign priority based on metrics
      expect(paths.length).toBeGreaterThan(0)
      paths.forEach((path) => {
        expect(['critical', 'high', 'medium', 'low']).toContain(path.priority)
      })

      // High traffic paths should have severity score
      const highPriorityPath = paths.find((p) => p.priority === 'critical' || p.priority === 'high')
      if (highPriorityPath) {
        expect(highPriorityPath.severity).toBeGreaterThan(0.5)
      }
    })

    it('should prevent infinite loops in circular dependencies', () => {
      // Create topology with circular dependency
      const circularTopology = [
        {
          serviceName: 'service-a',
          callCount: 1000,
          errorRate: 0.01,
          avgLatency: 100,
          p99Latency: 500,
          dependencies: [{ targetService: 'service-b', callCount: 800, errorRate: 0.01, avgLatency: 50 }]
        },
        {
          serviceName: 'service-b',
          callCount: 800,
          errorRate: 0.01,
          avgLatency: 50,
          p99Latency: 200,
          dependencies: [{ targetService: 'service-a', callCount: 500, errorRate: 0.01, avgLatency: 50 }]
        }
      ]

      const paths = statisticalPathDiscovery(circularTopology)

      // Should complete without infinite loop
      expect(paths).toBeDefined()
      paths.forEach((path) => {
        expect(path.services.length).toBeLessThanOrEqual(10) // Max path length
      })
    })
  })

  describe('calculatePathMetrics', () => {
    it('should calculate metrics from topology data', () => {
      const services = ['frontend', 'api-gateway', 'cart-service']
      const metrics = calculatePathMetrics(services, mockServiceMetrics)

      expect(metrics).toHaveProperty('requestCount')
      expect(metrics).toHaveProperty('avgLatency')
      expect(metrics).toHaveProperty('errorRate')
      expect(metrics).toHaveProperty('p99Latency')
    })

    it('should use entry service call count for request count', () => {
      const services = ['frontend', 'api-gateway']
      const metrics = calculatePathMetrics(services, mockServiceMetrics)

      // Should use frontend's call count
      expect(metrics.requestCount).toBe(50000)
    })

    it('should sum latencies across path', () => {
      const services = ['frontend', 'api-gateway', 'cart-service']
      const metrics = calculatePathMetrics(services, mockServiceMetrics)

      // avgLatency should be sum of service latencies
      // frontend: 120 + api-gateway: 150 + cart-service: 80 = 350
      expect(metrics.avgLatency).toBe(350)
    })

    it('should use maximum error rate in path', () => {
      const services = ['frontend', 'api-gateway', 'cart-service']
      const metrics = calculatePathMetrics(services, mockServiceMetrics)

      // Should use api-gateway's error rate (0.008) since it's highest
      expect(metrics.errorRate).toBe(0.01) // cart-service has 0.01
    })

    it('should handle empty path gracefully', () => {
      const services: string[] = []
      const metrics = calculatePathMetrics(services, mockServiceMetrics)

      expect(metrics.requestCount).toBe(0)
      expect(metrics.avgLatency).toBe(0)
      expect(metrics.errorRate).toBe(0)
      expect(metrics.p99Latency).toBe(0)
    })

    it('should handle non-existent services gracefully', () => {
      const services = ['non-existent-service-1', 'non-existent-service-2']
      const metrics = calculatePathMetrics(services, mockServiceMetrics)

      expect(metrics.requestCount).toBe(0)
      expect(metrics.avgLatency).toBe(0)
      expect(metrics.errorRate).toBe(0)
      expect(metrics.p99Latency).toBe(0)
    })

    it('should handle partial service matches', () => {
      const services = ['frontend', 'non-existent', 'database']
      const metrics = calculatePathMetrics(services, mockServiceMetrics)

      // Should calculate based on services that exist
      expect(metrics.requestCount).toBeGreaterThan(0)
      expect(metrics.avgLatency).toBeGreaterThan(0)
    })
  })
})
